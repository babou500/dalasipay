// Disposable PostgreSQL only. No production URL, account or customer write.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createProcurementDatabase,org,maker,checker,hr,outsider} from './procurement-database-fixture.mjs';
const migration=await readFile(new URL('../supabase/migrations/20261016231950_procurement_state_integrity.sql',import.meta.url),'utf8');
let db,revision=0;
const empty=()=>({data:{'business-expenses':[],'purchase-orders':[],'business-bills':[],'business-payments':[],'cash-accounts':[{id:'bank',status:'Active'}],'cash-transactions':[],'subscriptions':[{professional_preview:true}],billing:false}});
async function as(user){await db.exec(`RESET ROLE;SELECT set_config('fixture.user','${user}',false);SET ROLE authenticated;`);}
async function save(state,expected=revision){const result=await db.query('select * from public.save_organization_app_state($1,$2,$3,$4::jsonb)',[org,expected,'fixture',JSON.stringify(state)]);if(!result.rows[0].conflict)revision=Number(result.rows[0].revision);return result.rows[0];}
async function current(){return (await db.query('select state from public.organization_app_state where organization_id=$1',[org])).rows[0]?.state;}
test.before(async()=>{
 db=await createProcurementDatabase();
 await db.exec(migration);await as(maker);await save(empty());
});
test.after(async()=>{await db?.close();});

