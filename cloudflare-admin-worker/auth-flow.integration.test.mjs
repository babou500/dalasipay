import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import staging from './staging-entry.mjs';
import {renderSubscriptions} from './subscriptions-dashboard.mjs';
const source=await readFile(new URL('./worker-paste-private.js',import.meta.url),'utf8');
const {createPrivateWorker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const issuer='https://fixture.cloudflareaccess.com';
const subject='verified-immutable-subject';
const env={ACCESS_ISSUER:issuer,ACCESS_AUDIENCE:'dashboard-audience',EXPECTED_ADMIN_ACCESS_SUBJECT:subject,DALASIPAY_SUPABASE_URL:'https://zdpmlzmljozcmqndyfog.supabase.co',DALASIPAY_SUPABASE_SERVICE_ROLE_KEY:'fixture-credential'};
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const key={...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'fixture-key',alg:'RS256',use:'sig'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function sign(overrides={},header={}){const input=encode({alg:'RS256',kid:key.kid,...header})+'.'+encode({iss:issuer,aud:[env.ACCESS_AUDIENCE],iat:1000,exp:2000,sub:subject,email:'same@example.test',...overrides});return input+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');}
function setup({privateEnv=env,membership=true,rpcStatus=200,rpcBody,keys=[key],jwksDown=false,jwksStatus=200,rows,subscriptionsDown=false}={}){
 const calls=[];
 const fetchImpl=async(target,options)=>{
  const url=new URL(target);calls.push({url,options});
  if(url.pathname==='/cdn-cgi/access/certs'){assert.equal(url.origin,issuer);assert.equal(options.redirect,'manual');if(jwksDown)throw Error('secret upstream detail');return Response.json({keys},{status:jwksStatus});}
  assert.equal(url.origin,env.DALASIPAY_SUPABASE_URL);
  assert.equal(options.headers.apikey,'fixture-credential');
  if(url.pathname.includes('/rpc/')){assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{p_subject:subject});return Response.json(rpcBody??membership,{status:rpcStatus});}
  assert.equal(url.pathname,'/rest/v1/workspace_subscriptions');assert.equal(options.method,'GET');assert.equal(url.searchParams.get('limit'),'101');assert.match(url.searchParams.get('select'),/organizations\(name\)/);
  if(subscriptionsDown)throw Error('secret db detail');
  return Response.json(rows??[{organization_id:'workspace-fixture',organizations:{name:'Example Trading Ltd'},plan_id:'professional',status:'professional_preview',professional_preview:true,updated_at:'2026-10-09T00:00:00Z',private_field:'must not escape'}]);
 };
 const privateWorker=createPrivateWorker({fetchImpl,cryptoImpl:webcrypto,now:()=>1500});
 const binding={fetch:request=>privateWorker.fetch(request,privateEnv)};
 const run=async(path='/',jwt,extra={})=>staging.fetch(new Request('https://staging.example.test'+path,{headers:jwt?{'cf-access-jwt-assertion':jwt,'x-user-id':'attacker','x-user-email':'same@example.test'}:extra}),{ADMIN_MEMBERSHIP_SERVICE:binding});
 return {run,calls,privateWorker};
}
test('two Workers: verified actual JWT subject authorizes read-only real-data adapter',async()=>{
 const a=setup();const r=await a.run('/',await sign());assert.equal(r.status,200);const html=await r.text();assert.match(html,/workspace-fixture/);assert.match(html,/Example Trading Ltd/);assert.match(html,/Unlimited/);assert.doesNotMatch(html,/fixture-credential|private_field|must not escape/);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-security-policy'),/default-src 'none'/);assert.equal(a.calls.length,3);
});
test('identity match requires no database credential and does not appoint administrators',async()=>{
 const a=setup({privateEnv:{ACCESS_ISSUER:issuer+'/',ACCESS_AUDIENCE:env.ACCESS_AUDIENCE,EXPECTED_ADMIN_ACCESS_SUBJECT:subject}});
 const r=await a.run('/internal/admin/identity-match',await sign());assert.equal(r.status,200);assert.deepEqual(await r.json(),{identityMatched:true});assert.equal(a.calls.length,1);
 const b=setup({privateEnv:{...env,EXPECTED_ADMIN_ACCESS_SUBJECT:'different-verified-subject'}});assert.deepEqual(await (await b.run('/internal/admin/identity-match',await sign())).json(),{identityMatched:false});
});
test('staging preserves sanitized configuration, identity, JWKS and RPC failures as 503',async()=>{
 for(const [options,check] of [[{privateEnv:{}},'configuration'],[{privateEnv:{...env,EXPECTED_ADMIN_ACCESS_SUBJECT:''}},'identity_configuration'],[{jwksDown:true},'signing_keys_request'],[{rpcStatus:403},'membership_service'],[{rpcBody:{authorized:true}},'membership_response'],[{privateEnv:{...env,DALASIPAY_SUPABASE_SERVICE_ROLE_KEY:''}},'database_configuration'],[{subscriptionsDown:true},'subscription_service']]){
  const a=setup(options);const path=check==='identity_configuration'?'/internal/admin/identity-match':'/';const r=await a.run(path,await sign());assert.equal(r.status,503);assert.deepEqual(await r.json(),{authorized:false,check});
 }
});
test('signed but unappointed operator denied; subscription table never queried',async()=>{
 const a=setup({membership:false});assert.equal((await a.run('/',await sign())).status,403);assert.equal(a.calls.length,2);
});
test('wrong issuer, audience, expiry, future nbf/iat, unknown key and wrong algorithm denied before RPC',async()=>{
 for(const [claims,header] of [[{iss:'https://attacker.cloudflareaccess.com'},{}],[{aud:['other']},{}],[{exp:1500},{}],[{nbf:1600},{}],[{iat:1600},{}],[{sub:''},{}],[{}, {kid:'unknown'}],[{}, {alg:'none'}]]){
  const a=setup();assert.equal((await a.run('/',await sign(claims,header))).status,403);assert.ok(a.calls.every(c=>c.url.pathname==='/cdn-cgi/access/certs'));
 }
});
test('tampered subject and matching email cannot bypass signature verification',async()=>{
 const token=await sign();const [h,,sig]=token.split('.');const forged=h+'.'+encode({iss:issuer,aud:[env.ACCESS_AUDIENCE],iat:1000,exp:2000,sub:'forged-subject',email:'same@example.test'})+'.'+sig;
 const a=setup();assert.equal((await a.run('/',forged)).status,403);assert.equal(a.calls.length,1);
});
test('absent and oversized assertions, browser appointment and mutation paths denied',async()=>{
 const a=setup();assert.equal((await a.run('/')).status,403);assert.equal((await a.run('/','x'.repeat(16001))).status,403);assert.equal((await a.run('/internal/admin/appoint',await sign())).status,404);assert.equal(a.calls.length,0);
 const r=await staging.fetch(new Request('https://staging.example.test/',{method:'POST',headers:{'cf-access-jwt-assertion':await sign()}}),{});assert.equal(r.status,404);
});
test('signing key rotation loads current trusted keys on the next request',async()=>{
 const a=setup({keys:[]});assert.equal((await a.run('/',await sign())).status,403);const b=setup();assert.equal((await b.run('/',await sign())).status,200);
});
test('private response and binding failures cannot masquerade as identity mismatch',async()=>{
 for(const service of [{fetch:async()=>{throw Error('sensitive detail')}},{fetch:async()=>Response.json({check:'secret token'},{status:503})},{fetch:async()=>Response.json({identityMatched:'true'})}]){
  const r=await staging.fetch(new Request('https://staging.example.test/internal/admin/identity-match',{headers:{'cf-access-jwt-assertion':await sign()}}),{ADMIN_MEMBERSHIP_SERVICE:service});assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret token|sensitive detail/);
 }
});
test('subscription pagination bounded; only safe columns cross private boundary',async()=>{
 const a=setup({rows:Array.from({length:101},(_,i)=>({organization_id:String(i),organizations:{name:'Business '+i},plan_id:'professional',status:'professional_preview',professional_preview:true,updated_at:'now',secret:'hidden'}))});
 const r=await a.run('/internal/admin/subscriptions?offset=100',await sign());const data=await r.json();assert.equal(r.status,200);assert.equal(data.subscriptions.length,100);assert.equal(data.nextOffset,200);assert.ok(data.subscriptions.every(x=>!('secret' in x)&&typeof x.organization_name==='string'&&!('organizations' in x)));assert.equal(a.calls.at(-1).url.searchParams.get('offset'),'100');assert.equal((await a.run('/?offset=-1',await sign())).status,400);
});
test('dashboard escapes database strings',()=>{const html=renderSubscriptions({subscriptions:[{organization_id:'<script>alert(1)</script>',plan_id:'&',status:'"',professional_preview:true,updated_at:'<img>'}],nextOffset:null});assert.doesNotMatch(html,/<script>|<img>/);assert.match(html,/&lt;script&gt;/);});
test('private URL exposure disabled in tracked deployment config',async()=>{const config=await readFile(new URL('./wrangler.private.toml',import.meta.url),'utf8');assert.match(config,/workers_dev = false/);assert.match(config,/preview_urls = false/);assert.ok(config.includes('routes = []'));});

test('redirected signing keys and RPCs fail closed without forwarding credentials',async()=>{
 for(const [options,check] of [[{jwksStatus:302},'signing_keys_http'],[{rpcStatus:302},'membership_service']]){
  const a=setup(options);const response=await a.run('/',await sign());assert.equal(response.status,503);assert.equal((await response.json()).check,check);
  assert.ok(a.calls.every(call=>call.options.redirect==='manual'));
 }
});
test('existing admin/check route preserves explicit denial and successful approval',async()=>{
 const a=setup();assert.deepEqual(await (await a.run('/internal/admin/check',await sign())).json(),{authorized:true});
 const b=setup({membership:false});assert.equal((await b.run('/internal/admin/check',await sign())).status,403);
});

test('dashboard search and entitlement filters are read-only, escaped and page scoped',async()=>{
 const a=setup({rows:[
  {organization_id:'id-1',organizations:{name:'Alpha Traders'},plan_id:'professional',status:'professional_preview',professional_preview:true,updated_at:'2026-10-09T00:00:00Z'},
  {organization_id:'id-2',organizations:{name:'Beta Services'},plan_id:'standard',status:'active',professional_preview:false,updated_at:'2026-10-09T00:00:00Z'}
 ]});
 const jwt=await sign();
 const alpha=await a.run('/?q=Alpha&status=preview',jwt);
 assert.equal(alpha.status,200);
 assert.match(alpha.headers.get("content-security-policy"),/form-action 'self'/);
 const body=await alpha.text();
 assert.match(body,/Alpha Traders/);assert.doesNotMatch(body,/Beta Services/);
 assert.match(body,/Showing 1 of 2 records/);
 const other=await(await a.run('/?status=other',jwt)).text();
 assert.match(other,/Beta Services/);assert.doesNotMatch(other,/Alpha Traders/);
 const malicious=renderSubscriptions({subscriptions:[],nextOffset:null},{query:'"><script>alert(1)</script>',status:'all'});
 assert.doesNotMatch(malicious,/<script>/);assert.match(malicious,/&lt;script&gt;/);
 assert.equal(a.calls.filter(x=>x.url.pathname.includes('/rpc/')).length,2);
});
