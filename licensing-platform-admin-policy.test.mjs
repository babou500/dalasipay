import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePlatformAdminChange} from './licensing-platform-admin-policy.mjs';
const actor='11111111-1111-4111-8111-111111111111',target='22222222-2222-4222-8222-222222222222';
const valid={actorId:actor,targetId:target,action:'appoint',actorIsPlatformAdmin:true,confirmed:true,reason:'Verified independent admin request'};
test('even valid proposal remains inactive and requires two person review',()=>{
 const result=evaluatePlatformAdminChange(valid);
 assert.equal(result.valid,true);assert.equal(result.canExecute,false);
 assert.equal(result.requiresIndependentApproval,true);assert.equal(result.requiresAudit,true);
});
test('deny self appointment, unauthorized and missing approval',()=>{
 for(const variation of [{targetId:actor},{actorIsPlatformAdmin:false},{confirmed:false},{action:'unknown'}]){
  const result=evaluatePlatformAdminChange({...valid,...variation});
  assert.equal(result.valid,false);assert.equal(result.canExecute,false);
 }
});
