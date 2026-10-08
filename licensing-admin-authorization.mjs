/* Server-only authorization gate for future subscription administration.
 * Never mounts a request handler or changes subscription state.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function authorizeSubscriptionReview({actorId,workspaceId,readMembership}={}){
 if(!UUID.test(actorId||'')||!UUID.test(workspaceId||'')||typeof readMembership!=='function')return {authorized:false,reason:'invalid_request'};
 try{
  const membership=await readMembership({userId:actorId,workspaceId});
  if(!membership||membership.organization_id!==workspaceId||membership.user_id!==actorId)return {authorized:false,reason:'not_authorized'};
  if(membership.role!=='owner')return {authorized:false,reason:'insufficient_role'};
  return {authorized:true,role:'owner',workspaceId};
 }catch{return {authorized:false,reason:'authorization_unavailable'};}
}
export function canApplySubscriptionDecision(){return false;}
