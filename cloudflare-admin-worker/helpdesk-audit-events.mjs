// Dormant Help Desk audit-event preparation. Never authorizes operations or persists records.
export const SUPPORT_EVENTS=Object.freeze(['ticket_created','status_changed','reply_drafted','ticket_assigned']);
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function prepareSupportAuditEvent({ticketId,actorId,type,metadata}={}){
 if(!UUID.test(String(ticketId||''))||!UUID.test(String(actorId||'')))throw new TypeError('Invalid identity');
 if(!SUPPORT_EVENTS.includes(type))throw new TypeError('Invalid event');
 if(metadata!=null&&(typeof metadata!=='object'||Array.isArray(metadata)))throw new TypeError('Invalid metadata');
 const safe={};
 if(type==='status_changed'){
  const statuses=['open','in_progress','waiting_for_customer','resolved'];
  if(!statuses.includes(metadata?.from)||!statuses.includes(metadata?.to)||metadata.from===metadata.to)throw new TypeError('Invalid transition');
  safe.from=metadata.from;safe.to=metadata.to;
 }
 if(type==='ticket_assigned'){
  if(!UUID.test(String(metadata?.assigneeId||'')))throw new TypeError('Invalid assignee');
  safe.assigneeId=metadata.assigneeId;
 }
 // Never store descriptions, passwords, financial data, email content, or arbitrary client metadata.
 return Object.freeze({ticket_id:ticketId,actor_id:actorId,event_type:type,metadata:Object.freeze(safe)});
}
