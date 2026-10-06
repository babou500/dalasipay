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
    const expenses=window.DalasiExpensesPurchases?window.DalasiExpensesPurchases.expenseMetrics(state):{count:0,total:0,pending:0,approved:0,paid:0,receipts:0};
    const purchases=window.DalasiExpensesPurchases?window.DalasiExpensesPurchases.purchaseMetrics(state):{count:0,open:0,openValue:0,approval:0,ordered:0,received:0};
    const inventory=window.DalasiCatalog?window.DalasiCatalog.inventoryMetrics(state):{products:0,active:0,low:0,value:0};
    const revenue=window.DalasiRevenueIncome?window.DalasiRevenueIncome.metrics(state):{invoiceRevenue:invoiced,direct:0,total:invoiced,cashReceived:collections,invoiceCount:(state.customerInvoices||[]).length,directCount:0};
    const pnl=window.DalasiProfitLoss?window.DalasiProfitLoss.statement(state,state.pnlPeriod||state.currentPeriod):null;
    return {payments,ar,recurring,cash,payable,overduePayable,collections,outPaid,invoiced,collectionRate,expenses,purchases,inventory,revenue,pnl};
  }
  function customerRows(state){
    return (state.customers||[]).map(c=>{const a=window.DalasiBusinessPayments.customerAccount(state,c.id);return {id:c.id,name:c.name,terms:Number(c.termDays)||0,invoiced:a.invoiced,collected:a.collected,outstanding:a.outstanding,overdue:a.overdue,status:c.status||'Active'};}).sort((a,b)=>b.outstanding-a.outstanding);
  }
  function render(state,h){
    const icon=h.icon,money2=h.money2,esc=h.esc,pageTitle=h.pageTitle,m=metrics(state,h),customers=customerRows(state),topCustomers=customers.slice(0,6);
    const reports=[
      ['business-summary','Business summary','High-level inflows, outflows, receivables, payables and cash position','reports'],
      ['profit-loss','Profit & Loss','Revenue, cost of goods sold, operating expenses and net profit','chart'],
      ['accounts-receivable','Accounts receivable','Customer invoices, balances, due dates and collection status','send'],
      ['accounts-payable','Accounts payable','Supplier bills, due dates, approval state and amounts owed','file'],
      ['customer-balances','Customer balances','Outstanding and overdue balances by saved customer','employees'],
      ['revenue-register','Revenue register','Issued invoice revenue plus direct non-invoice business income','reports'],
      ['incoming-payments','Incoming payments','Recorded customer collections and receipt references','bank'],
      ['outgoing-payments','Outgoing payments','Business payment register including approval and paid status','bank'],
      ['recurring-commitments','Recurring commitments','Standing obligations and their monthly equivalent','calendar'],
      ['expense-register','Expense register','Business costs, categories, receipts and approval status','file'],
      ['purchase-orders','Purchase orders','Purchase requests, supplier commitments and receiving status','building'],
      ['inventory-summary','Inventory summary','Product stock on hand, cost value and reorder levels','building'],
      ['inventory-movements','Inventory movements','Opening balances, receipts, corrections and sales issues','file'],
      ['cash-flow','Cash flow forecast','Expected inflows and planned outflows for the next 90 days','reports']
    ];
    return tabs(state)+pageTitle('BUSINESS REPORTING','Reports','Cross-module finance reports for money in, money out, customers, bills and cash flow.',`<button class="secondary" data-action="business-report-export:business-summary">${icon('download',14)} Export summary</button>`)+
      '<div class="business-report-kpis">'+
        '<div class="surface"><span>Total revenue</span><b>'+money2(m.pnl?.revenue||0)+'</b><small>'+(state.pnlPeriod||state.currentPeriod)+' reporting period</small></div>'+
        '<div class="surface '+((m.pnl?.netProfit||0)<0?'cash-alert':'')+'"><span>Net profit</span><b>'+money2(m.pnl?.netProfit||0)+'</b><small>'+((m.pnl?.netMargin||0).toFixed?m.pnl.netMargin.toFixed(1):m.pnl?.netMargin||0)+'% net margin</small></div>'+
        '<div class="surface"><span>Outstanding receivables</span><b>'+money2(m.ar.outstanding)+'</b><small>'+money2(m.ar.overdue)+' overdue</small></div>'+
        '<div class="surface"><span>Outstanding payables</span><b>'+money2(m.payable)+'</b><small>'+money2(m.overduePayable)+' overdue</small></div>'+
      '</div>'+
      '<div class="business-report-grid">'+reports.map(r=>'<article class="surface business-report-card"><span class="business-report-icon">'+icon(r[3],18)+'</span><div><b>'+esc(r[1])+'</b><p>'+esc(r[2])+'</p></div><button class="secondary" data-action="business-report-export:'+r[0]+'">CSV</button></article>').join('')+'</div>'+
      (window.DalasiProfitLoss?window.DalasiProfitLoss.panel(state,{money2,esc,icon}):'')+
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
    if(kind==='profit-loss'){window.DalasiProfitLoss?.exportCsv(state,ctx);return;
    }else if(kind==='business-summary'){
      csv=rowsToCsv(['Metric','Value'],[['Selected P&L period',state.pnlPeriod||state.currentPeriod],['Selected-period revenue',m.pnl?.revenue||0],['Selected-period COGS',m.pnl?.cogs||0],['Selected-period gross profit',m.pnl?.grossProfit||0],['Selected-period operating expenses',m.pnl?.operatingExpenses||0],['Selected-period net profit',m.pnl?.netProfit||0],['Total revenue',m.revenue.total],['Invoice revenue',m.revenue.invoiceRevenue],['Direct non-invoice income',m.revenue.direct],['Cash received from revenue',m.revenue.cashReceived],['Outstanding receivables',m.ar.outstanding],['Overdue receivables',m.ar.overdue],['Outstanding payables',m.payable],['Overdue payables',m.overduePayable],['Collections recorded',m.collections],['Outgoing payments paid',m.outPaid],['Paid expenses',m.expenses.paid],['Expenses recorded',m.expenses.total],['Open purchase commitments',m.purchases.openValue],['Inventory at cost',m.inventory.value],['Low-stock products',m.inventory.low],['Recurring monthly equivalent',m.recurring.monthly],['30-day expected inflows',m.cash.in30],['30-day planned outflows',m.cash.out30],['30-day funding need',m.cash.need30],['30-day projected surplus',m.cash.surplus30]]);
    }else if(kind==='revenue-register'){
      const rows=window.DalasiRevenueIncome?window.DalasiRevenueIncome.ledgerRows(state):[];
      csv=rowsToCsv(['Date','Origin','Reference','Customer / Source','Category','Description','Method','Amount','Status'],rows.map(x=>[x.date,x.source,x.reference,x.party,x.category,x.description,x.method,x.amount,x.status]));
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
    }else if(kind==='expense-register'){
      csv=rowsToCsv(['Expense No','Merchant','Supplier ID','Category','Expense Date','Amount','Method','Reference','Receipt','Status','Created By'],(state.businessExpenses||[]).map(x=>[x.expenseNo||x.id,x.merchant,x.supplierId||'',x.category,x.expenseDate,x.amount,x.method,x.reference,x.receiptName||'',x.status,x.createdBy]));
    }else if(kind==='purchase-orders'){
      csv=rowsToCsv(['PO Number','Supplier','Supplier ID','Category','Description','Request Date','Required Date','Lines','Subtotal','Discount','Amount','Requested By','Reference','Status','Inventory Received'],(state.purchaseOrders||[]).map(x=>[x.poNumber||x.id,x.supplierName||'',x.supplierId||'',x.category,x.description,x.requestDate,x.requiredDate,(x.lineItems||[]).length,x.subtotal??x.amount,x.discountTotal||0,x.amount,x.requestedBy,x.reference,x.status,x.inventoryReceivedAt||'']));
    }else if(kind==='inventory-summary'){
      csv=rowsToCsv(['Code','Item','Type','Unit','Selling Price','Cost Price','Stock On Hand','Reorder Level','Stock Value','Status'],(state.salesCatalog||[]).map(x=>[x.code||x.id,x.name,x.type||'Product',x.unit||'Unit',x.unitPrice||0,x.costPrice||0,x.type==='Product'?(Number(x.stockOnHand)||0):'',x.type==='Product'?(Number(x.reorderLevel)||0):'',x.type==='Product'?((Number(x.stockOnHand)||0)*(Number(x.costPrice)||0)):'',x.status||'Active']));
    }else if(kind==='inventory-movements'){
      csv=rowsToCsv(['Movement ID','Date','Item Code','Item','Type','Quantity','Unit Cost','Balance Before','Balance After','Reference','Note','Created By'],(state.inventoryMovements||[]).map(mv=>{const item=(state.salesCatalog||[]).find(x=>x.id===mv.catalogId);return [mv.id,mv.createdAt,item?.code||'',item?.name||mv.catalogId,mv.type,mv.quantity,mv.unitCost??'',mv.balanceBefore??'',mv.balanceAfter??'',mv.reference||'',mv.note||'',mv.createdBy||''];}));
    }else if(kind==='cash-flow'){
      const items=window.DalasiBusinessPayments.cashFlowSummary(state,{payrollCalc:ctx.payrollCalc,periodLabel:ctx.periodLabel},90).items;
      csv=rowsToCsv(['Date','Direction','Source','Description','Detail','Amount','Status'],items.map(x=>[x.date,x.direction==='in'?'Inflow':'Outflow',x.source,x.label,x.detail,x.amount,x.status]));
    }else{return}
    ctx.downloadText('dalasipay-'+name+'-'+today+'.csv',csv);ctx.toast('Business report downloaded');
  }
  window.DalasiBusinessReports={render,tabs,exportReport,metrics};
})();
