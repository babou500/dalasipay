// Future Help Desk ticket submission boundary. Not connected to the live UI.
export const TICKET_CATEGORIES=Object.freeze(['Technical problem','Accounting or reports','Invoices and payments','Payroll','Tax and GRA','Subscription or login','Other question']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function prepareTicket(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new TypeError('Invalid ticket');
 const organization_id=input.organization_id;
 if(typeof organization_id!=='string'||!UUID.test(organization_id))throw new TypeError('Invalid workspace');
 const category=input.category,subject=typeof input.subject==='string'?input.subject.trim():'',details=typeof input.details==='string'?input.details.trim():'';
 if(!TICKET_CATEGORIES.includes(category))throw new TypeError('Invalid category');
 if(subject.length<5||subject.length>120)throw new TypeError('Subject must be 5–120 characters');
 if(details.length<10||details.length>4000)throw new TypeError('Description must be 10–4000 characters');
 // Caller-supplied identity, status, timestamps and files must never be forwarded.
 return Object.freeze({organization_id,category,subject,details});
}
export function ticketReference(id){
 if(typeof id!=='string'||!UUID.test(id))throw new TypeError('Invalid ticket reference');
 return 'DP-'+id.slice(0,8).toUpperCase();
}
