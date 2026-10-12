// Read-only support inbox projection. No DB access or route is enabled here.
// The eventual handler MUST use private server-side admin authorization before fetching tickets.
export const SUPPORT_STATUSES=Object.freeze(['open','in_progress','waiting_for_customer','resolved']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function prepareSupportInbox(rows,{limit=50}={}){
 if(!Array.isArray(rows))throw new TypeError('Invalid ticket result');
 const cap=Math.max(1,Math.min(50,Number.isInteger(limit)?limit:50));
 return rows.slice(0,cap).map(row=>{
  if(!row||!UUID.test(String(row.id||''))||!SUPPORT_STATUSES.includes(row.status))throw new TypeError('Invalid support ticket');
  return Object.freeze({
   reference:'DP-'+row.id.slice(0,8).toUpperCase(),
   status:row.status,
   category:String(row.category||'').slice(0,100),
   subject:String(row.subject||'').slice(0,120),
   created_at:row.created_at||null,
   updated_at:row.updated_at||null
  });
 });
}
