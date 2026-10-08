import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseLicensingProvider} from './supabase-licensing-provider.mjs';
const org='11111111-1111-4111-8111-111111111111';
const user='22222222-2222-4222-8222-222222222222';
function fake(){
 const calls=[];
 const adminClient={from(table){
  const filters={};
  const chain={select(){return chain},eq(k,v){filters[k]=v;return chain},async maybeSingle(){
    calls.push({table,filters:{...filters}});
    if(table==='organization_members')return {data:{user_id:user},error:null};
    return {data:{organization_id:org,plan_id:'professional',status:'professional_preview',professional_preview:true},error:null};
  }};
  return chain;
 }};
 return {adminClient,calls};
}
test('membership authorization requires verified principal and matching workspace',async()=>{
 const f=fake(),p=createSupabaseLicensingProvider(f);
 assert.equal(await p.authorizeWorkspace({principal:{userId:user},workspaceId:org}),true);
 assert.equal(await p.authorizeWorkspace({principal:{userId:'not-valid'},workspaceId:org}),false);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].table,'organization_members');
 assert.equal(f.calls[0].filters.user_id,user);
});
test('subscription snapshot is read-only and usage remains unknown',async()=>{
 const f=fake(),p=createSupabaseLicensingProvider(f);
 const result=await p.loadWorkspaceSnapshot({workspaceId:org});
 assert.equal(result.planId,'professional');
 assert.equal(result.professionalPreview,true);
 assert.equal(result.usage.invoicesPerMonth,null);
 assert.equal(result.usage.supplierBillsPerMonth,null);
 assert.equal(f.calls[0].table,'workspace_subscriptions');
});
test('server client is mandatory',()=>assert.throws(()=>createSupabaseLicensingProvider({}),TypeError));

test('trusted usage counts appear only in server snapshot',async()=>{
 const p=createSupabaseLicensingProvider({adminClient:fake().adminClient,countWorkspaceRecords:async(table,workspaceId)=>{assert.equal(workspaceId,org);return table==='employees'?7:3;}});
 const snapshot=await p.loadWorkspaceSnapshot({workspaceId:org});
 assert.equal(snapshot.usage.users,3);
 assert.equal(snapshot.usage.employees,7);
 assert.equal(snapshot.usage.invoicesPerMonth,null);
});
test('count service outage does not block subscription verification',async()=>{
 const p=createSupabaseLicensingProvider({adminClient:fake().adminClient,countWorkspaceRecords:async()=>{throw Error('private network detail')}});
 const snapshot=await p.loadWorkspaceSnapshot({workspaceId:org});
 assert.equal(snapshot.usage.users,null);
 assert.equal(snapshot.usage.employees,null);
});
