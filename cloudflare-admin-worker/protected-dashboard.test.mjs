import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedDashboard} from './protected-dashboard.mjs';
const req=()=>new Request('https://admin.example.test/');
test('dashboard requires a verified platform role, not only Cloudflare login',async()=>{
 const res=await createProtectedDashboard({verifyAccessAndPlatformRole:async()=>false})(req());
 assert.equal(res.status,403);assert.doesNotMatch(await res.text(),/Plans & Workspaces/);
});
test('dashboard fails closed on authorization outages and missing verifier',async()=>{
 assert.throws(()=>createProtectedDashboard(),TypeError);
 const res=await createProtectedDashboard({verifyAccessAndPlatformRole:async()=>{throw Error('lookup failed')}})(req());
 assert.equal(res.status,503);assert.match(res.headers.get('cache-control'),/no-store/);
});
test('authorized dashboard stays read only and no-store',async()=>{
 const res=await createProtectedDashboard({verifyAccessAndPlatformRole:async()=>true})(req());
 assert.equal(res.status,200);assert.match(await res.text(),/Platform Administration/);
 assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('unsupported routes and write operations are refused before verification',async()=>{
 let calls=0;const gate=createProtectedDashboard({verifyAccessAndPlatformRole:async()=>{calls++;return true}});
 assert.equal((await gate(new Request('https://admin.example.test/update',{method:'POST'}))).status,404);
 assert.equal(calls,0);
});
