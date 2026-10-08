/* On-demand subscription connectivity check. Never runs during application startup. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DalasiSubscriptionVerify=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ENDPOINT='https://dalasipay-licensing-staging.baboucarrnjie212.workers.dev/internal/licensing/observe';
 async function verify({getSession,workspaceId,request}={}){
  if(typeof getSession!=='function'||typeof workspaceId!=='string'||!workspaceId)return {ok:false,message:'Workspace or login session unavailable.'};
  const send=request||fetch;
  try{
   const session=await getSession();
   if(!session?.access_token)return {ok:false,message:'Sign in again to verify your subscription.'};
   const response=await send(ENDPOINT+'?workspaceId='+encodeURIComponent(workspaceId),{
    method:'GET',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{Authorization:'Bearer '+session.access_token,Accept:'application/json'}
   });
   if(response.status===401)return {ok:false,message:'Session verification failed. Sign in again.'};
   if(response.status===403)return {ok:false,message:'This account is not authorized for the selected workspace.'};
   if(!response.ok)return {ok:false,message:'Subscription service unavailable (HTTP '+response.status+').'};
   const data=await response.json();
   if(data?.ok!==true||data.workspaceId!==workspaceId||data.enforcementActive!==false)return {ok:false,message:'Subscription response could not be verified.'};
   const integerCount=key=>{
    const n=data.usage?.[key]?.count;
    return Number.isSafeInteger(n)&&n>=0?n:null;
   };
   const users=integerCount('users'),employees=integerCount('employees');
   const diag=data.monthlyDiagnostics;
   const diagnosticCount=n=>Number.isSafeInteger(n)&&n>=0?String(n):'Unavailable';
   const monthly=diag?.authoritative===false&&/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(diag.month||'')?
    ' Provisional '+diag.month+' document counts (not billing usage): issued invoices: '+diagnosticCount(diag.invoices)+', supplier bills: '+diagnosticCount(diag.supplierBills)+'.':
    ' Monthly document diagnostics unavailable.';
   const status=(label,n)=>label+': '+(n===null?'Unavailable':n);
   return {ok:true,message:'Connected securely. Plan: '+(data.planId==='professional-preview'?'Professional Preview':data.planId)+'. Licensing restrictions remain disabled. Server counts: '+status('users',users)+', '+status('employees',employees)+'.'+monthly+' Monthly invoice and supplier bill licensing usage remains unverified.'};
  }catch{return {ok:false,message:'Could not connect to the subscription service. No data was changed.'};}
 }
 return Object.freeze({verify});
});
