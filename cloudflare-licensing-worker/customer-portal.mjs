import {customerPage,customerStyle,customerScript} from './customer-portal-ui.mjs';
const base='https://zdpmlzmljozcmqndyfog.supabase.co';
const H={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY'};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...H,'content-type':'application/json; charset=utf-8'}});
async function boundedJSON(request){const reader=request.body?.getReader();if(!reader)throw Error();let size=0,chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>10000){await reader.cancel();throw Error();}chunks.push(value);}const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function handleCustomerPortal(request,env,fetchImpl=fetch){
 const url=new URL(request.url);if(!['/subscriptions','/subscriptions/style.css','/subscriptions/app.js','/subscriptions/api'].includes(url.pathname))return null;
 const key=env?.DALASIPAY_SUPABASE_PUBLISHABLE_KEY;if(typeof key!=='string'||!key.startsWith('sb_publishable_')||env.DALASIPAY_SUPABASE_URL?.replace(/\/$/,'')!==base)return reply(503,{ok:false});
 if(url.pathname==='/subscriptions/api'){
  if(request.method!=='POST')return reply(404,{ok:false});
  if(request.headers.get('origin')!==url.origin)return reply(403,{ok:false});
  const token=request.headers.get('authorization');if(!token?.startsWith('Bearer ')||token.length>16000)return reply(401,{ok:false});
  let input;try{input=await boundedJSON(request);}catch{return reply(400,{ok:false});}
  if(!['list','submit','cancel'].includes(input?.action)||!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload))return reply(400,{ok:false});
  try{
   // Remote Auth validation, never accept a locally decoded JWT as identity.
   const headers={apikey:key,authorization:token,'content-type':'application/json','cache-control':'no-store'};
   const identity=await fetchImpl(base+'/auth/v1/user',{headers,redirect:'manual',signal:AbortSignal.timeout(10000)});if(identity.status===401||identity.status===403)return reply(401,{ok:false});if(!identity.ok)return reply(503,{ok:false});
   const user=await identity.json();if(typeof user.id!=='string'||!user.email_confirmed_at)return reply(403,{ok:false});
   const response=await fetchImpl(base+'/rest/v1/rpc/customer_subscription_portal',{method:'POST',headers,body:JSON.stringify({p_action:input.action,p_payload:input.payload}),redirect:'manual',signal:AbortSignal.timeout(10000)});
   if(!response.ok){let error;try{error=await response.json();}catch{}return reply(error?.code==='42501'?403:error?.code==='55000'?409:response.status===400?400:503,{ok:false});}
   const body=await response.json();if(!body||typeof body!=='object'||Array.isArray(body))return reply(503,{ok:false});return reply(200,body);
  }catch{return reply(503,{ok:false});}
 }
 if(request.method!=='GET')return reply(404,{ok:false});
 const csp="default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self' "+base+"; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
 const type=url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
 const body=url.pathname.endsWith('.js')?'const configuration='+JSON.stringify({base,key})+';\n'+customerScript:url.pathname.endsWith('.css')?customerStyle:customerPage;
 return new Response(body,{headers:{...H,'content-type':type,'content-security-policy':csp}});
}
