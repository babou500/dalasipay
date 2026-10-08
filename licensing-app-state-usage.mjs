/* Read-only extraction from the actual persisted DalasiPay workspace state.
 * Counts are observation-only and never authorize billing or restrictions.
 */
export function observedAppUsage(record){
 const data=record?.state?.data;
 if(!data||typeof data!=='object'||Array.isArray(data))return {employees:null,invoicesPerMonth:null,supplierBillsPerMonth:null};
 const employees=data.employees;
 return {
  employees:Array.isArray(employees)?employees.length:null,
  invoicesPerMonth:null,
  supplierBillsPerMonth:null
 };
}
