const test=require('node:test');
const assert=require('node:assert/strict');
const calendar=require('./accounting-calendar.js');

test('legacy businesses retain January to December accounting year',()=>{
  const state={manualJournals:[{id:'existing',date:'2026-05-01'}]};
  assert.deepEqual({...calendar.readOnlyConfig(state)},{financialYearStartMonth:1,migrationDate:null,legacyCalendar:true});
  assert.deepEqual({...calendar.financialYearFor('2026-10-11',1)},{start:'2026-01-01',end:'2026-12-31',label:'2026'});
  assert.equal(state.accountingCalendar,undefined);
  assert.equal(state.manualJournals[0].id,'existing');
});

test('April financial year closes on March 31 including leap years',()=>{
  assert.deepEqual({...calendar.financialYearFor('2026-10-01',4)},{start:'2026-04-01',end:'2027-03-31',label:'2026/2027'});
  assert.deepEqual({...calendar.financialYearFor('2024-02-29',4)},{start:'2023-04-01',end:'2024-03-31',label:'2023/2024'});
});

test('July financial year closes June 30',()=>{
  assert.deepEqual({...calendar.financialYearFor('2026-01-10',7)},{start:'2025-07-01',end:'2026-06-30',label:'2025/2026'});
});

test('migration date and financial year can be proposed without mutating state',()=>{
  const state={accountingCalendar:{financialYearStartMonth:1,migrationDate:null}};
  const proposal=calendar.proposedConfig(state,{financialYearStartMonth:7,migrationDate:'2026-10-01'});
  assert.equal(proposal.financialYearStartMonth,7);
  assert.equal(proposal.migrationDate,'2026-10-01');
  assert.equal(state.accountingCalendar.financialYearStartMonth,1);
  assert.equal(state.accountingCalendar.migrationDate,null);
});

test('invalid financial years and nonexistent dates rejected',()=>{
  for(const date of ['2026-02-30','2025-02-29','2026-13-01','not a date'])assert.equal(calendar.validDate(date),false);
  assert.equal(calendar.validDate('2024-02-29'),true);
  assert.throws(()=>calendar.financialYearFor('2026-10-11',13));
  assert.throws(()=>calendar.proposedConfig({}, {migrationDate:'2026-02-30'}));
});
