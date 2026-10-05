(function(){
  'use strict';
  function tabs(state){
    const tab=state.reportsTab||'business';
    return '<div class="reports-tabs"><button class="'+(tab==='business'?'active':'')+'" data-action="reports-tab:business">Business reports</button><button class="'+(tab==='payroll'?'active':'')+'" data-action="reports-tab:payroll">Payroll reports</button></div>';
  }
  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function metrics(state,h){
    const payments=window.DalasiBusinessPayments.summary(state.businessPayments||[]);
    const ar=window.DalasiBusinessPayments.receivableSummary(state);
    const recurring=window.DalasiBusinessPayments.recurringSummary(state);
    const cash=window.DalasiBusinessPayments.cashFlowSummary(state,{payrollCalc:h.payrollCalc,periodLabel:h.periodLabel},90);
    const today=todayIso(),bills=(state.businessBills||[]).filter(x=>x.status!=='Paid');
    const payable=bills.reduce((a,x)=>a+(Number(x.amount)||0),0),overduePayable=bills.filter(x=>x.dueDate&&x.dueDate<today).reduce((a,x)=>a+(Number(x.amount)||0),0);
    const collections=(state.incomingPayments||[]).reduce((a,x)=>a+(Number(x.amount)||0),0),outPaid=(state.businessPayments||[]).filter(x=>x.status==='Paid').reduce((a,x)=>a+(Number(x.amount)||0),0);
    const invoiced=(state.customerInvoices||[]).reduce((a,x)=>a+(Number(x.amount)||0),0),collectionRate=invoiced?Math.round(collections/invoiced*100):0;
    return {payments,ar,recurring,cash,payable,overduePayable,collections,outPaid,invoiced,collectionRate};
  }
  function customerRows(state){
    return (state.customers||[]).map(c=>{const a=window.DalasiBusinessPayments.customerAccount(state,c.id);return {id:c.id,name:c.name,terms:Number(c.termDays)||0,invoiced:a.invoiced,collected:a.collected,outstanding:a.outstanding,overdue:a.overdue,status:c.status||'Active'};}).sort((a,b)=>b.outstanding-a.outstanding);
  }
  function render(state,h){
    const icon=h.icon,money2=h.money2,esc=h.esc,pageTitle=h.pageTitle,m=metrics(state,h),customers=customerRows(state),topCustomers=customers.slice(0,6);
    const reports=[
      ['business-summary','Business summary','High-level inflows, outflows, receivables, payables and cash position','reports'],
      ['accounts-receivable','Accounts receivable','Customer invoices, balances, due dates and collection status','send'],
      ['accounts-payable','Accounts payable','Supplier bills, due dates, approval state and amounts owed','file'],
      ['customer-balances','Customer balances','Outstanding and overdue balances by saved customer','employees'],
      ['incoming-payments','Incoming payments','Recorded customer collections and receipt references','bank'],
      ['outgoing-payments','Outgoing payments','Business payment register including approval and paid status','bank'],
      ['recurring-commitments','Recurring commitments','Standing obligations and their monthly equivalent','calendar'],
      ['cash-flow','Cash flow forecast','Expected inflows and planned outflows for the next 90 days','reports']
    ];
    return tabs(state)+pageTitle('BUSINESS REPORTING','Reports','Cross-module finance reports for money in, money out, customers, bills and cash flow.',`<button class="secondary" data-action="business-report-export:business-summary">${icon('download',14)} Export summary</button>`)+
      '<div class="business-report-kpis">'+
        '<div class="surface"><span>Outstanding receivables</span><b>'+money2(m.ar.outstanding)+'</b><small>'+money2(m.ar.overdue)+' overdue</small></div>'+
        '<div class="surface"><span>Outstanding payables</span><b>'+money2(m.payable)+'</b><small>'+money2(m.overduePayable)+' overdue</small></div>'+
        '<div class="surface"><span>Collections recorded</span><b>'+money2(m.collections)+'</b><small>'+m.collectionRate+'% of invoiced value</small></div>'+
        '<div class="surface"><span>30-day funding need</span><b>'+(m.cash.need30?money2(m.cash.need30):money2(m.cash.surplus30))+'</b><small>'+(m.cash.need30?'funding required':'projected surplus')+'</small></div>'+
      '</div>'+
      '<div class="business-report-grid">'+reports.map(r=>'<article class="surface business-report-card"><span class="business-report-icon">'+icon(r[3],18)+'</span><div><b>'+esc(r[1])+'</b><p>'+esc(r[2])+'</p></div><button class="secondary" data-action="business-report-export:'+r[0]+'">CSV</button></article>').join('')+'</div>'+
      '<div class="business-report-two">'+
        '<section class="surface"><div class="card-head"><div><h3>Receivables vs payables</h3><p>Current open obligations</p></div></div><div class="report-balance-bars"><div><span>Money due in</span><b>'+money2(m.ar.outstanding)+'</b><i><em style="width:'+(Math.max(m.ar.outstanding,m.payable)?Math.round(m.ar.outstanding/Math.max(m.ar.outstanding,m.payable)*100):0)+'%"></em></i></div><div><span>Money due out</span><b>'+money2(m.payable)+'</b><i><em style="width:'+(Math.max(m.ar.outstanding,m.payable)?Math.round(m.payable/Math.max(m.ar.outstanding,m.payable)*100):0)+'%"></em></i></div></div></section>'+
        '<section class="surface"><div class="card-head"><div><h3>90-day cash outlook</h3><p>Expected customer receipts against planned outflows</p></div></div><div class="cash-report-summary"><div><span>Expected in</span><b>'+money2(m.cash.in90)+'</b></div><div><span>Planned out</span><b>'+money2(m.cash.out90)+'</b></div><div><span>'+(m.cash.need90?'Funding need':'Surplus')+'</span><b>'+money2(m.cash.need90||m.cash.surplus90)+'</b></div></div></section>'+
      '</div>'+
      '<section class="surface business-customer-report"><div class="card-head"><div><h3>Largest customer balances</h3><p>Open balances by saved customer</p></div><button class="secondary" data-action="business-report-export:customer-balances">Export CSV</button></div>'+
        (topCustomers.length?'<div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>INVOICED</th><th>COLLECTED</th><th>OUTSTANDING</th><th>OVERDUE</th><th>TERMS</th></tr></thead><tbody>'+topCustomers.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+money2(x.invoiced)+'</td><td>'+money2(x.collected)+'</td><td><b>'+money2(x.outstanding)+'</b></td><td>'+money2(x.overdue)+'</td><td>'+(x.terms?'Net '+x.terms:'Due on receipt')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty-inline">No saved customer balances yet.</div>')+'</section>';
  }
  function csvEscape(v){const s=String(v??'');return /[\",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function rowsToCsv(headers,rows){return [headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n');}
  function exportReport(kind,state,ctx){
    const m=metrics(state,ctx),today=todayIso();let csv='',name=kind;
    if(kind==='business-summary'){
      csv=rowsToCsv(['Metric','Value'],[['Outstanding receivables',m.ar.outstanding],['Overdue receivables',m.ar.overdue],['Outstanding payables',m.payable],['Overdue payables',m.overduePayable],['Collections recorded',m.collections],['Outgoing payments paid',m.outPaid],['Recurring monthly equivalent',m.recurring.monthly],['30-day expected inflows',m.cash.in30],['30-day planned outflows',m.cash.out30],['30-day funding need',m.cash.need30],['30-day projected surplus',m.cash.surplus30]]);
    }else if(kind==='accounts-receivable'){
      csv=rowsToCsv(['Invoice ID','Invoice No','Customer','Issue Date','Due Date','Amount','Received','Balance','Status'],(state.customerInvoices||[]).map(inv=>[inv.id,inv.invoiceNo,inv.customerName,inv.issueDate,inv.dueDate,inv.amount,(state.incomingPayments||[]).filter(p=>p.invoiceId===inv.id).reduce((a,p)=>a+(Number(p.amount)||0),0),Math.max(0,(Number(inv.amount)||0)-(state.incomingPayments||[]).filter(p=>p.invoiceId===inv.id).reduce((a,p)=>a+(Number(p.amount)||0),0)),inv.status]));
    }else if(kind==='accounts-payable'){
      csv=rowsToCsv(['Bill ID','Supplier','Invoice No','Invoice Date','Due Date','Amount','Status','Linked Payment'],(state.businessBills||[]).map(b=>[b.id,b.supplier,b.invoiceNo,b.invoiceDate,b.dueDate,b.amount,b.status,b.paymentId||'']));
    }else if(kind==='customer-balances'){
      csv=rowsToCsv(['Customer ID','Customer','Status','Payment Terms Days','Invoiced','Collected','Outstanding','Overdue'],customerRows(state).map(x=>[x.id,x.name,x.status,x.terms,x.invoiced,x.collected,x.outstanding,x.overdue]));
    }else if(kind==='incoming-payments'){
      csv=rowsToCsv(['Receipt No','Customer','Invoice ID','Amount','Received Date','Method','Reference','Recorded By'],(state.incomingPayments||[]).map(p=>[p.receiptNumber||p.id,p.customerName,p.invoiceId,p.amount,p.receivedDate,p.method,p.reference,p.createdBy]));
    }else if(kind==='outgoing-payments'){
      csv=rowsToCsv(['Payment ID','Payee','Type','Amount','Method','Due Date','Reference','Status','Voucher No','Receipt No'],(state.businessPayments||[]).map(p=>[p.id,p.payee,p.type,p.amount,p.method,p.dueDate,p.reference,p.status,p.voucherNumber||'',p.receiptNumber||'']));
    }else if(kind==='recurring-commitments'){
      csv=rowsToCsv(['Recurring ID','Name','Payee','Amount','Frequency','Next Due Date','Monthly Equivalent','Method','Status'],(state.recurringBusinessPayments||[]).map(r=>[r.id,r.name,r.payee,r.amount,r.frequency,r.nextDueDate,r.frequency==='Weekly'?(Number(r.amount)||0)*52/12:r.frequency==='Quarterly'?(Number(r.amount)||0)/3:r.frequency==='Yearly'?(Number(r.amount)||0)/12:Number(r.amount)||0,r.method,r.status]));
    }else if(kind==='cash-flow'){
      const items=window.DalasiBusinessPayments.cashFlowSummary(state,{payrollCalc:ctx.payrollCalc,periodLabel:ctx.periodLabel},90).items;
      csv=rowsToCsv(['Date','Direction','Source','Description','Detail','Amount','Status'],items.map(x=>[x.date,x.direction==='in'?'Inflow':'Outflow',x.source,x.label,x.detail,x.amount,x.status]));
    }else{return}
    ctx.downloadText('dalasipay-'+name+'-'+today+'.csv',csv);ctx.toast('Business report downloaded');
  }
  window.DalasiBusinessReports={render,tabs,exportReport,metrics};
})();
