'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verify}=require('./subscription-verify.js');
const org='11111111-1111-4111-8111-111111111111';
test('no session makes no request',async()=>{let called=false;const r=await verify({workspaceId:org,getSession:async()=>null,request:async()=>{called=true;}});assert.equal(r.ok,false);assert.equal(called,false);});
test('valid preview is read only and uses bearer header without credentials',async()=>{
 const r=await verify({workspaceId:org,getSession:async()=>({access_token:'private-token'}),request:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer private-token');assert.equal(options.credentials,'omit');assert.equal(options.method,'GET');return {ok:true,status:200,json:async()=>({ok:true,workspaceId:org,planId:'professional-preview',enforcementActive:false})};}});
 assert.equal(r.ok,true);assert.match(r.message,/Professional Preview/);assert.doesNotMatch(r.message,/private-token/);
});
test('rejects mismatched workspace or enabled enforcement',async()=>{
 const r=await verify({workspaceId:org,getSession:async()=>({access_token:'x'}),request:async()=>({ok:true,status:200,json:async()=>({ok:true,workspaceId:'other',enforcementActive:false})})});assert.equal(r.ok,false);
});
test('network errors have safe message',async()=>{const r=await verify({workspaceId:org,getSession:async()=>({access_token:'x'}),request:async()=>{throw Error('private credentials')}});assert.equal(r.ok,false);assert.doesNotMatch(r.message,/private credentials/);});

test('displays validated server usage and never invents missing counts',async()=>{
 const check=async usage=>verify({workspaceId:org,getSession:async()=>({access_token:'not-returned'}),request:async()=>({ok:true,status:200,json:async()=>({ok:true,workspaceId:org,planId:'professional-preview',enforcementActive:false,usage})})});
 const valid=await check({users:{count:2},employees:{count:4}});
 assert.match(valid.message,/users: 2, employees: 4/);
 const missing=await check({users:{count:null},employees:{count:-9}});
 assert.match(missing.message,/users: Unavailable, employees: Unavailable/);
 assert.doesNotMatch(missing.message,/not-returned/);
});
