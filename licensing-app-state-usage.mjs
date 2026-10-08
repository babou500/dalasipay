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

export function observeIssuedDocuments(records,month){
 if(!Array.isArray(records)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
 const accepted=new Set(['sent','paid','partial','partially paid','overdue','unpaid','issued']);
 return records.filter(item=>item&&accepted.has(String(item.status||'').toLowerCase())&&typeof item.createdAt==='string'&&item.createdAt.slice(0,7)===month).length;
}

export function observeMonthlyWorkspaceDocuments(record,month){
 const data=record?.state?.data;
 return Object.freeze({
  month,
  invoices:observeIssuedDocuments(data?.['customer-invoices'],month),
  supplierBills:observeIssuedDocuments(data?.['business-bills'],month),
  authoritative:false
 });
}
