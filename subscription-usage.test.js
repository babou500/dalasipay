'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const usage=require('./subscription-usage.js');
test('counts only records in requested month',()=>{
 const x=usage.snapshot({employees:[{id:1},{id:2,deleted:true}],users:[{id:1}],companyCount:1,customerInvoices:[{issueDate:'2026-10-01'},{issueDate:'2026-09-30'}],businessBills:[{billDate:'2026-10-08'},{billDate:'2026-10-03',deleted:true}]},'2026-10');
 assert.equal(x.employees,1);assert.equal(x.users,1);assert.equal(x.invoicesPerMonth,1);assert.equal(x.supplierBillsPerMonth,1);
});
test('unknown monthly arrays do not masquerade as zero',()=>{
 const x=usage.snapshot({},'2026-10');assert.equal(x.invoicesPerMonth,null);assert.equal(x.supplierBillsPerMonth,null);assert.equal(x.companies,null);
});
test('render is display-only and does not add actions',()=>{
 const x=usage.snapshot({customerInvoices:[],businessBills:[]},'2026-10');
 const html=usage.render(x,{companies:1,users:2,employees:5,invoicesPerMonth:25,supplierBillsPerMonth:25});
 assert.match(html,/Informational counts only/);assert.doesNotMatch(html,/<button|onclick=|data-action=/i);
});
