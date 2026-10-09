import {handleCustomerPortal} from './customer-portal.mjs';
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
  const portal=await handleCustomerPortal(request,env);if(portal)return portal;
  const url=new URL(request.url);
  // No cross-origin browser access. Do not configure CORS for this endpoint.
  if(url.pathname!=='/internal/licensing/observe')return new Response('Not found',{status:404});
  const origin=request.headers.get('origin');
  const allowedOrigin='https://dalasipay.bebusinesssolutionsgm.com';
  const cors=origin===allowedOrigin?{'access-control-allow-origin':allowedOrigin,'vary':'Origin','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'Authorization','access-control-max-age':'300'}:{};
  if(request.method==='OPTIONS')return new Response(null,{status:origin===allowedOrigin?204:403,headers:{...cors,'cache-control':'no-store'}});
  const withCors=(res)=>{const headers=new Headers(res.headers);for(const [k,v] of Object.entries(cors))headers.set(k,v);return new Response(res.body,{status:res.status,statusText:res.statusText,headers});};
  if(!env.DALASIPAY_SUPABASE_URL||!env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY||!env.DALASIPAY_SUPABASE_PUBLISHABLE_KEY){
   return new Response('Service unavailable',{status:503,headers:{'cache-control':'no-store'}});
  }
  const rawBase=String(env.DALASIPAY_SUPABASE_URL);
  const base=rawBase.endsWith('/')?rawBase.slice(0,-1):rawBase;
  const authClient={auth:{async getUser(token){
    const res=await fetch(base+'/auth/v1/user',{headers:{apikey:env.DALASIPAY_SUPABASE_PUBLISHABLE_KEY,authorization:'Bearer '+token,'cache-control':'no-store'}});
    if(!res.ok)return {data:null,error:{status:res.status}};
    return {data:{user:await res.json()},error:null};
  }}};
  const adminClient=supabaseClient(base,env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY);
  const countWorkspaceRecords=async(table,workspaceId)=>{
   if(!['organization_members','employees'].includes(table))throw new Error('Unsupported usage table');
   const endpoint=new URL(base+'/rest/v1/'+table);
   endpoint.searchParams.set('select',table==='organization_members'?'user_id':'id');
   endpoint.searchParams.set('organization_id','eq.'+workspaceId);
   const result=await fetch(endpoint,{method:'HEAD',headers:{apikey:env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,prefer:'count=exact','cache-control':'no-store'}});
   if(!result.ok)throw new Error('Usage count unavailable');
   const range=result.headers.get('content-range');
   const count=range?.split('/').pop();
   if(!/^[0-9]+$/.test(count||''))throw new Error('Usage count missing');
   const value=Number(count);
   if(!Number.isSafeInteger(value))throw new Error('Usage count out of range');
   return value;
  };
  const loadAppState=async(workspaceId)=>{
   const endpoint=new URL(base+'/rest/v1/organization_app_state');
   endpoint.searchParams.set('select','state');
   endpoint.searchParams.set('organization_id','eq.'+workspaceId);
   endpoint.searchParams.set('limit','1');
   const result=await fetch(endpoint,{headers:{apikey:env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+env.DALASIPAY_SUPABASE_SERVICE_ROLE_KEY,accept:'application/json','cache-control':'no-store'}});
   if(!result.ok)throw new Error('Saved workspace state unavailable');
   const records=await result.json();
   return Array.isArray(records)?records[0]||null:null;
  };
  try {
   const handle=createVerifiedLicensingEndpoint({authClient,adminClient,countWorkspaceRecords,loadAppState});
   return withCors(await handle(request));
  } catch (_error) {
   return new Response(JSON.stringify({ok:false,reason:'service_unavailable'}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
 }
};
