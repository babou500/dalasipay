import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.mjs';
const org='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
const env={DALASIPAY_SUPABASE_URL:'https://example.supabase.co',DALASIPAY_SUPABASE_PUBLISHABLE_KEY:'publishable-test',DALASIPAY_SUPABASE_SERVICE_ROLE_KEY:'server-secret-test'};
const url='https://worker.example/internal/licensing/observe?workspaceId='+org;
function mockedFetch(){
 const previous=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (target,options)=>{
  calls.push({url:String(target),headers:options?.headers});
  if(options?.method==='HEAD')return new Response(null,{status:200,headers:{'content-range':'*/0'}});
  if(String(target).includes('/auth/v1/user'))return Response.json({id:user});
  if(String(target).includes('organization_app_state'))return Response.json([{state:{data:{employees:[{id:'emp-1'}]}}}]);
  if(String(target).includes('organization_members'))return Response.json([{user_id:user}]);
  if(String(target).includes('workspace_subscriptions'))return Response.json([{organization_id:org,plan_id:'professional',status:'professional_preview',professional_preview:true}]);
  throw Error('unexpected endpoint');
 };
 return {calls,restore(){globalThis.fetch=previous}};
}
test('unknown paths return 404 without touching backend',async()=>{
 const r=await worker.fetch(new Request('https://worker.example/'),{});
 assert.equal(r.status,404);
});
test('missing secret bindings return 503 without disclosure',async()=>{
 const r=await worker.fetch(new Request(url),{});
 assert.equal(r.status,503);
 assert.doesNotMatch(await r.text(),/SERVICE_ROLE_KEY/);
});
test('valid user and membership see read-only Professional Preview',async()=>{
 const m=mockedFetch();
 try{
  const r=await worker.fetch(new Request(url,{headers:{authorization:'Bearer valid-token'}}),env);
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.planId,'professional-preview');
  assert.equal(body.enforcementActive,false);
  assert.equal(body.usage.invoicesPerMonth.count,null);
  assert.equal(m.calls.length,6);
  assert.equal(body.usage.employees.count,1);
  assert.ok(m.calls[1].url.includes('organization_members'));
  assert.ok(m.calls[2].url.includes('workspace_subscriptions'));
  assert.doesNotMatch(JSON.stringify(body),/server-secret-test/);
 }finally{m.restore()}
});
test('no bearer token never queries organization records',async()=>{
 const m=mockedFetch();
 try{
  const r=await worker.fetch(new Request(url),env);
  assert.equal(r.status,401);
  assert.equal(m.calls.length,0);
 }finally{m.restore()}
});

test('Supabase outage returns 503 with no sensitive details',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>{throw new Error('internal credential or network detail');};
 try{
  const r=await worker.fetch(new Request(url,{headers:{authorization:'Bearer valid-token'}}),env);
  assert.equal(r.status,503);
  assert.match(r.headers.get('cache-control'),/no-store/);
  assert.doesNotMatch(await r.text(),/credential|network detail|server-secret-test/);
 }finally{globalThis.fetch=old;}
});

test('preflight only allows the DalasiPay origin',async()=>{
 const target='https://worker.example/internal/licensing/observe';
 const allowed=await worker.fetch(new Request(target,{method:'OPTIONS',headers:{origin:'https://dalasipay.bebusinesssolutionsgm.com'}}),{});
 assert.equal(allowed.status,204);
 assert.equal(allowed.headers.get('access-control-allow-origin'),'https://dalasipay.bebusinesssolutionsgm.com');
 const denied=await worker.fetch(new Request(target,{method:'OPTIONS',headers:{origin:'https://untrusted.example'}}),{});
 assert.equal(denied.status,403);
 assert.equal(denied.headers.get('access-control-allow-origin'),null);
});

test('trusted record counts returned only for authorized workspace',async()=>{
 const previous=globalThis.fetch;
 const counts=[];
 globalThis.fetch=async(target,options)=>{
  const url=String(target);
  if(url.includes('/auth/v1/user'))return Response.json({id:user});
  if(options?.method==='HEAD'){
   counts.push(url);
   const count=url.includes('/employees?')?'4':'2';
   return new Response(null,{status:200,headers:{'content-range':'0-0/'+count}});
  }
  if(url.includes('organization_app_state'))return Response.json([{state:{data:{employees:[{id:'a'},{id:'b'}]}}}]);
  if(url.includes('organization_members'))return Response.json([{user_id:user}]);
  if(url.includes('workspace_subscriptions'))return Response.json([{organization_id:org,plan_id:'professional',status:'professional_preview',professional_preview:true}]);
  throw Error('unexpected request');
 };
 try{
  const response=await worker.fetch(new Request(url,{headers:{authorization:'Bearer valid-token'}}),env);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.usage.users.count,2);
  assert.equal(body.usage.employees.count,2);
  assert.equal(body.usage.invoicesPerMonth.count,null);
  assert.equal(body.enforcementActive,false);
  assert.equal(counts.length,2);
  assert.ok(counts.every(x=>x.includes('organization_id=eq.')));
 }finally{globalThis.fetch=previous;}
});

test('unauthorized workspace cannot trigger usage counts or subscription reads',async()=>{
 const previous=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async(target,options)=>{
  const path=String(target);calls.push({path,method:options?.method});
  if(path.includes('/auth/v1/user'))return Response.json({id:user});
  if(path.includes('/organization_members'))return Response.json([]);
  throw Error('Unauthorized request attempted protected data retrieval');
 };
 try{
  const response=await worker.fetch(new Request(url,{headers:{authorization:'Bearer valid-token'}}),env);
  assert.equal(response.status,403);
  assert.equal(calls.filter(x=>x.method==='HEAD').length,0);
  assert.equal(calls.some(x=>x.path.includes('workspace_subscriptions')),false);
 }finally{globalThis.fetch=previous;}
});
