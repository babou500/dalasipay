import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateMembershipService} from './private-membership.mjs';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const request=(userId=id,token='valid')=>new Request('https://membership.internal/check',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({userId})});
test('verified identity and authorized membership yield boolean only',async()=>{
 const handler=createPrivateMembershipService({verifyToken:async()=>({userId:id}),checkMembership:async()=>true});
 const response=await handler(request());assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{authorized:true});assert.match(response.headers.get('cache-control'),/no-store/);
});
test('user ID spoofing cannot reach membership check',async()=>{
 let checks=0;const handler=createPrivateMembershipService({verifyToken:async()=>({userId:id}),checkMembership:async()=>{checks++;return true}});
 assert.equal((await handler(request(other))).status,403);assert.equal(checks,0);
});
test('missing or invalid token and nonmember fail closed',async()=>{
 const handler=createPrivateMembershipService({verifyToken:async()=>null,checkMembership:async()=>true});
 assert.equal((await handler(request())).status,403);
 assert.equal((await handler(new Request('https://membership.internal/check',{method:'POST'}))).status,401);
 const nonmember=createPrivateMembershipService({verifyToken:async()=>({userId:id}),checkMembership:async()=>false});
 assert.equal((await nonmember(request())).status,403);
});
test('verification and database exceptions fail closed',async()=>{
 const verifyError=createPrivateMembershipService({verifyToken:async()=>{throw Error('unavailable')},checkMembership:async()=>true});
 assert.equal((await verifyError(request())).status,503);
 const dbError=createPrivateMembershipService({verifyToken:async()=>({userId:id}),checkMembership:async()=>{throw Error('unavailable')}});
 assert.equal((await dbError(request())).status,503);
});
test('malformed requests and writes denied',async()=>{
 const handler=createPrivateMembershipService({verifyToken:async()=>({userId:id}),checkMembership:async()=>true});
 assert.equal((await handler(new Request('https://membership.internal/check',{method:'GET'}))).status,404);
 assert.equal((await handler(request('bad-user-id'))).status,400);
});
