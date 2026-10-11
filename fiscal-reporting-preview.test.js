const test=require('node:test');
const assert=require('node:assert/strict');
const report=require('./fiscal-reporting-preview.js');

test('legacy calendar report period remains January to December',()=>{
  assert.deepEqual({...report.periodFor({},'2026-10-15')},{start:'2026-01-01',end:'2026-12-31',label:'2026'});
});
test('April to March reports group date examples into correct fiscal year',()=>{
  const state={accountingCalendar:{financialYearStartMonth:4,migrationDate:null}};
  const periods=report.periodOptions(state,['2026-04-01','2026-12-15','2027-03-31','2027-04-01','invalid']);
  assert.equal(periods.length,2);
  assert.equal(periods[0].start,'2027-04-01');
  assert.equal(periods[0].end,'2028-03-31');
  assert.equal(periods[1].start,'2026-04-01');
  assert.equal(periods[1].end,'2027-03-31');
});
test('impact preview flags reinterpretation without altering historical entries',()=>{
  const state={manualJournals:[{id:'J1',date:'2026-01-31'}]};
  const original=JSON.stringify(state);
  const impact=report.impactPreview(state,{financialYearStartMonth:7,migrationDate:'2026-10-01'},['2026-01-31']);
  assert.equal(impact.requiresAccountingReview,true);
  assert.equal(impact.affectedDateCount,1);
  assert.equal(impact.doesNotPostOrModifyRecords,true);
  assert.equal(JSON.stringify(state),original);
});
test('unchanged calendar does not require review for valid dates',()=>{
  const result=report.impactPreview({}, {financialYearStartMonth:1}, ['2026-10-01']);
  assert.equal(result.requiresAccountingReview,false);
  assert.equal(result.affectedDateCount,0);
});
