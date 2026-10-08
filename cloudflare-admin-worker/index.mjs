/* Dedicated admin Worker source. NOT deployed: no Wrangler configuration or routes.
 * Checks verified Supabase Auth identity, then privileged admin membership.
 * No mutation endpoints, browser UI, CORS allowance or token logging.
 */
import {createPlatformAdminSessionHandler} from '../platform-admin-session.mjs';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/internal/admin/session')return new Response('Not found',{status:404});
  if(!env?.DALASIPAY_SUPABASE_URL||!env?.DALASIPAY_SUPABASE_PUBLISHABLE_KEY||!env?.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY)
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
   const target=new URL(base+'/rest/v1/subscription_platform_admins');
   target.searchParams.set('select','user_id');
   target.searchParams.set('user_id','eq.'+userId);
   target.searchParams.set('limit','1');
   const response=await fetch(target,{headers:{apikey:env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY}});
   if(!response.ok)throw Error('Admin lookup unavailable');
   const rows=await response.json();
   return Array.isArray(rows)&&rows.length===1&&rows[0]?.user_id===userId;
  };
  return createPlatformAdminSessionHandler({verifyToken,lookupPlatformAdmin})(request);
 }
};
