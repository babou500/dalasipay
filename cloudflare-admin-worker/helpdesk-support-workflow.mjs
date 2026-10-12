// Dormant support workflow primitives; authorization belongs to a verified private administrator service.
export const TICKET_STATES=Object.freeze(['open','in_progress','waiting_for_customer','resolved']);
const NEXT=Object.freeze({open:['in_progress'],in_progress:['waiting_for_customer','resolved'],waiting_for_customer:['in_progress','resolved'],resolved:['in_progress']});
export function prepareStatusChange({ticketId,currentStatus,nextStatus,reviewNote}={}){
 if(typeof ticketId!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(ticketId))throw new TypeError('Invalid ticket');
 if(!NEXT[currentStatus]?.includes(nextStatus))throw new TypeError('Invalid status transition');
 const note=typeof reviewNote==='string'?reviewNote.trim():'';
 if(note.length<5||note.length>1000)throw new TypeError('Review note required (5–1000 characters)');
 return Object.freeze({ticketId,currentStatus,nextStatus,reviewNote:note});
}
export function supportEmailDraft({reference,subject,status,summary}={}){
 if(typeof reference!=='string'||!/^DP-[A-F0-9]{8}$/.test(reference))throw new TypeError('Invalid reference');
 if(!TICKET_STATES.includes(status))throw new TypeError('Invalid status');
 const title=String(subject||'').trim(),message=String(summary||'').trim();
 if(title.length<5||title.length>120||message.length<10||message.length>1500)throw new TypeError('Invalid update');
 // Formatting only. No email is sent, stored, or delivered by this module.
 return Object.freeze({subject:'DalasiPay support update — '+reference,body:['Ticket: '+reference,'Subject: '+title,'Status: '+status.replaceAll('_',' '),'','Update:',message,'','BE Business Solutions','info@bebusinesssolutionsgm.com','+220 83 3159875'].join('\n')});
}
