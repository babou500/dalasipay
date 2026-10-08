/* Server-side licensing usage snapshot helpers.
 * Read-only. Must receive trusted backend results; never authorize from UI counts.
 * Invoice and supplier-bill counts remain null until a transactional authoritative
 * source has been verified. No license enforcement.
 */
export function buildObservedUsage({memberCount,employeeCount,companyCount=null}={}){
 const valid=n=>Number.isSafeInteger(n)&&n>=0?n:null;
 return Object.freeze({
  companies:valid(companyCount),
  users:valid(memberCount),
  employees:valid(employeeCount),
  invoicesPerMonth:null,
  supplierBillsPerMonth:null
 });
}
export async function queryObservedPeopleCounts({countMembers,countEmployees,workspaceId}={}){
 if(typeof countMembers!=='function'||typeof countEmployees!=='function')throw new TypeError('Trusted count functions required');
 if(typeof workspaceId!=='string'||!workspaceId)throw new TypeError('Workspace required');
 const [members,employees]=await Promise.all([
  countMembers(workspaceId),
  countEmployees(workspaceId)
 ]);
 return buildObservedUsage({memberCount:members,employeeCount:employees});
}
