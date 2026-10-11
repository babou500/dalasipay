const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');

test('new payroll calendars use current month rather than October 2026', () => {
  assert.ok(html.includes("id:new Date().toISOString().slice(0,7),label:periodLabel(new Date().toISOString().slice(0,7))"));
  assert.ok(html.includes("currentPeriod: new Date().toISOString().slice(0,7)"));
});

test('existing saved payroll periods remain authoritative', () => {
  assert.ok(html.includes("getOrgValue(state.org.id,'payroll-periods',null)||"));
  assert.ok(html.includes("getOrgValue(state.org.id,'current-period',state.periods[0]?.id"));
});

test('earlier payroll months are available and dates are validated', () => {
  assert.ok(html.includes('type="month" min="2000-01"'));
  assert.ok(html.includes('if(!/^(20\\d{2})-(0[1-9]|1[0-2])$/.test(id))'));
});
