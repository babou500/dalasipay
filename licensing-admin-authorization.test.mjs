import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeSubscriptionReview,canApplySubscriptionDecision} from './licensing-admin-authorization.mjs';
const user='22222222-2222-4222-8222-222222222222';
const workspace='11111111-1111-4111-8111-111111111111';
test('workspace owner passes identity and role check without mutations',async()=>{
 const v=await authorizeSubscriptionReview({actorId:user,workspaceId:workspace,readMembership:async()=>({user_id:user,organization_id:workspace,role:'owner'})});
 assert.equal(v.authorized,true);assert.equal(canApplySubscriptionDecision(),false);
});
test('non-owner and other workspace membership denied',async()=>{
 for(const membership of [{user_id:user,organization_id:workspace,role:'payroll_admin'},{user_id:user,organization_id:'33333333-3333-4333-8333-333333333333',role:'owner'},null]){
  const v=await authorizeSubscriptionReview({actorId:user,workspaceId:workspace,readMembership:async()=>membership});
  assert.equal(v.authorized,false);
 }
});
test('invalid user and unavailable membership fail closed',async()=>{
 const bad=await authorizeSubscriptionReview({actorId:'invalid',workspaceId:workspace,readMembership:async()=>{throw Error('should not run')}});
 assert.equal(bad.authorized,false);
 const down=await authorizeSubscriptionReview({actorId:user,workspaceId:workspace,readMembership:async()=>{throw Error('private')}});
 assert.equal(down.authorized,false);assert.equal(down.reason,'authorization_unavailable');
});
