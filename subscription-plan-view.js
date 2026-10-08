/* DalasiPay Subscription & Plans: display-only view model.
 * No initialization hooks, DOM writes, persistence, or enforcement.
 * Display only server-confirmed subscription records once integrated.
 */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./licensing-policy.js'):root.DalasiLicensingPolicy,typeof module==='object'&&module.exports?require('./workspace-subscription.js'):root.DalasiWorkspaceSubscription);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DalasiPlanView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(policy,subscriptions){
 'use strict';
 const VERSION='1.0.0';
 const LABELS=Object.freeze({companies:'Companies',users:'Users',employees:'Employees',invoicesPerMonth:'Invoices / month',supplierBillsPerMonth:'Supplier bills / month'});
 const FEATURES=Object.freeze({coreAccounting:'Core accounting',smallBusinessPayroll:'Small-business payroll',recurringBilling:'Recurring billing',projects:'Projects',budgets:'Budgets',advancedReports:'Advanced reports',fullPayroll:'Full payroll',makerChecker:'Maker-checker approvals',periodClose:'Month and year close',advancedTaxCompliance:'Advanced tax and compliance',auditControls:'Audit controls'});
 function getDisplayModel(workspaceId,record,options){
  const existing=options?.existingWorkspace===true;
  const subscription=existing?subscriptions.resolveExistingWorkspace(workspaceId,record):subscriptions.resolveNewWorkspace(workspaceId,record);
  const detail=subscriptions.describe(subscription);
  if(!detail.valid)return Object.freeze({valid:false,title:'Subscription unavailable',note:'Subscription data could not be verified. No changes have been made.',usage:[]});
  const ent=detail.entitlements;
  const usage=policy.LIMIT_KEYS.map(key=>Object.freeze({key,label:LABELS[key],limit:ent.limits[key],limitLabel:ent.limits[key]===null?'Unlimited':String(ent.limits[key])}));
  const featureList=policy.FEATURE_KEYS.map(key=>Object.freeze({key,label:FEATURES[key],included:ent.features.includes(key)}));
  return Object.freeze({valid:true,title:ent.label,planId:ent.planId,status:subscription.status,preview:ent.preview,usage:Object.freeze(usage),features:Object.freeze(featureList),note:ent.preview?'Development preview: your workspace retains full Professional access. No plan limits are enforced.':'Plan details shown for reference only. Subscription enforcement is not active.'});
 }
 // Text escaping is mandatory before passing model data into any HTML renderer.
 function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function renderReadOnly(model){
  if(!model?.valid)return '<section class="subscription-overview" aria-label="Current subscription"><p>Subscription information unavailable. No changes were made.</p></section>';
  const allowances=model.usage.map(item=>'<div class="subscription-allowance"><dt>'+escapeHtml(item.label)+'</dt><dd>'+escapeHtml(item.limitLabel)+'</dd></div>').join('');
  const features=model.features.map(item=>'<li class="'+(item.included?'included':'excluded')+'">'+escapeHtml(item.label)+(item.included?'':' (not included)')+'</li>').join('');
  return '<section class="subscription-overview" aria-label="Current subscription"><div class="subscription-hero"><div><div class="subscription-eyebrow">Your current plan</div><h3>'+escapeHtml(model.title)+'</h3><p>'+escapeHtml(model.note)+'</p></div><span class="subscription-pill">'+(model.preview?'Development access':'Read-only')+'</span></div><h4 class="subscription-heading">Plan allowances</h4><dl class="subscription-allowances">'+allowances+'</dl><h4 class="subscription-heading">Included features</h4><ul class="subscription-features">'+features+'</ul></section>';
 }
 function renderPlanComparison(){
  const ids=['free','standard','professional'];
  const limits=policy.LIMIT_KEYS.map(key=>'<tr><th scope="row">'+escapeHtml(LABELS[key])+'</th>'+ids.map(id=>{const value=policy.PLANS[id].limits[key];return '<td>'+escapeHtml(value===null?'Unlimited':value)+'</td>';}).join('')+'</tr>').join('');
  const features=policy.FEATURE_KEYS.map(key=>'<tr><th scope="row">'+escapeHtml(FEATURES[key])+'</th>'+ids.map(id=>'<td>'+ (policy.PLANS[id].features.includes(key)?'Included':'—')+'</td>').join('')+'</tr>').join('');
  return '<div class="subscription-comparison" style="margin-top:24px"><h3>Compare plans</h3><p style="color:var(--muted)">Plan comparison for information only. Upgrades, billing and restrictions are not active.</p><div style="overflow-x:auto;max-width:100%"><table style="width:100%;border-collapse:collapse;text-align:left;min-width:530px"><thead><tr><th scope="col">Allowance / feature</th>'+ids.map(id=>'<th scope="col">'+escapeHtml(policy.PLANS[id].label)+'</th>').join('')+'</tr></thead><tbody>'+limits+features+'</tbody></table></div></div>';
 }
 return Object.freeze({VERSION,LABELS,FEATURES,getDisplayModel,escapeHtml,renderReadOnly,renderPlanComparison});
});
