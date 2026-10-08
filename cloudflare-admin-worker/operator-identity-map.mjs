/* Unmounted identity-to-permission resolver.
 * Cloudflare Access 'sub' is a verified stable external identity, but is not
 * automatically a DalasiPay administrator or a Supabase user ID.
 * The injected lookup must be a protected exact-subject mapping with explicit
 * administrator approval. Never match email addresses or user-provided IDs.
 */
export function createApprovedOperatorResolver({lookupIdentity,lookupMembership}={}){
 if(typeof lookupIdentity!=='function'||typeof lookupMembership!=='function')throw new TypeError('Restricted identity and membership lookups required');
 return async function checkApprovedOperator(subject){
  if(typeof subject!=='string'||!/^[-_a-zA-Z0-9:.@]{8,256}$/.test(subject))return false;
  const mapping=await lookupIdentity(subject);
  if(!mapping||mapping.accessSubject!==subject||mapping.approved!==true||typeof mapping.userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mapping.userId))return false;
  return (await lookupMembership(mapping.userId))===true;
 };
}