test('historical paid/received records survive unrelated HR saves and PO linkage; unverifiable legacy approvals remain blocked',async()=>{
 const legacy=await createProcurementDatabase();
 try{
  const state=empty();state.data['business-expenses']=[{id:'historical-paid',status:'Paid',amount:10,accountId:'bank',expenseDate:'2026-09-01',createdBy:'Historical User'}];state.data['cash-transactions']=[{id:'historical-cash',sourceKey:'expense:historical-paid:out',amount:-10,direction:'out',accountId:'bank'}];state.data['purchase-orders']=[{id:'historical-po',status:'Received',amount:115,requestDate:'2026-09-01'}];state.data['business-bills']=[{id:'legacy-pending',status:'Pending approval',amount:115,invoiceNo:'HISTORICAL-1',supplier:'Fictional Legacy Supplier',createdBy:'Unverified Name'}];
  await legacy.exec(`SET ROLE authenticated;SELECT set_config('fixture.user','${maker}',false)`);
  async function write(snapshot,revision){return legacy.query('select * from public.save_organization_app_state($1,$2,$3,$4::jsonb)',[org,revision,'legacy-fixture',JSON.stringify(snapshot)]);}
  await write(state,0);await legacy.exec('RESET ROLE');await legacy.exec(migration);await legacy.exec(`SET ROLE authenticated;SELECT set_config('fixture.user','${hr}',false)`);
  state.data['hr-notes']=[{id:'fictional-hr-note',text:'No financial mutation'}];assert.equal((await write(state,1)).rows[0].conflict,false);
  await legacy.exec(`SELECT set_config('fixture.user','${maker}',false)`);state.data['purchase-orders'][0].linkedBillId='legacy-pending';assert.equal((await write(state,2)).rows[0].conflict,false);
  const bypass=structuredClone(state);bypass.data['business-bills'][0].status='Approved';bypass.data['business-bills'][0].approvedByUserId=maker;await assert.rejects(write(bypass,3),/Independent approval/);
  const saved=(await legacy.query('select state from public.organization_app_state where organization_id=$1',[org])).rows[0].state;assert.deepEqual(saved.data['business-expenses'],state.data['business-expenses']);assert.equal(saved.data['business-bills'][0].status,'Pending approval');
 }finally{await legacy.close();}
});
test('actual revisioned RPC retains snapshots and commits draft plus immutable server audit atomically',async()=>{
 const state=empty();state.data['business-bills']=[{id:'bill',organizationId:org,createdByUserId:maker,status:'Draft',amount:115,invoiceNo:'INV-1',beneficiaryId:'supplier',invoiceDate:'2026-10-16'}];
 await save(state);assert.deepEqual(await current(),state);
 const audit=await db.query('select * from public.procurement_state_events');assert.equal(audit.rows.length,1);assert.equal(audit.rows[0].actor_user_id,maker);
 const stale=structuredClone(state);stale.data['business-bills'][0].invoiceNo='LOST';const result=await save(stale,revision-1);assert.equal(result.conflict,true);assert.deepEqual(await current(),state);assert.equal((await db.query('select * from public.procurement_state_events')).rows.length,1);
 await assert.rejects(db.exec('delete from public.procurement_state_events'),/permission denied/);
});
test('direct RPC cannot bypass HR restriction, cross-workspace RLS, owned-draft rule or duplicate invoices',async()=>{
 const state=await current();const changed=structuredClone(state);changed.data['business-bills'][0].description='HR bypass';
 await as(hr);await assert.rejects(save(changed),/Procurement access denied/);
 await as(outsider);assert.equal(await current(),undefined);await assert.rejects(save(changed),/row-level security/);
 await as(maker);const duplicate=structuredClone(state);duplicate.data['business-bills'].push({...duplicate.data['business-bills'][0],id:'duplicate',invoiceNo:'inv 1'});await assert.rejects(save(duplicate),/Duplicate supplier reference/);
 const foreign=structuredClone(state);foreign.data['business-bills'].push({...foreign.data['business-bills'][0],id:'foreign',organizationId:outsider,invoiceNo:'INV-2'});await assert.rejects(save(foreign),/Wrong procurement workspace/);
 assert.deepEqual(await current(),state);
});
test('independent bill approval, partial settlement, exact cash linkage and overpayment checks survive direct RPC calls',async()=>{
 let state=await current();state.data['business-bills'][0].status='Pending approval';state.data['business-bills'][0].submittedByUserId=maker;await save(state);
 state.data['business-bills'][0].status='Approved';state.data['business-bills'][0].approvedByUserId=maker;await assert.rejects(save(state),/Independent approval/);
 await as(checker);state.data['business-bills'][0].approvedByUserId=checker;await save(state);
 await as(maker);state.data['business-payments']=[{id:'payment',organizationId:org,createdByUserId:maker,status:'Draft',amount:40,billId:'bill',beneficiaryId:'supplier',reference:'PAY-1',accountId:'bank'}];await save(state);
 state.data['business-payments'][0].status='Pending approval';state.data['business-payments'][0].submittedByUserId=maker;await save(state);await as(checker);state.data['business-payments'][0].status='Approved';state.data['business-payments'][0].approvedByUserId=checker;await save(state);
 state.data['business-payments'][0].status='Paid';state.data['business-bills'][0].status='Part paid';await assert.rejects(save(state),/Exactly one matching cash/);
 state.data['cash-transactions']=[{id:'cash',sourceKey:'business-payment:payment:out',direction:'out',accountId:'bank',amount:-40}];await save(state);assert.equal((await current()).data['business-bills'][0].status,'Part paid');
 const edit=structuredClone(state);edit.data['business-payments'][0].amount=50;await assert.rejects(save(edit),/Paid records require/);
 const over=structuredClone(state);over.data['business-payments'].push({id:'over',organizationId:org,createdByUserId:checker,status:'Draft',amount:80,billId:'bill',reference:'PAY-2',accountId:'bank'});await save(over);over.data['business-payments'][1].status='Pending approval';over.data['business-payments'][1].submittedByUserId=checker;await save(over);await as(maker);over.data['business-payments'][1].status='Approved';over.data['business-payments'][1].approvedByUserId=maker;await save(over);over.data['business-payments'][1].status='Paid';over.data['cash-transactions'].push({id:'cash-over',sourceKey:'business-payment:over:out',direction:'out',accountId:'bank',amount:-80});await assert.rejects(save(over),/overpaid/);
});
test('paid reversal needs a persisted independently approved request and exactly one opposite cash entry',async()=>{
 await as(maker);let state=await current();const forged=structuredClone(state);Object.assign(forged.data['business-payments'][0],{status:'Reversed',reversalRequestId:'forged',reversalReason:'Attempted bypass'});await assert.rejects(save(forged),/Verified independent reversal/);
 state.data['reversal-requests']=[{id:'reversal',organizationId:org,createdByUserId:maker,requestedByUserId:maker,sourceType:'business-payment',sourceId:'payment',status:'Pending',amount:40,reason:'Fixture independent reversal'}];await save(state);
 await as(checker);Object.assign(state.data['business-payments'][0],{status:'Reversed',reversalRequestId:'reversal',reversalReason:'Fixture independent reversal'});state.data['reversal-requests'][0].status='Approved';state.data['reversal-requests'][0].approvedByUserId=checker;state.data['business-bills'][0].status='Approved';await assert.rejects(save(state),/matching cash reversal/);
 state.data['cash-transactions'].push({id:'cash-reverse',sourceKey:'reverse:business-payment:payment:out',direction:'in',accountId:'bank',amount:40});await save(state);
 assert.equal((await current()).data['business-payments'][0].amount,40);assert.equal((await current()).data['reversal-requests'][0].status,'Approved');
 const rewritten=structuredClone(state);rewritten.data['reversal-requests'][0].reason='Erased genuine history';await assert.rejects(save(rewritten),/immutable/);
});
test('closed periods and audit insertion failures roll back the entire workspace write',async()=>{
 await as(maker);const state=await current(),closed=structuredClone(state);closed.data['month-end-closes']=[{period:'2026-10',status:'Closed'}];closed.data['business-expenses']=[{id:'closed',organizationId:org,createdByUserId:maker,status:'Draft',amount:10,expenseDate:'2026-10-16'}];await assert.rejects(save(closed),/period is closed/);
 await db.exec('RESET ROLE;CREATE FUNCTION private.fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'Fixture audit failure\';END $$;CREATE TRIGGER fail_audit BEFORE INSERT ON public.procurement_state_events FOR EACH ROW EXECUTE FUNCTION private.fail_audit();');await as(maker);
 const next=structuredClone(state);next.data['business-expenses']=[{id:'rollback',organizationId:org,createdByUserId:maker,status:'Draft',amount:10,expenseDate:'2026-10-16'}];await assert.rejects(save(next),/Fixture audit failure/);assert.deepEqual(await current(),state);
});
