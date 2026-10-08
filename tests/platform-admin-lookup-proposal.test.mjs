import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('./platform-admin-lookup-proposal.sql',import.meta.url),'utf8');
test('platform membership proposal grants no browser or service role access',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.is_platform_admin_internal\(uuid\) FROM authenticated/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.is_platform_admin_internal\(uuid\) FROM service_role/);
 assert.doesNotMatch(sql,/^GRANT\s+EXECUTE\b/im);
});
test('proposal returns only boolean membership and cannot edit administrator list',()=>{
 assert.match(sql,/RETURNS boolean/i);
 assert.match(sql,/SELECT EXISTS/i);
 assert.doesNotMatch(sql,/^\s*(INSERT|UPDATE|DELETE)\s+(INTO|FROM|public)/im);
});
