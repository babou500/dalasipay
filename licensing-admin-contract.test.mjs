import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProposedChange} from './licensing-admin-contract.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('valid proposal does not apply or bypass approval',()=>{
 const result=validateProposedChange({workspaceId:id,targetPlan:'standard',reason:'Requesting review for growing team'});
 assert.equal(result.valid,true);assert.equal(result.canApply,false);
 assert.equal(result.requiresServerAuthorization,true);assert.equal(result.requiresAuditRecord,true);
 assert.equal(result.requiresExplicitApproval,true);
});
test('unknown plan, missing reason or workspace invalid',()=>{
 for(const value of [{workspaceId:id,targetPlan:'gold',reason:'Requesting review'},{workspaceId:id,targetPlan:'free',reason:'short'},{workspaceId:'x',targetPlan:'free',reason:'Requesting review'}])assert.equal(validateProposedChange(value).valid,false);
});
