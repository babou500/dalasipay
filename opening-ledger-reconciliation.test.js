const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
 const w={DalasiAccounting:{cashLedgerAccounts:()=>[]}};
 vm.runInNewContext(fs.readFileSync('general-ledger.js','utf8'),{window:w,console,Date,Math});
 vm.runInNewContext(fs.readFileSync('balance-sheet.js','utf8'),{window:w,console,Date,Math});
 return w;
}
const base=()=>({balanceSheetSetup:{},cashAccounts:[],fixedAssets:[],businessLoans:[],manualJournals:[],customerInvoices:[],businessExpenses:[],businessBills:[],revenueEntries:[],cashTransactions:[],customerPayments:[],supplierPayments:[],runs:[]});
test('posted opening journal replaces rather than duplicates cash opening source',()=>{
 const w=harness(),s=base();
 s.cashAccounts=[{id:'B1',name:'Access Bank',type:'Bank',openingBalance:1000,openingDate:'2026-01-01',openingMigrationJournalId:'M1'}];
 s.manualJournals=[{id:'M1',journalNo:'JRN-2026-00001',date:'2026-01-01',status:'Posted',openingMigration:true,lines:[{account:'Access Bank',accountCode:'1010',accountType:'Asset',debit:1000,credit:0},{account:'Owner / Share Capital',accountCode:'3000',accountType:'Equity',debit:0,credit:1000}]}];
 const rows=w.DalasiGeneralLedger.journals(s);
 assert.equal(rows.filter(x=>x.account==='Access Bank'&&x.debit===1000).length,1);
 assert.equal(rows.some(x=>x.account==='Opening Balance Equity'),false);
 const tb=w.DalasiGeneralLedger.trialBalance(s),bs=w.DalasiBalanceSheet.statement(s);
 assert.equal(tb.balanced,true);assert.equal(bs.balanced,true);
 assert.equal(bs.totalAssets,1000);assert.equal(bs.equity,1000);
});
test('without migration a source opening bank balance still creates a balanced contra',()=>{
 const w=harness(),s=base();s.cashAccounts=[{id:'B1',name:'Access Bank',type:'Bank',openingBalance:1000,openingDate:'2026-01-01'}];
 const tb=w.DalasiGeneralLedger.trialBalance(s),bs=w.DalasiBalanceSheet.statement(s);
 assert.equal(tb.balanced,true);assert.equal(bs.balanced,true);
 assert.equal(bs.totalAssets,1000);assert.equal(bs.equity,1000);
});


test('migrated fixed-asset cost, accumulated depreciation, and loan are each booked once',()=>{
 const w=harness(),s=base();
 s.fixedAssets=[{id:'FA1',name:'Equipment',source:'Opening balance',cost:1200,openingAccumDep:200,acquisitionDate:'2026-01-01',openingMigrationJournalId:'M2'}];
 s.businessLoans=[{id:'L1',source:'Opening balance',principal:400,startDate:'2026-01-01',openingMigrationJournalId:'M2'}];
 s.manualJournals=[{id:'M2',journalNo:'JRN-2026-00002',date:'2026-01-01',status:'Posted',openingMigration:true,lines:[
  {account:'Property & Equipment, Cost',accountCode:'1500',accountType:'Asset',debit:1200,credit:0},
  {account:'Accumulated Depreciation',accountCode:'1510',accountType:'Asset',debit:0,credit:200},
  {account:'Loans & Borrowings',accountCode:'2300',accountType:'Liability',debit:0,credit:400},
  {account:'Owner / Share Capital',accountCode:'3000',accountType:'Equity',debit:0,credit:600}
 ]}];
 const rows=w.DalasiGeneralLedger.journals(s);
 assert.equal(rows.filter(x=>x.account==='Property & Equipment, Cost'&&x.debit===1200).length,1);
 assert.equal(rows.filter(x=>x.account==='Accumulated Depreciation'&&x.credit===200).length,1);
 assert.equal(rows.filter(x=>x.account==='Loans & Borrowings'&&x.credit===400).length,1);
 assert.equal(rows.some(x=>String(x.journalId).startsWith('FA-')||String(x.journalId).startsWith('LOAN-')),false);
 const tb=w.DalasiGeneralLedger.trialBalance(s),bs=w.DalasiBalanceSheet.statement(s);
 assert.equal(tb.balanced,true);assert.equal(bs.balanced,true);
 assert.equal(bs.totalAssets,1000);assert.equal(bs.totalLiabilities,400);assert.equal(bs.equity,600);
});
