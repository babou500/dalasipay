(function(){
  'use strict';

  function periodRange(period){
    const [y,m]=String(period||'').split('-').map(Number);
    if(!y||!m)return null;
    const start=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-01';
    const last=new Date(y,m,0).getDate();
    const end=String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(last).padStart(2,'0');
    return {year:y,month:m,start,end};
  }
  function inRange(date,start,end){
    if(!date)return false;
    const d=String(date).slice(0,10);
    return d>=start&&d<=end;
  }
  function issuedInvoices(state){
    return (state.customerInvoices||[]).filter(inv=>{
      const s=window.DalasiSalesInvoices?.status?window.DalasiSalesInvoices.status(state,inv):(inv.status||'Draft');
      return s!=='Draft';
    });
  }
  function cogsForRange(state,start,end){
    let total=0,estimated=0;
    (state.inventoryMovements||[]).forEach(mv=>{
      if(mv.type!=='Sales issue'||!inRange(mv.createdAt,start,end))return;
      let amount=Number(mv.costAmount);
      if(!Number.isFinite(amount)||amount<0){
        const qty=Math.abs(Number(mv.quantity)||0);
        let unitCost=Number(mv.unitCost);
        if(!Number.isFinite(unitCost)||unitCost<0){
          const item=(state.salesCatalog||[]).find(x=>x.id===mv.catalogId);
          unitCost=Math.max(0,Number(item?.costPrice)||0);estimated++;
        }
        amount=qty*unitCost;
      }
      total+=amount;
    });
    return {total:Math.round(total*100)/100,estimated};
  }
  function payrollForPeriod(state,period){
    const run=(state.runs||[]).find(r=>r.period===period&&['Approved','Paid','Closed'].includes(r.status));
    return run?Math.max(0,Number(run.totals?.employerCost)||0):0;
  }
  function expenseBreakdown(state,start,end){
    const map=new Map(),rows=(state.businessExpenses||[]).filter(x=>['Approved','Paid'].includes(x.status)&&inRange(x.expenseDate||x.createdAt,start,end));
    rows.forEach(x=>{const k=x.category||'Other expense';map.set(k,(map.get(k)||0)+(Number(x.amount)||0));});
    const items=[...map.entries()].map(([category,amount])=>({category,amount:Math.round(amount*100)/100})).sort((a,b)=>b.amount-a.amount);
    return {total:Math.round(items.reduce((a,x)=>a+x.amount,0)*100)/100,items,count:rows.length};
  }
  function statement(state,period){
    const r=periodRange(period);if(!r)return null;
    const periodInvoices=issuedInvoices(state).filter(x=>inRange(x.issueDate||x.createdAt,r.start,r.end));
    const invoiceRevenue=periodInvoices.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const unfulfilledProductInvoices=periodInvoices.filter(inv=>window.DalasiSalesInvoices?.invoiceHasStockLines?.(state,inv)&&!inv.fulfilledAt).length;
    const directIncome=(state.revenueEntries||[]).filter(x=>inRange(x.revenueDate||x.createdAt,r.start,r.end)).reduce((a,x)=>a+(Number(x.amount)||0),0);
    const revenue=Math.round((invoiceRevenue+directIncome)*100)/100;
    const cogs=cogsForRange(state,r.start,r.end);
    const grossProfit=Math.round((revenue-cogs.total)*100)/100;
    const exp=expenseBreakdown(state,r.start,r.end);
    const payroll=payrollForPeriod(state,period);
    const operatingExpenses=Math.round((exp.total+payroll)*100)/100;
    const netProfit=Math.round((grossProfit-operatingExpenses)*100)/100;
    return {
      period,start:r.start,end:r.end,
      invoiceRevenue:Math.round(invoiceRevenue*100)/100,
      directIncome:Math.round(directIncome*100)/100,
      revenue,cogs:cogs.total,cogsEstimated:cogs.estimated,
      grossProfit,grossMargin:revenue?Math.round(grossProfit/revenue*1000)/10:0,
      businessExpenses:exp.total,expenseBreakdown:exp.items,expenseCount:exp.count,
      payroll,operatingExpenses,netProfit,netMargin:revenue?Math.round(netProfit/revenue*1000)/10:0,
      unfulfilledProductInvoices
    };
  }
  function ytd(state,period){
    const r=periodRange(period);if(!r)return null;
    const rows=[];for(let m=1;m<=r.month;m++)rows.push(statement(state,r.year+'-'+String(m).padStart(2,'0')));
    const sum=k=>Math.round(rows.reduce((a,x)=>a+(Number(x?.[k])||0),0)*100)/100;
    const revenue=sum('revenue'),grossProfit=sum('grossProfit'),netProfit=sum('netProfit');
    return {
      period:r.year+' YTD',invoiceRevenue:sum('invoiceRevenue'),directIncome:sum('directIncome'),revenue,cogs:sum('cogs'),
      grossProfit,grossMargin:revenue?Math.round(grossProfit/revenue*1000)/10:0,
      businessExpenses:sum('businessExpenses'),payroll:sum('payroll'),operatingExpenses:sum('operatingExpenses'),
      netProfit,netMargin:revenue?Math.round(netProfit/revenue*1000)/10:0,
      cogsEstimated:rows.reduce((a,x)=>a+(Number(x?.cogsEstimated)||0),0)
    };
  }
  function periodLabel(period){
    const r=periodRange(period);if(!r)return period;
    return new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric'}).format(new Date(r.year,r.month-1,1));
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));
    const addDate=d=>{const s=String(d||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(s))set.add(s);};
    (state.customerInvoices||[]).forEach(x=>addDate(x.issueDate||x.createdAt));
    (state.revenueEntries||[]).forEach(x=>addDate(x.revenueDate||x.createdAt));
    (state.businessExpenses||[]).forEach(x=>addDate(x.expenseDate||x.createdAt));
    (state.inventoryMovements||[]).forEach(x=>addDate(x.createdAt));
    const current=String(state.currentPeriod||'').match(/^\d{4}-\d{2}$/)?.[0];if(current)set.add(current);
    return [...set].sort().reverse();
  }
  function row(label,current,ytdValue,money2,bold=false,sub=false){
    return '<tr class="'+(bold?'pnl-total ':'')+(sub?'pnl-sub':'')+'"><td>'+label+'</td><td>'+money2(current)+'</td><td>'+money2(ytdValue)+'</td></tr>';
  }
  function panel(state,h){
    const money2=h.money2,esc=h.esc,icon=h.icon;
    const available=periods(state),period=state.pnlPeriod||state.currentPeriod||available[0],m=statement(state,period),y=ytd(state,period);
    if(!m||!y)return '<div class="surface employee-card"><div class="empty-inline">Profit & Loss is not available until a reporting period exists.</div></div>';
    const options=available.map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(periodLabel(p))+'</option>').join('');
    const expenseRows=m.expenseBreakdown.length?m.expenseBreakdown.map(x=>'<tr class="pnl-sub"><td>'+esc(x.category)+'</td><td>'+money2(x.amount)+'</td><td>—</td></tr>').join(''):'';
    return '<section class="surface pnl-card">'+
      '<div class="table-tools"><div><h3>Profit & Loss</h3><p>Accrual-style operating statement. Invoices count as revenue when issued; collections do not create revenue again.</p></div><div class="inline-buttons"><select id="pnl-period-select">'+options+'</select><button class="secondary" data-action="business-report-export:profit-loss">'+icon('download',14)+' CSV</button></div></div>'+
      '<div class="pnl-kpis">'+
        '<div><span>Revenue</span><b>'+money2(m.revenue)+'</b><small>'+periodLabel(period)+'</small></div>'+
        '<div><span>Gross profit</span><b>'+money2(m.grossProfit)+'</b><small>'+m.grossMargin+'% gross margin</small></div>'+
        '<div><span>Operating expenses</span><b>'+money2(m.operatingExpenses)+'</b><small>including payroll</small></div>'+
        '<div class="'+(m.netProfit<0?'pnl-loss':'')+'"><span>Net profit</span><b>'+money2(m.netProfit)+'</b><small>'+m.netMargin+'% net margin</small></div>'+
      '</div>'+
      '<div class="table-scroll"><table class="pnl-table"><thead><tr><th>PROFIT & LOSS</th><th>'+esc(periodLabel(period).toUpperCase())+'</th><th>'+esc(String(period).slice(0,4)+' YTD')+'</th></tr></thead><tbody>'+
        row('Invoice sales revenue',m.invoiceRevenue,y.invoiceRevenue,money2,true)+
        row('Direct / other income',m.directIncome,y.directIncome,money2)+
        row('Total revenue',m.revenue,y.revenue,money2,true)+
        row('Cost of goods sold',-m.cogs,-y.cogs,money2)+
        row('Gross profit',m.grossProfit,y.grossProfit,money2,true)+
        row('Business operating expenses',-m.businessExpenses,-y.businessExpenses,money2)+
        expenseRows+
        row('Payroll & employer costs',-m.payroll,-y.payroll,money2)+
        row('Total operating expenses',-m.operatingExpenses,-y.operatingExpenses,money2,true)+
        row('Net profit',m.netProfit,y.netProfit,money2,true)+
      '</tbody></table></div>'+
      (m.unfulfilledProductInvoices?'<div class="pnl-note pnl-warning">Attention: '+m.unfulfilledProductInvoices+' product invoice'+(m.unfulfilledProductInvoices===1?' is':'s are')+' issued but not yet fulfilled. Revenue is included, but matching COGS will post when stock is issued.</div>':'')+
      (m.cogsEstimated?'<div class="pnl-note">Note: '+m.cogsEstimated+' older stock issue'+(m.cogsEstimated===1?'':'s')+' use the current recorded product cost because a historical issue cost was not stored at the time.</div>':'')+
    '</section>';
  }
  function exportCsv(state,ctx){
    const period=state.pnlPeriod||state.currentPeriod, m=statement(state,period), y=ytd(state,period);if(!m||!y)return;
    const rows=[
      ['Line',period, String(period).slice(0,4)+' YTD'],
      ['Invoice sales revenue',m.invoiceRevenue,y.invoiceRevenue],
      ['Direct / other income',m.directIncome,y.directIncome],
      ['Total revenue',m.revenue,y.revenue],
      ['Cost of goods sold',m.cogs,y.cogs],
      ['Gross profit',m.grossProfit,y.grossProfit],
      ['Gross margin %',m.grossMargin,y.grossMargin],
      ['Business operating expenses',m.businessExpenses,y.businessExpenses],
      ['Payroll & employer costs',m.payroll,y.payroll],
      ['Total operating expenses',m.operatingExpenses,y.operatingExpenses],
      ['Net profit',m.netProfit,y.netProfit],
      ['Net margin %',m.netMargin,y.netMargin]
    ];
    const csv=rows.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n');
    ctx.downloadText('dalasipay-profit-loss-'+period+'.csv',csv);ctx.toast('Profit & Loss report downloaded');
  }

  window.DalasiProfitLoss={statement,ytd,periods,panel,exportCsv};
})();