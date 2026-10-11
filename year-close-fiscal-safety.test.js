const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(calendar){
  const window={};vm.runInNewContext(fs.readFileSync('year-end-close.js','utf8'),{window,console});
  const events={toasts:[],saves:0,audits:0};
  const state={accountingCalendar:calendar,yearEndCloses:[],manualJournals:[],session:{name:'Test Owner'}};
  const ctx={can:()=>true,toast:m=>events.toasts.push(m),save:()=>events.saves++,audit:()=>events.audits++,render:()=>{}};
  return {window,state,events,ctx};
}
test('custom April fiscal year never creates a calendar-year closing journal',()=>{
  const t=harness({financialYearStartMonth:4,migrationDate:'2026-10-01'});
  t.window.DalasiYearClose.closeYear('2026',t.state,t.ctx);
  assert.match(t.events.toasts.at(-1),/not enabled yet/);
  assert.equal(t.state.manualJournals.length,0);
  assert.equal(t.state.yearEndCloses.length,0);
  assert.equal(t.events.saves,0);
  assert.equal(t.events.audits,0);
});
test('legacy January calendar stays on existing close-control path',()=>{
  const t=harness(undefined);
  t.window.DalasiYearClose.closeYear('2026',t.state,t.ctx);
  assert.match(t.events.toasts.at(-1),/Close all 12 months/);
  assert.equal(t.state.manualJournals.length,0);
});
