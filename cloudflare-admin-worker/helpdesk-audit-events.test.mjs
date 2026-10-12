import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSupportAuditEvent} from './helpdesk-audit-events.mjs';
const ticketId='123e4567-e89b-12d3-a456-426614174000',actorId='123e4567-e89b-12d3-a456-426614174001';
test('support audit metadata excludes confidential input and unknown properties',()=>{const event=prepareSupportAuditEvent({ticketId,actorId,type:'status_changed',metadata:{from:'open',to:'in_progress',password:'secret',financialRecords:'secret'}});assert.deepEqual(event.metadata,{from:'open',to:'in_progress'});assert.equal(Object.isFrozen(event),true);});
test('support audit blocks unrecognized events, forged IDs and invalid assignment',()=>{assert.throws(()=>prepareSupportAuditEvent({ticketId,actorId:'wrong',type:'ticket_created'}));assert.throws(()=>prepareSupportAuditEvent({ticketId,actorId,type:'delete_ticket'}));assert.throws(()=>prepareSupportAuditEvent({ticketId,actorId,type:'ticket_assigned',metadata:{assigneeId:'invalid'}}));});
