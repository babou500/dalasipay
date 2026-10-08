import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const env={DALASIPAY_SUPABASE_URL:'https://test.supabase.co',DALASIPAY_SUPABASE_PUBLISHABLE_KEY:'test-public',DALASIPAY_SUPABASE_SERVICE_ROLE_KEY:'test-only'};
const url='https://admin.example.test/internal/admin/session';
test('unconfigured or unrelated endpoints disclose nothing',async()=>{
 assert.equal((await worker.fetch(new Request(url),{})).status,503);
 assert.equal((await worker.fetch(new Request('https://admin.example.test/'),env)).status,404);
});
test('validated owner without platform-admin membership is denied',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(target)=>String(target).includes('/auth/v1/user')?Response.json({id:uid}):Response.json([]);
 try{const r=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer sample-token'}}),env);assert.equal(r.status,403);assert.deepEqual(await r.json(),{authorized:false});}
 finally{globalThis.fetch=old;}
});
test('verified platform operator receives status without exposing credentials',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async(target)=>String(target).includes('/auth/v1/user')?Response.json({id:uid}):Response.json([{user_id:uid}]);
 try{const r=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer sample-token'}}),env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{authorized:true});assert.match(r.headers.get('cache-control'),/no-store/);}
 finally{globalThis.fetch=old;}
});
