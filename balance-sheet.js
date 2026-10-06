(function(){
  'use strict';

  function money(n){return Math.round((Number(n)||0)*100)/100;}
  function invoiceOutstanding(state){
    return (state.customerInvoices||[]).reduce((sum,inv)=>{
      const s=window.DalasiSalesInvoices?.status?window.DalasiSalesInvoices.status(state,inv):(inv.status||'Draft');
      if(s==='Draft')return sum;
      const bal=window.DalasiSalesInvoices?.balance?window.DalasiSalesInvoices.balance(state,inv):Math.max(0,Number(inv.amount)||0);
      return sum+bal;
    },0);
  }
  function inventoryValue(state){
    return window.DalasiInventory?.summary?.(state)?.value??(state.salesCatalog||[]).filter(x=>x.type==='Product').reduce((a,x)=>a+(Number(x.stockOnHand)||0)*(Number(x.costPrice)||0),0);
  }
  function supplierPayables(state){
    return (state.businessBills||[]).filter(x=>x.status!=='Paid').reduce((a,x)=>a+(window.DalasiReturns?.billBalance?.(state,x)??(Number(x.amount)||0)),0);
  }
  function accruedExpenses(state){
    return (state.businessExpenses||[]).filter(x=>x.status==='Approved').reduce((a,x)=>a+(Number(x.amount)||0),0);
  }
  function payrollLiabilities(state){
    const runs=(state.runs||[]).filter(r=>['Approved','Paid','Closed'].includes(r.status)&&Array.isArray(r.rows));
    let wages=0,statutory=0,approvedRuns=0,statutoryRuns=0;
    runs.forEach(run=>{
      if(run.status==='Approved')approvedRuns++;
      if(!run.statutoryPaidAt)statutoryRuns++;
      (run.rows||[]).forEach(r=>{
        if(run.status==='Approved')wages+=Number(r.net)||0;
        if(!run.statutoryPaidAt)statutory+=(Number(r.paye)||0)+(Number(r.employeeContribution)||0)+(Number(r.employerContribution)||0)+(Number(r.iicf)||0)+(Number(r.employerBenefits)||0)+(Number(r.otherDeductions)||0);
      });
    });
    return {wages:money(wages),statutory:money(statutory),runs:approvedRuns,statutoryRuns};
  }
  function vatPosition(state){
    let input=0,output=0;
    (state.customerInvoices||[]).forEach(inv=>{
      const st=window.DalasiSalesInvoices?.status?window.DalasiSalesInvoices.status(state,inv):(inv.status||'Draft');if(st==='Draft')return;
      output+=Number(window.DalasiTax?.meta?.(state,inv,'sale')?.vatAmount)||0;
    });
    (state.businessExpenses||[]).filter(x=>['Approved','Paid'].includes(x.status)).forEach(x=>{const t=window.DalasiTax?.meta?.(state,x,'purchase');if(t?.vatRecoverable)input+=Number(t.vatAmount)||0;});
    (state.businessBills||[]).filter(x=>(x.status||'Draft')!=='Draft').forEach(x=>{const t=window.DalasiTax?.meta?.(state,x,'purchase');if(t?.vatRecoverable)input+=Number(t.vatAmount)||0;});
    (state.customerCreditNotes||[]).filter(x=>x.status!=='Void').forEach(x=>{output-=Number(x.vatAmount)||0;});
    (state.supplierCreditNotes||[]).filter(x=>x.status!=='Void'&&x.vatRecoverable).forEach(x=>{input-=Number(x.vatAmount)||0;});
    const paid=(state.vatPayments||[]).reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {input:money(input),output:money(Math.max(0,output-paid)),outputGross:money(output),paid:money(paid)};
  }
  function currentYearProfit(state){
    const period=String(state.currentPeriod||'').match(/^\d{4}-\d{2}$/)?.[0];
    const y=window.DalasiProfitLoss?.ytd?.(state,period);
    return money(y?.netProfit||0);
  }
  function manualBalanceAdjustments(state){
    let assets=0,liabilities=0,equity=0;
    (state.manualJournals||[]).filter(j=>j.status==='Posted').forEach(j=>(j.lines||[]).forEach(x=>{
      const debit=Number(x.debit)||0,credit=Number(x.credit)||0;
      if(x.accountType==='Asset')assets+=debit-credit;
      else if(x.accountType==='Liability')liabilities+=credit-debit;
      else if(x.accountType==='Equity')equity+=credit-debit;
    }));
    return {assets:money(assets),liabilities:money(liabilities),equity:money(equity)};
  }
  function statement(state){
    const setup=Object.assign({cashBank:0,pettyCash:0,otherCurrentAssets:0,fixedAssetsNet:0,loansBorrowings:0,otherLiabilities:0,ownerCapital:0,openingRetainedEarnings:0,updatedAt:'',note:''},state.balanceSheetSetup||{});
    const ar=money(invoiceOutstanding(state)),inventory=money(inventoryValue(state)),ap=money(supplierPayables(state)),accrued=money(accruedExpenses(state)),payroll=payrollLiabilities(state),vat=vatPosition(state),profit=currentYearProfit(state),supplierRefundReceivable=money(window.DalasiReturns?.supplierRefundReceivable?.(state)||0),customerRefundPayable=money(window.DalasiReturns?.customerRefundLiability?.(state)||0);
    const cashTotals=window.DalasiCashBank?.totals?.(state)||{accounts:0,total:0,bank:0,mobile:0,cash:0},usingCashbook=cashTotals.accounts>0,fixedAssets=window.DalasiFixedAssets?.summary?.(state)||{count:0,cost:0,accumulated:0,netBookValue:0},usingAssetRegister=fixedAssets.count>0,loanSummary=window.DalasiLoans?.summary?.(state)||{count:0,outstanding:0,interestPayable:0},usingLoanRegister=loanSummary.count>0;
    const cashBank=money(usingCashbook?(cashTotals.bank+cashTotals.mobile):Number(setup.cashBank)),pettyCash=money(usingCashbook?cashTotals.cash:Number(setup.pettyCash)),fixedAssetsNet=money(usingAssetRegister?fixedAssets.netBookValue:Number(setup.fixedAssetsNet)),manual=manualBalanceAdjustments(state);
    const currentAssets=money(cashBank+pettyCash+ar+inventory+vat.input+supplierRefundReceivable+Number(setup.otherCurrentAssets));
    const totalAssets=money(currentAssets+fixedAssetsNet+manual.assets);
    const currentLiabilities=money(ap+accrued+payroll.wages+payroll.statutory+vat.output+customerRefundPayable+Number(setup.otherLiabilities)+loanSummary.interestPayable);
    const loanPrincipal=money(usingLoanRegister?loanSummary.outstanding:Number(setup.loansBorrowings));
    const totalLiabilities=money(currentLiabilities+loanPrincipal+manual.liabilities);
    const equity=money(Number(setup.ownerCapital)+Number(setup.openingRetainedEarnings)+profit+manual.equity);
    const liabilitiesEquity=money(totalLiabilities+equity);
    return {setup,ar,inventory,ap,accrued,payroll,vat,profit,supplierRefundReceivable,customerRefundPayable,manual,cashBank,pettyCash,cashbookAccounts:cashTotals.accounts,usingCashbook,fixedAssets,usingAssetRegister,fixedAssetsNet,loanSummary,usingLoanRegister,loanPrincipal,currentAssets,totalAssets,currentLiabilities,totalLiabilities,equity,liabilitiesEquity,difference:money(totalAssets-liabilitiesEquity),balanced:Math.abs(totalAssets-liabilitiesEquity)<0.01};
  }
  function row(label,value,money2,total=false,sub=false){
    return '<tr class="'+(total?'bs-total ':'')+(sub?'bs-sub':'')+'"><td>'+label+'</td><td>'+money2(value)+'</td></tr>';
  }
  function panel(state,h){
    const money2=h.money2,icon=h.icon,s=statement(state),setup=s.setup;
    return '<section class="surface balance-sheet-card">'+
      '<div class="table-tools"><div><h3>Balance Sheet</h3><p>Current financial position using automatic operational balances plus the cash, asset, loan and equity balances you provide.</p></div><div class="inline-buttons"><button class="secondary" data-action="business-report-export:balance-sheet">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-balance-sheet-setup">'+icon('plus',14)+' Set balances</button></div></div>'+
      '<div class="bs-kpis">'+
        '<div><span>Total assets</span><b>'+money2(s.totalAssets)+'</b><small>including receivables and inventory</small></div>'+
        '<div><span>Total liabilities</span><b>'+money2(s.totalLiabilities)+'</b><small>payables, payroll and loans</small></div>'+
        '<div><span>Total equity</span><b>'+money2(s.equity)+'</b><small>capital + retained/current earnings</small></div>'+
        '<div class="'+(!s.balanced?'bs-warning':'')+'"><span>Balance check</span><b>'+money2(Math.abs(s.difference))+'</b><small>'+(s.balanced?'balanced':'difference to resolve')+'</small></div>'+
      '</div>'+
      '<div class="bs-columns">'+
        '<div><h4>ASSETS</h4><table><tbody>'+
          row(s.usingCashbook?'Bank & mobile-money accounts':'Cash at bank',s.cashBank,money2)+
          row(s.usingCashbook?'Cash accounts':'Petty cash',s.pettyCash,money2)+
          row('Accounts receivable',s.ar,money2)+
          row('Inventory at cost',s.inventory,money2)+
          (s.vat.input?row('VAT input recoverable',s.vat.input,money2):'')+
          row('Other current assets',setup.otherCurrentAssets,money2)+
          row('Total current assets',s.currentAssets,money2,true)+
          row(s.usingAssetRegister?'Property / equipment, net (asset register)':'Property / equipment, net',s.fixedAssetsNet,money2)+
          (s.manual.assets?row('Manual journal asset adjustments',s.manual.assets,money2):'')+
          row('TOTAL ASSETS',s.totalAssets,money2,true)+
        '</tbody></table></div>'+
        '<div><h4>LIABILITIES & EQUITY</h4><table><tbody>'+
          row('Supplier payables',s.ap,money2)+
          row('Approved expense accruals',s.accrued,money2)+
          row('Payroll payable',s.payroll.wages,money2)+
          row('Payroll/statutory payable',s.payroll.statutory,money2)+
          (s.vat.output?row('VAT output payable',s.vat.output,money2):'')+
          row('Other current liabilities',setup.otherLiabilities,money2)+
          (s.loanSummary.interestPayable?row('Accrued interest payable',s.loanSummary.interestPayable,money2):'')+
          row(s.usingLoanRegister?'Loans / borrowings (loan register)':'Loans / borrowings',s.loanPrincipal,money2)+
          (s.manual.liabilities?row('Manual journal liability adjustments',s.manual.liabilities,money2):'')+
          row('Total liabilities',s.totalLiabilities,money2,true)+
          row('Owner / share capital',setup.ownerCapital,money2)+
          row('Opening retained earnings',setup.openingRetainedEarnings,money2)+
          row('Current-year profit',s.profit,money2)+
          (s.manual.equity?row('Manual journal equity adjustments',s.manual.equity,money2):'')+
          row('TOTAL EQUITY',s.equity,money2,true)+
          row('LIABILITIES + EQUITY',s.liabilitiesEquity,money2,true)+
        '</tbody></table></div>'+
      '</div>'+
      (s.usingCashbook?'<div class="bs-note"><b>Cash & Bank linked.</b> '+s.cashbookAccounts+' active account'+(s.cashbookAccounts===1?'':'s')+' now feed the Balance Sheet automatically. Manual cash fields are ignored while accounts exist.</div>':'<div class="bs-note">No Cash & Bank accounts exist yet, so the manual cash and petty-cash setup balances are still being used.</div>')+
      (s.usingAssetRegister?'<div class="bs-note"><b>Fixed Assets linked.</b> '+s.fixedAssets.active+' active asset'+(s.fixedAssets.active===1?'':'s')+' with cost '+money2(s.fixedAssets.cost)+' and accumulated depreciation '+money2(s.fixedAssets.accumulated)+' now feed property and equipment automatically.</div>':'')+
      (!s.balanced?'<div class="bs-note bs-warning-note"><b>Balance Sheet is not balanced yet.</b> Enter or correct fixed assets, loans, capital and opening retained earnings from the company records. DalasiPay will not invent a balancing figure.</div>':'<div class="bs-note"><b>Balanced.</b> Assets equal liabilities plus equity based on the balances currently recorded.</div>')+
      (s.payroll.runs?'<div class="bs-note">Net payroll payable includes '+s.payroll.runs+' approved payroll run'+(s.payroll.runs===1?'':'s')+' not yet marked paid. Net wages clear when payroll is paid.</div>':'')+
      (s.payroll.statutoryRuns?'<div class="bs-note">PAYE, social contributions, IICF and other payroll deductions remain under payroll/statutory payable until a remittance-clearing workflow records them as settled.</div>':'')+
    '</section>';
  }
  function modal(state,h){
    const field=h.field,icon=h.icon,s=statement(state),x=s.setup,canEdit=h.can('workspace.manage')||h.can('payroll.manage'),dis=canEdit?'':'disabled',cashDis=s.usingCashbook?'disabled':dis,assetDis=s.usingAssetRegister?'disabled':dis,loanDis=s.usingLoanRegister?'disabled':dis;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-balance-sheet-setup"></div><form id="balance-sheet-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">FINANCIAL POSITION</div><h2>Balance Sheet setup</h2><p>Enter balances DalasiPay cannot derive automatically. Use figures from the bank statement and accounting records.</p></div><button type="button" class="close" data-action="close-balance-sheet-setup">×</button></div>'+
      '<div class="form-grid">'+
        field('Cash at bank fallback (GMD)','<input name="cashBank" type="number" step="0.01" value="'+Number(x.cashBank||0)+'" '+cashDis+'>')+
        field('Petty cash fallback (GMD)','<input name="pettyCash" type="number" step="0.01" value="'+Number(x.pettyCash||0)+'" '+cashDis+'>')+
        field('Other current assets (GMD)','<input name="otherCurrentAssets" type="number" step="0.01" value="'+Number(x.otherCurrentAssets||0)+'" '+dis+'>')+
        field('Property / equipment, net fallback (GMD)','<input name="fixedAssetsNet" type="number" step="0.01" value="'+Number(x.fixedAssetsNet||0)+'" '+assetDis+'>')+
        field('Loans / borrowings fallback (GMD)','<input name="loansBorrowings" type="number" step="0.01" value="'+Number(x.loansBorrowings||0)+'" '+loanDis+'>')+
        field('Other current liabilities (GMD)','<input name="otherLiabilities" type="number" step="0.01" value="'+Number(x.otherLiabilities||0)+'" '+dis+'>')+
        field('Owner / share capital (GMD)','<input name="ownerCapital" type="number" step="0.01" value="'+Number(x.ownerCapital||0)+'" '+dis+'>')+
        field('Opening retained earnings (GMD)','<input name="openingRetainedEarnings" type="number" step="0.01" value="'+Number(x.openingRetainedEarnings||0)+'" '+dis+'>')+
      '</div>'+
      field('Note / source','<input name="note" value="'+String(x.note||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))+'" placeholder="e.g. balances agreed to bank statement and opening accounts" '+dis+'>')+
      '<div class="modal-note">'+(s.usingCashbook?'Cash and bank balances are now taken from the Cash & Bank module. The fallback cash fields above are locked while live accounts exist. ':'')+(s.usingAssetRegister?'Property and equipment is now taken from the Fixed Assets register, so the fixed-asset fallback is locked. ':'')+'Accounts receivable, inventory, supplier bills, approved expense accruals and approved unpaid payroll are calculated automatically. Purchase orders are commitments and are not liabilities until billed/recognized.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-balance-sheet-setup">Cancel</button>'+(canEdit?'<button class="primary" type="submit">'+icon('save',14)+' Save balances</button>':'')+'</div>'+
    '</form></div>';
  }
  function saveSetup(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update Balance Sheet balances.');return;}
    const fd=new FormData(ev.target),old=state.balanceSheetSetup||{},num=(name,fallback=0)=>fd.has(name)?money(fd.get(name)):money(fallback);
    state.balanceSheetSetup={cashBank:num('cashBank',old.cashBank),pettyCash:num('pettyCash',old.pettyCash),otherCurrentAssets:num('otherCurrentAssets',old.otherCurrentAssets),fixedAssetsNet:num('fixedAssetsNet',old.fixedAssetsNet),loansBorrowings:num('loansBorrowings',old.loansBorrowings),otherLiabilities:num('otherLiabilities',old.otherLiabilities),ownerCapital:num('ownerCapital',old.ownerCapital),openingRetainedEarnings:num('openingRetainedEarnings',old.openingRetainedEarnings),note:String(fd.get('note')||old.note||'').trim(),updatedAt:new Date().toISOString(),updatedBy:state.session?.name||'User'};
    state.balanceSheetOpen=false;ctx.audit('balance_sheet.setup_updated',{...state.balanceSheetSetup});ctx.save();ctx.toast('Balance Sheet balances updated');ctx.render();
  }
  function exportCsv(state,ctx){
    const s=statement(state),x=s.setup;
    const rows=[
      ['Balance Sheet','Amount'],
      ['ASSETS',''],
      ['Cash / bank accounts',s.cashBank],['Petty cash / cash accounts',s.pettyCash],['Accounts receivable',s.ar],['Inventory at cost',s.inventory],['VAT input recoverable',s.vat.input],['Other current assets',x.otherCurrentAssets],['Total current assets',s.currentAssets],['Property / equipment, net',s.fixedAssetsNet],['Total assets',s.totalAssets],
      ['LIABILITIES',''],
      ['Supplier payables',s.ap],['Approved expense accruals',s.accrued],['Payroll payable',s.payroll.wages],['Payroll/statutory payable',s.payroll.statutory],['VAT output payable',s.vat.output],['Other current liabilities',x.otherLiabilities],['Accrued interest payable',s.loanSummary.interestPayable],['Loans / borrowings',s.loanPrincipal],['Total liabilities',s.totalLiabilities],
      ['EQUITY',''],
      ['Owner / share capital',x.ownerCapital],['Opening retained earnings',x.openingRetainedEarnings],['Current-year profit',s.profit],['Total equity',s.equity],['Liabilities + equity',s.liabilitiesEquity],['Balance difference',s.difference]
    ];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');
    ctx.downloadText('dalasipay-balance-sheet-'+new Date().toISOString().slice(0,10)+'.csv',csv);ctx.toast('Balance Sheet downloaded');
  }
  window.DalasiBalanceSheet={statement,panel,modal,saveSetup,exportCsv};
})();