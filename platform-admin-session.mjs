/* Server-only, unmounted, fail-closed platform admin session verifier. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff'};
function reply(status){return new Response(JSON.stringify({authorized:false}),{status,headers});}
export function createPlatformAdminSessionHandler({verifyToken,lookupPlatformAdmin}={}){
 if(typeof verifyToken!=='function'||typeof lookupPlatformAdmin!=='function')throw new TypeError('Server verifiers required');
 return async function handle(request){
  if(request?.method!=='GET')return reply(405);
  const path=new URL(request.url).pathname;
  if(path!=='/internal/admin/session')return reply(404);
  const authorization=request.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(authorization);
  if(!match)return reply(401);
  let actor;
  try{actor=await verifyToken(match[1]);}catch{return reply(503);}
  if(!UUID.test(actor?.userId||''))return reply(401);
  let isAdmin;
  try{isAdmin=await lookupPlatformAdmin(actor.userId);}catch{return reply(503);}
  if(isAdmin!==true)return reply(403);
  return new Response(JSON.stringify({authorized:true}),{status:200,headers});
 };
}
