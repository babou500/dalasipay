import {handleManagement} from './management-routes.mjs';
// Only a Cloudflare service binding can reach the private Worker.
import {renderSubscriptions} from './subscriptions-dashboard.mjs';
const H={'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff','x-frame-options':'DENY'};
const checks=new Set(['signing_keys_request','signing_keys_http','signing_keys_response','configuration','token_verification_service','identity_configuration','database_configuration','membership_service','membership_response','subscription_service','subscription_response']);
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:H});
export default {
 async fetch(request,env){
  const managed=await handleManagement(request,env);if(managed)return managed;
  const url=new URL(request.url);
  const paths={'/internal/admin/identity-match':'identity-match','/internal/admin/check':'authorize','/internal/admin/authorize':'authorize','/internal/admin/subscriptions':'subscriptions','/':'subscriptions'};
  const action=paths[url.pathname];
  if(request.method!=='GET'||!action)return reply(404,{authorized:false});
  const assertion=request.headers.get('cf-access-jwt-assertion');
  if(!assertion||assertion.length>16000)return reply(403,{authorized:false});
  if(!env?.ADMIN_MEMBERSHIP_SERVICE?.fetch)return reply(503,{authorized:false,check:'service_binding'});
  let offset=0;
  if(action==='subscriptions'){
   const value=url.searchParams.get('offset')??'0';
   if(!/^(0|[1-9][0-9]{0,5})$/.test(value)||Number(value)>100000)return reply(400,{authorized:false});
   offset=Number(value);
  }
  let result,data;
  try{
   result=await env.ADMIN_MEMBERSHIP_SERVICE.fetch(new Request('https://admin-membership.internal/internal/admin/'+action,{
    method:'POST',headers:{'cf-access-jwt-assertion':assertion,'content-type':'application/json'},body:JSON.stringify({offset}),signal:AbortSignal.timeout(35000)
   }));
   data=await result.json();
  }catch{return reply(503,{authorized:false,check:'service_binding'});}
  if(result.status===403)return reply(403,{authorized:false});
  if(!result.ok)return reply(503,{authorized:false,check:checks.has(data?.check)?data.check:'private_service'});
  if(action==='identity-match'){
   if(typeof data?.identityMatched!=='boolean')return reply(503,{authorized:false,check:'private_response'});
   return reply(200,{identityMatched:data.identityMatched});
  }
  if(data?.authorized!==true)return reply(503,{authorized:false,check:'private_response'});
  if(action==='authorize')return reply(200,{authorized:true});
  if(!Array.isArray(data.subscriptions)||data.subscriptions.length>100||!(data.nextOffset===null||data.nextOffset===offset+100))return reply(503,{authorized:false,check:'private_response'});
  if(url.pathname!=='/')return reply(200,{authorized:true,subscriptions:data.subscriptions,nextOffset:data.nextOffset});
  return new Response(renderSubscriptions(data,{query:url.searchParams.get('q')??'',status:url.searchParams.get('status')??'all'}),{status:200,headers:{...H,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
 }
};
