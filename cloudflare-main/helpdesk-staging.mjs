// Staging-only same-origin route bridge. No production Worker configuration uses this script.
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/helpdesk/api'){
   if(env?.DALASIPAY_HELPDESK_TICKETS_ENABLED!=='true'||!env?.HELPDESK_SERVICE)return new Response('Not available',{status:404,headers:{'cache-control':'no-store'}});
   if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{allow:'POST','cache-control':'no-store'}});
   if(request.headers.get('origin')!==url.origin)return new Response('Forbidden',{status:403,headers:{'cache-control':'no-store'}});
   return env.HELPDESK_SERVICE.fetch(request);
  }
  return env.ASSETS.fetch(request);
 }
};
