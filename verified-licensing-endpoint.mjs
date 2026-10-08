/* Server-only verified Supabase Auth bridge, inert until explicitly mounted.
 * Inject server-created authClient and adminClient. Never place secret keys here.
 */
import { createSupabaseLicensingProvider } from './supabase-licensing-provider.mjs';
import { createLicensingHttpAdapter } from './licensing-http-adapter.mjs';

export function createVerifiedLicensingEndpoint({ authClient, adminClient, countWorkspaceRecords, loadAppState } = {}) {
 if(typeof authClient?.auth?.getUser!=='function')throw new TypeError('Supabase Auth verifier required');
 const provider=createSupabaseLicensingProvider({adminClient,countWorkspaceRecords,loadAppState});
 async function authenticateRequest(request){
  const header=request.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if(!match)return null;
  const {data,error}=await authClient.auth.getUser(match[1]);
  if(error||!data?.user?.id)return null;
  return {userId:data.user.id};
 }
 return createLicensingHttpAdapter({authenticateRequest,authorizeWorkspace:provider.authorizeWorkspace,loadWorkspaceSnapshot:provider.loadWorkspaceSnapshot});
}
