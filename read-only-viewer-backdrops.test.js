const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const contexts=[
 ['accounting-journals.js','close-journal-detail'],
 ['sales-invoices.js','close-invoice-detail'],
 ['business-payments.js','close-bill-detail'],
 ['business-payments.js','close-payment-detail'],
 ['business-payments.js','close-customer-account'],
 ['business-payments.js','close-supplier-account'],
 ['expenses-purchases.js','close-purchase-detail'],
 ['business-reports.js','business-report-close']
];
test('read-only viewers use light non-blurred backdrops, preserving click-to-close',()=>{
 for(const [file,action] of contexts){
  const source=fs.readFileSync(file,'utf8');
  const tag=source.match(new RegExp('<div class="modal-scrim"[^>]*data-action="'+action+'"[^>]*>'));
  assert.ok(tag, file+' missing overlay for '+action);
  assert.match(tag[0],/backdrop-filter:none/,file+' unexpectedly blurs background');
  assert.ok(tag[0].includes('background:rgba(6,16,13,.15)'),file+' shade unexpectedly changed');
 }
});
test('editing and approval dialogs still use default modal overlay',()=>{
 const sources=[['business-payments.js','close-business-payment'],['expenses-purchases.js','close-expense'],['accounting-journals.js','close-journal']];
 for(const [file,action] of sources){
  const content=fs.readFileSync(file,'utf8');
  assert.ok(content.includes('<div class="modal-scrim" data-action="'+action+'"></div>'),file+' should preserve the protective editing backdrop');
 }
});
