/* Subscription administration roadmap. Display-only, no forms, mutation or authority. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DalasiSubscriptionAdminPreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function render(){
  return '<section class="subscription-admin-preview" aria-label="Subscription administration status"><h3>Subscription administration</h3><p class="subscription-usage-note">Administration tools are being prepared. Your current plan and permissions cannot be changed here.</p><div class="subscription-admin-steps"><div><strong>Plan assignments</strong><span>Future: authorized administrators only, with server-side permission checks.</span></div><div><strong>Subscription history</strong><span>Future: immutable record of plan changes, who approved them and when.</span></div><div><strong>Upgrade requests</strong><span>Future: request, review and approve before any plan change.</span></div></div><p class="subscription-plan-disclaimer">Not active: requests, approvals, payments, automatic billing, and plan enforcement. Professional Preview remains unrestricted.</p></section>';
 }
 return Object.freeze({render});
});
