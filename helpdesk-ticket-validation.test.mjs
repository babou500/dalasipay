import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTicket,ticketReference,TICKET_CATEGORIES} from './helpdesk-ticket-validation.mjs';
const sample={organization_id:'123e4567-e89b-12d3-a456-426614174000',category:'Technical problem',subject:'Report error',details:'My report shows an unexpected total.'};
test('accepts supported categories and creates an explicitly bounded payload',()=>{for(const category of TICKET_CATEGORIES){const t=prepareTicket({...sample,category,created_by:'spoof',status:'resolved',secret:'do not send'});assert.deepEqual(Object.keys(t),['organization_id','category','subject','details']);assert.ok(Object.isFrozen(t));}});
test('rejects malformed and oversized inputs before any request',()=>{for(const t of [{...sample,subject:'bad'},{...sample,details:'too short'},{...sample,category:'untrusted'},{...sample,organization_id:'wrong'},{...sample,details:'x'.repeat(4001)}])assert.throws(()=>prepareTicket(t));});
test('formats a ticket reference only from validated UUIDs',()=>{assert.equal(ticketReference(sample.organization_id),'DP-123E4567');assert.throws(()=>ticketReference('garbage'));});
