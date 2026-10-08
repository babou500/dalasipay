// Dedicated, opt-in licensing observer Worker. Not a part of the existing site.
import { createVerifiedLicensingEndpoint } from '../verified-licensing-endpoint.mjs';

function supabaseClient(baseUrl, key, authToken){
  const from=(table)=>({
    select(columns){
      const filters=[];
      const query={
        eq(column,value){filters.push([column,value]);return query},
        async maybeSingle(){
          const url=new URL(baseUrl+'/rest/v1/'+table);
          url.searchParams.set('select',columns);
          for(const [column,value] of filters)url.searchParams.set(column,'eq.'+value);
          url.searchParams.set('limit','1');
          const response=await fetch(url,{headers:{apikey:key,authorization:'Bearer '+authToken,accept:'application/json','cache-control':'no-store'}});
          if(!response.ok)return {data:null,error:{status:response.status}};
          const rows=await response.json();
          return {data:Array.isArray(rows)?rows[0]||null:null,error:null};
        }
      };
      return query;
    }
  });
  return {from};
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  // No cross-origin browser access. Do not configure CORS for this endpoint.
  if(url.pathname!=='/internal/licensing/observe')return new Response('Not found',{status:404});
  if(!env.DALASIPAY_SUPABASE_URL||!env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY||!env.DALASIPAY_SUPABASE_PUBLISHABLE_KEY){
   return new Response('Service unavailable',{status:503,headers:{'cache-control':'no-store'}});
  }
  const base=String(env.DALASIPAY_SUPABASE_URL).replace(/\\/$/,'');
  const authClient={auth:{async getUser(token){
    const res=await fetch(base+'/auth/v1/user',{headers:{apikey:env.DALASIPAY_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'cache-control':'no-store'}});
    if(!res.ok)return {data:null,error:{status:res.status}};
    return {data:{user:await res.json()},error:null};
  }}};
  const adminClient=supabaseClient(base,env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY);
  const handle=createVerifiedLicensingEndpoint({authClient,adminClient});
  return handle(request);
 }
};
