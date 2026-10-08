import { observedAppUsage } from './licensing-app-state-usage.mjs';
import { buildObservedUsage } from './licensing-usage-observer.mjs';
/* Trusted DalasiPay Supabase licensing data provider.
 * Server runtime only. Never bundle this module or service credentials into index.html.
 * Pass a server-created Supabase admin client. Caller must separately authenticate
 * the bearer token using Supabase Auth, not decode unverified JWT claims.
 * Read-only, observation-only, no enforcement.
 */
export function createSupabaseLicensingProvider({adminClient,countWorkspaceRecords,loadAppState}={}){
 if(!adminClient || typeof adminClient.from!=='function')throw new TypeError('Server-side Supabase client required');
 function identity(principal){
  return principal && typeof principal.userId==='string' && /^[a-f0-9-]{36}$/i.test(principal.userId) ? principal.userId : null;
 }
 async function authorizeWorkspace({principal,workspaceId}){
  const userId=identity(principal);
  if(!userId || !/^[a-f0-9-]{36}$/i.test(workspaceId))return false;
  const {data,error}=await adminClient.from('organization_members').select('user_id').eq('organization_id',workspaceId).eq('user_id',userId).maybeSingle();
  if(error)throw Error('Membership lookup unavailable');
  return data?.user_id===userId;
 }
 async function loadWorkspaceSnapshot({workspaceId}){
  const {data,error}=await adminClient.from('workspace_subscriptions').select('organization_id,plan_id,status,professional_preview').eq('organization_id',workspaceId).maybeSingle();
  if(error)throw Error('Subscription lookup unavailable');
  if(!data)return null;
  // Read-only server counts. Missing count support stays unknown (never zero).
  let usage=buildObservedUsage();
  if(typeof countWorkspaceRecords==='function'){
   try{
    const [memberCount,employeeCount]=await Promise.all([
     countWorkspaceRecords('organization_members',workspaceId),
     countWorkspaceRecords('employees',workspaceId)
    ]);
    usage=buildObservedUsage({memberCount,employeeCount});
   }catch{/* Count outage must not break subscription verification. */}
  }
  if(typeof loadAppState==='function'){
   try{
    const saved=await loadAppState(workspaceId);
    const observed=observedAppUsage(saved);
    usage=Object.freeze({...usage,employees:observed.employees});
   }catch{usage=Object.freeze({...usage,employees:null});}
  }
  return {workspaceId:data.organization_id,planId:data.plan_id,professionalPreview:data.status==='professional_preview' && data.professional_preview===true,usage};
 }
 return Object.freeze({authorizeWorkspace,loadWorkspaceSnapshot});
}
