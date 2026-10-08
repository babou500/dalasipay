import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPlatformAdminDashboard} from './dashboard-preview.mjs';
test('preview does not expose customer information, controls or misleading operational data',()=>{
 const html=renderPlatformAdminDashboard();
 assert.match(html,/Platform Administration/);
 assert.match(html,/Not connected/);
 assert.match(html,/Professional Preview remains unrestricted/);
 assert.doesNotMatch(html,/<form\b|<button\b|<input\b|<script\b/i);
 assert.doesNotMatch(html,/service_role|SUPABASE_SERVICE_ROLE_KEY|Bearer /);
});
test('preview provides mobile layout and no indexing',()=>{
 const html=renderPlatformAdminDashboard();
 assert.match(html,/max-width:650px/);
 assert.match(html,/noindex,nofollow/);
});
