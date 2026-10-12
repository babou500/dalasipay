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
  if(url.pathname==='/helpdesk/client-config.js'){
   const enabled=env?.DALASIPAY_HELPDESK_TICKETS_ENABLED==='true'&&!!env?.HELPDESK_SERVICE;
   const script='window.DALASIPAY_HELPDESK_TICKETS_ENABLED='+JSON.stringify(enabled)+';window.DALASIPAY_HELPDESK_API_URL='+JSON.stringify('/helpdesk/api')+';';
   return new Response(script,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
   const res=await env.ASSETS.fetch(request);
   if(!res.ok)return res;
   const html=await res.text();
   if(!html.includes('</head>'))return new Response('Invalid staging page',{status:503});
   const headers=new Headers(res.headers);headers.delete('content-length');headers.set('cache-control','no-store');
   return new Response(html.replace('</head>','<script src="/helpdesk/client-config.js"></script></head>'),{status:res.status,headers});
  }
  return env.ASSETS.fetch(request);
 }
};
