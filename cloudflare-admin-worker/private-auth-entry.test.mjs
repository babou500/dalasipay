import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateAdminHandler} from './private-auth-entry.mjs';
const req=(path='/internal/admin/authorize',method='POST')=>new Request('https://private.internal'+path,{method});
test('private auth fails closed on absent verified Access identity',async()=>{
 let queries=0;
 const run=createPrivateAdminHandler({verifyAccess:async()=>null,checkIdentity:async()=>{queries++;return true}});
 assert.equal((await run(req())).status,403);assert.equal(queries,0);
});
test('private auth returns true only after verified identity and approved database result',async()=>{
 const run=createPrivateAdminHandler({verifyAccess:async()=>({subject:'verified-subject'}),checkIdentity:async s=>s==='verified-subject'});
 const res=await run(req());assert.equal(res.status,200);assert.deepEqual(await res.json(),{authorized:true});
});
test('database denial, verification outage, and backend errors never authorize',async()=>{
 const denied=createPrivateAdminHandler({verifyAccess:async()=>({subject:'verified-subject'}),checkIdentity:async()=>false});
 assert.equal((await denied(req())).status,403);
 const down=createPrivateAdminHandler({verifyAccess:async()=>{throw Error('jwks down')},checkIdentity:async()=>true});
 assert.equal((await down(req())).status,503);
 const failed=createPrivateAdminHandler({verifyAccess:async()=>({subject:'verified-subject'}),checkIdentity:async()=>{throw Error('rpc denied')}});
 const res=await failed(req());assert.equal(res.status,503);assert.deepEqual(await res.json(),{authorized:false});
});
test('no GET, unexpected paths, or missing dependencies',async()=>{
 const run=createPrivateAdminHandler({verifyAccess:async()=>({subject:'verified-subject'}),checkIdentity:async()=>true});
 assert.equal((await run(req('/', 'GET'))).status,404);
 assert.equal((await run(req('/internal/admin/authorize','GET'))).status,404);
 assert.throws(()=>createPrivateAdminHandler(),TypeError);
});
