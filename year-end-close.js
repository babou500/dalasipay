(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yearOf=v=>{const y=String(v||'').slice(0,4);return /^\d{4}$/.test(y)?y:'';};
  const monthIds=year=>Array.from({length:12},(_,i)=>String(year)+'-'+String(i+1).padStart(2,'0'));
  function nextJournalNo(state){
    const y=new Date().getFullYear(),prefix='JRN-'+y+'-';let max=0;
    (state.manualJournals||[]).forEach(x=>{const n=String(x.journalNo||'');if(n.startsWith(prefix))max=Math.max(max,Number(n.slice(prefix.length))||0);});
    return prefix+String(max+1).padStart(5,'0');
  }
  function closingLines(state){
    const tb=window.DalasiGeneralLedger?.trialBalance?.(state)||{accounts:[]},lines=[];
    (tb.accounts||[]).filter(a=>a.type==='Revenue').forEach(a=>{const amt=round(a.credit-a.debit);if(Math.abs(amt)>.004)lines.push({account:a.name,accountCode:a.code,accountType:'Revenue',debit:amt>0?amt:0,credit:amt<0?Math.abs(amt):0,memo:'Year-end close'});});
    (tb.accounts||[]).filter(a=>a.type==='Expense').forEach(a=>{const amt=round(a.debit-a.credit);if(Math.abs(amt)>.004)lines.push({account:a.name,accountCode:a.code,accountType:'Expense',debit:amt<0?Math.abs(amt):0,credit:amt>0?amt:0,memo:'Year-end close'});});
    const debit=round(lines.reduce((a,x)=>a+(Number(x.debit)||0),0)),credit=round(lines.reduce((a,x)=>a+(Number(x.credit)||0),0)),diff=round(debit-credit);
    if(Math.abs(diff)>.004)lines.push({account:'Retained Earnings',accountCode:'3200',accountType:'Equity',debit:diff<0?Math.abs(diff):0,credit:diff>0?diff:0,memo:'Transfer annual result to retained earnings'});
    return lines;
  }
  function postClosingJournal(state,year,closeId,user){
    const lines=closingLines(state),debit=round(lines.reduce((a,x)=>a+(Number(x.debit)||0),0)),credit=round(lines.reduce((a,x)=>a+(Number(x.credit)||0),0));
    if(!lines.length||Math.abs(debit-credit)>.01)return null;
    const now=new Date().toISOString(),id='JRN-'+Date.now().toString(36).toUpperCase(),journalNo=nextJournalNo(state);
    const j={id,journalNo,date:String(year)+'-12-31',reference:'YE-CLOSE-'+year,memo:'Year-end closing entries for '+year,lines,debit,credit,status:'Posted',yearEndClosing:true,yearEndCloseId:closeId,createdAt:now,createdBy:user,postedAt:now,postedBy:user,updatedAt:now};
    state.manualJournals=state.manualJournals||[];state.manualJournals.unshift(j);return j;
  }
  function reverseClosingJournal(state,rec,user,reason){
    const src=(state.manualJournals||[]).find(x=>x.id===rec.closingJournalId);if(!src)return null;
    const now=new Date().toISOString(),id='JRN-'+Date.now().toString(36).toUpperCase(),journalNo=nextJournalNo(state),lines=(src.lines||[]).map(x=>({...x,debit:Number(x.credit)||0,credit:Number(x.debit)||0,memo:'Reversal of year-end close '+rec.year}));
    const rev={id,journalNo,date:String(rec.year)+'-12-31',reference:'REV-'+(src.journalNo||src.id),memo:'Reversal of '+(src.journalNo||src.id)+' · '+reason,lines,debit:src.credit,credit:src.debit,status:'Posted',yearEndClosing:true,yearEndClosingReversal:true,reversalOf:src.id,createdAt:now,createdBy:user,postedAt:now,postedBy:user,updatedAt:now};
    state.manualJournals.unshift(rev);src.reversalJournalId=id;src.reversedAt=now;src.reversedBy=user;src.reversalReason=reason;return rev;
  }

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
    const now=new Date().toISOString(),snap=snapshot(state,year),user=state.session?.name||'User',id='YEC-'+Date.now().toString(36).toUpperCase();
    const closingJournal=postClosingJournal(state,year,id,user);if(!closingJournal){ctx.toast('Year-end closing journal could not be created. Review the Trial Balance.');return;}
    state.yearEndCloses=state.yearEndCloses||[];
    state.yearEndCloses.unshift({id,year,status:'Closed',checks:rd.checks.map(x=>({id:x.id,label:x.label,done:x.done,detail:x.detail})),snapshot:snap,closingJournalId:closingJournal.id,closingJournalNo:closingJournal.journalNo,retainedEarningsTransfer:round(snap.netProfit),closedAt:now,closedBy:user});
    ctx.audit('accounting.year_closed',{year,snapshot:snap,closingJournalId:closingJournal.id,closingJournalNo:closingJournal.journalNo,retainedEarningsTransfer:round(snap.netProfit)});ctx.save();ctx.toast(year+' financial year closed and profit transferred to retained earnings');ctx.render();
  }
  function openReopen(year,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen a closed financial year.');return;}
    const rec=record(state,year);if(!rec){ctx.toast('This financial year is not closed.');return;}
    state.yearReopenYear=String(year);ctx.render();
  }
  function reopenModal(state,h){
    const year=state.yearReopenYear,rec=year?record(state,year):null;if(!year||!rec)return '';
    const {icon,esc}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-year-reopen"></div><form id="year-reopen-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">YEAR-END CONTROL</div><h2>Reopen '+esc(year)+'</h2><p>The year-end closing journal will be reversed and the reason retained permanently.</p></div><button type="button" class="close" data-action="close-year-reopen">×</button></div>'+
      '<div class="payment-notice"><span>'+icon('alert',17)+'</span><div><b>Year-end accounting will be reopened</b><p>DalasiPay preserves the original closing journal and posts an opposite system reversal. Reclose the year after all corrections are complete.</p></div></div>'+
      '<div class="form-grid"><label class="field" style="grid-column:1/-1"><span>Mandatory reopen reason</span><textarea name="reason" rows="4" minlength="8" placeholder="Explain why this financial year must be reopened" required></textarea></label></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-year-reopen">Cancel</button><button class="primary" type="submit">'+icon('lock',14)+' Reopen year</button></div></form></div>';
  }
  function reopenSubmit(ev,state,ctx){
    ev.preventDefault();const year=String(state.yearReopenYear||'');
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen a closed financial year.');return;}
    const rec=record(state,year);if(!rec){state.yearReopenYear=null;ctx.toast('This financial year is not closed.');ctx.render();return;}
    const reason=String(new FormData(ev.target).get('reason')||'').trim();if(reason.length<8){ctx.toast('Enter a clear reason for reopening the financial year.');return;}
    const user=state.session?.name||'User',rev=reverseClosingJournal(state,rec,user,reason);
    rec.status='Reopened';rec.reopenedAt=new Date().toISOString();rec.reopenedBy=user;rec.reopenReason=reason;rec.closingReversalJournalId=rev?.id||'';rec.closingReversalJournalNo=rev?.journalNo||'';
    state.yearReopenYear=null;ctx.audit('accounting.year_reopened',{year,closeId:rec.id,reason,closingReversalJournalId:rec.closingReversalJournalId});ctx.save();ctx.toast(year+' financial year reopened and closing journal reversed');ctx.render();
  }
  function exportRecord(year,state,ctx){
    const rec=(state.yearEndCloses||[]).find(x=>String(x.year)===String(year));if(!rec){ctx.toast('Year-end close record not found');return;}
    const s=rec.snapshot||{},rows=[['Year-End Close',year],['Status',rec.status],['Closed by',rec.closedBy],['Closed at',rec.closedAt],['Reopened by',rec.reopenedBy||''],['Reopened at',rec.reopenedAt||''],['Reopen reason',rec.reopenReason||''],['Closing journal',rec.closingJournalNo||''],['Closing reversal journal',rec.closingReversalJournalNo||''],['Retained earnings transfer',rec.retainedEarningsTransfer||0],[],['Annual financial snapshot','Amount'],['Revenue',s.revenue],['COGS',s.cogs],['Gross profit',s.grossProfit],['Operating expenses',s.operatingExpenses],['Net profit',s.netProfit],['Total assets',s.totalAssets],['Total liabilities',s.totalLiabilities],['Total equity',s.totalEquity],['Trial Balance debits',s.trialDebits],['Trial Balance credits',s.trialCredits],[],['Control','Status','Detail'],...(rec.checks||[]).map(x=>[x.label,x.done?'Ready':'Resolve',x.detail])];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q;}).join(',')).join('\n');
    ctx.downloadText('dalasipay-year-close-'+year+'.csv',csv);ctx.toast('Year-end close record downloaded');
  }

  window.DalasiYearClose={record,isClosed,availableYears,readiness,snapshot,panel,closeYear,openReopen,reopenModal,reopenSubmit,closingLines,exportRecord};
})();