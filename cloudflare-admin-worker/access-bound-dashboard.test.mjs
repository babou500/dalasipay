import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessBoundDashboard} from './access-bound-dashboard.mjs';
const issuer='https://test.cloudflareaccess.com/';
const audience='admin-app';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function setup(){
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(jwk,{kid:'key1',alg:'RS256',use:'sig'});
 const sign=async claims=>{const input=encode({alg:'RS256',kid:'key1'})+'.'+encode({iss:issuer,aud:[audience],sub:'approved-subject',iat:100,exp:300,...claims});const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input));return input+'.'+Buffer.from(sig).toString('base64url');};
 return {sign,config:{issuer,audience,loadKeys:async()=>({keys:[jwk]}),now:()=>200}};
}
const request=token=>new Request('https://admin.example.test/',{headers:{'cf-access-jwt-assertion':token}});
test('only a signed Access subject with an independently approved operator mapping can see the dashboard',async()=>{
 const {sign,config}=await setup();let checked=[];
 const dashboard=createAccessBoundDashboard({...config,checkApprovedOperator:async subject=>{checked.push(subject);return subject==='approved-subject';}});
 const response=await dashboard(request(await sign({})));
 assert.equal(response.status,200);assert.deepEqual(checked,['approved-subject']);
});
test('signed but unapproved Cloudflare member cannot see the dashboard',async()=>{
 const {sign,config}=await setup();
 const dashboard=createAccessBoundDashboard({...config,checkApprovedOperator:async()=>false});
 assert.equal((await dashboard(request(await sign({}))).status),403);
});
test('wrong audience, expired token, and missing token cannot reach membership lookup',async()=>{
 const {sign,config}=await setup();let calls=0;
 const dashboard=createAccessBoundDashboard({...config,checkApprovedOperator:async()=>{calls++;return true;}});
 assert.equal((await dashboard(request(await sign({aud:['other']})))).status,403);
 assert.equal((await dashboard(request(await sign({exp:150})))).status,403);
 assert.equal((await dashboard(new Request('https://admin.example.test/'))).status,403);
 assert.equal(calls,0);
});
test('operator lookup failure denies access and reveals no customer data',async()=>{
 const {sign,config}=await setup();
 const dashboard=createAccessBoundDashboard({...config,checkApprovedOperator:async()=>{throw Error('database unavailable');}});
 const response=await dashboard(request(await sign({})));
 assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/Plans & Workspaces/);
});
