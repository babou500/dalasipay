const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/20261012170000_helpdesk_ticket_foundation.sql','utf8');
test('helpdesk tickets require authenticated workspace membership and authorship',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
 assert.match(sql,/CREATE POLICY helpdesk_ticket_read_own/);
 assert.match(sql,/CREATE POLICY helpdesk_ticket_create_own/);
 assert.match(sql,/created_by=\(SELECT auth\.uid\(\)\)/);
 assert.match(sql,/m\.organization_id=helpdesk_tickets\.organization_id/);
 assert.match(sql,/m\.user_id=\(SELECT auth\.uid\(\)\)/);
});
test('ticket fields and privileges are restricted and mail is not enabled',()=>{
 assert.match(sql,/CHECK\(status IN \('open','in_progress','waiting_for_customer','resolved'\)\)/);
 assert.match(sql,/GRANT SELECT, INSERT ON public\.helpdesk_tickets TO authenticated/);
 assert.doesNotMatch(sql,/GRANT UPDATE|GRANT DELETE|http_post|send_email|net\.http_post/i);
});
