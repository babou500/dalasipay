/* Undeployed private-service adapter. No public fetch handler or direct database grants.
 * The caller must supply a reviewed membership lookup implementation.
 */
import {createPrivateMembershipService} from './private-membership.mjs';
export function createMembershipIntegration({supabaseUrl,publishableKey,lookupMembership,fetchImpl=fetch}={}){
 if(typeof supabaseUrl!=='string'||!/^https:\/\//.test(supabaseUrl)||typeof publishableKey!=='string'||!publishableKey||typeof lookupMembership!=='function'||typeof fetchImpl!=='function')
  throw new TypeError('Explicit verified membership integration dependencies required');
 const base=supabaseUrl.replace(/\/$/,'');
 const verifyToken=async token=>{
  const result=await fetchImpl(base+'/auth/v1/user',{headers:{apikey:publishableKey,authorization:'Bearer '+token}});
  if(result.status===401||result.status===403)return null;
  if(!result.ok)throw new Error('Auth verification unavailable');
  const user=await result.json();
  return {userId:user?.id};
 };
 return createPrivateMembershipService({verifyToken,checkMembership:lookupMembership});
}
