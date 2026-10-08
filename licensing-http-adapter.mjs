/* DalasiPay licensing HTTP adapter. Inert until explicitly mounted by a verified Worker.
 * No billing, mutation, enforcement, browser tokens, or application startup dependency.
 */
import { createLicensingObserver } from './cloudflare-licensing-observer.mjs';
const HEADERS = Object.freeze({'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff'});
function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:HEADERS});}
export function createLicensingHttpAdapter({ authenticateRequest, authorizeWorkspace, loadWorkspaceSnapshot } = {}){
 if(typeof authenticateRequest!=='function')throw new TypeError('Server-side request authentication required');
 const observe=createLicensingObserver({authorizeWorkspace,loadWorkspaceSnapshot});
 return async function handleLicensingRequest(request){
  if(!request||request.method!=='GET')return response({ok:false,reason:'method_not_allowed'},405);
  let workspaceId;
  try{
   const url=new URL(request.url);
   workspaceId=url.searchParams.get('workspaceId');
   if(!workspaceId||url.searchParams.getAll('workspaceId').length!==1)return response({ok:false,reason:'invalid_request'},400);
  }catch{return response({ok:false,reason:'invalid_request'},400);}
  let principal;
  try{principal=await authenticateRequest(request);}catch{return response({ok:false,reason:'authentication_unavailable'},503);}
  if(!principal)return response({ok:false,reason:'authentication_required'},401);
  const result=await observe({principal,workspaceId});
  if(!result.ok){
   const status=result.reason==='invalid_request'?400:result.reason==='not_authorized'?403:503;
   return response({ok:false,reason:result.reason},status);
  }
  return response(result);
 };
}
