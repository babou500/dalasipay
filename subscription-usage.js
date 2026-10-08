/* DalasiPay read-only usage snapshot. Never use client counts for authorization. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DalasiPlanUsage=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function monthKey(date){return typeof date==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(date)?date:null}
 function activeCount(items){return Array.isArray(items)?items.filter(x=>x&&x.deleted!==true&&x.isDeleted!==true).length:0}
 function monthlyCount(items,month,keys){
  if(!Array.isArray(items)||!monthKey(month))return null;
  return items.filter(x=>x&&x.deleted!==true&&x.isDeleted!==true&&keys.some(key=>typeof x[key]==='string'&&x[key].slice(0,7)===month)).length;
 }
 function snapshot(data,month){
  if(!monthKey(month))return null;
  const d=data||{};
  return Object.freeze({
   month,
   employees:activeCount(d.employees),
   users:activeCount(d.users),
   companies:typeof d.companyCount==='number'&&Number.isSafeInteger(d.companyCount)&&d.companyCount>=0?d.companyCount:null,
   invoicesPerMonth:monthlyCount(d.customerInvoices,month,['issueDate','date']),
   supplierBillsPerMonth:monthlyCount(d.businessBills,month,['issueDate','billDate','date'])
  });
 }
 function render(snapshot,limits,escape){
  if(!snapshot||!limits)return '<p>Usage details are currently unavailable.</p>';
  const e=typeof escape==='function'?escape:(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={companies:'Companies',users:'Users',employees:'Employees',invoicesPerMonth:'Invoices this month',supplierBillsPerMonth:'Supplier bills this month'};
  return '<div class="subscription-usage"><h4>Workspace usage</h4><p>Informational counts only. No plan limits are enforced.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">'+Object.keys(labels).map(key=>'<div style="border:1px solid var(--border,#dce5df);border-radius:10px;padding:12px"><small>'+e(labels[key])+'</small><div><strong>'+e(snapshot[key]===null?'Unavailable':snapshot[key])+'</strong> / '+e(limits[key]===null?'Unlimited':limits[key])+'</div></div>').join('')+'</div></div>';
 }
 return Object.freeze({monthKey,activeCount,monthlyCount,snapshot,render});
});
