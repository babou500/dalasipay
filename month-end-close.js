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
    const drafts=draftsInPeriod(state,r),fixedAssets=window.DalasiFixedAssets?.periodStatus?.(state,period)||{eligible:0,posted:0,missing:0};
    const checks=[
      {id:'bank',label:'Bank & mobile reconciliations',done:bankMissing.length===0,blocking:true,detail:bankAccounts.length?(bankMissing.length?bankMissing.length+' account'+(bankMissing.length===1?'':'s')+' not reconciled through '+r.end:'All active bank/mobile accounts reconciled through period end'):'No active bank/mobile accounts to reconcile'},
      {id:'trial',label:'Trial Balance',done:!!tb.balanced,blocking:true,detail:tb.balanced?'Debits equal credits':'Debit/credit difference '+round(Math.abs(tb.difference))},
      {id:'suspense',label:'Mapping suspense',done:Math.abs(Number(suspense?.balance)||0)<0.01,blocking:true,detail:Math.abs(Number(suspense?.balance)||0)<0.01?'No unresolved mapping balance':'Suspense balance '+round(Math.abs(Number(suspense?.balance)||0))},
      {id:'cogs',label:'Revenue & COGS matching',done:!(pnl?.unfulfilledProductInvoices),blocking:true,detail:pnl?.unfulfilledProductInvoices?(pnl.unfulfilledProductInvoices+' product invoice'+(pnl.unfulfilledProductInvoices===1?'':'s')+' not fulfilled'):'No issued product invoices waiting for COGS'},
      {id:'balance',label:'Balance Sheet',done:!!bs?.balanced,blocking:true,detail:bs?.balanced?'Assets equal liabilities + equity':'Balance Sheet difference '+round(Math.abs(bs?.difference||0))},
      {id:'fixed-assets',label:'Fixed asset depreciation',done:fixedAssets.missing===0,blocking:true,detail:fixedAssets.missing?(fixedAssets.missing+' asset'+(fixedAssets.missing===1?'':'s')+' still need depreciation for '+period):(fixedAssets.eligible?('Depreciation posted for '+fixedAssets.posted+' eligible asset'+(fixedAssets.posted===1?'':'s')):'No depreciation due for this period')},
      {id:'drafts',label:'Draft accounting documents',done:drafts.total===0,blocking:true,detail:drafts.total?(drafts.total+' draft document'+(drafts.total===1?'':'s')+' dated in this period'):'No draft invoices, expenses, supplier bills or journals in the period'}
    ];
    return {period,r,checks,ready:checks.filter(x=>x.blocking).every(x=>x.done),tb,suspense,pnl,bs,bankAccounts,bankMissing,drafts,fixedAssets};
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));
    const add=v=>{const p=periodOf(v);if(p)set.add(p);};
    (state.customerInvoices||[]).forEach(x=>add(x.issueDate||x.createdAt));
    (state.revenueEntries||[]).forEach(x=>add(x.revenueDate||x.createdAt));
    (state.businessExpenses||[]).forEach(x=>add(x.expenseDate||x.createdAt));
    (state.cashTransactions||[]).forEach(x=>add(x.date||x.createdAt));
    (state.fixedAssetDepreciation||[]).forEach(x=>add(x.date||x.period));
    (state.fixedAssets||[]).forEach(x=>{add(x.acquisitionDate);add(x.disposalDate);});
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
    const checkRows=rd.checks.map(x=>'<div class="close-check '+(x.done?'done':'open')+'"><span>'+icon(x.done?'check':'alert',15)+'</span><div><b>'+esc(x.label)+'</b><small>'+esc(x.detail)+'</small></div><em>'+esc(x.done?'Ready':'Resolve')+'</em></div>').join('');
    const historyRows=hist.length?hist.map(x=>'<tr><td><b>'+esc(label(x.period))+'</b><small>'+esc(x.period)+'</small></td><td>'+esc(x.closedBy||'User')+'</td><td>'+esc(String(x.closedAt||'').replace('T',' ').slice(0,16))+'</td><td>'+money2(x.snapshot?.revenue||0)+'</td><td>'+money2(x.snapshot?.netProfit||0)+'</td><td>'+pill(x.status||'Closed','ready')+'</td><td><button class="secondary" data-action="month-close-export:'+esc(x.period)+'">'+icon('download',13)+' CSV</button></td></tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No accounting months have been closed yet.</div></td></tr>';
    return '<section class="surface month-close-card">'+
      '<div class="table-tools"><div><h3>Month-End Close</h3><p>Review the accounting controls, lock the period, and preserve a close snapshot.</p></div><div class="inline-buttons"><select id="month-close-period-select">'+opts+'</select>'+(closed?'<button class="secondary" data-action="month-reopen:'+esc(period)+'">Reopen period</button>':'<button class="primary" data-action="month-close:'+esc(period)+'" '+(rd.ready?'':'disabled')+'>'+icon('check',14)+' Close '+esc(label(period))+'</button>')+'</div></div>'+
      '<div class="close-kpis"><div><span>Period status</span><b>'+(closed?'CLOSED':rd.ready?'READY':'OPEN')+'</b><small>'+esc(label(period))+'</small></div><div><span>Revenue</span><b>'+money2(rd.pnl?.revenue||0)+'</b><small>period P&L</small></div><div><span>Net profit</span><b>'+money2(rd.pnl?.netProfit||0)+'</b><small>'+Number(rd.pnl?.netMargin||0).toFixed(1)+'% margin</small></div><div class="'+(!rd.ready&&!closed?'close-warning':'')+'"><span>Close checks</span><b>'+rd.checks.filter(x=>x.done).length+'/'+rd.checks.length+'</b><small>'+(closed?'period locked':rd.ready?'ready to close':'items require attention')+'</small></div></div>'+
      (closed?'<div class="close-lock-note"><b>This accounting period is locked.</b> New or changed dated transactions cannot be posted into '+esc(label(period))+' until an authorized user reopens it.</div>':'')+
      '<div class="close-check-grid">'+checkRows+'</div>'+
      (!rd.ready&&!closed?'<div class="close-note close-warning-note"><b>Close is blocked.</b> Resolve every red control above before finalizing the month.</div>':'<div class="close-note"><b>'+(closed?'Close record preserved.':'Ready for close.')+'</b> DalasiPay stores the financial snapshot and audit user when the period is closed.</div>')+
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
  function reopen(period,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen a closed accounting period.');return;}
    if(window.DalasiYearClose?.record?.(state,String(period||'').slice(0,4))){ctx.toast('Reopen the financial year before reopening one of its months.');return;}
    const rec=record(state,period);if(!rec){ctx.toast('This period is not closed.');return;}
    rec.status='Reopened';rec.reopenedAt=new Date().toISOString();rec.reopenedBy=state.session?.name||'User';
    ctx.audit('accounting.period_reopened',{period,closeId:rec.id});ctx.save();ctx.toast(label(period)+' reopened');ctx.render();
  }
  function exportRecord(period,state,ctx){
    const rec=(state.monthEndCloses||[]).find(x=>x.period===period);if(!rec){ctx.toast('Close record not found');return;}
    const s=rec.snapshot||{},rows=[['Month-End Close',period],['Status',rec.status],['Closed by',rec.closedBy],['Closed at',rec.closedAt],['Reopened by',rec.reopenedBy||''],['Reopened at',rec.reopenedAt||''],[],['Financial snapshot','Amount'],['Revenue',s.revenue],['COGS',s.cogs],['Gross profit',s.grossProfit],['Operating expenses',s.operatingExpenses],['Net profit',s.netProfit],['Total assets',s.totalAssets],['Total liabilities',s.totalLiabilities],['Total equity',s.totalEquity],['Trial Balance debits',s.trialDebits],['Trial Balance credits',s.trialCredits],[],['Control','Status','Detail'],...(rec.checks||[]).map(x=>[x.label,x.done?'Ready':'Resolve',x.detail])];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');
    ctx.downloadText('dalasipay-month-close-'+period+'.csv',csv);ctx.toast('Month-end close record downloaded');
  }
  window.DalasiMonthClose={range,periodOf,record,isClosed,readiness,periods,panel,closePeriod,reopen,exportRecord};
})();