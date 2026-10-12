import {prepareTicket,ticketReference} from '../helpdesk-ticket-validation.mjs';
// Dormant handler: not registered in the Worker router or customer UI.
const BASE='https://zdpmlzmljozcmqndyfog.supabase.co';
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export async function handleHelpdeskRequest(request,env,fetchImpl=fetch){
 const url=new URL(request.url);
 if(url.pathname!=='/helpdesk/api'||request.method!=='POST')return reply(404,{ok:false});
 if(request.headers.get('origin')!==url.origin)return reply(403,{ok:false});
 const key=env?.DALASIPAY_SUPABASE_PUBLISHABLE_KEY;
 if(typeof key!=='string'||!key.startsWith('sb_publishable_')||env?.DALASIPAY_SUPABASE_URL?.replace(/\/$/,'')!==BASE)return reply(503,{ok:false});
 const bearer=request.headers.get('authorization');
 if(!bearer?.startsWith('Bearer ')||bearer.length>16000)return reply(401,{ok:false});
 let input;
 try{const body=await request.text();if(body.length>7000)return reply(413,{ok:false});input=JSON.parse(body);}catch{return reply(400,{ok:false});}
 if(input?.action!=='create')return reply(400,{ok:false});
 let ticket;try{ticket=prepareTicket(input.ticket);}catch{return reply(400,{ok:false});}
 const headers={apikey:key,authorization:bearer,'cache-control':'no-store'};
 try{
  const result=await fetchImpl(BASE+'/auth/v1/user',{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(result.status===401||result.status===403)return reply(401,{ok:false});
  if(!result.ok)return reply(503,{ok:false});
  const user=await result.json();
  if(typeof user?.id!=='string'||!user.email_confirmed_at)return reply(403,{ok:false});
  const created=await fetchImpl(BASE+'/rest/v1/helpdesk_tickets?select=id,status,created_at',{
   method:'POST',headers:{...headers,'content-type':'application/json',prefer:'return=representation'},
   body:JSON.stringify({...ticket,created_by:user.id}),redirect:'manual',signal:AbortSignal.timeout(10000)
  });
  if(created.status===401||created.status===403)return reply(403,{ok:false});
  if(!created.ok)return reply(created.status===400?400:503,{ok:false});
  const entries=await created.json();
  if(!Array.isArray(entries)||entries.length!==1||typeof entries[0]?.id!=='string')return reply(503,{ok:false});
  return reply(201,{ok:true,ticket:{reference:ticketReference(entries[0].id),status:entries[0].status,created_at:entries[0].created_at}});
 }catch{return reply(503,{ok:false});}
}
