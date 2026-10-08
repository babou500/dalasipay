/* Dedicated admin Worker source. NOT deployed: no Wrangler configuration or routes.
 * Checks verified Supabase Auth identity, then a private membership service binding.
 * No mutation endpoints, browser UI, CORS allowance or token logging.
 */
import {createPlatformAdminSessionHandler} from '../platform-admin-session.mjs';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/internal/admin/session')return new Response('Not found',{status:404});
  if(!env?.DALASIPAY_SUPABASE_URL||!env?.DALASIPAY_SUPABASE_PUBLISHABLE_KEY||!env?.ADMIN_MEMBERSHIP_SERVICE?.fetch)
   return new Response(JSON.stringify({authorized:false}),{status:503,headers:{'cache-control':'no-store','content-type':'application/json'}});
  const base=env.DALASIPAY_SUPABASE_URL.replace(/\/$/,'');
  const verifyToken=async token=>{
   const response=await fetch(base+'/auth/v1/user',{headers:{apikey:env.DALASIPAY_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token}});
   if(response.status===401||response.status===403)return null;
   if(!response.ok)throw Error('Authentication service unavailable');
   const user=await response.json();
   return {userId:user?.id};
  };
  const lookupPlatformAdmin=async userId=>{
   // Private Cloudflare service binding, NOT a public endpoint or direct table SELECT.
   // The separate lookup service must authenticate its caller and bind this ID to
   // the previously verified Supabase identity. It is intentionally not deployed.
   const response=await env.ADMIN_MEMBERSHIP_SERVICE.fetch(
    new Request('https://admin-membership.internal/check',{
     method:'POST',headers:{'content-type':'application/json','authorization':request.headers.get('authorization')||''},
     body:JSON.stringify({userId})
    })
   );
   if(!response.ok)throw Error('Membership service unavailable');
   const body=await response.json();
   return body?.authorized===true;
  };
  return createPlatformAdminSessionHandler({verifyToken,lookupPlatformAdmin})(request);
 }
};
