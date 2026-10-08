import test from 'node:test';
import assert from 'node:assert/strict';
import {planReviewDecision} from './licensing-admin-review-plan.mjs';
const actor='22222222-2222-4222-8222-222222222222',org='11111111-1111-4111-8111-111111111111';
const request={id:'33333333-3333-4333-8333-333333333333',organization_id:org,requested_by:'44444444-4444-4444-8444-444444444444',status:'pending'};
const readMembership=async()=>({organization_id:org,user_id:actor,role:'owner'});
test('approved proposal is inert and mandates audit and atomicity',async()=>{const r=await planReviewDecision({actorId:actor,workspaceId:org,request,decision:'approved',note:'Reviewed request details',readMembership});assert.equal(r.valid,true);assert.equal(r.canExecute,false);assert.equal(r.requiresAtomicTransaction,true);assert.equal(r.requiresAuditEvent,true);});
test('deny self approval and cross tenant review',async()=>{const self=await planReviewDecision({actorId:actor,workspaceId:org,request:{...request,requested_by:actor},decision:'approved',note:'Reviewed request details',readMembership});assert.equal(self.valid,false);const cross=await planReviewDecision({actorId:actor,workspaceId:org,request:{...request,organization_id:'55555555-5555-4555-8555-555555555555'},decision:'rejected',note:'Reviewed request details',readMembership});assert.equal(cross.valid,false)});
test('deny non-owner stale request and invalid decision',async()=>{for(const change of [{request:{...request,status:'approved'}},{decision:'unknown'},{readMembership:async()=>({organization_id:org,user_id:actor,role:'viewer'})}]){const r=await planReviewDecision({actorId:actor,workspaceId:org,request,decision:'rejected',note:'Reviewed request details',readMembership,...change});assert.equal(r.valid,false);assert.equal(r.canExecute,false)}});
