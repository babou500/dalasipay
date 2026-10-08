import test from 'node:test';
import assert from 'node:assert/strict';
import {observedAppUsage} from './licensing-app-state-usage.mjs';
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
