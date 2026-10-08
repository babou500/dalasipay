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
  if(String(target).includes('/auth/v1/user'))return Response.json({id:user});
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
  assert.equal(m.calls.length,3);
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
