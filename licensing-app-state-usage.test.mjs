import test from 'node:test';
import assert from 'node:assert/strict';
import {observedAppUsage,observeIssuedDocuments,observeMonthlyWorkspaceDocuments} from './licensing-app-state-usage.mjs';
test('reads actual saved employee roster without treating invoices as billable',()=>{
 const usage=observedAppUsage({state:{data:{employees:[{id:'a'},{id:'b'}],'customer-invoices':[{}],'business-bills':[{}]}}});
 assert.equal(usage.employees,2);
 assert.equal(usage.invoicesPerMonth,null);
 assert.equal(usage.supplierBillsPerMonth,null);
});
test('missing or invalid roster is unknown, not zero',()=>{
 assert.equal(observedAppUsage(null).employees,null);
 assert.equal(observedAppUsage({state:{data:{employees:{}}}}).employees,null);
});

test('diagnostic monthly issued counts exclude draft cancelled and backdated issue dates',()=>{
 const docs=[
  {status:'Draft',createdAt:'2026-10-02T10:00:00Z'},
  {status:'Sent',createdAt:'2026-10-07T12:00:00Z',issueDate:'2026-09-01'},
  {status:'Paid',createdAt:'2026-10-08T10:00:00Z'},
  {status:'Cancelled',createdAt:'2026-10-08T10:00:00Z'},
  {status:'Sent',createdAt:'2026-09-30T10:00:00Z'}
 ];
 assert.equal(observeIssuedDocuments(docs,'2026-10'),2);
 const report=observeMonthlyWorkspaceDocuments({state:{data:{'customer-invoices':docs,'business-bills':[]}}},'2026-10');
 assert.equal(report.invoices,2);
 assert.equal(report.supplierBills,0);
 assert.equal(report.authoritative,false);
});
test('missing records remain unknown',()=>{
 const report=observeMonthlyWorkspaceDocuments({state:{data:{}}},'2026-10');
 assert.equal(report.invoices,null);
 assert.equal(report.supplierBills,null);
});
