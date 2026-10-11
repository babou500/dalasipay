const test=require('node:test');
const assert=require('node:assert/strict');
const audit=require('./year-close-scope-audit.js');
const row=(date,accountType,debit,credit,other={})=>({date,accountType,debit,credit,...other});
test('exclude revenue and expenses from past and future years',()=>{
  const rows=[row('2025-07-01','Revenue',0,100),row('2026-06-01','Revenue',0,250),row('2026-06-10','Expense',50,0),row('2026-07-01','Revenue',0,900)];
  const result=audit.analyzeRows(rows,'2026-01-01','2026-12-31');
  assert.equal(result.netResult,1100);
  const fiscal=audit.analyzeRows(rows,'2025-07-01','2026-06-30');
  assert.equal(fiscal.revenue,350);
  assert.equal(fiscal.expenses,50);
  assert.equal(fiscal.netResult,300);
});
test('ignore end-year closing lines and retain reversing source amounts',()=>{
  const r=audit.analyzeRows([row('2026-12-31','Revenue',100,0,{reference:'YE-CLOSE-2026'}),row('2026-04-01','Revenue',0,100),row('2026-04-02','Revenue',100,0,{reference:'REV-SALE'})],'2026-01-01','2026-12-31');
  assert.equal(r.netResult,0);
  assert.equal(r.ignoredClosing,1);
});
test('detect lifetime trial-balance profit differs from selected financial year without mutation',()=>{
  const state={id:'original'};
  const ledger={journals:()=>[row('2025-01-01','Revenue',0,100),row('2026-02-01','Revenue',0,200)],trialBalance:()=>({accounts:[{type:'Revenue',credit:300,debit:0}]})};
  const s=JSON.stringify(state),result=audit.compareWithClosingLines(state,'2026-01-01','2026-12-31',ledger);
  assert.equal(result.period.netResult,200);
  assert.equal(result.discrepancy,100);
  assert.equal(result.requiresReview,true);
  assert.equal(JSON.stringify(state),s);
});
test('reject reversed date bounds',()=>assert.throws(()=>audit.analyzeRows([],'2027-01-01','2026-12-31')));
