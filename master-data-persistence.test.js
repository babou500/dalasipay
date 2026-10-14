'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto').webcrypto;
const html=fs.readFileSync('index.html','utf8');
const source=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes("const APP_PREFIX = 'dalasipay-v3-org-';"));
function fixture(){
  const data=new Map(),writes=[],remote={revision:3,state:{schemaVersion:'test',data:{'transactions':[{id:'preserved',amount:321}],'subscriptions':Array.from({length:13},(_,id)=>({id,professional_preview:true})),billing:false}}};
  const storage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
  const control={allowed:true,online:true,error:null,org:'workspace',userId:'owner'};
  const window={DALASIPAY_CONFIG:{mode:'supabase'},addEventListener(){},DalasiAuth:{getSession:()=>({userId:control.userId,name:'Owner'}),getActiveOrganization:()=>({id:control.org}),can:()=>control.allowed},DalasiBackend:{configured:()=>true,repository:{appState:async()=>structuredClone(remote),saveAppState:async request=>{
    writes.push(request);await new Promise(resolve=>setTimeout(resolve,5));if(control.error)throw control.error;
    if(request.expectedRevision!==remote.revision)return {conflict:true};
    remote.state=structuredClone(request.state);return {revision:++remote.revision};
  }}}};
  vm.runInNewContext(source,{window,localStorage:storage,navigator:{get onLine(){return control.online;}},crypto,console,setTimeout,clearTimeout});
  const production=window.DalasiProduction;
  production.applyWorkspace('workspace',remote.state);storage.setItem('dalasipay-prod-revision-workspace',3);
  return {production,storage,remote,writes,control};
}
test('master records and audit persist through hydrate/refresh without changing financial data or subscriptions',async()=>{
  const f=fixture(),before=structuredClone(f.remote.state.data);
  const rows=[{id:'account',code:'6001',parentCode:'6000',type:'Expense',organizationId:'workspace'}];
  await f.production.commitMasterData('workspace','custom-accounts',rows,{action:'accounting.account_created',metadata:{accountId:'account'}});
  assert.equal(f.writes[0].organizationId,'workspace');assert.equal(f.writes[0].expectedRevision,3);
  for(const key of Object.keys(before))assert.deepEqual(f.remote.state.data[key],before[key]);
  assert.deepEqual(f.remote.state.data['custom-accounts'],rows);assert.equal(f.remote.state.data.audit[0].actorUserId,'owner');
  f.storage.removeItem('dalasipay-v3-org-workspace-custom-accounts');f.production.applyWorkspace('workspace',f.remote.state);
  assert.deepEqual(JSON.parse(f.storage.getItem('dalasipay-v3-org-workspace-custom-accounts')),rows);
});
test('conflicts, permission changes, offline and backend failures leave cache and audit untouched',async()=>{
  for(const mode of ['conflict','permission','offline','network','switched']){
    const f=fixture(),before=f.storage.getItem('dalasipay-v3-org-workspace-custom-accounts');
    if(mode==='conflict')f.remote.revision=4;
    if(mode==='permission')f.control.allowed=false;
    if(mode==='offline')f.control.online=false;
    if(mode==='network')f.control.error=Error('private backend detail');
    if(mode==='switched')f.control.org='another-workspace';
    await assert.rejects(f.production.commitMasterData('workspace','custom-accounts',[{code:'6001'}],{action:'accounting.account_created',metadata:{}}));
    assert.equal(f.storage.getItem('dalasipay-v3-org-workspace-custom-accounts'),before);
    assert.equal(f.storage.getItem('dalasipay-v3-org-workspace-audit'),null);
  }
});
test('master writes serialize with existing sync and retain both master collections and audit events',async()=>{
  const f=fixture();
  await Promise.all([
    f.production.commitMasterData('workspace','custom-accounts',[{id:'a'}],{action:'accounting.account_created',metadata:{}}),
    f.production.syncNow('workspace'),
    f.production.commitMasterData('workspace','payment-beneficiaries',[{id:'s'}],{action:'payment.beneficiary_created',metadata:{}})
  ]);
  assert.deepEqual(f.writes.map(w=>w.expectedRevision),[3,4,5]);
  assert.equal(f.remote.state.data['custom-accounts'][0].id,'a');assert.equal(f.remote.state.data['payment-beneficiaries'][0].id,'s');assert.equal(f.remote.state.data.audit.length,2);
});
test('record services wait for acknowledgement, report failure, reject missing workspace and detect hidden code collisions',async()=>{
  const window={DalasiGeneralLedger:{CHART:[[6000,'Operating Expenses','Expense']]}};
  for(const file of ['master-data-forms.js','accounting-journals.js','business-payments.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,crypto,Date,Math,FormData});
  const state={org:{id:'workspace'},session:{userId:'owner'},customAccounts:[{code:'6010',name:'Operating Expenses',type:'Expense'}],paymentBeneficiaries:[]},messages=[];
  let finish;const ctx={can:()=>true,toast:m=>messages.push(m),persist:()=>new Promise(resolve=>finish=resolve)};
  const promise=window.DalasiAccounting.createAccountRecord(state,{code:'6011',name:'Supplies',parentCode:'6000'},ctx);
  assert.equal(state.customAccounts.length,1);finish();const row=await promise;assert.equal(row.parentCode,'6000');assert.equal(row.type,'Expense');
  assert.equal(await window.DalasiAccounting.createAccountRecord(state,{code:'6010',name:'Collision',type:'Expense'},ctx),null);
  assert.equal(await window.DalasiAccounting.createAccountRecord({...state,org:null},{code:'6012',name:'No org',type:'Expense'},ctx),null);
  const bad={...ctx,persist:async()=>{throw Error('private backend detail');}};
  assert.equal(await window.DalasiBusinessPayments.createQuickSupplier(state,{name:'Failed Vendor'},bad),null);assert.equal(state.paymentBeneficiaries.length,0);assert.ok(messages.at(-1).includes('Unable to confirm'));assert.ok(!messages.at(-1).includes('private backend detail'));
});

test('supplier duplicate email, inactive records and workspace mismatch never create additional records',async()=>{
  const window={};for(const file of ['master-data-forms.js','business-payments.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,crypto,Date,Math,FormData});
  const state={org:{id:'workspace'},paymentBeneficiaries:[{id:'one',organizationId:'workspace',name:'Vendor',email:'vendor@example.test',status:'Active'}]},messages=[];let writes=0;
  const ctx={can:()=>true,toast:message=>messages.push(message),persist:async()=>{writes++;}};
  assert.equal((await window.DalasiBusinessPayments.createQuickSupplier(state,{name:'Changed spelling',email:'VENDOR@example.test'},ctx)).id,'one');
  state.paymentBeneficiaries[0].status='Inactive';assert.equal(await window.DalasiBusinessPayments.createQuickSupplier(state,{name:'vendor'},ctx),null);assert.match(messages.at(-1),/inactive/);
  state.paymentBeneficiaries[0].status='Active';state.paymentBeneficiaries[0].organizationId='other';assert.equal(await window.DalasiBusinessPayments.createQuickSupplier(state,{name:'vendor'},ctx),null);assert.match(messages.at(-1),/another workspace/);
  assert.equal(state.paymentBeneficiaries.length,1);assert.equal(writes,0);
});

test('switching workspace during a pending creation never appends the saved record to the new workspace',async()=>{
  const window={DalasiGeneralLedger:{CHART:[[6000,'Expenses','Expense']]}};for(const file of ['master-data-forms.js','accounting-journals.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,crypto,Date,Math,FormData});
  const state={org:{id:'first'},customAccounts:[]};let finish;
  const pending=window.DalasiAccounting.createAccountRecord(state,{code:'6001',name:'Child',parentCode:'6000'},{can:()=>true,toast:()=>{},persist:()=>new Promise(resolve=>finish=resolve)});
  state.org={id:'second'};state.customAccounts=[];finish();assert.equal(await pending,null);assert.equal(state.customAccounts.length,0);
});


test('a partial browser cache cannot remove server financial data or silently drop existing master records',async()=>{
  const f=fixture(),before=structuredClone(f.remote.state.data);
  f.storage.removeItem('dalasipay-v3-org-workspace-transactions');f.storage.removeItem('dalasipay-v3-org-workspace-subscriptions');f.storage.removeItem('dalasipay-v3-org-workspace-billing');
  await f.production.commitMasterData('workspace','custom-accounts',[{id:'new-account'}],{action:'accounting.account_created',metadata:{}});
  for(const key of Object.keys(before))assert.deepEqual(f.remote.state.data[key],before[key]);
  await f.production.syncNow('workspace');
  for(const key of Object.keys(before))assert.deepEqual(f.remote.state.data[key],before[key]);
  const count=f.writes.length;
  await assert.rejects(f.production.commitMasterData('workspace','custom-accounts',[{id:'different-account'}],{action:'accounting.account_created',metadata:{}}),error=>error.code==='conflict');
  assert.equal(f.writes.length,count);assert.equal(f.remote.state.data['custom-accounts'][0].id,'new-account');
});
