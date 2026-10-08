/* Trusted DalasiPay Supabase licensing data provider.
 * Server runtime only. Never bundle this module or service credentials into index.html.
 * Pass a server-created Supabase admin client. Caller must separately authenticate
 * the bearer token using Supabase Auth, not decode unverified JWT claims.
 * Read-only, observation-only, no enforcement.
 */
export function createSupabaseLicensingProvider({adminClient}={}){
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
  // No client-supplied counts. Accurate billing-period usage needs a separate
  // server-owned transactional ledger. null signals that it is not yet available.
  return {workspaceId:data.organization_id,planId:data.plan_id,professionalPreview:data.status==='professional_preview' && data.professional_preview===true,usage:{companies:null,users:null,employees:null,invoicesPerMonth:null,supplierBillsPerMonth:null}};
 }
 return Object.freeze({authorizeWorkspace,loadWorkspaceSnapshot});
}
