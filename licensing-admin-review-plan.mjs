/* Inert subscription administration decision planner.
 * This module does not write to databases or activate plan changes.
 * Any eventual implementation must use one atomic database transaction
 * for request-state changes and append-only audit events.
 */
import {authorizeSubscriptionReview} from './licensing-admin-authorization.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function planReviewDecision({actorId,workspaceId,request,decision,note,readMembership}={}){
 if(!UUID.test(request?.id||'')||request?.organization_id!==workspaceId||request?.status!=='pending')
  return {valid:false,reason:'invalid_or_nonpending_request',canExecute:false};
 if(!['approved','rejected'].includes(decision)||typeof note!=='string'||note.trim().length<10||note.length>1000)
  return {valid:false,reason:'invalid_decision',canExecute:false};
 const access=await authorizeSubscriptionReview({actorId,workspaceId,readMembership});
 if(!access.authorized)return {valid:false,reason:access.reason,canExecute:false};
 if(request.requested_by===actorId)return {valid:false,reason:'self_approval_not_allowed',canExecute:false};
 return Object.freeze({
  valid:true,canExecute:false,requiresAtomicTransaction:true,
  requiresAuditEvent:true,requiresPendingStateRecheck:true,
  eventType:decision==='approved'?'review_approved':'review_rejected'
 });
}
