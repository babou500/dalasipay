'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function load(filename,window){
  const source=fs.readFileSync(path.join(__dirname,filename),'utf8');
  vm.runInNewContext(source,{window,Date,Math,console,FormData,crypto:require('node:crypto').webcrypto},{filename});
  return window;
}
function context(allowed=true){
  const events=[],messages=[];
  return {events,messages,persist:async(key,rows,action,metadata)=>events.push([action,metadata]),can:()=>allowed,audit:(...args)=>events.push(args),save:()=>{},render:()=>{},toast:msg=>messages.push(msg)};
}
function accounting(){
  const win={DalasiGeneralLedger:{CHART:[[1000,'Cash & Bank','Asset'],[6000,'Operating Expenses','Expense']]}};
  load('master-data-forms.js',win);return load('accounting-journals.js',win).DalasiAccounting;
}
test('sub-account inherits parent type, gets unique code and persists',async()=>{
  const a=accounting(),state={org:{id:'workspace'},cashAccounts:[],customAccounts:[],session:{name:'Tester'}},ctx=context();
  const one=await a.createAccountRecord(state,{code:'',name:'Office Supplies',type:'Asset',parentCode:'6000'},ctx);
  assert.ok(one);assert.equal(one.code,'6001');assert.equal(one.type,'Expense');
  assert.equal(one.parentCode,'6000');assert.equal(state.customAccounts.length,1);
  assert.equal(ctx.events[0][0],'accounting.account_created');
  const two=await a.createAccountRecord(state,{code:'',name:'Cleaning',type:'Expense',parentCode:'6000'},ctx);
  assert.equal(two.code,'6002');
});
test('rejects duplicate account code/name, bad code, and unauthorised changes',async()=>{
  const a=accounting(),state={org:{id:'workspace'},cashAccounts:[],customAccounts:[]},ctx=context();
  assert.equal(await a.createAccountRecord(state,{code:'6000',name:'Duplicate code',type:'Expense'},ctx),null);
  assert.ok(await a.createAccountRecord(state,{code:'6010',name:'Stationery',type:'Expense'},ctx));
  assert.equal(await a.createAccountRecord(state,{code:'6010',name:'Transport',type:'Expense'},ctx),null);
  assert.equal(await a.createAccountRecord(state,{code:'6011',name:'STATIONERY',type:'Expense'},ctx),null);
  assert.equal(await a.createAccountRecord(state,{code:'6012-A',name:'Office',type:'Expense'},ctx),null);
  assert.equal(await a.createAccountRecord(state,{code:'6012',name:'Office',type:'Expense'},context(false)),null);
  assert.equal(state.customAccounts.length,1);
});
test('quick supplier is reusable, selected by ID, and cannot create duplicates',async()=>{
  const win={};load('master-data-forms.js',win);load('business-payments.js',win);
  const b=win.DalasiBusinessPayments,state={org:{id:'workspace'},paymentBeneficiaries:[],session:{name:'Tester'}},ctx=context();
  const a=await b.createQuickSupplier(state,{name:'Vendor One',phone:'+220 123456',email:'v@example.com'},ctx);
  assert.equal(a.kind,'Supplier / vendor');assert.equal(state.paymentBeneficiaries.length,1);
  assert.equal((await b.createQuickSupplier(state,{name:' vendor one '},ctx)).id,a.id);
  assert.equal(b.resolveBeneficiaryForTransaction(state,{beneficiaryId:a.id}).id,a.id);
  assert.equal(await b.createQuickSupplier(state,{name:'Vendor Two'},context(false)),null);
  assert.equal(ctx.events[0][0],'payment.beneficiary_created');
});
test('purchase, expense and journal forms expose inline creation choices',()=>{
  const a=accounting(),state={customAccounts:[],cashAccounts:[],paymentBeneficiaries:[]};
  const j=a.journalModal(state,{field:(_,html)=>html,icon:()=>''});
  assert.match(j,/value="__add_account__"/);assert.match(j,/data-journal-quick-account/);
  const acc=a.accountModal(state,{field:(_,html)=>html,icon:()=>''});
  assert.match(acc,/name="code"[^>]+value="1010"/);
  const win={DalasiBusinessPayments:{beneficiaryFields:()=>''},DalasiCashBank:{accountSelect:()=>'<select></select>'},DalasiCatalog:{lineItemsForm:()=>'<div>Items</div>'}};
  load('expenses-purchases.js',win);
  const h={field:(_,html)=>html,icon:()=>'',esc:x=>x};
  const po=win.DalasiExpensesPurchases.purchaseModal(state,h);
  const ex=win.DalasiExpensesPurchases.expenseModal(state,h);
  for(const html of [po,ex]){assert.match(html,/value="__add_supplier__"/);assert.match(html,/data-quick-supplier-panel/);}
  const root=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  assert.match(root,/bindQuickSupplier\(pof,state/);
  assert.match(root,/bindQuickSupplier\(exf,state/);
  assert.match(root,/bindJournalForm\(mjf,state,\{can,audit,save,toast,render\}\)/);
  assert.match(root,/bindAccountForm\(laf,state\)/);
});
