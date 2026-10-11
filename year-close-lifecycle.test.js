const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ledgerRows=[];
function setup(){
 const w={DalasiGeneralLedger:{journals:(state)=>[...state.sourceRows,...state.manualJournals.flatMap(j=>j.lines.map(l=>({...l,date:j.date,journalId:j.journalNo||j.id})))],trialBalance:()=>({balanced:true,difference:0})},DalasiBalanceSheet:{statement:()=>({balanced:true,difference:0})},DalasiMonthClose:{record:(state,p)=>state.monthEndCloses.find(x=>x.period===p)},DalasiProfitLoss:{statement:(state,p)=>({revenue:state.sourceRows.filter(x=>x.date.slice(0,7)===p&&x.accountType==='Revenue').reduce((n,x)=>n+(x.credit-x.debit),0),netProfit:state.sourceRows.filter(x=>x.date.slice(0,7)===p).reduce((n,x)=>n+(x.accountType==='Revenue'?x.credit-x.debit:x.credit-x.debit),0)})}};
 vm.runInNewContext(fs.readFileSync('year-end-close.js','utf8'),{window:w,console,FormData:class{get(){return 'Correct an invoice after audit';}}});
 const state={currentPeriod:'2026-12',sourceRows:[{date:'2025-05-01',accountType:'Revenue',account:'Sales',accountCode:'4000',debit:0,credit:150,journalId:'OLD'},{date:'2026-05-01',accountType:'Revenue',account:'Sales',accountCode:'4000',debit:0,credit:200,journalId:'SALE1'},{date:'2026-05-02',accountType:'Expense',account:'Rent',accountCode:'6000',debit:50,credit:0,journalId:'RENT1'}],manualJournals:[],monthEndCloses:Array.from({length:12},(_,i)=>({period:'2026-'+String(i+1).padStart(2,'0'),status:'Closed'})),yearEndCloses:[],session:{name:'Owner'}};
 const calls={messages:[],saves:0,audits:0};const ctx={can:()=>true,toast:x=>calls.messages.push(x),save:()=>calls.saves++,audit:()=>calls.audits++,render:()=>{}};
 return {api:w.DalasiYearClose,state,calls,ctx};
}
test('close, reverse, correct and reclose preserves balanced immutable journals',()=>{
 const t=setup();
 t.api.closeYear('2026',t.state,t.ctx);
 assert.equal(t.state.yearEndCloses[0].status,'Closed');
 assert.equal(t.state.manualJournals.length,1);
 const original=t.state.manualJournals[0];assert.equal(original.date,'2026-12-31');
 assert.equal(original.lines.find(x=>x.account==='Retained Earnings').credit,150);
 t.state.yearReopenYear='2026';t.api.reopenSubmit({preventDefault(){}},t.state,t.ctx);
 assert.equal(t.state.yearEndCloses[0].status,'Reopened');
 assert.equal(t.state.manualJournals.length,2);
 const reversal=t.state.manualJournals[0];assert.equal(reversal.reversalOf,original.id);
 t.state.sourceRows.push({date:'2026-08-01',accountType:'Expense',account:'Audit correction',accountCode:'6100',debit:20,credit:0,journalId:'ADJ1'});
 t.api.closeYear('2026',t.state,t.ctx);
 assert.equal(t.state.yearEndCloses[0].status,'Closed');
 assert.equal(t.state.manualJournals.length,3);
 const corrected=t.state.manualJournals[0];
 assert.equal(corrected.lines.find(x=>x.account==='Retained Earnings').credit,130);
 assert.equal(corrected.lines.reduce((n,x)=>n+x.debit,0),corrected.lines.reduce((n,x)=>n+x.credit,0));
 assert.equal(t.state.manualJournals[1].id,reversal.id);
 assert.equal(t.state.manualJournals[2].id,original.id);
 assert.equal(t.calls.saves,3);
 assert.equal(t.calls.audits,3);
});
