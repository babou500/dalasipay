(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DalasiYearCloseScopeAudit=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  function analyzeRows(rows,start,end){
    if(!datePattern.test(String(start))||!datePattern.test(String(end))||start>end)throw new Error('Invalid financial period');
    const report={start,end,revenue:0,expenses:0,netResult:0,scanned:0,ignoredClosing:0,undated:0};
    for(const row of rows||[]){
      const date=String(row.date||'');
      if(!datePattern.test(date)){report.undated++;continue;}
      if(date<start||date>end)continue;
      // This audit is informational only; posted close journals must not be treated as trading activity.
      if(row.yearEndClosing||String(row.reference||'').startsWith('YE-CLOSE-')||String(row.reference||'').startsWith('REV-JRN-')&&row.yearEndClosingReversal){report.ignoredClosing++;continue;}
      const amount=round(row.credit)-round(row.debit);
      if(row.accountType==='Revenue')report.revenue=round(report.revenue+amount);
      if(row.accountType==='Expense')report.expenses=round(report.expenses-amount);
      report.scanned++;
    }
    report.netResult=round(report.revenue-report.expenses);
    return Object.freeze(report);
  }
  function compareWithClosingLines(state,start,end,ledger){
    if(!ledger||typeof ledger.journals!=='function'||typeof ledger.trialBalance!=='function')throw new Error('Ledger unavailable');
    const scoped=analyzeRows(ledger.journals(state),start,end);
    const lifetime=ledger.trialBalance(state);
    const recurring=(lifetime.accounts||[]).filter(x=>x.type==='Revenue'||x.type==='Expense');
    const residual=round(recurring.reduce((sum,x)=>sum+(x.type==='Revenue'?round(x.credit)-round(x.debit):round(x.debit)-round(x.credit)),0));
    return Object.freeze({period:scoped,lifetimeRevenueExpenseNet:residual,discrepancy:round(residual-scoped.netResult),requiresReview:Math.abs(residual-scoped.netResult)>.01,readOnly:true});
  }
  return Object.freeze({analyzeRows,compareWithClosingLines});
});
