import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.mjs';
const uid='11111111-1111-4111-8111-111111111111';
const env={DALASIPAY_SUPABASE_URL:'https://test.supabase.co',DALASIPAY_SUPABASE_PUBLISHABLE_KEY:'test-public',ADMIN_MEMBERSHIP_SERVICE:{fetch:async()=>Response.json({authorized:false})}};
const url='https://admin.example.test/internal/admin/session';
test('unconfigured or unrelated endpoints disclose nothing',async()=>{
 assert.equal((await worker.fetch(new Request(url),{})).status,503);
 assert.equal((await worker.fetch(new Request('https://admin.example.test/'),env)).status,404);
});
test('validated owner without platform-admin membership is denied',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({id:uid});
 try{const r=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer sample-token'}}),env);assert.equal(r.status,403);assert.deepEqual(await r.json(),{authorized:false});}
 finally{globalThis.fetch=old;}
});
test('verified platform operator receives status without exposing credentials',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({id:uid});
 const adminEnv={...env,ADMIN_MEMBERSHIP_SERVICE:{fetch:async()=>Response.json({authorized:true})}};
 try{const r=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer sample-token'}}),adminEnv);assert.equal(r.status,200);assert.deepEqual(await r.json(),{authorized:true});assert.match(r.headers.get('cache-control'),/no-store/);}
 finally{globalThis.fetch=old;}
});

test('missing bearer token never contacts Supabase',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('unexpected upstream call')};
 try{const res=await worker.fetch(new Request(url),env);assert.equal(res.status,401);assert.equal(calls,0);}
 finally{globalThis.fetch=old;}
});
test('expired or forged bearer token is denied before administrator lookup',async()=>{
 const old=globalThis.fetch;let calls=0;
 globalThis.fetch=async target=>{calls++;assert.match(String(target),/\/auth\/v1\/user/);return Response.json({message:'JWT invalid'},{status:401})};
 try{const res=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer forged-token'}}),env);assert.equal(res.status,401);assert.equal(calls,1);}
 finally{globalThis.fetch=old;}
});
test('identity lookup failure returns unavailable rather than authorization',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({id:uid});
 const blockedEnv={...env,ADMIN_MEMBERSHIP_SERVICE:{fetch:async()=>Response.json({message:'restricted'},{status:403})}};
 try{const res=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer valid-token'}}),blockedEnv);assert.equal(res.status,503);assert.deepEqual(await res.json(),{authorized:false});}
 finally{globalThis.fetch=old;}
});
test('caller cannot spoof identity or invoke writes',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected call')};
 try{
  assert.equal((await worker.fetch(new Request(url+'?userId='+uid,{headers:{Authorization:'Bearer valid-token'}}),env)).status,400);
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{Authorization:'Bearer valid-token'}}),env)).status,405);
  assert.equal(calls,0);
 }finally{globalThis.fetch=old;}
});
