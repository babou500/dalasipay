'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window={};
require('./business-payments.js');
const m=global.window.DalasiBusinessPayments;
const html=fs.readFileSync('index.html','utf8');
const style=fs.readFileSync('ui-refinement.css','utf8');
const sales=fs.readFileSync('sales-invoices.js','utf8');
const helpers={
  esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  money2:x=>'D'+Number(x||0).toFixed(2),icon:()=>''
};
const invoice=()=>({id:'invoice-1',invoiceNo:'INV-2026-00018',customerName:'QA Customer',status:'Sent',amount:1000,issueDate:'2026-10-15'});
const state=()=>{
  const inv=invoice();
  return {org:{id:'test-workspace'},company:'DalasiPay Test',session:{name:'QA User'},
    invoiceDetailId:inv.id,customerInvoices:[inv],incomingPayments:[],cashAccounts:[{id:'bank-1',name:'Test Bank'}]};
};
test('receipt confirmation uses its own title, receipt number and PDF link instead of relabelling an invoice',()=>{
  const s=state(),p={id:'payment-1',invoiceId:'invoice-1',customerName:'QA Customer',
    receiptNumber:'CR-2026-00001',amount:250,method:'Bank transfer',receivedDate:'2026-10-15',
    accountId:'bank-1',reference:'BANK-0001',createdAt:'2026-10-15T12:00:00Z'};
  s.incomingPayments=[p];
  global.window.DalasiCashBank={accountById:(_,id)=>id==='bank-1'?{id,name:'Test Bank'}:null};
  const view=m.customerReceiptDetailModal({...s,customerReceiptDetailId:p.id},helpers);
  assert.match(view,/<div class="eyebrow">CUSTOMER RECEIPT<\/div>/);
  assert.match(view,/id="customer-receipt-heading">CR-2026-00001/);
  assert.match(view,/D250\.00/);
  assert.match(view,/D750\.00/);
  assert.match(view,/Test Bank/);
  assert.match(view,/data-action="receivable-doc:receipt:payment-1"/);
  assert.match(view,/data-action="invoice-view:invoice-1"/);
  assert.match(view,/data-action="close-customer-receipt"/);
  assert.doesNotMatch(view,/<div class="eyebrow">CUSTOMER INVOICE<\/div>/);
  assert.match(style,/\.customer-receipt-detail-wrap\s*\{z-index:150\}/);
  assert.match(html,/state\.customerReceiptDetailId\?window\.DalasiBusinessPayments\.customerReceiptDetailModal/);
  assert.match(html,/a\.startsWith\('customer-receipt-view:'\)/);
  assert.match(html,/a==='close-customer-receipt'/);
  assert.match(sales,/data-action="customer-receipt-view:/);
  assert.match(html,/ui-refinement\.css\?v=20261015-receipt-confirm/);
});
test('successful partial collection exposes the receipt while retaining invoice identity and double entry',()=>{
  const s=state(),actions=[],messages=[];
  global.window.DalasiCashBank={
    accountById:(_,id)=>id==='bank-1'?{id,name:'Test Bank'}:null,
    post:(_,item)=>actions.push(item)
  };
  const fields={invoiceId:'invoice-1',amount:'250',receivedDate:'2026-10-15',accountId:'bank-1',
    method:'Bank transfer',reference:'QA-PAY-001',note:'Part payment'};
  const original=global.FormData;
  global.FormData=class {constructor(target){this.fields=target.fields;}get(k){return this.fields[k]??null;}};
  let saves=0,renders=0;
  try{
    m.recordIncomingPayment({preventDefault(){},target:{fields}},s,{
      can:()=>true,toast:t=>messages.push(t),audit:()=>{},save:()=>saves++,render:()=>renders++
    });
  }finally{global.FormData=original;}
  assert.equal(s.incomingPayments.length,1);
  assert.equal(s.customerReceiptDetailId,s.incomingPayments[0].id);
  assert.equal(s.invoiceDetailId,'invoice-1');
  assert.equal(s.customerInvoices[0].status,'Part paid');
  assert.equal(s.incomingPaymentOpen,false);
  assert.equal(saves,1);assert.equal(renders,1);
  assert.equal(actions.length,1);
  assert.equal(actions[0].direction,'in');
  assert.equal(actions[0].sourceType,'customer-collection');
  assert.equal(actions[0].amount,250);
  assert.match(messages.join(' '),/Receipt CR-/);
  const preview=m.customerReceiptDetailModal(s,helpers);
  assert.match(preview,/CUSTOMER RECEIPT/);
  assert.match(preview,/D750\.00/);
});
test('PDF export for a saved receipt remains a payment receipt, not a customer invoice',()=>{
  const s=state(),p={id:'payment-1',invoiceId:'invoice-1',receiptNumber:'CR-2026-00001',
    amount:250,receivedDate:'2026-10-15',method:'Cash',createdAt:'2026-10-15T12:00:00Z'};
  s.incomingPayments=[p];
  let filename='',content='';
  m.downloadReceivableDocument(p.id,'receipt',s,{
    money2:helpers.money2,pdfDownload:(name,body)=>{filename=name;content=body;},toast:()=>{}
  });
  assert.match(filename,/^Customer_Receipt_QA_Customer_CR-2026-00001\.pdf$/);
  assert.match(content,/\(PAYMENT RECEIPT\)/);
  assert.doesNotMatch(content,/\(CUSTOMER INVOICE\)/);
});
