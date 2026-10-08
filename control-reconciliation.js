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
  function ledgerAccountsFor(key,state){
    if(key==='cash')return new Set(['Cash & Bank',...(state.cashAccounts||[]).map(x=>x.name)]);
    if(key==='ar')return new Set(['Accounts Receivable']);
    if(key==='ap')return new Set(['Accounts Payable']);
    if(key==='fixed-assets')return new Set(['Property & Equipment, Cost','Property & Equipment, Net','Accumulated Depreciation']);
    if(key==='vat-input')return new Set(['VAT Input Recoverable']);
    if(key==='vat-output')return new Set(['VAT Output Payable']);
    if(key==='loans')return new Set(['Loans & Borrowings']);
    return new Set();
  }
  function ledgerDetail(key,state){
    const names=ledgerAccountsFor(key,state);
    return (window.DalasiGeneralLedger?.ledgerRows?.(state)||[]).filter(x=>names.has(x.account)).slice().reverse();
  }
  function moduleDetail(key,state){
    const out=[];
    if(key==='cash'){
      (state.cashAccounts||[]).forEach(a=>out.push({label:a.name,ref:a.ledgerCode||a.id,date:a.openingDate||a.createdAt,amount:window.DalasiCashBank?.balance?.(state,a.id)||0,sourceType:'cash-account',sourceId:a.id,detail:a.type||'Cash & Bank'}));
    }else if(key==='ar'){
      (state.customerInvoices||[]).forEach(inv=>{const st=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');if(st==='Draft')return;const amount=window.DalasiReturns?.invoiceBalance?.(state,inv)??Number(inv.amount)||0;if(Math.abs(amount)>.004)out.push({label:inv.customerName||'Customer',ref:inv.invoiceNo||inv.id,date:inv.issueDate||inv.createdAt,amount,sourceType:'customer-invoice',sourceId:inv.id,detail:st});});
    }else if(key==='ap'){
      (state.businessBills||[]).forEach(b=>{if((b.status||'Draft')==='Draft')return;const amount=window.DalasiReturns?.billBalance?.(state,b)??Number(b.amount)||0;if(Math.abs(amount)>.004)out.push({label:b.supplier||'Supplier',ref:b.invoiceNo||b.id,date:b.invoiceDate||b.createdAt,amount,sourceType:'supplier-bill',sourceId:b.id,detail:b.status||'Posted'});});
    }else if(key==='fixed-assets'){
      (state.fixedAssets||[]).forEach(a=>{const dep=window.DalasiFixedAssets?.accumulated?.(state,a)||0;const amount=round((Number(a.cost)||0)-dep);out.push({label:a.name||'Fixed asset',ref:a.assetNo||a.id,date:a.acquisitionDate||a.createdAt,amount,sourceType:'fixed-asset',sourceId:a.id,detail:(a.status||'Active')+' · cost '+round(Number(a.cost)||0)+' · accum. dep. '+round(dep)});});
    }else if(key==='vat-input'){
      (state.businessExpenses||[]).filter(x=>['Approved','Paid','Reversed'].includes(x.status)).forEach(x=>{const t=window.DalasiTax?.meta?.(state,x,'purchase');if(t?.vatRecoverable&&Number(t.vatAmount)){const sign=x.reversedAt?-1:1;out.push({label:x.merchant||'Expense',ref:x.expenseNo||x.id,date:x.expenseDate||x.createdAt,amount:round(sign*Number(t.vatAmount)),sourceType:'expense',sourceId:x.id,detail:x.status});}});
      (state.businessBills||[]).filter(x=>(x.status||'Draft')!=='Draft').forEach(x=>{const t=window.DalasiTax?.meta?.(state,x,'purchase');if(t?.vatRecoverable&&Number(t.vatAmount))out.push({label:x.supplier||'Supplier bill',ref:x.invoiceNo||x.id,date:x.invoiceDate||x.createdAt,amount:round(Number(t.vatAmount)),sourceType:'supplier-bill',sourceId:x.id,detail:'Input VAT'});});
    }else if(key==='vat-output'){
      (state.customerInvoices||[]).forEach(inv=>{const st=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');if(st==='Draft')return;const t=window.DalasiTax?.meta?.(state,inv,'sale');if(Number(t?.vatAmount))out.push({label:inv.customerName||'Customer invoice',ref:inv.invoiceNo||inv.id,date:inv.issueDate||inv.createdAt,amount:round(Number(t.vatAmount)),sourceType:'customer-invoice',sourceId:inv.id,detail:'Output VAT'});});
      (state.vatPayments||[]).forEach(p=>out.push({label:'GRA VAT payment',ref:p.reference||p.id,date:p.date||p.createdAt,amount:round(-Number(p.amount||0)),sourceType:'vat-payment',sourceId:p.id,detail:p.period||'Settlement'}));
    }else if(key==='loans'){
      (state.businessLoans||[]).forEach(l=>{const principal=Number(l.principal)||0,paid=(state.loanRepayments||[]).filter(x=>x.loanId===l.id).reduce((a,x)=>a+(Number(x.principal)||0),0),amount=round(principal-paid);if(Math.abs(amount)>.004)out.push({label:l.lender||'Loan',ref:l.reference||l.id,date:l.startDate||l.createdAt,amount,sourceType:'loan',sourceId:l.id,detail:l.status||'Active'});});
    }
    return out.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  function drillModal(state,h){
    const key=state.controlReconDrill;if(!key)return '';
    const check=checks(state).find(x=>x.key===key);if(!check)return '';
    const {money2,icon,pill}=h,mods=moduleDetail(key,state),gl=ledgerDetail(key,state);
    const modRows=mods.length?mods.map(x=>'<tr><td><div class="payment-payee"><b>'+esc(x.ref||'—')+'</b><small>'+esc(x.label||'')+' · '+esc(x.detail||'')+'</small></div></td><td>'+esc(String(x.date||'').slice(0,10))+'</td><td>'+money2(x.amount)+'</td><td>'+(x.sourceType&&x.sourceId?'<button class="secondary tiny" data-action="source-open:'+esc(x.sourceType)+':'+esc(x.sourceId)+'">View</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="4"><div class="empty-inline">No module records found.</div></td></tr>';
    const glRows=gl.length?gl.slice(0,150).map(x=>'<tr><td><div class="payment-payee"><b>'+esc(x.reference||x.journalId)+'</b><small>'+esc(x.source||'Ledger')+' · '+esc(x.account)+'</small></div></td><td>'+esc(x.date||'')+'</td><td>'+money2(x.debit)+'</td><td>'+money2(x.credit)+'</td><td>'+(x.sourceId?'<button class="secondary tiny" data-action="source-open:'+esc(x.sourceType)+':'+esc(x.sourceId)+'">View</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="5"><div class="empty-inline">No matching ledger lines found.</div></td></tr>';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-control-recon-drill"></div><div class="modal-box wide">'+
      '<div class="modal-head"><div><div class="eyebrow">CONTROL RECONCILIATION</div><h2>'+esc(check.label)+'</h2><p>Trace the subledger records and General Ledger postings behind this control balance.</p></div><button type="button" class="close" data-action="close-control-recon-drill">×</button></div>'+
      '<div class="accounting-summary"><div class="surface"><span>Module</span><b>'+money2(check.module)+'</b></div><div class="surface"><span>General Ledger</span><b>'+money2(check.ledger)+'</b></div><div class="surface '+(check.matched?'':'cash-alert')+'"><span>Difference</span><b>'+money2(Math.abs(check.difference))+'</b></div><div class="surface"><span>Status</span><b>'+pill(check.matched?'MATCH':'REVIEW',check.matched?'ready':'approved')+'</b></div></div>'+
      '<div class="payment-notice"><span>'+icon(check.matched?'check':'alert',17)+'</span><div><b>'+(check.matched?'Control agrees':'Difference requires investigation')+'</b><p>'+(check.matched?'The operational records and control-account ledger balance agree.':'Review missing, duplicated, draft, reversed, incorrectly dated or manually posted items. DalasiPay will not plug this difference automatically.')+'</p></div></div>'+
      '<div class="surface employee-card" style="margin-bottom:14px"><div class="table-tools"><div><h3>Module / subledger records</h3><p>'+mods.length+' source record'+(mods.length===1?'':'s')+'</p></div></div><div class="table-scroll"><table><thead><tr><th>RECORD</th><th>DATE</th><th>BALANCE / VALUE</th><th>SOURCE</th></tr></thead><tbody>'+modRows+'</tbody></table></div></div>'+
      '<div class="surface employee-card"><div class="table-tools"><div><h3>General Ledger lines</h3><p>'+gl.length+' matching ledger line'+(gl.length===1?'':'s')+'</p></div></div><div class="table-scroll"><table><thead><tr><th>REFERENCE</th><th>DATE</th><th>DEBIT</th><th>CREDIT</th><th>SOURCE</th></tr></thead><tbody>'+glRows+'</tbody></table></div></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-control-recon-drill">Close</button></div></div></div>';
  }
  function render(state,h){
    const {money2,icon,pill}=h,c=checks(state),matched=c.filter(x=>x.matched).length,review=c.length-matched,tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{balanced:true,difference:0};
    const rows=c.map(x=>'<tr><td><div class="payment-payee"><b>'+esc(x.label)+'</b><small>'+esc(x.detail)+'</small></div></td><td>'+money2(x.module)+'</td><td>'+money2(x.ledger)+'</td><td class="'+(x.matched?'':'warn-text')+'"><b>'+money2(Math.abs(x.difference))+'</b></td><td>'+pill(x.matched?'MATCH':'REVIEW',x.matched?'ready':'approved')+'</td><td><button class="'+(x.matched?'secondary':'primary')+' tiny" data-action="control-recon-drill:'+esc(x.key)+'">'+(x.matched?'View detail':'Investigate')+'</button></td></tr>').join('');
    return '<div class="accounting-summary"><div class="surface"><span>Control checks</span><b>'+c.length+'</b><small>core subledgers tested</small></div><div class="surface"><span>Matched</span><b>'+matched+'</b><small>module agrees with ledger</small></div><div class="surface '+(review?'cash-alert':'')+'"><span>Needs review</span><b>'+review+'</b><small>differences requiring investigation</small></div><div class="surface"><span>Trial Balance</span><b>'+(tb.balanced?'Balanced':'Review')+'</b><small>'+(tb.balanced?'debits equal credits':money2(Math.abs(tb.difference))+' difference')+'</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Control accounts must reconcile to their source modules</b><p>DalasiPay does not automatically plug reconciliation differences. A REVIEW result means the underlying source, posting, opening balance or mapping should be investigated.</p></div></div>'+
      '<section class="surface employee-card"><div class="table-tools"><div><h3>Control account reconciliation</h3><p>Operational subledgers compared directly with their General Ledger control accounts</p></div><button class="secondary" data-action="control-recon-export">'+icon('download',14)+' Export</button></div><div class="table-scroll"><table><thead><tr><th>CONTROL</th><th>MODULE / SUBLEDGER</th><th>GENERAL LEDGER</th><th>DIFFERENCE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
  }
  function exportCsv(state,ctx){
    const rows=[['Control','Module / Subledger','General Ledger','Difference','Status'],...checks(state).map(x=>[x.label,x.module,x.ledger,x.difference,x.matched?'MATCH':'REVIEW'])];
    const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');
    ctx.downloadText('dalasipay-control-account-reconciliation-'+new Date().toISOString().slice(0,10)+'.csv',csv);ctx.toast('Control account reconciliation downloaded');
  }
  window.DalasiControlReconciliation={checks,moduleDetail,ledgerDetail,render,drillModal,exportCsv};
})();