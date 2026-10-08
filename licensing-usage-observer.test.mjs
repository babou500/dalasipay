import test from 'node:test';
import assert from 'node:assert/strict';
import {buildObservedUsage,queryObservedPeopleCounts} from './licensing-usage-observer.mjs';
test('trusted counts retain correct integers and unknown transactional usage',()=>{
 const r=buildObservedUsage({memberCount:3,employeeCount:5});
 assert.equal(r.users,3);assert.equal(r.employees,5);
 assert.equal(r.invoicesPerMonth,null);assert.equal(r.supplierBillsPerMonth,null);
});
test('invalid or absent source counts are unknown rather than zero',()=>{
 const r=buildObservedUsage({memberCount:-1,employeeCount:NaN});
 assert.equal(r.users,null);assert.equal(r.employees,null);assert.equal(r.companies,null);
});
test('each count is scoped to the same workspace',async()=>{
 const seen=[];
 const r=await queryObservedPeopleCounts({workspaceId:'org-1',countMembers:async id=>{seen.push(['members',id]);return 2},countEmployees:async id=>{seen.push(['employees',id]);return 4}});
 assert.deepEqual(seen.sort(),[['employees','org-1'],['members','org-1']]);
 assert.equal(r.users,2);assert.equal(r.employees,4);
});
