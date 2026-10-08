/* Pure observation-only evaluation. No client-provided plan or usage accepted as authority. */
export const LIMITS = Object.freeze({
 free: Object.freeze({companies:1,users:2,employees:5,invoicesPerMonth:25,supplierBillsPerMonth:25}),
 standard: Object.freeze({companies:1,users:5,employees:25,invoicesPerMonth:null,supplierBillsPerMonth:null}),
 professional: Object.freeze({companies:null,users:null,employees:null,invoicesPerMonth:null,supplierBillsPerMonth:null})
});
export function evaluateSubscription(snapshot) {
 if (!snapshot || !Object.hasOwn(LIMITS, snapshot.planId) || !snapshot.usage || typeof snapshot.usage !== 'object') {
  return {ok:false,reason:'invalid_snapshot'};
 }
 const planId=snapshot.planId;
 const professionalPreview=snapshot.professionalPreview===true && planId==='professional';
 const allowances=LIMITS[planId];
 const counters=Object.fromEntries(Object.entries(allowances).map(([key,limit])=>{
  const count=snapshot.usage[key];
  const valid=Number.isSafeInteger(count)&&count>=0;
  return [key,{count:valid?count:null,limit,overLimit:valid&&limit!==null?count>limit:null}];
 }));
 return {ok:true,mode:'observe_only',workspaceId:snapshot.workspaceId,planId:professionalPreview?'professional-preview':planId,professionalPreview,usage:counters,enforcementActive:false};
}
