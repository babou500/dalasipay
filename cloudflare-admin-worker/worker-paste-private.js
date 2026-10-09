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
async function signedIdentity(request,env){
 const token=request.headers.get('cf-access-jwt-assertion');
 if(!token||token.length>16000)return null;
 const parts=token.split('.');if(parts.length!==3)return null;
 let head,claims;try{head=parse(parts[0]);claims=parse(parts[1]);}catch{return null;}
 if(head?.alg!=='RS256'||typeof head.kid!=='string'||!head.kid||head.kid.length>256)return null;
 const issuer=issuerBase(env.ACCESS_ISSUER);
 const expectedIssuer=issuer;
 const now=Math.floor(Date.now()/1000);
 if(claims?.iss!==expectedIssuer&&claims?.iss!==expectedIssuer+'/')return null;
 if(!Array.isArray(claims.aud)||!claims.aud.includes(env.ACCESS_AUDIENCE))return null;
 if(!Number.isSafeInteger(claims.exp)||claims.exp<=now||!Number.isSafeInteger(claims.iat)||claims.iat>now+60)return null;
 if(typeof claims.sub!=='string'||claims.sub.length<8||claims.sub.length>256)return null;
 const jwks=await fetch(issuer+'/cdn-cgi/access/certs',{redirect:'error'});
 if(!jwks.ok)throw Error('Access certificates unavailable');
 const data=await jwks.json();
 const key=data?.keys?.find(k=>k.kid===head.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
 if(!key)return null;
 try{
 const cryptoKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const signed=new TextEncoder().encode(parts[0]+'.'+parts[1]);
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',cryptoKey,b64(parts[2]),signed);
 return valid?claims.sub:null;
 }catch{return null;}
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method!=='POST'||!['/internal/admin/authorize','/internal/admin/identity-match'].includes(url.pathname))return answer(404);
  // Keep fail-closed until encrypted credential is installed.
  if(!env?.DALASIPAY_SUPABASE_URL||!env?.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY||
     !env?.ACCESS_ISSUER||!env?.ACCESS_AUDIENCE)return diagnostic('configuration');
  let subject;
  try{subject=await signedIdentity(request,env);}catch{return diagnostic('token_verification_service');}
  if(!subject)return answer(403);
  if(url.pathname==='/internal/admin/identity-match'){
   const expected=env?.EXPECTED_ADMIN_ACCESS_SUBJECT;
   if(typeof expected!=='string'||expected.length<8)return diagnostic('identity_configuration');
   return new Response(JSON.stringify({identityMatched:subject===expected}),{status:200,headers:H});
  }
  try{
   const endpoint=new URL('/rest/v1/rpc/platform_admin_identity_authorized_internal',env.DALASIPAY_SUPABASE_URL);
   if(endpoint.protocol!=='https:'||endpoint.hostname!=='zdpmlzmljozcmqndyfog.supabase.co')return answer(503);
   const response=await fetch(endpoint.toString(),{
    method:'POST',
    headers:{'content-type':'application/json','apikey':env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,
      'authorization':'Bearer '+env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,'cache-control':'no-store'},
    body:JSON.stringify({p_subject:subject})
   });
   if(!response.ok)return answer(503);
   const approved=await response.json();
   if(typeof approved!=='boolean')return answer(503);
   return approved===true?answer(200,true):answer(403);
  }catch{return answer(503);}
 }
};
