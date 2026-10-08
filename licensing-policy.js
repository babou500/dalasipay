/* DalasiPay licensing policy v1. Catalogue only; not an authorization boundary.
 * Enforcement must later run in authenticated Cloudflare server handlers.
 * Deliberately NOT included in index.html or startup.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DalasiLicensingPolicy=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='1.0.0';
 const PLANS=Object.freeze({
  free:Object.freeze({id:'free',label:'Free',limits:Object.freeze({companies:1,users:2,employees:5,invoicesPerMonth:25,supplierBillsPerMonth:25}),features:Object.freeze(['coreAccounting','smallBusinessPayroll'])}),
  standard:Object.freeze({id:'standard',label:'Standard',limits:Object.freeze({companies:1,users:5,employees:25,invoicesPerMonth:null,supplierBillsPerMonth:null}),features:Object.freeze(['coreAccounting','smallBusinessPayroll','recurringBilling','projects','budgets','advancedReports'])}),
  professional:Object.freeze({id:'professional',label:'Professional',limits:Object.freeze({companies:null,users:null,employees:null,invoicesPerMonth:null,supplierBillsPerMonth:null}),features:Object.freeze(['coreAccounting','smallBusinessPayroll','recurringBilling','projects','budgets','advancedReports','fullPayroll','makerChecker','periodClose','advancedTaxCompliance','auditControls'])})
 });
 const LIMIT_KEYS=Object.freeze(['companies','users','employees','invoicesPerMonth','supplierBillsPerMonth']);
 const FEATURE_KEYS=Object.freeze([...new Set(Object.values(PLANS).flatMap(p=>p.features))]);
 const PREVIEW='professional-preview';
 function normalizePlan(id){return Object.prototype.hasOwnProperty.call(PLANS,id)?id:null}
 function getPlan(id){return PLANS[normalizePlan(id)]||null}
 function getEntitlements(planId,opts){
  const preview=opts&&opts.professionalPreview===true;
  const plan=preview?PLANS.professional:getPlan(planId);
  if(!plan)return null;
  return Object.freeze({planId:preview?PREVIEW:plan.id,label:preview?'Professional Preview':plan.label,preview,limits:plan.limits,features:plan.features});
 }
 function checkFeature(entitlements,feature){
  if(!FEATURE_KEYS.includes(feature))return {allowed:false,reason:'unknown_feature'};
  if(!entitlements)return {allowed:false,reason:'missing_entitlements'};
  return entitlements.features.includes(feature)?{allowed:true,reason:'allowed'}:{allowed:false,reason:'plan_feature_unavailable'};
 }
 function checkLimit(entitlements,limitKey,currentCount,amountToAdd){
  if(!LIMIT_KEYS.includes(limitKey))return {allowed:false,reason:'unknown_limit'};
  if(!entitlements)return {allowed:false,reason:'missing_entitlements'};
  if(!Number.isSafeInteger(currentCount)||currentCount<0||!Number.isSafeInteger(amountToAdd)||amountToAdd<0)return {allowed:false,reason:'invalid_usage'};
  const cap=entitlements.limits[limitKey];
  if(cap===null)return {allowed:true,reason:'unlimited',limit:null,remaining:null};
  const remaining=Math.max(0,cap-currentCount);
  return {allowed:amountToAdd<=remaining,reason:amountToAdd<=remaining?'within_limit':'limit_exceeded',limit:cap,remaining};
 }
 return Object.freeze({VERSION,PLANS,PREVIEW,LIMIT_KEYS,FEATURE_KEYS,normalizePlan,getPlan,getEntitlements,checkFeature,checkLimit});
});
