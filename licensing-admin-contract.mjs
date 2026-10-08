/* Proposed server-side plan-change contract. No persistence or activation. */
export const REQUEST_STATES=Object.freeze(['pending','approved','rejected','cancelled']);
export function validateProposedChange(input){
 const validPlan=['free','standard','professional'].includes(input?.targetPlan);
 const validReason=typeof input?.reason==='string'&&input.reason.trim().length>=10&&input.reason.length<=1000;
 const validWorkspace=typeof input?.workspaceId==='string'&&/^[0-9a-f-]{36}$/i.test(input.workspaceId);
 if(!validPlan||!validReason||!validWorkspace)return {valid:false,reason:'invalid_request'};
 return {valid:true,requiresServerAuthorization:true,requiresAuditRecord:true,requiresExplicitApproval:true,canApply:false};
}
