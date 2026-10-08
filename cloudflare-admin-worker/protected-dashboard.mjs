/* Not deployed. Platform authorization gate for the staging dashboard.
 * Cloudflare Access authentication alone is insufficient.
 * Verification callback must validate Cloudflare Access JWT cryptographically,
 * including issuer, audience, expiry, and signature, and map an approved
 * operator through a separately reviewed membership mechanism.
 */
import {renderPlatformAdminDashboard} from './dashboard-preview.mjs';
const baseHeaders={'cache-control':'no-store, private','x-content-type-options':'nosniff','x-frame-options':'DENY'};
export function createProtectedDashboard({verifyAccessAndPlatformRole}={}){
 if(typeof verifyAccessAndPlatformRole!=='function')throw new TypeError('Verified platform-role adapter required');
 return async function(request){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/')return new Response('Not found',{status:404,headers:baseHeaders});
  let authorized=false;
  try{authorized=(await verifyAccessAndPlatformRole(request))===true;}catch{return new Response('Authorization unavailable',{status:503,headers:baseHeaders});}
  if(!authorized)return new Response('Forbidden',{status:403,headers:baseHeaders});
  return new Response(renderPlatformAdminDashboard(),{status:200,headers:{...baseHeaders,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
 };
}
