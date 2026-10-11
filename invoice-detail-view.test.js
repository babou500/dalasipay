const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
global.window={};
require('./sales-invoices.js');
const viewer=global.window.DalasiSalesInvoices;
const style=fs.readFileSync('ui-refinement.css','utf8');
const source=fs.readFileSync('sales-invoices.js','utf8');
const money2=value=>'D'+Number(value||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const helpers={icon:()=>'',esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),money2,pill:(status)=>'<span class="status-chip">'+status+'</span>'};
function sample(){
  const id='invoice-1';
  const inv={
    id,invoiceNo:'INV-2026-00001',customerName:'ABC Trading Ltd',status:'Sent',
    issueDate:'2026-10-02',dueDate:'2026-11-07',amount:58500,subtotal:60000,
    discountTotal:1500,taxCode:'OUT',taxPricingMode:'inclusive',
    lineItems:[{description:'Consulting services',unit:'Service',quantity:1,unitPrice:60000,amount:60000}],
    createdAt:'2026-10-02T10:00:00'
  };
  return {invoiceDetailId:id,customerInvoices:[inv],incomingPayments:[{
    id:'payment-1',invoiceId:id,amount:58500,receivedDate:'2026-10-08',receiptNumber:'REC-2026-001'
  }],customerCreditNotes:[],customerDebitNotes:[]};
}
test('invoice viewer keeps accessible title, full item/payment/audit sections and source action buttons',()=>{
  const state=sample();
  const view=viewer.invoiceDetailModal(state,helpers);
  assert.match(view,/<aside class="record-drawer invoice-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="invoice-detail-heading">/);
  assert.match(view,/<h2 id="invoice-detail-heading">INV-2026-00001<\/h2>/);
  assert.match(view,/aria-label="Close invoice details"/);
  assert.match(view,/ABC Trading Ltd/);
  for(const section of ['Invoice lines','Payment history','Document history & audit trail'])assert.ok(view.includes(section),section);
  assert.match(view,/Consulting services/);
  assert.match(view,/REC-2026-001/);
  assert.match(view,/D58,500\.00 collected of D58,500\.00/);
  assert.match(view,/100% collected/);
  assert.match(view,/data-action="receivable-doc:invoice:invoice-1"/);
  assert.match(view,/data-action="sales-doc:delivery:invoice-1"/);
  assert.match(view,/D60,000\.00/);
  assert.match(view,/D1,500\.00/);
  assert.match(view,/D0\.00/);
  assert.match(view,/Issue date/);
  assert.match(view,/Due date/);
  assert.match(view,/Gross before discount/);
  assert.match(view,/Sales discount/);
  assert.match(view,/VAT/);
});
test('invoice content escapes untrusted names and line descriptions',()=>{
  const state=sample();
  state.customerInvoices[0].customerName='<img src=x onerror=1>';
  state.customerInvoices[0].lineItems[0].description='<script>alert(1)</script>';
  const markup=viewer.invoiceDetailModal(state,helpers);
  assert.doesNotMatch(markup,/<img src=x|<script>alert/);
  assert.match(markup,/&lt;img/);
  assert.match(markup,/&lt;script/);
});
test('invoice-only drawer is fully scrollable with nonshrinking sections and a visible footer',()=>{
  assert.match(style,/\.record-drawer\.invoice-detail-drawer\s*\{[^}]*height:100dvh;[^}]*overflow-y:auto;/s);
  assert.match(style,/\.invoice-detail-drawer\s*>\s*\*\s*\{\s*flex:0 0 auto\s*\}/);
  assert.match(style,/\.invoice-detail-drawer \.record-section\s*\{[^}]*flex-shrink:0;[^}]*min-height:max-content;/s);
  assert.match(style,/\.invoice-detail-drawer \.record-drawer-actions\s*\{[^}]*position:sticky;[^}]*bottom:0;/s);
  assert.match(style,/env\(safe-area-inset-bottom\)/);
  assert.match(style,/@media\(max-width:760px\)\s*\{[^}]*\.record-drawer\.invoice-detail-drawer\s*\{width:100vw;/s);
});
test('invoice field values wrap instead of being ellipsized or truncated, with mobile line prices preserved',()=>{
  assert.match(style,/\.invoice-detail-drawer \.record-facts b\s*\{[^}]*white-space:normal;[^}]*overflow:visible;[^}]*text-overflow:clip;[^}]*overflow-wrap:anywhere;/s);
  assert.match(style,/@media\(max-width:560px\)\s*\{[^}]*\.invoice-detail-drawer \.record-facts\s*\{grid-template-columns:1fr\}/s);
  assert.match(style,/\.invoice-detail-drawer \.record-line>span\s*\{display:block;grid-column:1;grid-row:2\}/);
  assert.match(style,/\.invoice-detail-drawer \.record-line>strong\s*\{grid-column:2;grid-row:1 \/ span 2\}/);
  assert.equal(source.includes('function invoiceDetailModal(state,h)'),true);
});
test('invoice scope does not alter shared record drawer, subscription, payment or accounting implementations',()=>{
  assert.match(style,/\.record-drawer\.invoice-detail-drawer/);
  assert.doesNotMatch(source,/invoice-detail-drawer.*(?:billing|subscription|customer_subscription_portal)/);
  assert.match(source,/data-action="close-invoice-detail"/);
});
