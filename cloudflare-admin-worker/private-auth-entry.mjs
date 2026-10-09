/* UNDEPLOYED private Cloudflare Worker entry point.
 * Requires public workers.dev routes disabled and service-binding-only invocation.
 * Verifies the Cloudflare Access assertion cryptographically before the narrow
 * Supabase boolean RPC. No identity supplied by callers is trusted.
 */
import {createAccessVerifier} from './access-jwt.mjs';
import {createRestrictedAdminLookup} from './restricted-admin-lookup.mjs';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(status,authorized=false)=>new Response(JSON.stringify({authorized}),{status,headers});
export function createPrivateAdminHandler({verifyAccess,checkIdentity}={}){
 if(typeof verifyAccess!=='function'||typeof checkIdentity!=='function')throw new TypeError('Two independent verification functions required');
 return async request=>{
  const url=new URL(request.url);
  if(request.method!=='POST'||url.pathname!=='/internal/admin/authorize')return reply(404);
  let identity;
  try{identity=await verifyAccess(request);}catch{return reply(503);}
  if(!identity?.subject)return reply(403);
  try{return (await checkIdentity(identity.subject))===true?reply(200,true):reply(403);}
  catch{return reply(503);}
 };
}
export default {
 async fetch(request,env){
  if(!env?.DALASIPAY_SUPABASE_URL||!env?.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY||
     !env?.ACCESS_ISSUER||!env?.ACCESS_AUDIENCE)return reply(503);
  const issuer=env.ACCESS_ISSUER;
  const verifyAccess=createAccessVerifier({
   issuer,audience:env.ACCESS_AUDIENCE,
   loadKeys:async()=>{
    const endpoint=new URL('/cdn-cgi/access/certs',issuer).href;
    const response=await fetch(endpoint,{redirect:'manual'});
    if(!response.ok)throw Error('Certificate provider unavailable');
    return response.json();
   }
  });
  const checkIdentity=createRestrictedAdminLookup({
   supabaseUrl:env.DALASIPAY_SUPABASE_URL,
   serverCredential:env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY
  });
  return createPrivateAdminHandler({verifyAccess,checkIdentity})(request);
 }
};
