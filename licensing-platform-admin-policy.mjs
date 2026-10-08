/* Policy for future platform-admin appointments. Inert and server-only. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function evaluatePlatformAdminChange({actorId,targetId,action,actorIsPlatformAdmin,confirmed,reason}={}){
 if(!UUID.test(actorId||'')||!UUID.test(targetId||'')||!['appoint','revoke'].includes(action))
  return {valid:false,reason:'invalid_request',canExecute:false};
 if(!actorIsPlatformAdmin)return {valid:false,reason:'platform_authorization_required',canExecute:false};
 if(actorId===targetId)return {valid:false,reason:'self_change_not_allowed',canExecute:false};
 if(confirmed!==true||typeof reason!=='string'||reason.trim().length<10||reason.length>1000)
  return {valid:false,reason:'approval_details_required',canExecute:false};
 return {valid:true,requiresIndependentApproval:true,requiresAudit:true,requiresAtomicTransaction:true,canExecute:false};
}
