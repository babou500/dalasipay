/* Unmounted restricted RPC adapter. Production EXECUTE is revoked for service_role,
 * so this fails closed until a separate reviewed execution principal is available.
 * Never accept an identity value from the browser; only a verified Access subject.
 */
export function createRestrictedAdminLookup({supabaseUrl,serverCredential,fetchImpl=fetch}={}){
 if(typeof supabaseUrl!=='string'||!/^https:\/\/[^/]+\/?$/.test(supabaseUrl)||typeof serverCredential!=='string'||!serverCredential||typeof fetchImpl!=='function')throw new TypeError('Private RPC dependencies required');
 const url=supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/platform_admin_identity_authorized_internal';
 return async function checkVerifiedSubject(subject){
  if(typeof subject!=='string'||subject.length<8||subject.length>256)return false;
  const response=await fetchImpl(url,{method:'POST',headers:{authorization:'Bearer '+serverCredential,apikey:serverCredential,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({p_subject:subject})});
  if(!response.ok)throw Error('Restricted membership lookup unavailable');
  const result=await response.json();
  if(typeof result!=='boolean')throw Error('Invalid membership response');
  return result;
 };
}
