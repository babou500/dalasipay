import test from 'node:test';
import assert from 'node:assert/strict';
import {createLicensingHttpAdapter} from './licensing-http-adapter.mjs';
const workspace={workspaceId:'org_1',planId:'professional',professionalPreview:true,usage:{users:3,employees:8}};
const make=(auth,authorized=true)=>createLicensingHttpAdapter({
 authenticateRequest:async()=>auth,
 authorizeWorkspace:async()=>authorized,
 loadWorkspaceSnapshot:async()=>workspace
});
const request=(method='GET',suffix='?workspaceId=org_1')=>new Request('https://example.test/observe'+suffix,{method});
test('unauthenticated request is rejected and never cached',async()=>{
 const r=await make(null)(request());assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('cross-workspace request rejected',async()=>{assert.equal((await make({id:'user_1'},false)(request())).status,403);});
test('valid preview returns observation only',async()=>{
 const r=await make({id:'user_1'})(request());const body=await r.json();
 assert.equal(r.status,200);assert.equal(body.planId,'professional-preview');assert.equal(body.enforcementActive,false);
});
test('POST and repeated workspace parameters rejected',async()=>{
 const handle=make({id:'user_1'});
 assert.equal((await handle(request('POST'))).status,405);
 assert.equal((await handle(request('GET','?workspaceId=org_1&workspaceId=org_2'))).status,400);
});
test('data provider failure does not disclose stack or snapshot',async()=>{
 const handle=createLicensingHttpAdapter({authenticateRequest:async()=>({id:'u'}),authorizeWorkspace:async()=>true,loadWorkspaceSnapshot:async()=>{throw Error('database password');}});
 const r=await handle(request());assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/database password/);
});
