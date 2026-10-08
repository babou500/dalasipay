/* In-memory approval transaction model for safety tests only.
 * No Supabase client, no writes, no endpoint registration.
 */
export async function simulateAtomicReview({request,decision,writeAudit,authorize}={}){
 if(!request||request.status!=='pending'||!['approved','rejected'].includes(decision))return {ok:false,reason:'invalid_transition'};
 if(typeof authorize!=='function'||await authorize()!==true)return {ok:false,reason:'not_authorized'};
 if(typeof writeAudit!=='function')return {ok:false,reason:'audit_unavailable'};
 const staged={...request,status:decision};
 try{
  await writeAudit({requestId:request.id,eventType:decision==='approved'?'review_approved':'review_rejected'});
  return {ok:true,request:staged};
 }catch{
  return {ok:false,reason:'rolled_back',request:{...request}};
 }
}
