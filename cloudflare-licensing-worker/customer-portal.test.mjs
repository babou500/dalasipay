import {Script} from 'node:vm';
import {readFileSync} from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';import {handleCustomerPortal} from './customer-portal.mjs';
const env={DALASIPAY_SUPABASE_URL:'https://zdpmlzmljozcmqndyfog.supabase.co',DALASIPAY_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',DALASIPAY_SUPABASE_SERVICE_ROLE_KEY:'server-secret-never-exposed'};
const request=(input={action:'list',payload:{}},extra={})=>new Request('https://portal.fixture/subscriptions/api',{method:'POST',headers:{origin:'https://portal.fixture',authorization:'Bearer fixture-user-token','content-type':'application/json',...extra.headers},body:JSON.stringify(input)});
test('customer portal requires remote verified confirmed Auth before tenant RPC; only user credential forwarded',async()=>{const calls=[];const response=await handleCustomerPortal(request(),env,async(target,options)=>{calls.push({target,options});assert.equal(options.headers.authorization,'Bearer fixture-user-token');assert.equal(options.headers.apikey,'sb_publishable_fixture');assert.equal(options.redirect,'manual');return Response.json(target.endsWith('/user')?{id:'owner-id',email_confirmed_at:'2026-01-01'}:{businesses:[],plans:[]});});assert.equal(response.status,200);assert.equal(calls.length,2);assert.deepEqual(JSON.parse(calls[1].options.body),{p_action:'list',p_payload:{}});});
test('invalid identity, cross-origin, missing authorization and unknown actions denied without tenant data',async()=>{let calls=0;const invalid=async()=>{calls++;return Response.json({error:'bad'},{status:401});};assert.equal((await handleCustomerPortal(request(),env,invalid)).status,401);assert.equal(calls,1);assert.equal((await handleCustomerPortal(request({}, {headers:{origin:'https://attacker.fixture'}}),env,invalid)).status,403);assert.equal(calls,1);assert.equal((await handleCustomerPortal(request({action:'activate_billing',payload:{}}),env,invalid)).status,400);assert.equal(calls,1);assert.equal((await handleCustomerPortal(request({}, {headers:{authorization:''}}),env,invalid)).status,401);});
test('customer RPC ownership denial and stale request errors sanitized; no billing activation route',async()=>{for(const [code,expected]of [['42501',403],['55000',409]]){const response=await handleCustomerPortal(request({action:'submit',payload:{organization_id:'other'}}),env,async target=>Response.json(target.endsWith('/user')?{id:'owner',email_confirmed_at:'now'}:{code,message:'confidential detail'},{status:target.endsWith('/user')?200:400}));assert.equal(response.status,expected);assert.doesNotMatch(await response.text(),/confidential/);}assert.equal(await handleCustomerPortal(new Request('https://portal.fixture/activate_billing'),env),null);});
test('portal serves separate scripts, no service credentials or persistent token storage, and restrictive CSP',async()=>{for(const path of ['/subscriptions','/subscriptions/app.js','/subscriptions/style.css']){const response=await handleCustomerPortal(new Request('https://portal.fixture'+path),env);assert.equal(response.status,200);const body=await response.text();if(path.endsWith('.js'))new Script(body);assert.doesNotMatch(body,/server-secret-never-exposed|localStorage|sessionStorage|innerHTML|console\.log/);assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);assert.match(response.headers.get('cache-control'),/no-store/);}});

test('customer portal links to the main DalasiPay account registration rather than implementing a second signup',async()=>{
 const response=await handleCustomerPortal(new Request('https://portal.fixture/subscriptions'),env);
 assert.equal(response.status,200);
 const html=await response.text();
 const match=html.match(/<a href="([^"]+)"[^>]*>Create DalasiPay account<\\/a>/);
 assert.ok(match,'The portal should offer a clear create-account link');
 const target=new URL(match[1]);
 assert.equal(target.origin,'https://dalasipay.bebusinesssolutionsgm.com');
 assert.equal(target.pathname,'/');
 assert.equal(target.searchParams.get('auth'),'signup');
 assert.match(html,/This portal creates no customer accounts/);
 const mainApp=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(mainApp,/authView: new URLSearchParams\\(location\\.search\\)\\.get\\('auth'\\)==='signup'\\?'signup'/);
});
