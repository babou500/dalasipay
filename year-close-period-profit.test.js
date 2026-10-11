const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(rows,manualJournals=[]){
 const window={DalasiGeneralLedger:{journals:()=>rows}};
 vm.runInNewContext(fs.readFileSync('year-end-close.js','utf8'),{window,console});
 return {api:window.DalasiYearClose,state:{manualJournals}};
}
const r=(date,accountType,debit,credit,account,code,journalId)=>({date,accountType,debit,credit,account,accountCode:code,journalId});
const earnings=lines=>lines.find(x=>x.account==='Retained Earnings');
test('2026 closing excludes 2025 profits and offsets 2026 expenses',()=>{
 const {api,state}=setup([r('2025-06-01','Revenue',0,150,'Sales','4000','S1'),r('2026-04-01','Revenue',0,200,'Sales','4000','S2'),r('2026-07-01','Expense',50,0,'Rent','6000','E1')]);
 const lines=api.closingLines(state,'2026');
 assert.equal(earnings(lines).credit,150);
 assert.equal(lines.find(x=>x.account==='Sales').debit,200);
 assert.equal(lines.find(x=>x.account==='Rent').credit,50);
 assert.equal(api.closingLines(state,'2025').find(x=>x.account==='Sales').debit,150);
});
test('reversed sales are netted and close journals and reversals excluded',()=>{
 const manual=[{id:'C1',journalNo:'JRN-2026-10',yearEndClosing:true},{id:'R1',journalNo:'JRN-2026-11',yearEndClosing:true,yearEndClosingReversal:true}];
 const {api,state}=setup([r('2026-01-01','Revenue',0,200,'Sales','4000','S1'),r('2026-02-01','Revenue',100,0,'Sales','4000','S2'),r('2026-12-31','Revenue',100,0,'Sales','4000','JRN-2026-10'),r('2026-12-31','Revenue',0,100,'Sales','4000','JRN-2026-11')],manual);
 assert.equal(earnings(api.closingLines(state,'2026')).credit,100);
});
test('2026 loss posts retained earnings debit and still balances',()=>{
 const {api,state}=setup([r('2026-03-01','Expense',180,0,'Wages','6100','P1'),r('2026-04-01','Revenue',0,100,'Sales','4000','S1')]);
 const lines=api.closingLines(state,'2026');
 assert.equal(earnings(lines).debit,80);
 assert.equal(lines.reduce((a,x)=>a+x.debit,0),lines.reduce((a,x)=>a+x.credit,0));
});
test('invalid year produces no lines',()=>{
 const {api,state}=setup([r('2026-03-01','Revenue',0,200,'Sales','4000','S1')]);
 assert.equal(api.closingLines(state,'invalid').length,0);
});
