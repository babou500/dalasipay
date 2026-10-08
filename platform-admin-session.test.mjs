import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlatformAdminSessionHandler} from './platform-admin-session.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const url='https://admin.example.test/internal/admin/session';
const handler=(verifyToken=async()=>({userId:uid}),lookupPlatformAdmin=async()=>true)=>createPlatformAdminSessionHandler({verifyToken,lookupPlatformAdmin});
test('verified platform operator is read only',async()=>{
 const res=await handler()(new Request(url,{headers:{Authorization:'Bearer safe-token'}}));
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{authorized:true});
 assert.match(res.headers.get('cache-control'),/no-store/);
});
test('missing token, invalid token, owner without platform authorization are denied',async()=>{
 assert.equal((await handler()(new Request(url))).status,401);
 assert.equal((await handler(async()=>({userId:null}))(new Request(url,{headers:{Authorization:'Bearer bad'}}))).status,401);
 assert.equal((await handler(undefined,async()=>false)(new Request(url,{headers:{Authorization:'Bearer valid'}}))).status,403);
});
test('errors fail closed and endpoint denies writes and other routes',async()=>{
 assert.equal((await handler(async()=>{throw Error('secret')})(new Request(url,{headers:{Authorization:'Bearer valid'}}))).status,503);
 assert.equal((await handler()(new Request(url,{method:'POST'}))).status,405);
 assert.equal((await handler()(new Request('https://admin.example.test/other'))).status,404);
});

test('caller-selected identity query is rejected before authorization lookup',async()=>{
 let lookups=0;
 const h=handler(async()=>({userId:uid}),async()=>{lookups++;return true;});
 const response=await h(new Request(url+'?userId=22222222-2222-4222-8222-222222222222',{headers:{Authorization:'Bearer valid'}}));
 assert.equal(response.status,400);
 assert.equal(lookups,0);
});
