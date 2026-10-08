/* Presentation of authenticated licensing observations; never an entitlement gate. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DalasiUsagePanel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=n=>Number.isSafeInteger(n)&&n>=0?String(n):'Unavailable';
 function render(data,workspaceId){
  if(!data||data.ok!==true||data.workspaceId!==workspaceId||data.enforcementActive!==false)return '';
  const count=k=>number(data.usage?.[k]?.count);
  const diag=data.monthlyDiagnostics;
  const period=diag?.authoritative===false&&/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(diag.month||'')?diag.month:null;
  const tile=(label,value)=>'<div class="subscription-allowance"><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>';
  return '<section class="subscription-usage-panel" aria-label="Verified subscription usage"><h4 class="subscription-heading">Workspace usage</h4><p class="subscription-usage-note">Server-reported records, for information only. Plan limits are not enforced.</p><dl class="subscription-allowances">'+tile('Users',count('users'))+tile('Employee records',count('employees'))+'</dl><h4 class="subscription-heading">Monthly document diagnostics</h4><p class="subscription-usage-note">Provisional observations, not official subscription usage or billable totals.</p><dl class="subscription-allowances">'+tile('Period',period||'Unavailable')+tile('Issued invoices',period?number(diag.invoices):'Unavailable')+tile('Supplier bills',period?number(diag.supplierBills):'Unavailable')+'</dl></section>';
 }
 return Object.freeze({render});
});
