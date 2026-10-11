const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');

test('new payroll calendars use current period, not fixed October 2026',()=>{
  assert.match(html,/state\.periods=window\.DalasiAuth\.getOrgValue\(state\.org\.id,'payroll-periods',null\)\|\|\[\{id:new Date\(\)\.toISOString\(\)\.slice\(0,7\)/);
  assert.match(html,/currentPeriod: new Date\(\)\.toISOString\(\)\.slice\(0,7\)/);
});
test('existing saved payroll calendars remain primary',()=>{
  assert.match(html,/getOrgValue\(state\.org\.id,'payroll-periods',null\)\|\|/);
  assert.match(html,/getOrgValue\(state\.org\.id,'current-period',state\.periods\[0\]/);
});
test('payroll calendar accepts earlier months while validating full month',()=>{
  assert.match(html,/type=\\"month\\" min=\\"2000-01\\"/);
  assert.match(html,/\(20\\d\{2\}\)-\(0\[1-9\]\|1\[0-2\]\)/);
});
