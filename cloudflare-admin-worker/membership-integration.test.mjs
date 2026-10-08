import test from 'node:test';
import assert from 'node:assert/strict';
import admin from './index.mjs';
import {createMembershipIntegration} from './membership-integration.mjs';
const id='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const url='https://admin.test/internal/admin/session';
function setup({verifiedId=id,member=true,authStatus=200,dbFails=false}={}){
 let lookups=0,verifications=0;
 const fakeFetch=async()=>{verifications++;return authStatus===200?Response.json({id:verifiedId}):Response.json({error:'invalid'},{status:authStatus});};
 const privateHandler=createMembershipIntegration({supabaseUrl:'https://test.supabase.co',publishableKey:'public-test',fetchImpl:fakeFetch,lookupMembership:async userId=>{lookups++;if(dbFails)throw Error('database unavailable');return member&&userId===id;}});
 const binding={fetch:request=>privateHandler(request)};
 return {binding,fakeFetch,counts:()=>({lookups,verifications})};
}
test('end-to-end two independent token checks authorize only verified member',async()=>{
 const a=setup();
 const original=globalThis.fetch;globalThis.fetch=a.fakeFetch;
 try{
  const res=await admin.fetch(new Request(url,{headers:{Authorization:'Bearer valid'}}),{DALASIPAY_SUPABASE_URL:'https://test.supabase.co',DALASIPAY_SUPABASE_PUBLISHABLE_KEY:'public-test',ADMIN_MEMBERSHIP_SERVICE:a.binding});
  assert.equal(res.status,200);assert.deepEqual(await res.json(),{authorized:true});assert.deepEqual(a.counts(),{lookups:1,verifications:2});
 }finally{globalThis.fetch=original;}
});
test('rejected token never reaches membership lookup',async()=>{
 const a=setup({authStatus:401});const original=globalThis.fetch;globalThis.fetch=a.fakeFetch;
 try{const res=await admin.fetch(new Request(url,{headers:{Authorization:'Bearer invalid'}}),{DALASIPAY_SUPABASE_URL:'https://test.supabase.co',DALASIPAY_SUPABASE_PUBLISHABLE_KEY:'public-test',ADMIN_MEMBERSHIP_SERVICE:a.binding});assert.equal(res.status,401);assert.equal(a.counts().lookups,0);}
 finally{globalThis.fetch=original;}
});
test('private service denies spoofed identity and membership failures',async()=>{
 const a=setup();const request=new Request('https://membership.internal/check',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify({userId:other})});
 assert.equal((await a.binding.fetch(request)).status,403);assert.equal(a.counts().lookups,0);
 const b=setup({dbFails:true});
 const request2=new Request('https://membership.internal/check',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json'},body:JSON.stringify({userId:id})});
 assert.equal((await b.binding.fetch(request2)).status,503);
});
test('integration cannot start without explicit trusted dependencies',()=>{
 assert.throws(()=>createMembershipIntegration({supabaseUrl:'https://test.supabase.co',publishableKey:'public-test'}),TypeError);
});
