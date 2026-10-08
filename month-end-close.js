(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  function range(period){
    const m=String(period||'').match(/^(\d{4})-(\d{2})$/);if(!m)return null;
    const y=Number(m[1]),mo=Number(m[2]),last=new Date(y,mo,0).getDate();
    return {period,start:period+'-01',end:period+'-'+String(last).padStart(2,'0'),year:y,month:mo};
  }
  function periodOf(date){const s=String(date||'').slice(0,7);return /^\d{4}-\d{2}$/.test(s)?s:'';}
  function record(state,period){return (state.monthEndCloses||[]).find(x=>x.period===period&&x.status==='Closed')||null;}
  function isClosed(state,dateOrPeriod){const p=String(dateOrPeriod||'').length===7?String(dateOrPeriod):periodOf(dateOrPeriod);const y=String(p||'').slice(0,4);return !!record(state,p)||!!window.DalasiYearClose?.record?.(state,y);}
  function latestBankRecon(state,accountId){
    return (state.bankReconciliations||[]).filter(x=>x.accountId===accountId).slice().sort((a,b)=>String(b.statementDate||'').localeCompare(String(a.statementDate||'')))[0]||null;
  }
  function draftsInPeriod(state,r){
    const invoices=(state.customerInvoices||[]).filter(x=>(x.status||'Draft')==='Draft'&&periodOf(x.issueDate||x.createdAt)===r.period);
    const expenses=(state.businessExpenses||[]).filter(x=>(x.status||'Draft')==='Draft'&&periodOf(x.expenseDate||x.createdAt)===r.period);
    const bills=(state.businessBills||[]).filter(x=>(x.status||'Draft')==='Draft'&&periodOf(x.invoiceDate||x.createdAt)===r.period);
    const journals=(state.manualJournals||[]).filter(x=>(x.status||'Draft')==='Draft'&&periodOf(x.date||x.createdAt)===r.period);
    return {invoices,expenses,bills,journals,total:invoices.length+expenses.length+bills.length+journals.length};
  }
  function readiness(state,period){
    const r=range(period);if(!r)return null;
    const tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{balanced:false,difference:0,accounts:[]};
    const suspense=tb.accounts?.find(x=>x.name==='Opening / Mapping Suspense');
    const pnl=window.DalasiProfitLoss?.statement?.(state,period)||null;
    const bs=window.DalasiBalanceSheet?.statement?.(state)||null;
    const bankAccounts=(state.cashAccounts||[]).filter(x=>(x.status||'Active')==='Active'&&['Bank','Mobile Money'].includes(x.type||'Bank'));
    const bankMissing=bankAccounts.filter(a=>{const rec=latestBankRecon(state,a.id);return !rec||String(rec.statementDate||'')<r.end;});
    const drafts=draftsInPeriod(state,r),fixedAssets=window.DalasiFixedAssets?.periodStatus?.(state,period)||{eligible:0,posted:0,missing:0},loanInterest=window.DalasiLoans?.periodStatus?.(state,period)||{eligible:0,posted:0,missing:0},inventory=window.DalasiInventory?.periodStatus?.(state,period)||{exceptions:0,unfulfilled:0,ready:true};
    const controlChecks=window.DalasiControlReconciliation?.checks?.(state)||[];
    const controlBy=id=>controlChecks.find(x=>x.key===id)||null;
    const cashControl=controlBy('cash'),arControl=controlBy('ar'),apControl=controlBy('ap'),faControl=controlBy('fixed-assets'),vatInControl=controlBy('vat-input'),vatOutControl=controlBy('vat-output'),loanControl=controlBy('loans');
    const pendingReversals=(state.reversalRequests||[]).filter(x=>x.status==='Pending');
    const vatRegistered=!!window.DalasiTax?.settings?.(state)?.vatRegistered,vatFiled=!!window.DalasiTax?.returnRecord?.(state,period);
    const checks=[
      {id:'bank',label:'Bank & mobile reconciliations',done:bankMissing.length===0,blocking:true,detail:bankAccounts.length?(bankMissing.length?bankMissing.length+' account'+(bankMissing.length===1?'':'s')+' not reconciled through '+r.end:'All active bank/mobile accounts reconciled through period end'):'No active bank/mobile accounts to reconcile'},
      {id:'trial',label:'Trial Balance',done:!!tb.balanced,blocking:true,detail:tb.balanced?'Debits equal credits':'Debit/credit difference '+round(Math.abs(tb.difference))},
      {id:'suspense',label:'Mapping suspense',done:Math.abs(Number(suspense?.balance)||0)<0.01,blocking:true,detail:Math.abs(Number(suspense?.balance)||0)<0.01?'No unresolved mapping balance':'Suspense balance '+round(Math.abs(Number(suspense?.balance)||0))},
      {id:'cogs',label:'Revenue & COGS matching',done:!(pnl?.unfulfilledProductInvoices),blocking:true,detail:pnl?.unfulfilledProductInvoices?(pnl.unfulfilledProductInvoices+' product invoice'+(pnl.unfulfilledProductInvoices===1?'':'s')+' not fulfilled'):'No issued product invoices waiting for COGS'},
      {id:'inventory',label:'Inventory reconciliation',done:inventory.ready,blocking:true,detail:inventory.exceptions?(inventory.exceptions+' product'+(inventory.exceptions===1?'':'s')+' have catalog/movement quantity differences'):(inventory.unfulfilled?(inventory.unfulfilled+' stock invoice'+(inventory.unfulfilled===1?'':'s')+' not fulfilled'):'Catalog stock agrees to movement history')},
      {id:'balance',label:'Balance Sheet',done:!!bs?.balanced,blocking:true,detail:bs?.balanced?'Assets equal liabilities + equity':'Balance Sheet difference '+round(Math.abs(bs?.difference||0))},
      {id:'fixed-assets',label:'Fixed asset depreciation',done:fixedAssets.missing===0,blocking:true,detail:fixedAssets.missing?(fixedAssets.missing+' asset'+(fixedAssets.missing===1?'':'s')+' still need depreciation for '+period):(fixedAssets.eligible?('Depreciation posted for '+fixedAssets.posted+' eligible asset'+(fixedAssets.posted===1?'':'s')):'No depreciation due for this period')},
      {id:'loan-interest',label:'Loan interest accruals',done:loanInterest.missing===0,blocking:true,detail:loanInterest.missing?(loanInterest.missing+' loan installment'+(loanInterest.missing===1?'':'s')+' still need interest accrual for '+period):(loanInterest.eligible?('Interest accrued for '+loanInterest.posted+' installment'+(loanInterest.posted===1?'':'s')):'No loan interest due for this period')},
      {id:'cash-control',label:'Cash & Bank control account',done:!!cashControl&&cashControl.matched,blocking:true,detail:!cashControl?'Control reconciliation unavailable':cashControl.matched?'Cash & Bank module agrees to General Ledger':'Difference '+round(Math.abs(cashControl.difference))+' between Cash & Bank and General Ledger'},
      {id:'ar-control',label:'Accounts Receivable control',done:!!arControl&&arControl.matched,blocking:true,detail:!arControl?'Control reconciliation unavailable':arControl.matched?'Customer balances agree to Accounts Receivable':'Difference '+round(Math.abs(arControl.difference))+' between customer balances and Accounts Receivable'},
      {id:'ap-control',label:'Accounts Payable control',done:!!apControl&&apControl.matched,blocking:true,detail:!apControl?'Control reconciliation unavailable':apControl.matched?'Supplier balances agree to Accounts Payable':'Difference '+round(Math.abs(apControl.difference))+' between supplier balances and Accounts Payable'},
      {id:'fixed-control',label:'Fixed asset control account',done:!!faControl&&faControl.matched,blocking:true,detail:!faControl?'Control reconciliation unavailable':faControl.matched?'Fixed asset register agrees to General Ledger':'Difference '+round(Math.abs(faControl.difference))+' between fixed asset register and General Ledger'},
      {id:'vat-control',label:'VAT control accounts',done:!!vatInControl&&!!vatOutControl&&vatInControl.matched&&vatOutControl.matched,blocking:true,detail:(!vatInControl&&!vatOutControl)?'VAT control reconciliation unavailable':((!vatInControl||vatInControl.matched)&&(!vatOutControl||vatOutControl.matched)?'VAT input and output controls agree to General Ledger':'VAT control difference requires review')},
      {id:'loan-control',label:'Loans control account',done:!!loanControl&&loanControl.matched,blocking:true,detail:!loanControl?'Control reconciliation unavailable':loanControl.matched?'Loan register agrees to General Ledger':'Difference '+round(Math.abs(loanControl.difference))+' between loan register and General Ledger'},
      {id:'reversals',label:'Pending reversal approvals',done:pendingReversals.length===0,blocking:true,detail:pendingReversals.length?(pendingReversals.length+' reversal request'+(pendingReversals.length===1?'':'s')+' still awaiting independent review'):'No reversal requests awaiting approval'},
      {id:'drafts',label:'Draft accounting documents',done:drafts.total===0,blocking:true,detail:drafts.total?(drafts.total+' draft document'+(drafts.total===1?'':'s')+' dated in this period'):'No draft invoices, expenses, supplier bills or journals in the period'},
      {id:'vat-filing',label:'VAT return filing status',done:!vatRegistered||vatFiled,blocking:false,detail:!vatRegistered?'Business is not marked VAT registered':vatFiled?'VAT return marked filed for '+period:'VAT return not yet marked filed; this does not block accounting close'}
    ];
    return {period,r,checks,ready:checks.filter(x=>x.blocking).every(x=>x.done),tb,suspense,pnl,bs,bankAccounts,bankMissing,drafts,fixedAssets,loanInterest,inventory,controlChecks,pendingReversals,vatRegistered,vatFiled};
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));
    const add=v=>{const p=periodOf(v);if(p)set.add(p);};
    (state.customerInvoices||[]).forEach(x=>add(x.issueDate||x.createdAt));
    (state.revenueEntries||[]).forEach(x=>add(x.revenueDate||x.createdAt));
    (state.businessExpenses||[]).forEach(x=>add(x.expenseDate||x.createdAt));
    (state.cashTransactions||[]).forEach(x=>add(x.date||x.createdAt));
    (state.inventoryMovements||[]).forEach(x=>add(x.revenueDate||x.movementDate||x.createdAt));
    (state.fixedAssetDepreciation||[]).forEach(x=>add(x.date||x.period));
    (state.fixedAssets||[]).forEach(x=>{add(x.acquisitionDate);add(x.disposalDate);});
    (state.businessLoans||[]).forEach(x=>{add(x.startDate);(window.DalasiLoans?.schedule?.(x)||[]).forEach(r=>add(r.dueDate));});
    (state.loanRepayments||[]).forEach(x=>add(x.date));
    (state.monthEndCloses||[]).forEach(x=>set.add(x.period));
    if(state.currentPeriod)set.add(state.currentPeriod);
    return [...set].filter(x=>/^\d{4}-\d{2}$/.test(x)).sort().reverse();
  }
  function label(period){const r=range(period);return r?new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(new Date(r.year,r.month-1,1)):period;}
  function snapshot(state,period){
    const rd=readiness(state,period),p=rd?.pnl||{},b=rd?.bs||{},tb=rd?.tb||{};
    return {revenue:round(p.revenue),cogs:round(p.cogs),grossProfit:round(p.grossProfit),operatingExpenses:round(p.operatingExpenses),netProfit:round(p.netProfit),totalAssets:round(b.totalAssets),totalLiabilities:round(b.totalLiabilities),totalEquity:round(b.equity),trialDebits:round(tb.debit),trialCredits:round(tb.credit),bankAccounts:rd?.bankAccounts?.length||0};
  }
  function panel(state,h){
    const {money2,icon,esc,pill}=h,available=periods(state),period=state.monthClosePeriod||state.currentPeriod||available[0],rd=readiness(state,period),closed=record(state,period),hist=(state.monthEndCloses||[]).slice().sort((a,b)=>String(b.period).localeCompare(String(a.period)));
    if(!rd)return '<section class="surface month-close-card"><div class="empty-inline">No accounting period is available to close.</div></section>';
    const opts=available.map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(label(p))+'</option>').join('');
    const checkRows=rd.checks.map(x=>'<div class="close-check '+(x.done?'done':(x.blocking?'open':'advisory'))+'"><span>'+icon(x.done?'check':(x.blocking?'alert':'clock'),15)+'</span><div><b>'+esc(x.label)+'</b><small>'+esc(x.detail)+'</small></div><em>'+esc(x.done?'Ready':(x.blocking?'Resolve':'Advisory'))+'</em></div>').join('');
    const historyRows=hist.length?hist.map(x=>'<tr><td><b>'+esc(label(x.period))+'</b><small>'+esc(x.period)+'</small></td><td>'+esc(x.closedBy||'User')+'</td><td>'+esc(String(x.closedAt||'').replace('T',' ').slice(0,16))+'</td><td>'+money2(x.snapshot?.revenue||0)+'</td><td>'+money2(x.snapshot?.netProfit||0)+'</td><td>'+pill(x.status||'Closed','ready')+'</td><td><div class="inline-buttons"><button class="secondary" data-action="month-close-export:'+esc(x.period)+'">'+icon('download',13)+' CSV</button><button class="primary" data-action="month-evidence-pack:'+esc(x.period)+'">'+icon('file',13)+' Evidence pack</button></div></td></tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No accounting months have been closed yet.</div></td></tr>';
    return '<section class="surface month-close-card">'+
      '<div class="table-tools"><div><h3>Month-End Close</h3><p>Review the accounting controls, lock the period, and preserve a close snapshot.</p></div><div class="inline-buttons"><select id="month-close-period-select">'+opts+'</select>'+(closed?'<button class="secondary" data-action="month-reopen:'+esc(period)+'">Reopen period</button>':'<button class="primary" data-action="month-close:'+esc(period)+'" '+(rd.ready?'':'disabled')+'>'+icon('check',14)+' Close '+esc(label(period))+'</button>')+'</div></div>'+
      '<div class="close-kpis"><div><span>Period status</span><b>'+(closed?'CLOSED':rd.ready?'READY':'OPEN')+'</b><small>'+esc(label(period))+'</small></div><div><span>Revenue</span><b>'+money2(rd.pnl?.revenue||0)+'</b><small>period P&L</small></div><div><span>Net profit</span><b>'+money2(rd.pnl?.netProfit||0)+'</b><small>'+Number(rd.pnl?.netMargin||0).toFixed(1)+'% margin</small></div><div class="'+(!rd.ready&&!closed?'close-warning':'')+'"><span>Close checks</span><b>'+rd.checks.filter(x=>x.done).length+'/'+rd.checks.length+'</b><small>'+(closed?'period locked':rd.ready?'ready to close':'items require attention')+'</small></div></div>'+
      (closed?'<div class="close-lock-note"><b>This accounting period is locked.</b> New or changed dated transactions cannot be posted into '+esc(label(period))+' until an authorized user reopens it.</div>':'')+
      '<div class="close-check-grid">'+checkRows+'</div>'+
      (!rd.ready&&!closed?'<div class="close-note close-warning-note"><b>Close is blocked.</b> Resolve every red control above before finalizing the month.</div>':'<div class="close-note"><b>'+(closed?'Close record preserved.':'Ready for close.')+'</b> DalasiPay stores the financial snapshot and audit user when the period is closed.'+(closed?'<div class="inline-buttons" style="margin-top:10px"><button class="primary" data-action="month-evidence-pack:'+esc(period)+'">'+icon('file',14)+' Download evidence pack</button><button class="secondary" data-action="month-evidence-json:'+esc(period)+'">Evidence JSON</button></div>':'')+'</div>')+
    '</section>'+
    '<section class="surface month-close-card"><div class="table-tools"><div><h3>Close history</h3><p>Permanent month-end close records and financial snapshots</p></div></div><div class="table-scroll"><table><thead><tr><th>PERIOD</th><th>CLOSED BY</th><th>CLOSED AT</th><th>REVENUE</th><th>NET PROFIT</th><th>STATUS</th><th>EXPORT</th></tr></thead><tbody>'+historyRows+'</tbody></table></div></section>';
  }
  function closePeriod(period,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to close accounting periods.');return;}
    if(record(state,period)){ctx.toast('This accounting period is already closed.');return;}
    const rd=readiness(state,period);if(!rd?.ready){ctx.toast('Resolve all blocking month-end checks before closing the period.');return;}
    const now=new Date().toISOString(),user=state.session?.name||'User',snap=snapshot(state,period);
    state.monthEndCloses=state.monthEndCloses||[];
    state.monthEndCloses.unshift({id:'MEC-'+Date.now().toString(36).toUpperCase(),period,status:'Closed',periodEnd:rd.r.end,checks:rd.checks.map(x=>({id:x.id,label:x.label,done:x.done,detail:x.detail})),snapshot:snap,closedAt:now,closedBy:user});
    ctx.audit('accounting.period_closed',{period,snapshot:snap});ctx.save();ctx.toast(label(period)+' closed and locked');ctx.render();
  }
  function openReopen(period,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen a closed accounting period.');return;}
    if(window.DalasiYearClose?.record?.(state,String(period||'').slice(0,4))){ctx.toast('Reopen the financial year before reopening one of its months.');return;}
    const rec=record(state,period);if(!rec){ctx.toast('This period is not closed.');return;}
    state.monthReopenPeriod=period;ctx.render();
  }
  function reopenModal(state,h){
    const period=state.monthReopenPeriod,rec=period?record(state,period):null;if(!period||!rec)return '';
    const {icon,esc}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-month-reopen"></div><form id="month-reopen-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">PERIOD CONTROL</div><h2>Reopen '+esc(label(period))+'</h2><p>This unlocks a previously closed accounting period. The reason becomes part of the permanent audit trail.</p></div><button type="button" class="close" data-action="close-month-reopen">×</button></div>'+
      '<div class="payment-notice"><span>'+icon('alert',17)+'</span><div><b>Reopening affects accounting control</b><p>Only reopen when a dated correction must be posted into this period. The original close record remains preserved.</p></div></div>'+
      '<div class="form-grid"><label class="field" style="grid-column:1/-1"><span>Mandatory reopen reason</span><textarea name="reason" rows="4" minlength="8" placeholder="Explain why this accounting period must be reopened" required></textarea></label></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-month-reopen">Cancel</button><button class="primary" type="submit">'+icon('lock',14)+' Reopen period</button></div></form></div>';
  }
  function reopenSubmit(ev,state,ctx){
    ev.preventDefault();const period=state.monthReopenPeriod;
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen a closed accounting period.');return;}
    if(window.DalasiYearClose?.record?.(state,String(period||'').slice(0,4))){ctx.toast('Reopen the financial year before reopening one of its months.');return;}
    const rec=record(state,period);if(!rec){state.monthReopenPeriod=null;ctx.toast('This period is not closed.');ctx.render();return;}
    const reason=String(new FormData(ev.target).get('reason')||'').trim();if(reason.length<8){ctx.toast('Enter a clear reason for reopening the period.');return;}
    rec.status='Reopened';rec.reopenedAt=new Date().toISOString();rec.reopenedBy=state.session?.name||'User';rec.reopenReason=reason;
    state.monthReopenPeriod=null;ctx.audit('accounting.period_reopened',{period,closeId:rec.id,reason});ctx.save();ctx.toast(label(period)+' reopened');ctx.render();
  }
  function evidencePack(period,state){
    const rec=(state.monthEndCloses||[]).find(x=>x.period===period);if(!rec)return null;
    const r=range(period),rd=readiness(state,period),tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{accounts:[],debit:0,credit:0,difference:0,balanced:false};
    const pnl=window.DalasiProfitLoss?.statement?.(state,period)||{},bs=window.DalasiBalanceSheet?.statement?.(state)||{};
    const controls=window.DalasiControlReconciliation?.checks?.(state)||[];
    const bankRecs=(state.bankReconciliations||[]).filter(x=>String(x.statementDate||'').slice(0,7)<=period&&String(x.statementDate||'')<=r.end).slice().sort((a,b)=>String(a.accountName||'').localeCompare(String(b.accountName||''))||String(b.statementDate||'').localeCompare(String(a.statementDate||'')));
    const latestBank=[];const seen=new Set();for(const x of bankRecs){if(seen.has(x.accountId))continue;seen.add(x.accountId);latestBank.push(x);}
    const journals=(state.manualJournals||[]).filter(x=>x.status==='Posted'&&periodOf(x.date||x.postedAt)===period).map(x=>({journalNo:x.journalNo||x.id,date:x.date,reference:x.reference||'',memo:x.memo||'',debit:round(x.debit),credit:round(x.credit),postedBy:x.postedBy||x.createdBy||'',reversalOf:x.reversalOf||null,openingMigration:!!x.openingMigration}));
    const reversals=(state.reversalRequests||[]).filter(x=>periodOf(x.approvedAt||x.rejectedAt||x.requestedAt)===period).map(x=>({id:x.id,sourceRef:x.sourceRef,transactionType:x.transactionType,amount:round(x.amount),status:x.status,reason:x.reason,requestedBy:x.requestedBy,approvedBy:x.approvedBy||'',rejectedBy:x.rejectedBy||'',requestedAt:x.requestedAt,approvedAt:x.approvedAt||'',rejectedAt:x.rejectedAt||''}));
    const vat=window.DalasiTax?.returnSummary?.(state,period)||{},vatReturn=window.DalasiTax?.returnRecord?.(state,period)||null;
    return {
      generatedAt:new Date().toISOString(),company:state.company||state.org?.name||'DalasiPay',period,periodStart:r.start,periodEnd:r.end,
      close:{id:rec.id,status:rec.status,closedAt:rec.closedAt,closedBy:rec.closedBy,reopenedAt:rec.reopenedAt||'',reopenedBy:rec.reopenedBy||'',reopenReason:rec.reopenReason||'',checks:rec.checks||[]},
      profitLoss:{revenue:round(pnl.revenue),cogs:round(pnl.cogs),grossProfit:round(pnl.grossProfit),operatingExpenses:round(pnl.operatingExpenses),netProfit:round(pnl.netProfit)},
      balanceSheet:{totalAssets:round(bs.totalAssets),totalLiabilities:round(bs.totalLiabilities),totalEquity:round(bs.equity),liabilitiesEquity:round(bs.liabilitiesEquity),difference:round(bs.difference),balanced:!!bs.balanced},
      trialBalance:{debit:round(tb.debit),credit:round(tb.credit),difference:round(tb.difference),balanced:!!tb.balanced,accounts:(tb.accounts||[]).map(a=>({code:a.code,name:a.name,type:a.type,debit:round(a.debit),credit:round(a.credit),balance:round(a.balance)}))},
      controlReconciliation:controls.map(x=>({control:x.label,module:round(x.module),generalLedger:round(x.ledger),difference:round(x.difference),status:x.matched?'MATCH':'REVIEW'})),
      bankReconciliations:latestBank.map(x=>({account:x.accountName||x.accountId,statementDate:x.statementDate,statementBalance:round(x.statementBalance),bookBalance:round(x.bookBalance),outstandingNet:round(x.outstandingNet),clearedCount:x.clearedCount,reconciledBy:x.createdBy||x.reconciledBy||''})),
      vat:{registered:!!window.DalasiTax?.settings?.(state)?.vatRegistered,filed:!!vatReturn,returnStatus:vatReturn?.status||'Working paper',outputVat:round(vat.totalOutput),inputVat:round(vat.totalInput),netVat:round(vat.netVat),payments:round(vat.payments),outstanding:round(vat.outstanding),credit:round(vat.credit)},
      postedJournals:journals,reversalActivity:reversals,
      closeReadiness:rd?.checks||[]
    };
  }
  function evidenceHtml(pack){
    const escHtml=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    const fmt=n=>'GMD '+Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
    const rows=(arr,cols)=>arr.length?arr.map(x=>'<tr>'+cols.map(c=>'<td>'+escHtml(c(x))+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+cols.length+'">No records</td></tr>';
    const checks=pack.close.checks||[],controls=pack.controlReconciliation||[],tb=pack.trialBalance.accounts||[],banks=pack.bankReconciliations||[],journals=pack.postedJournals||[],revs=pack.reversalActivity||[];
    return '<!doctype html><html><head><meta charset="utf-8"><title>DalasiPay Month-End Evidence Pack '+escHtml(pack.period)+'</title><style>'+
      'body{font-family:Arial,sans-serif;color:#17211f;margin:32px;line-height:1.4}h1,h2,h3{color:#0f5e50}h1{margin-bottom:4px}.muted{color:#71807b}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.card{border:1px solid #dfe6e1;border-radius:10px;padding:12px}.card span{display:block;color:#71807b;font-size:12px}.card b{font-size:18px}table{width:100%;border-collapse:collapse;margin:10px 0 24px}th,td{border-bottom:1px solid #dfe6e1;padding:8px;text-align:left;font-size:12px}th{background:#f5f7f4}.ok{color:#1e7a5f}.bad{color:#a84242}.section{page-break-inside:avoid}.foot{margin-top:28px;padding-top:12px;border-top:1px solid #dfe6e1;color:#71807b;font-size:11px}@media print{body{margin:18mm}.no-print{display:none}}</style></head><body>'+
      '<h1>DalasiPay Month-End Evidence Pack</h1><div class="muted">'+escHtml(pack.company)+' · '+escHtml(pack.period)+' · '+escHtml(pack.periodStart)+' to '+escHtml(pack.periodEnd)+'</div>'+
      '<div class="grid"><div class="card"><span>Close status</span><b>'+escHtml(pack.close.status)+'</b></div><div class="card"><span>Closed by</span><b>'+escHtml(pack.close.closedBy||'—')+'</b></div><div class="card"><span>Closed at</span><b>'+escHtml(String(pack.close.closedAt||'').replace('T',' ').slice(0,16))+'</b></div><div class="card"><span>Trial Balance</span><b class="'+(pack.trialBalance.balanced?'ok':'bad')+'">'+(pack.trialBalance.balanced?'Balanced':'Review')+'</b></div></div>'+
      (pack.close.reopenedAt?'<div class="section"><h3>Reopen history</h3><p><b>Reopened by:</b> '+escHtml(pack.close.reopenedBy)+' · '+escHtml(String(pack.close.reopenedAt).replace('T',' ').slice(0,16))+'<br><b>Reason:</b> '+escHtml(pack.close.reopenReason||'—')+'</p></div>':'')+
      '<div class="section"><h2>Financial snapshot</h2><table><tbody><tr><th>Revenue</th><td>'+fmt(pack.profitLoss.revenue)+'</td><th>Net profit</th><td>'+fmt(pack.profitLoss.netProfit)+'</td></tr><tr><th>Total assets</th><td>'+fmt(pack.balanceSheet.totalAssets)+'</td><th>Total liabilities</th><td>'+fmt(pack.balanceSheet.totalLiabilities)+'</td></tr><tr><th>Total equity</th><td>'+fmt(pack.balanceSheet.totalEquity)+'</td><th>Balance difference</th><td>'+fmt(Math.abs(pack.balanceSheet.difference))+'</td></tr></tbody></table></div>'+
      '<div class="section"><h2>Close checklist</h2><table><thead><tr><th>Control</th><th>Status</th><th>Detail</th></tr></thead><tbody>'+rows(checks,[x=>x.label,x=>x.done?'READY':'RESOLVE',x=>x.detail])+'</tbody></table></div>'+
      '<div class="section"><h2>Control account reconciliation</h2><table><thead><tr><th>Control</th><th>Module</th><th>General Ledger</th><th>Difference</th><th>Status</th></tr></thead><tbody>'+rows(controls,[x=>x.control,x=>fmt(x.module),x=>fmt(x.generalLedger),x=>fmt(Math.abs(x.difference)),x=>x.status])+'</tbody></table></div>'+
      '<div class="section"><h2>Bank reconciliation status</h2><table><thead><tr><th>Account</th><th>Statement date</th><th>Statement balance</th><th>Book balance</th><th>Outstanding net</th></tr></thead><tbody>'+rows(banks,[x=>x.account,x=>x.statementDate,x=>fmt(x.statementBalance),x=>fmt(x.bookBalance),x=>fmt(x.outstandingNet)])+'</tbody></table></div>'+
      '<div class="section"><h2>VAT position</h2><table><tbody><tr><th>Status</th><td>'+escHtml(pack.vat.returnStatus)+'</td><th>Output VAT</th><td>'+fmt(pack.vat.outputVat)+'</td></tr><tr><th>Input VAT</th><td>'+fmt(pack.vat.inputVat)+'</td><th>Net VAT</th><td>'+fmt(pack.vat.netVat)+'</td></tr><tr><th>Payments</th><td>'+fmt(pack.vat.payments)+'</td><th>Outstanding</th><td>'+fmt(pack.vat.outstanding)+'</td></tr></tbody></table></div>'+
      '<div class="section"><h2>Posted journals in period</h2><table><thead><tr><th>Journal</th><th>Date</th><th>Reference</th><th>Memo</th><th>Debit</th><th>Credit</th><th>Posted by</th></tr></thead><tbody>'+rows(journals,[x=>x.journalNo,x=>x.date,x=>x.reference,x=>x.memo,x=>fmt(x.debit),x=>fmt(x.credit),x=>x.postedBy])+'</tbody></table></div>'+
      '<div class="section"><h2>Reversal activity</h2><table><thead><tr><th>Request</th><th>Source</th><th>Type</th><th>Amount</th><th>Status</th><th>Reason</th></tr></thead><tbody>'+rows(revs,[x=>x.id,x=>x.sourceRef,x=>x.transactionType,x=>fmt(x.amount),x=>x.status,x=>x.reason])+'</tbody></table></div>'+
      '<div class="section"><h2>Trial Balance</h2><table><thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>'+rows(tb,[x=>x.code,x=>x.name,x=>x.type,x=>fmt(x.debit),x=>fmt(x.credit),x=>fmt(Math.abs(x.balance))])+'<tr><th colspan="3">TOTAL</th><th>'+fmt(pack.trialBalance.debit)+'</th><th>'+fmt(pack.trialBalance.credit)+'</th><th>'+fmt(Math.abs(pack.trialBalance.difference))+'</th></tr></tbody></table></div>'+
      '<div class="foot">Generated '+escHtml(String(pack.generatedAt).replace('T',' ').slice(0,19))+' · DalasiPay accounting evidence. This pack is generated from the application records for the selected closed period.</div></body></html>';
  }
  function exportEvidencePack(period,state,ctx){
    const pack=evidencePack(period,state);if(!pack){ctx.toast('Close record not found');return;}
    const html=evidenceHtml(pack);ctx.downloadText('dalasipay-month-end-evidence-'+period+'.html',html,'text/html');ctx.toast('Month-end evidence pack downloaded');
  }
  function exportEvidenceJson(period,state,ctx){
    const pack=evidencePack(period,state);if(!pack){ctx.toast('Close record not found');return;}
    ctx.downloadText('dalasipay-month-end-evidence-'+period+'.json',JSON.stringify(pack,null,2),'application/json');ctx.toast('Month-end evidence JSON downloaded');
  }
  function exportRecord(period,state,ctx){
    const rec=(state.monthEndCloses||[]).find(x=>x.period===period);if(!rec){ctx.toast('Close record not found');return;}
    const s=rec.snapshot||{},rows=[['Month-End Close',period],['Status',rec.status],['Closed by',rec.closedBy],['Closed at',rec.closedAt],['Reopened by',rec.reopenedBy||''],['Reopened at',rec.reopenedAt||''],['Reopen reason',rec.reopenReason||''],[],['Financial snapshot','Amount'],['Revenue',s.revenue],['COGS',s.cogs],['Gross profit',s.grossProfit],['Operating expenses',s.operatingExpenses],['Net profit',s.netProfit],['Total assets',s.totalAssets],['Total liabilities',s.totalLiabilities],['Total equity',s.totalEquity],['Trial Balance debits',s.trialDebits],['Trial Balance credits',s.trialCredits],[],['Control','Status','Detail'],...(rec.checks||[]).map(x=>[x.label,x.done?'Ready':'Resolve',x.detail])];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');
    ctx.downloadText('dalasipay-month-close-'+period+'.csv',csv);ctx.toast('Month-end close record downloaded');
  }
  window.DalasiMonthClose={range,periodOf,record,isClosed,readiness,periods,panel,closePeriod,openReopen,reopenModal,reopenSubmit,evidencePack,evidenceHtml,exportEvidencePack,exportEvidenceJson,exportRecord};
})();