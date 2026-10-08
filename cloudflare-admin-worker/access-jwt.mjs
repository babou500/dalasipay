/* Undeployed Cloudflare Access JWT verification using Web Crypto.
 * Audience and issuer are pinned; JWKS is supplied by an independently
 * configured trusted loader. No decoded JWT claims are trusted before verify.
 */
const enc=new TextEncoder();
function decode(segment){const str=segment.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(str.padEnd(Math.ceil(str.length/4)*4,'=')),c=>c.charCodeAt(0));}
function json(segment){return JSON.parse(new TextDecoder().decode(decode(segment)));}
export function createAccessVerifier({issuer,audience,loadKeys,now=()=>Math.floor(Date.now()/1000)}={}){
 if(!/^https:\/\/[a-z0-9.-]+\/$/i.test(issuer||'')||typeof audience!=='string'||!audience||typeof loadKeys!=='function')throw new TypeError('Trusted issuer, audience and key loader required');
 return async function verify(request){
  const jwt=request.headers.get('cf-access-jwt-assertion');
  if(!jwt||jwt.length>16000)return null;
  const parts=jwt.split('.');
  if(parts.length!==3)return null;
  let header,claims;
  try{header=json(parts[0]);claims=json(parts[1]);}catch{return null;}
  if(header?.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||header.kid.length>256)return null;
  const timestamp=now();
  if(claims?.iss!==issuer||!Array.isArray(claims?.aud)||!claims.aud.includes(audience)||!Number.isSafeInteger(claims.exp)||claims.exp<=timestamp||!Number.isSafeInteger(claims.iat)||claims.iat>timestamp+60)return null;
  if(typeof claims.sub!=='string'||!claims.sub)return null;
  const keys=await loadKeys();
  const jwk=keys?.keys?.find(key=>key.kid===header.kid&&key.kty==='RSA'&&key.alg==='RS256'&&key.use==='sig');
  if(!jwk)return null;
  try{
   const publicKey=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
   const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,decode(parts[2]),enc.encode(parts[0]+'.'+parts[1]));
   return valid?{subject:claims.sub,email:typeof claims.email==='string'?claims.email:null}:null;
  }catch{return null;}
 };
}
