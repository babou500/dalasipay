(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yearOf=v=>{const y=String(v||'').slice(0,4);return /^\d{4}$/.test(y)?y:'';};
  const monthIds=year=>Array.from({length:12},(_,i)=>String(year)+'-'+String(i+1).padStart(2,'0'));

  function record(state,year){
    return (state.yearEndCloses||[]).find(x=>String(x.year)===String(year)&&x.status==='Closed')||null;
  }
  function isClosed(state,dateOrYear){
    const y=String(dateOrYear||'').length===4?String(dateOrYear):yearOf(dateOrYear);
    return !!record(state,y);
  }
  function availableYears(state){
    const set=new Set();
    const add=v=>{const y=yearOf(v);if(y)set.add(y);};
    add(state.currentPeriod);
    (state.monthEndCloses||[]).forEach(x=>add(x.period));
    (state.yearEndCloses||[]).forEach(x=>add(x.year));
    (state.customerInvoices||[]).forEach(x=>add(x.issueDate||x.createdAt));
    (state.businessExpenses||[]).forEach(x=>add(x.expenseDate||x.createdAt));
    (state.businessBills||[]).forEach(x=>add(x.invoiceDate||x.createdAt));
    (state.manualJournals||[]).forEach(x=>add(x.date||x.createdAt));
    if(!set.size)set.add(String(new Date().getFullYear()));
    return [...set].sort().reverse();
  }
  function draftCount(state,year){
    const inYear=v=>yearOf(v)===String(year);
    return [
      ...(state.customerInvoices||[]).filter(x=>(x.status||'Draft')==='Draft'&&inYear(x.issueDate||x.createdAt)),
      ...(state.businessExpenses||[]).filter(x=>(x.status||'Draft')==='Draft'&&inYear(x.expenseDate||x.createdAt)),
      ...(state.businessBills||[]).filter(x=>(x.status||'Draft')==='Draft'&&inYear(x.invoiceDate||x.createdAt)),
      ...(state.manualJournals||[]).filter(x=>(x.status||'Draft')==='Draft'&&inYear(x.date||x.createdAt))
    ].length;
  }
  function readiness(state,year){
    year=String(year||'');
    if(!/^\d{4}$/.test(year))return null;
    const months=monthIds(year).map(period=>({period,closed:!!window.DalasiMonthClose?.record?.(state,period)}));
    const missing=months.filter(x=>!x.closed);
    const tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{balanced:false,difference:0,debit:0,credit:0};
    const bs=window.DalasiBalanceSheet?.statement?.(state)||null;
    const drafts=draftCount(state,year);
    const checks=[
      {id:'months',label:'All 12 months closed',done:missing.length===0,blocking:true,detail:missing.length?missing.length+' month'+(missing.length===1?' is':'s are')+' still open':'January through December are closed'},
      {id:'trial',label:'Trial Balance',done:!!tb.balanced,blocking:true,detail:tb.balanced?'Debits equal credits':'Debit/credit difference '+round(Math.abs(tb.difference||0))},
      {id:'balance',label:'Balance Sheet',done:!!bs?.balanced,blocking:true,detail:bs?.balanced?'Assets equal liabilities + equity':'Balance Sheet difference '+round(Math.abs(bs?.difference||0))},
      {id:'drafts',label:'Draft accounting documents',done:drafts===0,blocking:true,detail:drafts?drafts+' draft document'+(drafts===1?'':'s')+' remain dated in '+year:'No draft invoices, expenses, bills or journals remain in '+year}
    ];
    return {year,months,missing,tb,bs,drafts,checks,ready:checks.every(x=>x.done)};
  }
  function snapshot(state,year){
    const months=monthIds(year).map(period=>window.DalasiProfitLoss?.statement?.(state,period)||{});
    const sum=k=>round(months.reduce((a,x)=>a+(Number(x[k])||0),0));
    const bs=window.DalasiBalanceSheet?.statement?.(state)||{};
    const tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{};
    return {
      revenue:sum('revenue'),cogs:sum('cogs'),grossProfit:sum('grossProfit'),operatingExpenses:sum('operatingExpenses'),netProfit:sum('netProfit'),
      totalAssets:round(bs.totalAssets),totalLiabilities:round(bs.totalLiabilities),totalEquity:round(bs.equity),
      trialDebits:round(tb.debit),trialCredits:round(tb.credit)
    };
  }
  function panel(state,h){
    const {money2,icon,pill}=h,years=availableYears(state),year=String(state.yearCloseYear||yearOf(state.currentPeriod)||years[0]||new Date().getFullYear()),rd=readiness(state,year),closed=record(state,year),hist=(state.yearEndCloses||[]).slice().sort((a,b)=>String(b.year).localeCompare(String(a.year)));
    if(!rd)return '<section class="surface year-close-card"><div class="empty-inline">No financial year is available to close.</div></section>';
    const opts=years.map(y=>'<option value="'+esc(y)+'" '+(y===year?'selected':'')+'>'+esc(y)+'</option>').join('');
    const monthGrid=rd.months.map(x=>'<div class="year-month '+(x.closed?'done':'open')+'"><span>'+esc(new Intl.DateTimeFormat('en-GB',{month:'short'}).format(new Date(Number(year),Number(x.period.slice(5,7))-1,1)))+'</span><b>'+icon(x.closed?'check':'alert',12)+' '+(x.closed?'Closed':'Open')+'</b></div>').join('');
    const checkRows=rd.checks.map(x=>'<div class="close-check '+(x.done?'done':'open')+'"><span>'+icon(x.done?'check':'alert',15)+'</span><div><b>'+esc(x.label)+'</b><small>'+esc(x.detail)+'</small></div><em>'+esc(x.done?'Ready':'Resolve')+'</em></div>').join('');
    const snap=closed?.snapshot||snapshot(state,year);
    const historyRows=hist.length?hist.map(x=>'<tr><td><b>'+esc(x.year)+'</b></td><td>'+esc(x.closedBy||'User')+'</td><td>'+esc(String(x.closedAt||'').replace('T',' ').slice(0,16))+'</td><td>'+money2(x.snapshot?.revenue||0)+'</td><td>'+money2(x.snapshot?.netProfit||0)+'</td><td>'+pill(x.status||'Closed','ready')+'</td><td><button class="secondary" data-action="year-close-export:'+esc(x.year)+'">'+icon('download',13)+' CSV</button></td></tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No financial years have been closed yet.</div></td></tr>';
    return '<section class="surface year-close-card">'+
      '<div class="table-tools"><div><h3>Year-End Close</h3><p>Manual financial-year close. All 12 monthly periods must be closed first.</p></div><div class="inline-buttons"><select id="year-close-year-select">'+opts+'</select>'+(closed?'<button class="secondary" data-action="year-reopen:'+esc(year)+'">Reopen year</button>':'<button class="primary" data-action="year-close:'+esc(year)+'" '+(rd.ready?'':'disabled')+'>'+icon('check',14)+' Close '+esc(year)+'</button>')+'</div></div>'+
      '<div class="close-kpis"><div><span>Year status</span><b>'+(closed?'CLOSED':rd.ready?'READY':'OPEN')+'</b><small>'+esc(year)+' financial year</small></div><div><span>Annual revenue</span><b>'+money2(snap.revenue||0)+'</b><small>12-month P&L</small></div><div><span>Annual net profit</span><b>'+money2(snap.netProfit||0)+'</b><small>12-month result</small></div><div class="'+(!rd.ready&&!closed?'close-warning':'')+'"><span>Months closed</span><b>'+rd.months.filter(x=>x.closed).length+'/12</b><small>'+(closed?'year locked':rd.ready?'ready to close':'monthly closes required')+'</small></div></div>'+
      (closed?'<div class="close-lock-note"><b>This financial year is locked.</b> Dated accounting transactions in '+esc(year)+' remain protected until the year is explicitly reopened.</div>':'')+
      '<div class="year-month-grid">'+monthGrid+'</div><div class="close-check-grid">'+checkRows+'</div>'+
      (!rd.ready&&!closed?'<div class="close-note close-warning-note"><b>Year close is blocked.</b> Close every month and resolve all accounting controls first.</div>':'<div class="close-note"><b>'+(closed?'Year-end record preserved.':'Ready for manual year close.')+'</b> DalasiPay stores the annual financial snapshot, close checks and audit user.</div>')+
      '</section>'+
      '<section class="surface year-close-card"><div class="table-tools"><div><h3>Year-end close history</h3><p>Permanent financial-year close records and snapshots</p></div></div><div class="table-scroll"><table><thead><tr><th>YEAR</th><th>CLOSED BY</th><th>CLOSED AT</th><th>REVENUE</th><th>NET PROFIT</th><th>STATUS</th><th>EXPORT</th></tr></thead><tbody>'+historyRows+'</tbody></table></div></section>';
  }
  function closeYear(year,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can close the financial year.');return;}
    year=String(year||'');
    if(record(state,year)){ctx.toast(year+' is already closed.');return;}
    const rd=readiness(state,year);if(!rd?.ready){ctx.toast('Close all 12 months and resolve every year-end control first.');return;}
    const now=new Date().toISOString(),snap=snapshot(state,year),user=state.session?.name||'User';
    state.yearEndCloses=state.yearEndCloses||[];
    state.yearEndCloses.unshift({id:'YEC-'+Date.now().toString(36).toUpperCase(),year,status:'Closed',checks:rd.checks.map(x=>({id:x.id,label:x.label,done:x.done,detail:x.detail})),snapshot:snap,closedAt:now,closedBy:user});
    ctx.audit('accounting.year_closed',{year,snapshot:snap});ctx.save();ctx.toast(year+' financial year closed and locked');ctx.render();
  }
  function reopen(year,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen a closed financial year.');return;}
    const rec=record(state,year);if(!rec){ctx.toast('This financial year is not closed.');return;}
    rec.status='Reopened';rec.reopenedAt=new Date().toISOString();rec.reopenedBy=state.session?.name||'User';
    ctx.audit('accounting.year_reopened',{year,closeId:rec.id});ctx.save();ctx.toast(String(year)+' financial year reopened');ctx.render();
  }
  function exportRecord(year,state,ctx){
    const rec=(state.yearEndCloses||[]).find(x=>String(x.year)===String(year));if(!rec){ctx.toast('Year-end close record not found');return;}
    const s=rec.snapshot||{},rows=[['Year-End Close',year],['Status',rec.status],['Closed by',rec.closedBy],['Closed at',rec.closedAt],['Reopened by',rec.reopenedBy||''],['Reopened at',rec.reopenedAt||''],[],['Annual financial snapshot','Amount'],['Revenue',s.revenue],['COGS',s.cogs],['Gross profit',s.grossProfit],['Operating expenses',s.operatingExpenses],['Net profit',s.netProfit],['Total assets',s.totalAssets],['Total liabilities',s.totalLiabilities],['Total equity',s.totalEquity],['Trial Balance debits',s.trialDebits],['Trial Balance credits',s.trialCredits],[],['Control','Status','Detail'],...(rec.checks||[]).map(x=>[x.label,x.done?'Ready':'Resolve',x.detail])];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q;}).join(',')).join('\n');
    ctx.downloadText('dalasipay-year-close-'+year+'.csv',csv);ctx.toast('Year-end close record downloaded');
  }

  window.DalasiYearClose={record,isClosed,availableYears,readiness,snapshot,panel,closeYear,reopen,exportRecord};
})();