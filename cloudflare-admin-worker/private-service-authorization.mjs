/* Undeployed staging-to-private service binding authorization adapter.
 * The Access JWT comes ONLY from the incoming Cloudflare-protected request.
 * Never use browser-supplied identity IDs or trust a boolean from the browser.
 * The private Worker independently verifies JWT signature, issuer and audience.
 */
export function createPrivateServiceAuthorization({service}={}){
 if(!service||typeof service.fetch!=='function')throw new TypeError('Private Worker service binding required');
 return async function authorize(request){
  const assertion=request.headers.get('cf-access-jwt-assertion');
  if(!assertion||assertion.length>16000)return false;
  const result=await service.fetch(new Request('https://admin-membership.internal/internal/admin/authorize',{
   method:'POST',
   headers:{'cf-access-jwt-assertion':assertion,'content-type':'application/json'},
   body:'{}'
  }));
  if(result.status===403)return false;
  if(!result.ok)throw Error('Private administrator verification unavailable');
  const data=await result.json();
  if(typeof data?.authorized!=='boolean')throw Error('Invalid private verification response');
  return data.authorized===true;
 };
}
