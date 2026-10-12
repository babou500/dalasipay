import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSupportInbox} from './helpdesk-inbox-preview.mjs';
const id='123e4567-e89b-12d3-a456-426614174000';
test('support inbox returns bounded metadata, not private ticket descriptions or email',()=>{const rows=Array.from({length:60},()=>({id,status:'open',subject:'Example',category:'Technical problem',details:'Private customer data',replyEmail:'private@example.com'}));const output=prepareSupportInbox(rows);assert.equal(output.length,50);assert.equal(output[0].reference,'DP-123E4567');assert.equal(output[0].details,undefined);assert.equal(output[0].replyEmail,undefined);});
test('support inbox rejects malformed ids and statuses',()=>{assert.throws(()=>prepareSupportInbox([{id:'invalid',status:'open'}]));assert.throws(()=>prepareSupportInbox([{id,status:'unknown'}]));});
