'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
function form(values={}){const feedback={textContent:''};return {values,dataset:{},inert:false,querySelector:s=>s==='[data-master-feedback]'?feedback:null,append(){},feedback};}
function fixture(){
 const messages=[],writes=[],state={org:{id:'workspace'},session:{userId:'maker',name:'Maker'},taxSettings:{vatRegistered:true,standardRate:15},paymentBeneficiaries:[{id:'supplier',organizationId:'workspace',name:'Fixture Supplier',status:'Active'}],cashAccounts:[{id:'bank',name:'Bank',type:'Bank',status:'Active'}],businessExpenses:[],businessBills:[],businessPayments:[],purchaseOrders:[],cashTransactions:[],salesCatalog:[],inventoryMovements:[]};
 const control={allowed:true,error:null,hold:null,closed:false};
 const window={DalasiProduction:{commitProcurementData:async(org,changes,event,before)=>{if(control.hold)await control.hold;if(control.error)throw control.error;writes.push(structuredClone({org,changes,event,before}));}},DalasiMonthClose:{isClosed:()=>control.closed}};
 class Data extends Map{constructor(f){super(Object.entries(f.values||{}));}get(k){return super.get(k)??null;}}
 const document={createElement:()=>form()};
 for(const file of ['master-data-forms.js','tax-vat.js','cash-bank.js','returns-credits.js','sales-catalog.js','business-payments.js','expenses-purchases.js','general-ledger.js','reversal-approvals.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,document,crypto,Date,Math,FormData:Data,console,setTimeout,clearTimeout});
 const ctx={can:()=>control.allowed,toast:m=>messages.push(m),render:()=>{},save:()=>{throw Error('Queued save must not be used');},audit:()=>{throw Error('Unconfirmed audit must not be used');}};
 const event=values=>({target:form(values),preventDefault(){}});
 const billValues={beneficiaryId:'supplier',supplier:'Fixture Supplier',invoiceNo:'INV-1',invoiceDate:'2026-10-16',dueDate:'2026-11-16',amount:'115',taxCode:'STD',taxPricingMode:'inclusive',settlementChoice:'credit',plannedPaymentAmount:'40'};
 return {window,state,ctx,control,messages,writes,event,billValues};
}
test('expense save waits for backend, locks double-click, and preserves data and evidence on failure',async()=>{
 const f=fixture();let finish;f.control.hold=new Promise(r=>finish=r);
 const ev=f.event({merchant:'Shop',amount:'115',expenseDate:'2026-10-16',taxCode:'STD',reference:'RECEIPT-1'});
 const pending=f.window.DalasiExpensesPurchases.createExpense(ev,f.state,f.ctx);
 await Promise.resolve();assert.equal(f.state.businessExpenses.length,0);assert.equal(ev.target.inert,true);
 assert.equal(await f.window.DalasiExpensesPurchases.createExpense(ev,f.state,f.ctx),null);
 f.control.error={code:'offline'};finish();assert.equal(await pending,null);assert.equal(f.state.businessExpenses.length,0);assert.equal(ev.target.values.reference,'RECEIPT-1');assert.match(ev.target.feedback.textContent,/offline/);assert.equal(f.messages.length,0);
 f.control.hold=null;f.control.error=null;assert.equal(await f.window.DalasiExpensesPurchases.createExpense(ev,f.state,f.ctx),true);
 assert.equal(f.state.businessExpenses[0].organizationId,'workspace');assert.equal(f.state.businessExpenses[0].vatAmount,15);assert.equal(f.state.businessExpenses[0].status,'Draft');assert.equal(f.state.cashTransactions.length,0);
 assert.equal(await f.window.DalasiExpensesPurchases.createExpense(ev,f.state,f.ctx),null);assert.equal(f.writes.length,1);
});
test('credit expense uses existing bill collection only; permissions, stale workspace and duplicate invoice fail closed',async()=>{
 const f=fixture(),values={...f.billValues,supplierId:'supplier',merchant:'Fixture Supplier',expenseDate:'2026-10-16'};
 assert.equal(await f.window.DalasiExpensesPurchases.createExpense(f.event(values),f.state,f.ctx),true);
 assert.equal(f.state.businessExpenses.length,0);assert.equal(f.state.businessBills.length,1);assert.equal(f.state.businessBills[0].plannedPaymentAmount,40);assert.equal(f.state.businessPayments.length,0);
 assert.equal(await f.window.DalasiExpensesPurchases.createExpense(f.event({...values,invoiceNo:' inv 1 '}),f.state,f.ctx),null);
 f.control.allowed=false;assert.equal(await f.window.DalasiBusinessPayments.createBill(f.event({...f.billValues,invoiceNo:'INV-2'}),f.state,f.ctx),null);
 assert.equal(f.writes.length,1);
});
test('VAT inclusive/exclusive, discounts and mixed purchase lines produce balanced AP recognition without cash',async()=>{
 for(const pricing of ['inclusive','exclusive']){
  const f=fixture();await f.window.DalasiBusinessPayments.createBill(f.event({...f.billValues,amount:115,discountReceived:15,taxPricingMode:pricing}),f.state,f.ctx);
  const bill=f.state.businessBills[0];assert.equal(bill.amount,pricing==='inclusive'?100:115);
  assert.equal(f.window.DalasiGeneralLedger.journals(f.state).length,0);
  await f.window.DalasiBusinessPayments.updateBill(bill.id,'Pending approval',f.state,f.ctx);
  assert.equal(await f.window.DalasiBusinessPayments.updateBill(bill.id,'Approved',f.state,f.ctx),null);
  f.state.session={userId:'checker',name:'Checker'};await f.window.DalasiBusinessPayments.updateBill(bill.id,'Approved',f.state,f.ctx);
  const rows=f.window.DalasiGeneralLedger.journals(f.state).filter(x=>x.source==='Supplier bill');
  assert.equal(Math.round(rows.reduce((sum,x)=>sum+x.debit-x.credit,0)*100),0);assert.equal(rows.find(x=>x.account==='Accounts Payable').credit,f.state.businessBills[0].amount);assert.equal(f.state.cashTransactions.length,0);
 }
 const f=fixture(),tax=f.window.DalasiExpensesPurchases.purchaseTaxSummary(f.state,[{quantity:1,unitPrice:115,discount:0,taxCode:'STD'},{quantity:1,unitPrice:100,discount:10,taxCode:'EXEMPT'}],'STD','inclusive');
 assert.equal(tax.taxGross,205);assert.equal(tax.taxNet,190);assert.equal(tax.vatAmount,15);assert.equal(tax.preDiscountTaxNet,200);
});
test('partial settlements require independent approval, reduce AP, prevent overpayment and duplicate cash posting',async()=>{
 const f=fixture();await f.window.DalasiBusinessPayments.createBill(f.event(f.billValues),f.state,f.ctx);const id=f.state.businessBills[0].id;
 await f.window.DalasiBusinessPayments.updateBill(id,'Pending approval',f.state,f.ctx);f.state.session={userId:'checker',name:'Checker'};await f.window.DalasiBusinessPayments.updateBill(id,'Approved',f.state,f.ctx);
 for(const [amount,reference] of [[40,'PAY-1'],[75,'PAY-2']]){
  f.state.session={userId:'maker',name:'Maker'};await f.window.DalasiBusinessPayments.create(f.event({billId:id,beneficiaryId:'supplier',amount,accountId:'bank',reference}),f.state,f.ctx);
  const pid=f.state.businessPayments[0].id;await f.window.DalasiBusinessPayments.update(pid,'Pending approval',f.state,f.ctx);
  assert.equal(await f.window.DalasiBusinessPayments.update(pid,'Approved',f.state,f.ctx,{comment:'Checked invoice'}),null);
  f.state.session={userId:'checker',name:'Checker'};await f.window.DalasiBusinessPayments.update(pid,'Approved',f.state,f.ctx,{comment:'Checked invoice'});await f.window.DalasiBusinessPayments.update(pid,'Paid',f.state,f.ctx);
  const count=f.state.cashTransactions.length;await f.window.DalasiBusinessPayments.update(pid,'Paid',f.state,f.ctx);assert.equal(f.state.cashTransactions.length,count);
  assert.equal(f.window.DalasiReturns.billBalance(f.state,f.state.businessBills[0]),amount===40?75:0);
 }
 assert.equal(f.state.businessBills[0].status,'Paid');assert.equal(f.state.cashTransactions.length,2);
 const rows=f.window.DalasiGeneralLedger.journals(f.state);assert.equal(Math.round(rows.reduce((sum,x)=>sum+x.debit-x.credit,0)*100),0);assert.equal(rows.filter(x=>x.account==='Accounts Payable').reduce((sum,x)=>sum+x.credit-x.debit,0),0);
 assert.equal(await f.window.DalasiBusinessPayments.create(f.event({billId:id,amount:1,payee:'Fixture Supplier'}),f.state,f.ctx),null);
 f.state.session={userId:'maker',name:'Maker'};
 const paidId=f.state.businessPayments[0].id;
 await f.window.DalasiReversalApprovals.request(f.state,{sourceType:'business-payment',sourceId:paidId,sourceRef:'PAY-2',amount:75,reason:'Fixture reversal review'},f.ctx);
 const reversalId=f.state.reversalRequests[0].id;assert.equal(f.state.reversalRequests[0].status,'Pending');
 assert.equal(await f.window.DalasiReversalApprovals.approve(reversalId,f.state,f.ctx),null);
 f.state.session={userId:'checker',name:'Checker'};await f.window.DalasiReversalApprovals.approve(reversalId,f.state,f.ctx);
 assert.equal(f.state.reversalRequests[0].status,'Approved');assert.equal(f.state.businessPayments[0].status,'Reversed');assert.equal(f.window.DalasiReturns.billBalance(f.state,f.state.businessBills[0]),75);
 const reversalCount=f.state.cashTransactions.length;await f.window.DalasiReversalApprovals.approve(reversalId,f.state,f.ctx);assert.equal(f.state.cashTransactions.length,reversalCount);
});
test('closed periods and foreign suppliers cannot create expenses, bills or liabilities',async()=>{
 const f=fixture();f.control.closed=true;assert.equal(await f.window.DalasiBusinessPayments.createBill(f.event(f.billValues),f.state,f.ctx),null);
 f.control.closed=false;f.state.paymentBeneficiaries[0].organizationId='other';assert.equal(await f.window.DalasiBusinessPayments.createBill(f.event(f.billValues),f.state,f.ctx),null);assert.equal(f.writes.length,0);
});
test('received product/service PO converts atomically to one mixed-VAT bill and clears inventory receipt once',async()=>{
 const f=fixture();f.state.salesCatalog=[{id:'stock',type:'Product',name:'Fixture stock',status:'Active',stockOnHand:0,costPrice:0}];
 f.state.purchaseOrders=[{id:'po',organizationId:'workspace',supplierId:'supplier',supplierName:'Fixture Supplier',poNumber:'PO-1',status:'Ordered',amount:205,subtotal:215,discountTotal:10,taxCode:'STD',taxPricingMode:'inclusive',lineItems:[{catalogId:'stock',description:'Stock',quantity:1,unitPrice:115,discount:0,taxCode:'STD'},{description:'Service',quantity:1,unitPrice:100,discount:10,taxCode:'EXEMPT'}]}];
 await f.window.DalasiExpensesPurchases.updatePurchase('po','Received',f.state,f.ctx);assert.equal(f.state.salesCatalog[0].stockOnHand,1);assert.equal(f.state.inventoryMovements[0].costAmount,100);
 const ev=f.event({purchaseId:'po',invoiceNo:'PO-INV-1',invoiceDate:'2026-10-16',dueDate:'2026-11-16',taxCode:'STD',taxPricingMode:'inclusive',settlementChoice:'credit'});
 await f.window.DalasiExpensesPurchases.createBillFromPurchase(ev,f.state,f.ctx);const bill=f.state.businessBills[0];assert.equal(bill.amount,205);assert.equal(bill.vatAmount,15);assert.equal(f.state.purchaseOrders[0].linkedBillId,bill.id);assert.ok(f.writes.at(-1).changes['purchase-orders']);assert.ok(f.writes.at(-1).changes['business-bills']);
 await f.window.DalasiExpensesPurchases.createBillFromPurchase(ev,f.state,f.ctx);assert.equal(f.state.businessBills.length,1);assert.equal(f.state.inventoryMovements.length,1);
 await f.window.DalasiBusinessPayments.updateBill(bill.id,'Pending approval',f.state,f.ctx);f.state.session={userId:'checker',name:'Checker'};await f.window.DalasiBusinessPayments.updateBill(bill.id,'Approved',f.state,f.ctx);
 const rows=f.window.DalasiGeneralLedger.journals(f.state);assert.equal(Math.round(rows.reduce((sum,x)=>sum+x.debit-x.credit,0)*100),0);assert.equal(rows.filter(x=>x.account==='Inventory Receipt Clearing').reduce((sum,x)=>sum+x.debit-x.credit,0),0);assert.equal(f.state.cashTransactions.length,0);
});
