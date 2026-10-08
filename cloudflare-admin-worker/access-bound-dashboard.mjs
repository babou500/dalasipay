/* Undeployed: bridge signed Cloudflare Access identity to separately approved operator.
 * Never infer DalasiPay administrator status from Cloudflare account membership.
 * checkApprovedOperator must use a verified immutable subject mapping and
 * restricted membership lookup; no email-only or client-controlled identity.
 */
import {createAccessVerifier} from './access-jwt.mjs';
import {createProtectedDashboard} from './protected-dashboard.mjs';
export function createAccessBoundDashboard({issuer,audience,loadKeys,checkApprovedOperator,now}={}){
 if(typeof checkApprovedOperator!=='function')throw new TypeError('Reviewed operator lookup required');
 const verify=createAccessVerifier({issuer,audience,loadKeys,now});
 return createProtectedDashboard({verifyAccessAndPlatformRole:async request=>{
  const identity=await verify(request);
  if(!identity?.subject)return false;
  return (await checkApprovedOperator(identity.subject))===true;
 }});
}
