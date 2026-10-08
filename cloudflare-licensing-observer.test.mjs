import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSubscription } from './licensing-observer-core.mjs';
import { createLicensingObserver } from './cloudflare-licensing-observer.mjs';

test('Professional Preview is observational and unlimited',()=>{
 const out=evaluateSubscription({workspaceId:'existing',planId:'professional',professionalPreview:true,usage:{employees:200,users:30}});
 assert.equal(out.mode,'observe_only');
 assert.equal(out.enforcementActive,false);
 assert.equal(out.planId,'professional-preview');
 assert.equal(out.usage.employees.overLimit,null);
});
test('free usage can be reported over limit without restricting writes',()=>{
 const out=evaluateSubscription({workspaceId:'new',planId:'free',usage:{employees:6,invoicesPerMonth:26}});
 assert.equal(out.usage.employees.overLimit,true);
 assert.equal(out.usage.invoicesPerMonth.overLimit,true);
 assert.equal(out.enforcementActive,false);
});
test('requires both server-side loaders',()=>{
 assert.throws(()=>createLicensingObserver({}),TypeError);
});
test('denies unauthorized workspace and never loads its snapshot',async()=>{
 let loaded=false;
 const observer=createLicensingObserver({authorizeWorkspace:async()=>false,loadWorkspaceSnapshot:async()=>{loaded=true;return null;}});
 const out=await observer({principal:{id:'member'},workspaceId:'other_workspace'});
 assert.equal(out.ok,false);
 assert.equal(loaded,false);
});
test('server data must match authenticated workspace',async()=>{
 const observer=createLicensingObserver({authorizeWorkspace:async()=>true,loadWorkspaceSnapshot:async()=>({workspaceId:'wrong',planId:'free',usage:{}})});
 assert.equal((await observer({principal:{id:'member'},workspaceId:'correct'})).reason,'snapshot_unavailable');
});
