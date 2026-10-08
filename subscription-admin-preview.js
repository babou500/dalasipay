/* Subscription administration roadmap. Display-only, no forms, mutation or authority. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DalasiSubscriptionAdminPreview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function render(){
  const sections=[
   ['Access control','Platform operator appointments','Disabled until independently authorized and audited'],
   ['Subscription requests','Review queue','Unavailable until a secure platform-admin endpoint exists'],
   ['Plan operations','Assignment and restoration','Disabled; existing workspace plans remain unchanged'],
   ['Audit history','Append-only event register','Database foundation prepared; no browser data access']
  ];
  const cards=sections.map(([category,name,status])=>'<div class="subscription-admin-preview-card"><span class="subscription-admin-category">'+category+'</span><strong>'+name+'</strong><p>'+status+'</p><span class="subscription-admin-disabled">Not active</span></div>').join('');
  return '<section class="subscription-admin-preview" aria-label="Future platform administration preview"><h3>Platform administration</h3><p class="subscription-usage-note">Read-only preview of future platform controls. This is not a live administrator dashboard. Only verified platform operators will receive access once secure endpoints are available.</p><div class="subscription-admin-steps">'+cards+'</div><p class="subscription-plan-disclaimer">No administrator can be appointed, no request can be processed, and no plan can be changed here. Professional Preview remains unrestricted.</p></section>';
 }
 return Object.freeze({render});
});
