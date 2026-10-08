import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedLicensingEndpoint} from './verified-licensing-endpoint.mjs';
const org='11111111-1111-4111-8111-111111111111', user='22222222-2222-4222-8222-222222222222';
function endpoint(){
 const seen=[];
 const authClient={auth:{async getUser(token){seen.push(token);return token==='valid'?{data:{user:{id:user}},error:null}:{data:{user:null},error:{message:'invalid'}};}}};
 const adminClient={from(table){const criteria={};const q={select(){return q},eq(k,v){criteria[k]=v;return q},async maybeSingle(){if(table==='organization_members')return {data:criteria.user_id===user?{user_id:user}:null,error:null};return {data:{organization_id:org,plan_id:'professional',status:'professional_preview',professional_preview:true},error:null};}};return q;}};
 return {handle:createVerifiedLicensingEndpoint({authClient,adminClient}),seen};
}
test('no bearer token yields unauthorized',async()=>{
 const {handle}=endpoint(),r=await handle(new Request('https://example.test/observe?workspaceId='+org));
 assert.equal(r.status,401);
});
test('invalid token yields unauthorized',async()=>{
 const {handle}=endpoint(),r=await handle(new Request('https://example.test/observe?workspaceId='+org,{headers:{authorization:'Bearer invalid'}}));
 assert.equal(r.status,401);
});
test('verified token and membership yields observation-only preview',async()=>{
 const {handle,seen}=endpoint();
 const r=await handle(new Request('https://example.test/observe?workspaceId='+org,{headers:{authorization:'Bearer valid'}}));
 const data=await r.json();assert.equal(r.status,200);assert.deepEqual(seen,['valid']);assert.equal(data.planId,'professional-preview');assert.equal(data.enforcementActive,false);
});
test('missing verification dependency fails during construction',()=>{
 assert.throws(()=>createVerifiedLicensingEndpoint({authClient:{},adminClient:{from(){}}}),TypeError);
});
