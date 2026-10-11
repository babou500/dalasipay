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
