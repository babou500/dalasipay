(function(){
  'use strict';
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function tbAccount(tb,name){return (tb.accounts||[]).find(x=>x.name===name)||{balance:0};}
  function invoiceOutstanding(state){
    return round((state.customerInvoices||[]).reduce((sum,inv)=>{
      const st=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');if(st==='Draft')return sum;
      const bal=window.DalasiReturns?.invoiceBalance?.(state,inv)??Math.max(0,Number(inv.amount)||0);return sum+(Number(bal)||0);
    },0));
  }
  function supplierOutstanding(state){
    return round((state.businessBills||[]).filter(x=>(x.status||'Draft')!=='Draft').reduce((sum,b)=>sum+(Number(window.DalasiReturns?.billBalance?.(state,b)??b.amount)||0),0));
  }
  function vatSubledger(state){
    let input=0,output=0;
    (state.customerInvoices||[]).forEach(inv=>{const st=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');if(st==='Draft')return;output+=Number(window.DalasiTax?.meta?.(state,inv,'sale')?.vatAmount)||0;});
    (state.revenueEntries||[]).forEach(x=>{output+=Number(window.DalasiTax?.meta?.(state,x,'sale')?.vatAmount)||0;});
    (state.businessExpenses||[]).filter(x=>['Approved','Paid','Reversed'].includes(x.status)).forEach(x=>{const t=window.DalasiTax?.meta?.(state,x,'purchase');if(t?.vatRecoverable)input+=Number(t.vatAmount)||0;if(x.reversedAt&&t?.vatRecoverable)input-=Number(t.vatAmount)||0;});
    (state.businessBills||[]).filter(x=>(x.status||'Draft')!=='Draft').forEach(x=>{const t=window.DalasiTax?.meta?.(state,x,'purchase');if(t?.vatRecoverable)input+=Number(t.vatAmount)||0;});
    (state.customerCreditNotes||[]).filter(x=>x.status!=='Void').forEach(x=>{output-=Number(x.vatAmount)||0;});
    (state.supplierCreditNotes||[]).filter(x=>x.status!=='Void'&&x.vatRecoverable).forEach(x=>{input-=Number(x.vatAmount)||0;});
    (state.customerDebitNotes||[]).filter(x=>x.status!=='Void').forEach(x=>{output+=Number(x.vatAmount)||0;});
    (state.supplierDebitNotes||[]).filter(x=>x.status!=='Void'&&x.vatRecoverable).forEach(x=>{input+=Number(x.vatAmount)||0;});
    const paid=(state.vatPayments||[]).reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {input:round(input),output:round(output-paid)};
  }
  function checks(state){
    const tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{accounts:[],balanced:true,difference:0};
    const cashAccounts=(state.cashAccounts||[]).filter(x=>(x.status||'Active')==='Active');
    const moduleCash=round(cashAccounts.length?(window.DalasiCashBank?.totals?.(state)?.total||0):((Number(state.balanceSheetSetup?.cashBank)||0)+(Number(state.balanceSheetSetup?.pettyCash)||0)));
    const cashNames=new Set(cashAccounts.map(x=>x.name));let glCash=0;
    (tb.accounts||[]).forEach(a=>{if(a.name==='Cash & Bank'||cashNames.has(a.name))glCash+=Number(a.balance)||0;});glCash=round(glCash);
    const ar=invoiceOutstanding(state),glAr=round(Number(tbAccount(tb,'Accounts Receivable').balance)||0);
    const ap=supplierOutstanding(state),glAp=round(-(Number(tbAccount(tb,'Accounts Payable').balance)||0));
    const fa=window.DalasiFixedAssets?.summary?.(state)||{count:0,netBookValue:0};
    const moduleFa=round(fa.count?fa.netBookValue:(Number(state.balanceSheetSetup?.fixedAssetsNet)||0));
    const glFa=round((Number(tbAccount(tb,'Property & Equipment, Cost').balance)||0)+(Number(tbAccount(tb,'Property & Equipment, Net').balance)||0)+(Number(tbAccount(tb,'Accumulated Depreciation').balance)||0));
    const loans=window.DalasiLoans?.summary?.(state)||{count:0,outstanding:0};
    const moduleLoans=round(loans.count?loans.outstanding:(Number(state.balanceSheetSetup?.loansBorrowings)||0));
    const glLoans=round(-(Number(tbAccount(tb,'Loans & Borrowings').balance)||0));
    const vat=vatSubledger(state),glVatIn=round(Number(tbAccount(tb,'VAT Input Recoverable').balance)||0),glVatOut=round(-(Number(tbAccount(tb,'VAT Output Payable').balance)||0));
    const make=(key,label,module,ledger,detail)=>({key,label,module:round(module),ledger:round(ledger),difference:round(module-ledger),matched:Math.abs(round(module-ledger))<0.01,detail});
    return [
      make('cash','Cash & Bank',moduleCash,glCash,cashAccounts.length+' active operational account'+(cashAccounts.length===1?'':'s')),
      make('ar','Accounts Receivable',ar,glAr,'Customer invoice subledger vs control account'),
      make('ap','Accounts Payable',ap,glAp,'Supplier bill subledger vs control account'),
      make('fixed-assets','Fixed Assets',moduleFa,glFa,'Fixed asset register net book value vs ledger'),
      make('vat-input','VAT Input Recoverable',vat.input,glVatIn,'Recoverable input VAT records vs ledger'),
      make('vat-output','VAT Output Payable',vat.output,glVatOut,'Output VAT less recorded settlements vs ledger'),
      make('loans','Loans & Borrowings',moduleLoans,glLoans,'Loan register outstanding principal vs ledger')
    ];
  }
  function render(state,h){
    const {money2,icon,pill}=h,c=checks(state),matched=c.filter(x=>x.matched).length,review=c.length-matched,tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{balanced:true,difference:0};
    const rows=c.map(x=>'<tr><td><div class="payment-payee"><b>'+esc(x.label)+'</b><small>'+esc(x.detail)+'</small></div></td><td>'+money2(x.module)+'</td><td>'+money2(x.ledger)+'</td><td class="'+(x.matched?'':'warn-text')+'"><b>'+money2(Math.abs(x.difference))+'</b></td><td>'+pill(x.matched?'MATCH':'REVIEW',x.matched?'ready':'approved')+'</td></tr>').join('');
    return '<div class="accounting-summary"><div class="surface"><span>Control checks</span><b>'+c.length+'</b><small>core subledgers tested</small></div><div class="surface"><span>Matched</span><b>'+matched+'</b><small>module agrees with ledger</small></div><div class="surface '+(review?'cash-alert':'')+'"><span>Needs review</span><b>'+review+'</b><small>differences requiring investigation</small></div><div class="surface"><span>Trial Balance</span><b>'+(tb.balanced?'Balanced':'Review')+'</b><small>'+(tb.balanced?'debits equal credits':money2(Math.abs(tb.difference))+' difference')+'</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Control accounts must reconcile to their source modules</b><p>DalasiPay does not automatically plug reconciliation differences. A REVIEW result means the underlying source, posting, opening balance or mapping should be investigated.</p></div></div>'+
      '<section class="surface employee-card"><div class="table-tools"><div><h3>Control account reconciliation</h3><p>Operational subledgers compared directly with their General Ledger control accounts</p></div><button class="secondary" data-action="control-recon-export">'+icon('download',14)+' Export</button></div><div class="table-scroll"><table><thead><tr><th>CONTROL</th><th>MODULE / SUBLEDGER</th><th>GENERAL LEDGER</th><th>DIFFERENCE</th><th>STATUS</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }
  function exportCsv(state,ctx){
    const rows=[['Control','Module / Subledger','General Ledger','Difference','Status'],...checks(state).map(x=>[x.label,x.module,x.ledger,x.difference,x.matched?'MATCH':'REVIEW'])];
    const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');
    ctx.downloadText('dalasipay-control-account-reconciliation-'+new Date().toISOString().slice(0,10)+'.csv',csv);ctx.toast('Control account reconciliation downloaded');
  }
  window.DalasiControlReconciliation={checks,render,exportCsv};
})();