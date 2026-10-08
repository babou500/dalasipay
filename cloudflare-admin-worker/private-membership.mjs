/* Unmounted private membership service: verify identity independently, return only boolean.
 * Adapter must perform least-privilege lookup; never expose a public route.
 */
const deny=(status)=>new Response(JSON.stringify({authorized:false}),{status,headers:{'content-type':'application/json','cache-control':'no-store, private'}});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createPrivateMembershipService({verifyToken,checkMembership}={}){
 if(typeof verifyToken!=='function'||typeof checkMembership!=='function')throw new TypeError('Trusted service adapters required');
 return async function(request){
  if(request.method!=='POST'||new URL(request.url).pathname!=='/check')return deny(404);
  const token=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return deny(401);
  let payload;
  try{payload=await request.json();}catch{return deny(400);}
  if(!payload||typeof payload!=='object'||Object.keys(payload).sort().join(',')!=='userId'||!UUID.test(payload.userId))return deny(400);
  let verified;
  try{verified=await verifyToken(token);}catch{return deny(503);}
  if(!verified?.userId||verified.userId!==payload.userId)return deny(403);
  let allowed;
  try{allowed=await checkMembership(verified.userId);}catch{return deny(503);}
  return new Response(JSON.stringify({authorized:allowed===true}),{status:allowed===true?200:403,headers:{'content-type':'application/json','cache-control':'no-store, private'}});
 };
}
