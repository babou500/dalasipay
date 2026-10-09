// DalasiPay private authorization Worker — single-file staging deployment.
// Use ONLY in dalasipay-admin-auth-private with workers.dev routes disabled.
// The Worker never trusts user-selected identifiers; it verifies the signed
// Cloudflare Access token against the configured issuer and application audience.
// No secrets are exposed in responses. No admin exists until separately approved.
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const answer=(status,authorized=false)=>new Response(JSON.stringify({authorized}),{status,headers:H});
const diagnostic=(code)=>new Response(JSON.stringify({authorized:false,check:code}),{status:503,headers:H});
const textDecoder=new TextDecoder();
const b64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
function parse(s){return JSON.parse(textDecoder.decode(b64(s)));}
function issuerBase(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!url.hostname.endsWith('.cloudflareaccess.com'))throw Error('Access issuer configuration invalid');return url.origin;}
export async function signedIdentity(request,env,fetchImpl=fetch,cryptoImpl=crypto,now=Math.floor(Date.now()/1000)){
 const token=request.headers.get('cf-access-jwt-assertion');
 if(!token||token.length>16000)return null;
 const parts=token.split('.');if(parts.length!==3)return null;
 let head,claims;try{head=parse(parts[0]);claims=parse(parts[1]);}catch{return null;}
 if(head?.alg!=='RS256'||typeof head.kid!=='string'||!head.kid||head.kid.length>256)return null;
 const issuer=issuerBase(env.ACCESS_ISSUER);
 const expectedIssuer=issuer;

 if(claims?.iss!==expectedIssuer&&claims?.iss!==expectedIssuer+'/')return null;
 if(!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUDIENCE))return null;
 if(!Number.isSafeInteger(claims.exp)||claims.exp<=now||!Number.isSafeInteger(claims.iat)||claims.iat>now+60)return null;
 if(claims.nbf!==undefined&&(!Number.isSafeInteger(claims.nbf)||claims.nbf>now+60))return null;
 if(typeof claims.sub!=='string'||claims.sub.length<8||claims.sub.length>256)return null;
 // workerd supports manual/follow, not error. Never follow key-provider redirects.
 let jwks;
 try{jwks=await fetchImpl(issuer+'/cdn-cgi/access/certs',{redirect:'manual',signal:AbortSignal.timeout(10000)});}
 catch{throw Object.assign(new Error('Signing-key request unavailable'),{check:'signing_keys_request'});}
 if(!jwks.ok)throw Object.assign(new Error('Signing-key HTTP failure'),{check:'signing_keys_http'});
 let data;try{data=await jwks.json();}catch{throw Object.assign(new Error('Signing-key response invalid'),{check:'signing_keys_response'});}
 const key=data?.keys?.find(k=>k.kid===head.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
 if(!key)return null;
 try{
 const cryptoKey=await cryptoImpl.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const signed=new TextEncoder().encode(parts[0]+'.'+parts[1]);
 const valid=await cryptoImpl.subtle.verify('RSASSA-PKCS1-v1_5',cryptoKey,b64(parts[2]),signed);
 return valid?claims.sub:null;
 }catch{return null;}
}
export function createPrivateWorker({fetchImpl=fetch,cryptoImpl=crypto,now=()=>Math.floor(Date.now()/1000)}={}){
 return {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method!=='POST'||!['/internal/admin/authorize','/internal/admin/identity-match','/internal/admin/subscriptions'].includes(url.pathname))return answer(404);
  if(!env?.ACCESS_ISSUER||!env?.ACCESS_AUDIENCE)return diagnostic('configuration');
  try{issuerBase(env.ACCESS_ISSUER);}catch{return diagnostic('configuration');}
  let subject;
  try{subject=await signedIdentity(request,env,fetchImpl,cryptoImpl,now());}catch(error){return diagnostic(['signing_keys_request','signing_keys_http','signing_keys_response'].includes(error?.check)?error.check:'token_verification_service');}
  if(!subject)return answer(403);
  if(url.pathname==='/internal/admin/identity-match'){
   const expected=env?.EXPECTED_ADMIN_ACCESS_SUBJECT;
   if(typeof expected!=='string'||expected.length<8||expected.length>256)return diagnostic('identity_configuration');
   return new Response(JSON.stringify({identityMatched:subject===expected}),{status:200,headers:H});
  }
  if(!env.DALASIPAY_SUPABASE_URL||!env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY)return diagnostic('database_configuration');
  let base;
  try{
   base=new URL(env.DALASIPAY_SUPABASE_URL);
   if(base.origin!=='https://zdpmlzmljozcmqndyfog.supabase.co'||base.username||base.password||base.pathname!=='/'||base.search||base.hash)return diagnostic('database_configuration');
  }catch{return diagnostic('database_configuration');}
  const dbHeaders={'content-type':'application/json','apikey':env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,
   authorization:'Bearer '+env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,'cache-control':'no-store'};
  let approved;
  try{
   const response=await fetchImpl(new URL('/rest/v1/rpc/platform_admin_identity_authorized_internal',base),{
    method:'POST',headers:dbHeaders,body:JSON.stringify({p_subject:subject}),redirect:'manual',signal:AbortSignal.timeout(10000)
   });
   if(!response.ok)return diagnostic('membership_service');
   approved=await response.json();
   if(typeof approved!=='boolean')return diagnostic('membership_response');
  }catch{return diagnostic('membership_service');}
  if(!approved)return answer(403);
  if(url.pathname==='/internal/admin/authorize')return answer(200,true);
  let offset;
  try{const input=await request.json();offset=input.offset??0;if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return answer(400);}catch{return answer(400);}
  try{
   const endpoint=new URL('/rest/v1/workspace_subscriptions',base);
   endpoint.search=new URLSearchParams({select:'organization_id,plan_id,status,professional_preview,updated_at',order:'organization_id.asc',offset:String(offset),limit:'101'});
   const response=await fetchImpl(endpoint,{method:'GET',headers:dbHeaders,redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(!response.ok)return diagnostic('subscription_service');
   const rows=await response.json();
   if(!Array.isArray(rows)||rows.length>101||rows.some(r=>typeof r.organization_id!=='string'||typeof r.plan_id!=='string'||typeof r.status!=='string'||typeof r.professional_preview!=='boolean'||typeof r.updated_at!=='string'))return diagnostic('subscription_response');
   const subscriptions=rows.slice(0,100).map(({organization_id,plan_id,status,professional_preview,updated_at})=>({organization_id,plan_id,status,professional_preview,updated_at}));
   return new Response(JSON.stringify({authorized:true,subscriptions,nextOffset:rows.length>100?offset+100:null}),{status:200,headers:H});
  }catch{return diagnostic('subscription_service');}
 }
 };
}
export default createPrivateWorker();
