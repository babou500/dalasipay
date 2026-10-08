(function(){
  'use strict';
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function yearOf(v){const y=String(v||'').slice(0,4);return /^\d{4}$/.test(y)?y:'';}
  function years(state){
    const set=new Set(),add=v=>{const y=yearOf(v);if(y)set.add(y);};
    add(state.currentPeriod);
    (state.manualJournals||[]).forEach(x=>add(x.date||x.createdAt));
    (state.customerInvoices||[]).forEach(x=>add(x.issueDate||x.createdAt));
    (state.businessExpenses||[]).forEach(x=>add(x.expenseDate||x.createdAt));
    (state.yearEndCloses||[]).forEach(x=>add(x.year));
    if(!set.size)set.add(String(new Date().getFullYear()));
    return [...set].sort().reverse();
  }
  function annualProfit(state,year){
    let total=0;
    for(let m=1;m<=12;m++){const p=year+'-'+String(m).padStart(2,'0'),s=window.DalasiProfitLoss?.statement?.(state,p);if(s)total+=Number(s.netProfit)||0;}
    return round(total);
  }
  function model(state,year){
    year=String(year||yearOf(state.currentPeriod)||new Date().getFullYear());
    const start=year+'-01-01',end=year+'-12-31',rows=window.DalasiGeneralLedger?.ledgerRows?.(state)||[];
    const isEq=x=>x.accountType==='Equity'||['Owner / Share Capital','Opening Retained Earnings','Opening Balance Equity','Retained Earnings','Owner Drawings / Distributions','Opening / Mapping Suspense'].includes(x.account);
    const opening=round(rows.filter(x=>isEq(x)&&String(x.date||'')<start).reduce((a,x)=>a+(Number(x.credit)||0)-(Number(x.debit)||0),0));
    const yr=rows.filter(x=>isEq(x)&&String(x.date||'')>=start&&String(x.date||'')<=end);
    const movement=name=>round(yr.filter(x=>x.account===name).reduce((a,x)=>a+(Number(x.credit)||0)-(Number(x.debit)||0),0));
    const capital=movement('Owner / Share Capital');
    const openingRetained=movement('Opening Retained Earnings');
    const openingBalanceEquity=movement('Opening Balance Equity');
    const drawingsBalance=movement('Owner Drawings / Distributions');
    const drawings=round(Math.max(0,-drawingsBalance));
    const suspense=movement('Opening / Mapping Suspense');
    const closingTransfers=round((state.manualJournals||[]).filter(j=>j.status==='Posted'&&j.yearEndClosing&&!j.yearEndClosingReversal&&yearOf(j.date)===year).flatMap(j=>j.lines||[]).filter(x=>x.account==='Retained Earnings').reduce((a,x)=>a+(Number(x.credit)||0)-(Number(x.debit)||0),0));
    const closingReversals=round((state.manualJournals||[]).filter(j=>j.status==='Posted'&&j.yearEndClosingReversal&&yearOf(j.date)===year).flatMap(j=>j.lines||[]).filter(x=>x.account==='Retained Earnings').reduce((a,x)=>a+(Number(x.credit)||0)-(Number(x.debit)||0),0));
    const profit=annualProfit(state,year);
    const otherEquity=round(yr.filter(x=>isEq(x)&&!['Owner / Share Capital','Opening Retained Earnings','Opening Balance Equity','Retained Earnings','Owner Drawings / Distributions','Opening / Mapping Suspense'].includes(x.account)).reduce((a,x)=>a+(Number(x.credit)||0)-(Number(x.debit)||0),0));
    const retainedNonClosing=round(yr.filter(x=>x.account==='Retained Earnings'&&!String(x.reference||'').startsWith('YE-CLOSE-')&&!String(x.reference||'').startsWith('REV-JRN-')).reduce((a,x)=>a+(Number(x.credit)||0)-(Number(x.debit)||0),0));
    const adjustedOpening=round(opening+openingRetained+openingBalanceEquity+retainedNonClosing+suspense);
    const closing=round(adjustedOpening+capital+otherEquity+profit-drawings);
    const yearClose=(state.yearEndCloses||[]).find(x=>String(x.year)===year&&x.status==='Closed')||null;
    return {year,opening,openingRetained,openingBalanceEquity,retainedNonClosing,suspense,adjustedOpening,capital,drawings,otherEquity,profit,closing,closingTransfers,closingReversals,yearClose};
  }
  function render(state,h){
    const {money2,icon}=h,yr=state.equityYear||yearOf(state.currentPeriod)||years(state)[0],m=model(state,yr),opts=years(state).map(y=>'<option value="'+esc(y)+'" '+(y===yr?'selected':'')+'>'+esc(y)+'</option>').join('');
    const rows=[
      ['Opening equity carried forward',m.opening],
      ['Opening retained earnings / migration',m.openingRetained],
      ['Opening balance equity / migration',m.openingBalanceEquity],
      ['Other retained earnings adjustments',m.retainedNonClosing],
      ['Opening / Mapping Suspense',m.suspense],
      ['Owner / Share Capital movements',m.capital],
      ['Current-year profit / (loss)',m.profit],
      ['Owner Drawings / Distributions',-m.drawings],
      ['Other equity movements',m.otherEquity]
    ];
    return '<section class="surface employee-card"><div class="table-tools"><div><h3>Statement of Changes in Equity</h3><p>Explains how opening equity, capital, profit or loss and owner distributions reconcile to closing equity.</p></div><div class="inline-buttons"><select id="equity-year-select">'+opts+'</select><button class="secondary" data-action="business-report-export:equity-statement">'+icon('download',14)+' CSV</button></div></div>'+
      '<div class="accounting-summary"><div class="surface"><span>Opening equity</span><b>'+money2(m.adjustedOpening)+'</b></div><div class="surface"><span>Owner capital movement</span><b>'+money2(m.capital)+'</b></div><div class="surface"><span>Profit / (loss)</span><b>'+money2(m.profit)+'</b></div><div class="surface"><span>Closing equity</span><b>'+money2(m.closing)+'</b></div></div>'+
      '<div class="table-scroll"><table><thead><tr><th>EQUITY MOVEMENT</th><th>AMOUNT</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r[0])+'</td><td>'+money2(r[1])+'</td></tr>').join('')+'<tr class="bs-total"><td><b>CLOSING EQUITY</b></td><td><b>'+money2(m.closing)+'</b></td></tr></tbody></table></div>'+
      (m.yearClose?'<div class="payment-notice"><span>'+icon('check',17)+'</span><div><b>'+esc(m.year)+' is closed</b><p>Closing journal '+esc(m.yearClose.closingJournalNo||'')+' transferred '+money2(m.yearClose.retainedEarningsTransfer||m.profit)+' to retained earnings.</p></div></div>':'')+
      (Math.abs(m.suspense)>.004?'<div class="payment-notice"><span>'+icon('alert',17)+'</span><div><b>Opening / Mapping Suspense remains in equity</b><p>Resolve this balance before relying on the final equity presentation.</p></div></div>':'')+
      '</section>';
  }
  function exportCsv(state,ctx){
    const year=state.equityYear||yearOf(state.currentPeriod)||years(state)[0],m=model(state,year);
    const rows=[['Statement of Changes in Equity',year],[],['Movement','Amount'],['Opening equity carried forward',m.opening],['Opening retained earnings / migration',m.openingRetained],['Opening balance equity / migration',m.openingBalanceEquity],['Other retained earnings adjustments',m.retainedNonClosing],['Opening / Mapping Suspense',m.suspense],['Owner / Share Capital movements',m.capital],['Current-year profit / (loss)',m.profit],['Owner Drawings / Distributions',-m.drawings],['Other equity movements',m.otherEquity],['Closing equity',m.closing],[],['Year-end closing journal',m.yearClose?.closingJournalNo||''],['Retained earnings transfer',m.yearClose?.retainedEarningsTransfer||0]];
    const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');
    ctx.downloadText('dalasipay-statement-of-changes-in-equity-'+year+'.csv',csv);ctx.toast('Statement of Changes in Equity downloaded');
  }
  window.DalasiEquityStatement={years,annualProfit,model,render,exportCsv};
})();