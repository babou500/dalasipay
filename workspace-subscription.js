/* DalasiPay workspace subscription records, v1.
 * Pure read-only helpers: no storage, startup hooks, or enforcement.
 * Server must own assignment and validate authenticated workspace IDs.
 */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./licensing-policy.js'):root.DalasiLicensingPolicy);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.DalasiWorkspaceSubscription=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(policy){
 'use strict';
 const VERSION='1.0.0';
 const STATUS=Object.freeze({preview:'professional_preview',active:'active',expired:'expired',suspended:'suspended'});
 function isId(value){return typeof value==='string'&&value.length>0&&value.length<=200&&/^[a-zA-Z0-9:_-]+$/.test(value)}
 function previewRecord(workspaceId){
  if(!isId(workspaceId))return null;
  return Object.freeze({workspaceId,planId:'professional',status:STATUS.preview,professionalPreview:true,source:'development_preview',effectiveAt:null,expiresAt:null});
 }
 function freeRecord(workspaceId){
  if(!isId(workspaceId))return null;
  return Object.freeze({workspaceId,planId:'free',status:STATUS.active,professionalPreview:false,source:'new_workspace_default',effectiveAt:null,expiresAt:null});
 }
 function resolveExistingWorkspace(workspaceId,record){
  // Legacy workspaces have no subscription record and stay unrestricted in development.
  if(!isId(workspaceId))return null;
  if(record==null)return previewRecord(workspaceId);
  return parseRecord(workspaceId,record);
 }
 function resolveNewWorkspace(workspaceId,record){
  if(!isId(workspaceId))return null;
  if(record==null)return freeRecord(workspaceId);
  return parseRecord(workspaceId,record);
 }
 function parseRecord(workspaceId,record){
  if(!record||typeof record!=='object'||Array.isArray(record)||record.workspaceId!==workspaceId)return null;
  const planId=policy.normalizePlan(record.planId);
  if(!planId||!Object.values(STATUS).includes(record.status))return null;
  const preview=record.status===STATUS.preview&&record.professionalPreview===true&&planId==='professional';
  if(record.status===STATUS.preview&&!preview)return null;
  if(record.status!==STATUS.preview&&record.professionalPreview===true)return null;
  return Object.freeze({workspaceId,planId,status:record.status,professionalPreview:preview,source:typeof record.source==='string'?record.source:'unknown',effectiveAt:typeof record.effectiveAt==='string'?record.effectiveAt:null,expiresAt:typeof record.expiresAt==='string'?record.expiresAt:null});
 }
 function describe(record){
  if(!record)return Object.freeze({valid:false,label:'Subscription unavailable',entitlements:null});
  const entitlements=policy.getEntitlements(record.planId,{professionalPreview:record.professionalPreview});
  return Object.freeze({valid:!!entitlements,label:entitlements?.label||'Subscription unavailable',status:record.status,entitlements});
 }
 return Object.freeze({VERSION,STATUS,previewRecord,freeRecord,parseRecord,resolveExistingWorkspace,resolveNewWorkspace,describe});
});
