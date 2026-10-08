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
    const cash=window.DalasiBusinessPayments.cashFlowSummary(state,{payrollCalc:h.payrollCalc,periodLabel:h.periodLabel},90),cashForecast=window.DalasiCashFlow?.forecast?.(state,{payrollCalc:h.payrollCalc},90)||{start:0,inflows:0,outflows:0,closing:0,minBalance:0,firstDeficit:''};
    const today=todayIso(),bills=(state.businessBills||[]).filter(x=>['Approved','Part paid','Paid'].includes(x.status||'Draft')),billBal=x=>window.DalasiReturns?.billBalance?.(state,x)??(Number(x.amount)||0);
    const payable=bills.reduce((a,x)=>a+billBal(x),0),overduePayable=bills.filter(x=>billBal(x)>0&&x.dueDate&&x.dueDate<today).reduce((a,x)=>a+billBal(x),0);
    const grossCollections=(state.incomingPayments||[]).reduce((a,x)=>a+(Number(x.amount)||0),0),customerRefunds=(state.customerRefunds||[]).reduce((a,x)=>a+(Number(x.amount)||0),0),collections=Math.max(0,grossCollections-customerRefunds),outPaid=(state.businessPayments||[]).filter(x=>x.status==='Paid').reduce((a,x)=>a+(Number(x.amount)||0),0);
    const grossInvoiced=(state.customerInvoices||[]).reduce((a,x)=>a+(Number(x.amount)||0),0),invoiceCredits=(state.customerCreditNotes||[]).filter(x=>x.status!=='Void').reduce((a,x)=>a+(Number(x.amount)||0),0),invoiceDebits=(state.customerDebitNotes||[]).filter(x=>x.status!=='Void').reduce((a,x)=>a+(Number(x.amount)||0),0),invoiced=Math.max(0,grossInvoiced+invoiceDebits-invoiceCredits),collectionRate=invoiced?Math.round(collections/invoiced*100):0;
    const expenses=window.DalasiExpensesPurchases?window.DalasiExpensesPurchases.expenseMetrics(state):{count:0,total:0,pending:0,approved:0,paid:0,receipts:0};
    const purchases=window.DalasiExpensesPurchases?window.DalasiExpensesPurchases.purchaseMetrics(state):{count:0,open:0,openValue:0,approval:0,ordered:0,received:0};
    const inventory=window.DalasiCatalog?window.DalasiCatalog.inventoryMetrics(state):{products:0,active:0,low:0,value:0};
    const revenue=window.DalasiRevenueIncome?window.DalasiRevenueIncome.metrics(state):{invoiceRevenue:invoiced,direct:0,total:invoiced,cashReceived:collections,invoiceCount:(state.customerInvoices||[]).length,directCount:0};
    const pnl=window.DalasiProfitLoss?window.DalasiProfitLoss.statement(state,state.pnlPeriod||state.currentPeriod):null;
    const balanceSheet=window.DalasiBalanceSheet?window.DalasiBalanceSheet.statement(state):null;
    const cashBank=window.DalasiCashBank?window.DalasiCashBank.totals(state):{accounts:0,total:0,bank:0,mobile:0,cash:0};
    const fixedAssets=window.DalasiFixedAssets?window.DalasiFixedAssets.summary(state):{count:0,active:0,cost:0,accumulated:0,netBookValue:0};
    const returns=window.DalasiReturns?window.DalasiReturns.summary(state):{customerCredits:0,supplierCredits:0,customerRefundDue:0,supplierRefundDue:0,customerNotes:0,supplierNotes:0},debits=window.DalasiDebits?window.DalasiDebits.summary(state):{customerDebits:0,supplierDebits:0,customerNotes:0,supplierNotes:0},budgetYear=String(state.budgetYear||state.currentPeriod||'').slice(0,4),budgetMonth=String(state.budgetMonth||state.currentPeriod||'').slice(-2),budget=window.DalasiBudgets?window.DalasiBudgets.summary(state,budgetYear,budgetMonth):{lines:0,ytdBudgetProfit:0,ytdActualProfit:0,annualBudgetProfit:0,annualActualProfit:0},loans=window.DalasiLoans?window.DalasiLoans.summary(state):{active:0,outstanding:0,interestPayable:0},credit=window.DalasiCreditControl?window.DalasiCreditControl.summary(state):{ar:{},ap:{},highRisk:0,onHold:0,overLimit:0};
    return {payments,ar,recurring,cash,payable,overduePayable,collections,outPaid,invoiced,collectionRate,expenses,purchases,inventory,revenue,pnl,balanceSheet,cashBank,fixedAssets,budget,loans,cashForecast,credit,returns,debits};
  }
  function customerRows(state){
    return (state.customers||[]).map(c=>{const a=window.DalasiBusinessPayments.customerAccount(state,c.id);return {id:c.id,name:c.name,terms:Number(c.termDays)||0,invoiced:a.invoiced,collected:a.collected,outstanding:a.outstanding,overdue:a.overdue,status:c.status||'Active'};}).sort((a,b)=>b.outstanding-a.outstanding);
  }
  function reportCategory(kind){
    const groups={
      financial:['business-summary','profit-loss','balance-sheet','equity-statement','trial-balance','general-ledger'],
      treasury:['cash-bank-register','bank-reconciliations','cash-flow-statement','cash-forecast','loan-register'],
      sales:['accounts-receivable','receivables-aging','credit-control','customer-balances','revenue-register','incoming-payments','customer-debit-notes','customer-credit-notes'],
      purchases:['accounts-payable','payables-aging','outgoing-payments','recurring-commitments','expense-register','purchase-orders','supplier-debit-notes','supplier-credit-notes'],
      inventory:['fixed-assets','inventory-summary','product-margin','inventory-movements'],
      management:['vat-return','budget-vs-actual','project-profitability','cost-centre-performance','month-end-close','year-end-close']
    };
    return Object.entries(groups).find(([,items])=>items.includes(kind))?.[0]||'management';
  }
  function categoryLabel(key){return ({all:'All reports',financial:'Financial statements',treasury:'Cash & treasury',sales:'Sales & receivables',purchases:'Purchases & payables',inventory:'Inventory & assets',management:'Management & compliance'})[key]||key;}
  function render(state,h){
    const icon=h.icon,money2=h.money2,pill=h.pill,esc=h.esc,pageTitle=h.pageTitle,m=metrics(state,h),customers=customerRows(state),topCustomers=customers.slice(0,6);
    const reports=[
      ['business-summary','Business summary','High-level inflows, outflows, receivables, payables and cash position','reports'],
      ['profit-loss','Profit & Loss','Revenue, cost of goods sold, operating expenses and net profit','chart'],
      ['balance-sheet','Balance Sheet','Assets, liabilities and equity with automatic operational balances','building'],
      ['equity-statement','Statement of Changes in Equity','Opening equity, capital movements, profit or loss, drawings and retained earnings','reports'],
      ['trial-balance','Trial Balance','Debit and credit balances across the generated chart of accounts','reports'],
      ['general-ledger','General Ledger','Journal lines by account, source document and reference','file'],
      ['cash-bank-register','Cash & Bank register','Bank, mobile-money and cash-account balances and movements','bank'],
      ['bank-reconciliations','Bank reconciliations','Finalized statement reconciliations, cleared items and outstanding differences','check'],
      ['fixed-assets','Fixed asset register','Asset cost, accumulated depreciation, net book value and disposal status','building'],
      ['vat-return','VAT return working paper','Output VAT, recoverable input VAT, filing due date and net GRA position','shield'],
      ['budget-vs-actual','Budget vs Actual','Annual and YTD targets compared with live P&L performance','chart'],
      ['project-profitability','Project profitability','Revenue, COGS, operating costs, payroll and profit by project','building'],
      ['cost-centre-performance','Cost centre performance','Operating activity and payroll employer cost by cost centre','reports'],
      ['loan-register','Loans & Debt','Outstanding principal, interest accruals and repayment schedule','bank'],
      ['month-end-close','Month-End Close','Review accounting controls, lock completed periods and preserve close snapshots','shield'],
      ['year-end-close','Year-End Close','Manually close the financial year after all 12 monthly periods are closed','shield'],
      ['customer-debit-notes','Customer debit notes','Additional customer charges, VAT additions and receivable increases','file'],
      ['customer-credit-notes','Customer credit notes','Credits, VAT reversals, returned goods and customer refunds','file'],
      ['supplier-debit-notes','Supplier debit notes','Additional supplier charges, input VAT and payable increases','file'],
      ['supplier-credit-notes','Supplier credit notes','Supplier bill credits, purchase returns and refunds receivable','file'],
      ['accounts-receivable','Accounts receivable','Customer invoices, balances, due dates and collection status','send'],
      ['receivables-aging','Receivables ageing','Current, 1–30, 31–60, 61–90 and 90+ customer balances','shield'],
      ['credit-control','Credit control register','Customer exposure, limits, holds, risk and collection follow-ups','employees'],
      ['accounts-payable','Accounts payable','Supplier bills, due dates, approval state and amounts owed','file'],
      ['payables-aging','Payables ageing','Current, 1–30, 31–60, 61–90 and 90+ supplier balances','calendar'],
      ['customer-balances','Customer balances','Outstanding and overdue balances by saved customer','employees'],
      ['revenue-register','Revenue register','Issued invoice revenue plus direct non-invoice business income','reports'],
      ['incoming-payments','Incoming payments','Recorded customer collections and receipt references','bank'],
      ['outgoing-payments','Outgoing payments','Business payment register including approval and paid status','bank'],
      ['recurring-commitments','Recurring commitments','Standing obligations and their monthly equivalent','calendar'],
      ['expense-register','Expense register','Business costs, categories, receipts and approval status','file'],
      ['purchase-orders','Purchase orders','Purchase requests, supplier commitments and receiving status','building'],
      ['inventory-summary','Inventory valuation','Weighted-average / FIFO stock value, ageing and reorder levels','building'],
      ['product-margin','Product gross margin','Product revenue, COGS, gross profit and margin by reporting period','chart'],
      ['inventory-movements','Inventory movements','Opening balances, receipts, corrections and sales issues','file'],
      ['cash-flow-statement','Cash Flow Statement','Operating, investing and financing cash movements from the cashbook','reports'],
      ['cash-forecast','Cash Forecast','30–90 day liquidity outlook from receivables, payables, payroll, VAT and loans','chart']
    ];
    const category=state.businessReportCategory||'all',categories=['all','financial','treasury','sales','purchases','inventory','management'];
    const visibleReports=category==='all'?reports:reports.filter(r=>reportCategory(r[0])===category);
    return tabs(state)+pageTitle('BUSINESS REPORTING','Reports','View, review and export live finance reports across the business.',`<button class="secondary" data-action="business-report-view:business-summary">${icon('eye',14)} View summary</button><button class="secondary" data-action="business-report-export:business-summary">${icon('download',14)} CSV</button>`)+
      '<div class="business-report-kpis">'+
        '<div class="surface"><span>Total revenue</span><b>'+money2(m.pnl?.revenue||0)+'</b><small>'+(state.pnlPeriod||state.currentPeriod)+' reporting period</small></div>'+
        '<div class="surface '+((m.pnl?.netProfit||0)<0?'cash-alert':'')+'"><span>Net profit</span><b>'+money2(m.pnl?.netProfit||0)+'</b><small>'+Number(m.pnl?.netMargin||0).toFixed(1)+'% net margin</small></div>'+
        '<div class="surface"><span>Outstanding receivables</span><b>'+money2(m.ar.outstanding)+'</b><small>'+money2(m.ar.overdue)+' overdue</small></div>'+
        '<div class="surface"><span>Outstanding payables</span><b>'+money2(m.payable)+'</b><small>'+money2(m.overduePayable)+' overdue</small></div>'+
      '</div>'+
      '<section class="surface report-library"><div class="report-library-toolbar"><div><h3>Report library</h3><p>Open a report on-screen, review the live figures, then print or export when needed.</p></div><label class="report-library-search">'+icon('search',14)+'<input id="report-library-search" placeholder="Search reports"></label></div>'+
      '<div class="report-category-tabs">'+categories.map(k=>'<button class="'+(category===k?'active':'')+'" data-action="report-category:'+k+'">'+esc(categoryLabel(k))+'<span>'+reports.filter(r=>k==='all'||reportCategory(r[0])===k).length+'</span></button>').join('')+'</div>'+
      '<div class="report-library-meta"><b>'+visibleReports.length+' report'+(visibleReports.length===1?'':'s')+'</b><span>'+esc(categoryLabel(category))+'</span></div>'+
      '<div class="business-report-grid" id="report-library-grid">'+visibleReports.map(r=>'<article class="surface business-report-card" data-report-card data-report-search="'+esc((r[1]+' '+r[2]+' '+categoryLabel(reportCategory(r[0]))).toLowerCase())+'"><span class="business-report-icon">'+icon(r[3],18)+'</span><div><small>'+esc(categoryLabel(reportCategory(r[0])))+'</small><b>'+esc(r[1])+'</b><p>'+esc(r[2])+'</p></div><div class="report-card-actions"><button class="primary tiny" data-action="business-report-view:'+r[0]+'">'+icon('eye',12)+' View</button><button class="secondary tiny" data-action="business-report-export:'+r[0]+'">CSV</button></div></article>').join('')+'</div>'+
      '<div class="report-library-empty" id="report-library-empty" hidden>No reports match your search.</div></section>'+
      '<div class="business-report-two">'+
        '<section class="surface"><div class="card-head"><div><h3>Receivables vs payables</h3><p>Current open obligations</p></div></div><div class="report-balance-bars"><div><span>Money due in</span><b>'+money2(m.ar.outstanding)+'</b><i><em style="width:'+(Math.max(m.ar.outstanding,m.payable)?Math.round(m.ar.outstanding/Math.max(m.ar.outstanding,m.payable)*100):0)+'%"></em></i></div><div><span>Money due out</span><b>'+money2(m.payable)+'</b><i><em style="width:'+(Math.max(m.ar.outstanding,m.payable)?Math.round(m.payable/Math.max(m.ar.outstanding,m.payable)*100):0)+'%"></em></i></div></div></section>'+
        '<section class="surface"><div class="card-head"><div><h3>90-day cash outlook</h3><p>Receivables, obligations, payroll, VAT, loans and commitments</p></div></div><div class="cash-report-summary"><div><span>Expected in</span><b>'+money2(m.cashForecast.inflows)+'</b></div><div><span>Planned out</span><b>'+money2(m.cashForecast.outflows)+'</b></div><div><span>Projected closing</span><b>'+money2(m.cashForecast.closing)+'</b></div></div></section>'+
      '</div>'+
      '<section class="surface business-customer-report"><div class="card-head"><div><h3>Largest customer balances</h3><p>Open balances by saved customer</p></div><button class="secondary" data-action="business-report-export:customer-balances">Export CSV</button></div>'+
        (topCustomers.length?'<div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>INVOICED</th><th>COLLECTED</th><th>OUTSTANDING</th><th>OVERDUE</th><th>TERMS</th></tr></thead><tbody>'+topCustomers.map(x=>'<tr><td><b>'+esc(x.name)+'</b></td><td>'+money2(x.invoiced)+'</td><td>'+money2(x.collected)+'</td><td><b>'+money2(x.outstanding)+'</b></td><td>'+money2(x.overdue)+'</td><td>'+(x.terms?'Net '+x.terms:'Due on receipt')+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty-inline">No saved customer balances yet.</div>')+'</section>';
  }
  function reportTitle(kind){
    const map={
      'business-summary':'Business summary','profit-loss':'Profit & Loss','balance-sheet':'Balance Sheet','equity-statement':'Statement of Changes in Equity','cash-flow-statement':'Cash Flow Statement','vat-return':'VAT return working paper',
      'accounts-receivable':'Accounts receivable','accounts-payable':'Accounts payable','customer-balances':'Customer balances','expense-register':'Expense register','purchase-orders':'Purchase orders','inventory-summary':'Inventory valuation',
      'trial-balance':'Trial Balance','general-ledger':'General Ledger','cash-bank-register':'Cash & Bank register','bank-reconciliations':'Bank reconciliations','fixed-assets':'Fixed asset register',
      'budget-vs-actual':'Budget vs Actual','project-profitability':'Project profitability','cost-centre-performance':'Cost centre performance','loan-register':'Loans & Debt','month-end-close':'Month-End Close','year-end-close':'Year-End Close',
      'customer-debit-notes':'Customer debit notes','customer-credit-notes':'Customer credit notes','supplier-debit-notes':'Supplier debit notes','supplier-credit-notes':'Supplier credit notes',
      'receivables-aging':'Receivables ageing','credit-control':'Credit control register','payables-aging':'Payables ageing','revenue-register':'Revenue register','incoming-payments':'Incoming payments','outgoing-payments':'Outgoing payments',
      'recurring-commitments':'Recurring commitments','product-margin':'Product gross margin','inventory-movements':'Inventory movements','cash-forecast':'Cash Forecast'
    };return map[kind]||String(kind||'Report').replace(/-/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
  }
  function previewTable(headers,rows,esc){
    const head='<thead><tr>'+headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead>';
    const body=rows.length?rows.map(r=>'<tr>'+r.map((x,i)=>'<td'+(i===0?' class="report-key-cell"':'')+'>'+x+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+headers.length+'"><div class="empty-inline">No records available for this report.</div></td></tr>';
    return '<div class="table-scroll"><table class="report-preview-table">'+head+'<tbody>'+body+'</tbody></table></div>';
  }
  function viewReport(kind,state,h){
    const {money2,esc,icon}=h,title=reportTitle(kind),m=metrics(state,h),period=state.pnlPeriod||state.currentPeriod;
    if(kind==='profit-loss'&&window.DalasiProfitLoss)return window.DalasiProfitLoss.panel(state,h);
    if(kind==='balance-sheet'&&window.DalasiBalanceSheet)return window.DalasiBalanceSheet.panel(state,h);
    if(kind==='equity-statement'&&window.DalasiEquityStatement)return window.DalasiEquityStatement.render(state,h);
    if(kind==='business-summary'){
      return '<div class="report-preview-kpis"><div><span>Revenue</span><b>'+money2(m.pnl?.revenue||0)+'</b></div><div><span>Net profit</span><b>'+money2(m.pnl?.netProfit||0)+'</b></div><div><span>Receivables</span><b>'+money2(m.ar.outstanding||0)+'</b></div><div><span>Payables</span><b>'+money2(m.payable||0)+'</b></div><div><span>Cash</span><b>'+money2(m.cashBank?.total||0)+'</b></div><div><span>Inventory</span><b>'+money2(m.inventory?.value||0)+'</b></div></div>';
    }
    if(kind==='cash-flow-statement'&&window.DalasiCashFlow){
      const s=window.DalasiCashFlow.statement(state,state.cashStatementPeriod||state.currentPeriod),rows=[];
      ['Operating','Investing','Financing'].forEach(k=>{rows.push(['<b>'+k+' activities</b>',money2(s.sections[k].net)]);s.sections[k].rows.forEach(x=>rows.push([esc(x.label),money2(x.net)]));});
      rows.push(['<b>Net change in cash</b>','<b>'+money2(s.net)+'</b>'],['Opening cash',money2(s.opening)],['<b>Closing cash</b>','<b>'+money2(s.closing)+'</b>']);
      return '<div class="report-preview-kpis"><div><span>Opening cash</span><b>'+money2(s.opening)+'</b></div><div><span>Net movement</span><b>'+money2(s.net)+'</b></div><div><span>Closing cash</span><b>'+money2(s.closing)+'</b></div><div><span>Reconciled</span><b>'+s.reconPct+'%</b></div></div>'+previewTable(['Cash flow line','Amount'],rows,esc);
    }
    if(kind==='vat-return'&&window.DalasiTax){
      const s=window.DalasiTax.returnSummary(state,state.taxPeriod||state.currentPeriod);
      const rows=[['Standard-rated sales · net',money2(s.stdSalesNet)],['Standard-rated sales · gross',money2(s.stdSalesGross)],['Zero-rated sales',money2(s.zeroSales)],['Exempt sales',money2(s.exemptSales)],['Output VAT',money2(s.totalOutput)],['Recoverable input VAT',money2(s.totalInput)],['Net VAT',money2(s.netVat)],['Payments recorded',money2(s.payments)],['Outstanding',money2(s.outstanding)]];
      return '<div class="report-preview-kpis"><div><span>Output VAT</span><b>'+money2(s.totalOutput)+'</b></div><div><span>Input VAT</span><b>'+money2(s.totalInput)+'</b></div><div><span>Net VAT</span><b>'+money2(s.netVat)+'</b></div><div><span>Due date</span><b>'+esc(s.dueDate||'—')+'</b></div></div>'+previewTable(['VAT working paper','Amount'],rows,esc);
    }
    if(kind==='receivables-aging'&&window.DalasiCreditControl){
      const lines=window.DalasiCreditControl.receivableLines(state),tot=window.DalasiCreditControl.bucketTotals(lines);
      const kpis='<div class="report-preview-kpis">'+['Current','1-30','31-60','61-90','90+'].map(k=>'<div><span>'+esc(k==='Current'?'Current / not due':k+' days')+'</span><b>'+money2(tot[k])+'</b></div>').join('')+'<div><span>Total outstanding</span><b>'+money2(tot.total)+'</b></div></div>';
      const rows=lines.slice().sort((a,b)=>b.daysPastDue-a.daysPastDue||b.balance-a.balance).map(x=>[
        '<button class="secondary tiny" data-action="source-open:customer-account:'+esc(x.customerId)+'">'+esc(x.customer)+'</button>',
        '<button class="secondary tiny" data-action="source-open:customer-invoice:'+esc(x.id)+'">'+esc(x.invoiceNo)+'</button>',
        esc(x.dueDate||'—'),money2(x.balance),String(x.daysPastDue),esc(x.bucket),esc(x.status)
      ]);
      return kpis+previewTable(['Customer','Invoice','Due date','Balance','Days past due','Age bucket','Status'],rows,esc);
    }
    if(kind==='payables-aging'&&window.DalasiCreditControl){
      const lines=window.DalasiCreditControl.payableLines(state),tot=window.DalasiCreditControl.bucketTotals(lines);
      const kpis='<div class="report-preview-kpis">'+['Current','1-30','31-60','61-90','90+'].map(k=>'<div><span>'+esc(k==='Current'?'Current / not due':k+' days')+'</span><b>'+money2(tot[k])+'</b></div>').join('')+'<div><span>Total outstanding</span><b>'+money2(tot.total)+'</b></div></div>';
      const rows=lines.slice().sort((a,b)=>b.daysPastDue-a.daysPastDue||b.balance-a.balance).map(x=>[
        x.supplierId?'<button class="secondary tiny" data-action="source-open:supplier-account:'+esc(x.supplierId)+'">'+esc(x.supplier)+'</button>':esc(x.supplier),
        '<button class="secondary tiny" data-action="source-open:supplier-bill:'+esc(x.id)+'">'+esc(x.invoiceNo)+'</button>',
        esc(x.dueDate||'—'),money2(x.balance),String(x.daysPastDue),esc(x.bucket),esc(x.status)
      ]);
      return kpis+previewTable(['Supplier','Bill','Due date','Balance','Days past due','Age bucket','Status'],rows,esc);
    }
    if(kind==='accounts-receivable'){
      const rows=(state.customerInvoices||[]).filter(x=>(window.DalasiSalesInvoices?.status?.(state,x)||x.status)!=='Draft').map(x=>[esc(x.invoiceNo||x.id),esc(x.customerName||''),esc(x.dueDate||''),money2(window.DalasiReturns?.invoiceBalance?.(state,x)??x.amount),esc(window.DalasiSalesInvoices?.status?.(state,x)||x.status||'')]);
      return previewTable(['Invoice','Customer','Due','Balance','Status'],rows,esc);
    }
    if(kind==='accounts-payable'){
      const rows=(state.businessBills||[]).filter(x=>['Approved','Part paid','Paid'].includes(x.status||'Draft')).map(x=>[esc(x.invoiceNo||x.id),esc(x.supplier||''),esc(x.dueDate||''),money2(window.DalasiReturns?.billBalance?.(state,x)??x.amount),esc(x.status||'')]);
      return previewTable(['Bill','Supplier','Due','Balance','Status'],rows,esc);
    }
    if(kind==='customer-balances'){
      const rows=customerRows(state).map(x=>[esc(x.name),money2(x.invoiced),money2(x.collected),money2(x.outstanding),money2(x.overdue),x.terms?'Net '+x.terms:'Due on receipt']);
      return previewTable(['Customer','Invoiced','Collected','Outstanding','Overdue','Terms'],rows,esc);
    }
    if(kind==='expense-register'){
      const rows=(state.businessExpenses||[]).map(x=>[esc(x.expenseNo||x.id),esc(x.merchant||''),esc(x.category||''),esc(x.expenseDate||''),money2(x.amount),esc(x.status||'')]);
      return previewTable(['Ref','Merchant','Category','Date','Amount','Status'],rows,esc);
    }
    if(kind==='purchase-orders'){
      const rows=(state.purchaseOrders||[]).map(x=>[esc(x.poNumber||x.id),esc(x.supplierName||''),esc(x.requiredDate||''),money2(x.amount),esc(x.status||'')]);
      return previewTable(['PO','Supplier','Required','Amount','Status'],rows,esc);
    }
    if(kind==='inventory-summary'){
      const rows=(state.salesCatalog||[]).filter(x=>x.type==='Product').map(x=>{const v=window.DalasiInventory?.valuation?.(state,x)||{quantity:x.stockOnHand||0,unitCost:x.costPrice||0,value:(Number(x.stockOnHand)||0)*(Number(x.costPrice)||0)};return [esc(x.code||x.id),esc(x.name),String(v.quantity||0),money2(v.unitCost||0),money2(v.value||0),String(x.reorderLevel||0)];});
      return previewTable(['Code','Product','On hand','Unit cost','Stock value','Reorder level'],rows,esc);
    }
    const routeMap={'trial-balance':'accounting','general-ledger':'accounting','cash-bank-register':'cashbank','bank-reconciliations':'cashbank','fixed-assets':'assets','budget-vs-actual':'budgets','project-profitability':'projects','cost-centre-performance':'projects','loan-register':'loans','month-end-close':'accounting','year-end-close':'accounting','customer-debit-notes':'debits','customer-credit-notes':'returns','supplier-debit-notes':'debits','supplier-credit-notes':'returns','credit-control':'credit','revenue-register':'invoices','incoming-payments':'invoices','outgoing-payments':'payments','recurring-commitments':'payments','product-margin':'inventory','inventory-movements':'inventory','cash-forecast':'cashflow'};
    return '<div class="report-preview-empty"><span>'+icon('reports',22)+'</span><h3>'+esc(title)+'</h3><p>This report is available as an interactive working view in its source module. Open it there to review the live underlying records before exporting.</p>'+(routeMap[kind]?'<button class="primary" data-action="report-open-module:'+routeMap[kind]+'">Open detailed view</button>':'')+'</div>';
  }
  function reportModal(state,h){
    const kind=state.businessReportView;if(!kind)return '';
    return '<div class="report-viewer-wrap"><div class="modal-scrim" data-action="business-report-close"></div><section class="report-viewer"><div class="report-viewer-head"><div><div class="eyebrow">ON-SCREEN REPORT</div><h2>'+h.esc(reportTitle(kind))+'</h2><p>Review live DalasiPay data before downloading or printing.</p></div><button class="close" data-action="business-report-close">×</button></div><div class="report-viewer-toolbar"><button class="secondary" data-action="report-print">'+h.icon('print',14)+' Print</button><button class="secondary" data-action="business-report-export:'+h.esc(kind)+'">'+h.icon('download',14)+' Export CSV</button></div><div class="report-viewer-body">'+viewReport(kind,state,h)+'</div></section></div>';
  }
  function csvEscape(v){const s=String(v??'');return /[\",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function rowsToCsv(headers,rows){return [headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n');}
  function exportReport(kind,state,ctx){
    const m=metrics(state,ctx),today=todayIso();let csv='',name=kind;
    if(kind==='profit-loss'){window.DalasiProfitLoss?.exportCsv(state,ctx);return;
    }else if(kind==='balance-sheet'){window.DalasiBalanceSheet?.exportCsv(state,ctx);return;
    }else if(kind==='equity-statement'){window.DalasiEquityStatement?.exportCsv(state,ctx);return;
    }else if(kind==='trial-balance'){window.DalasiGeneralLedger?.exportTrialBalance(state,ctx);return;
    }else if(kind==='general-ledger'){window.DalasiGeneralLedger?.exportLedger(state,ctx);return;
    }else if(kind==='business-summary'){
      csv=rowsToCsv(['Metric','Value'],[['Selected P&L period',state.pnlPeriod||state.currentPeriod],['Selected-period revenue',m.pnl?.revenue||0],['Selected-period COGS',m.pnl?.cogs||0],['Selected-period gross profit',m.pnl?.grossProfit||0],['Selected-period operating expenses',m.pnl?.operatingExpenses||0],['Selected-period net profit',m.pnl?.netProfit||0],['Balance Sheet total assets',m.balanceSheet?.totalAssets||0],['Balance Sheet total liabilities',m.balanceSheet?.totalLiabilities||0],['Balance Sheet total equity',m.balanceSheet?.equity||0],['Balance Sheet difference',m.balanceSheet?.difference||0],['Cash & Bank total',m.cashBank.total],['Active cash accounts',m.cashBank.accounts],['Total revenue',m.revenue.total],['Invoice revenue',m.revenue.invoiceRevenue],['Direct non-invoice income',m.revenue.direct],['Cash received from revenue',m.revenue.cashReceived],['Outstanding receivables',m.ar.outstanding],['Overdue receivables',m.ar.overdue],['Customer debit notes',m.debits.customerDebits],['Customer credit notes',m.returns.customerCredits],['Customer refunds payable',m.returns.customerRefundDue],['Receivables 90+ days',m.credit.ar?.['90+']||0],['High-risk customers',m.credit.highRisk],['Customers on credit hold',m.credit.onHold],['Customers over credit limit',m.credit.overLimit],['Outstanding payables',m.payable],['Overdue payables',m.overduePayable],['Supplier debit notes',m.debits.supplierDebits],['Supplier credit notes',m.returns.supplierCredits],['Supplier refunds receivable',m.returns.supplierRefundDue],['Payables 90+ days',m.credit.ap?.['90+']||0],['Collections recorded',m.collections],['Outgoing payments paid',m.outPaid],['Paid expenses',m.expenses.paid],['Expenses recorded',m.expenses.total],['Open purchase commitments',m.purchases.openValue],['Inventory at cost',m.inventory.value],['Low-stock products',m.inventory.low],['Fixed assets at cost',m.fixedAssets.cost],['Accumulated depreciation',m.fixedAssets.accumulated],['Fixed asset net book value',m.fixedAssets.netBookValue],['Recurring monthly equivalent',m.recurring.monthly],['YTD budget profit',m.budget.ytdBudgetProfit],['YTD actual profit',m.budget.ytdActualProfit],['Annual budget profit',m.budget.annualBudgetProfit],['Annual actual profit',m.budget.annualActualProfit],['Outstanding loan principal',m.loans.outstanding],['Accrued loan interest payable',m.loans.interestPayable],['90-day forecast inflows',m.cashForecast.inflows],['90-day forecast outflows',m.cashForecast.outflows],['90-day projected closing cash',m.cashForecast.closing],['Minimum projected cash',m.cashForecast.minBalance],['First projected cash deficit',m.cashForecast.firstDeficit||'None']]);
    }else if(kind==='cash-bank-register'){window.DalasiCashBank?.exportCsv(state,ctx);return;
    }else if(kind==='bank-reconciliations'){window.DalasiBankReconciliation?.exportRegister(state,ctx);return;
    }else if(kind==='fixed-assets'){window.DalasiFixedAssets?.exportCsv(state,ctx);return;
    }else if(kind==='vat-return'){window.DalasiTax?.exportReturn(state,state.taxPeriod||state.currentPeriod,ctx);return;
    }else if(kind==='budget-vs-actual'){window.DalasiBudgets?.exportCsv(state,String(state.budgetYear||state.currentPeriod||'').slice(0,4),ctx);return;
    }else if(kind==='project-profitability'){window.DalasiDimensions?.exportCsv(state,'project',state.dimensionPeriod||state.currentPeriod,ctx);return;
    }else if(kind==='cost-centre-performance'){window.DalasiDimensions?.exportCsv(state,'costCentre',state.dimensionPeriod||state.currentPeriod,ctx);return;
    }else if(kind==='loan-register'){window.DalasiLoans?.exportCsv(state,ctx);return;
    }else if(kind==='month-end-close'){const p=state.monthClosePeriod||state.currentPeriod;if(window.DalasiMonthClose?.record(state,p))window.DalasiMonthClose.exportRecord(p,state,ctx);else ctx.toast('Close the selected accounting period before exporting its close record.');return;
    }else if(kind==='year-end-close'){const y=state.yearCloseYear||String(state.currentPeriod||'').slice(0,4);if(window.DalasiYearClose?.record(state,y))window.DalasiYearClose.exportRecord(y,state,ctx);else ctx.toast('Close the selected financial year before exporting its close record.');return;
    }else if(kind==='revenue-register'){
      const rows=window.DalasiRevenueIncome?window.DalasiRevenueIncome.ledgerRows(state):[];
      csv=rowsToCsv(['Date','Origin','Reference','Customer / Source','Category','Description','Method','Project','Cost Centre','Net Revenue','VAT','Gross Amount','VAT Treatment','Status'],rows.map(x=>[x.date,x.source,x.reference,x.party,x.category,x.description,x.method,x.project||'',x.costCentre||'',x.amount,x.vat||0,x.gross??x.amount,window.DalasiTax?.code?.(x.taxCode)?.label||x.taxCode||'Out of scope',x.status]));
    }else if(kind==='customer-debit-notes'){window.DalasiDebits?.exportCsv(state,'customer',ctx);return;
    }else if(kind==='supplier-debit-notes'){window.DalasiDebits?.exportCsv(state,'supplier',ctx);return;
    }else if(kind==='customer-credit-notes'){window.DalasiReturns?.exportCsv(state,'customer',ctx);return;
    }else if(kind==='supplier-credit-notes'){window.DalasiReturns?.exportCsv(state,'supplier',ctx);return;
    }else if(kind==='receivables-aging'){window.DalasiCreditControl?.exportAging(state,'ar',ctx);return;
    }else if(kind==='payables-aging'){window.DalasiCreditControl?.exportAging(state,'ap',ctx);return;
    }else if(kind==='credit-control'){
      const rows=window.DalasiCreditControl?.customerRows?.(state)||[];csv=rowsToCsv(['Customer ID','Customer','Outstanding','Overdue','Current','1-30','31-60','61-90','90+','Oldest Days','Credit Limit','Utilization %','Over Limit','Risk','Credit Status','Last Follow-up','Next Follow-up'],rows.map(x=>[x.customer?.id||'',x.customer?.name||'',x.total,x.overdue,x.Current,x['1-30'],x['31-60'],x['61-90'],x['90+'],x.oldest,x.limit,x.utilization,x.exceeded,x.risk,x.customer?.creditStatus||'Open',x.lastFollowUp?.createdAt||'',x.lastFollowUp?.nextFollowUp||'']));
    }else if(kind==='accounts-receivable'){
      csv=rowsToCsv(['Invoice ID','Invoice No','Customer','Issue Date','Due Date','Project','Cost Centre','Amount','Received','Balance','Status'],(state.customerInvoices||[]).map(inv=>[inv.id,inv.invoiceNo,inv.customerName,inv.issueDate,inv.dueDate,inv.project||'',inv.costCentre||'',inv.amount,(state.incomingPayments||[]).filter(p=>p.invoiceId===inv.id).reduce((a,p)=>a+(Number(p.amount)||0),0),window.DalasiReturns?.invoiceBalance?.(state,inv)??Math.max(0,(Number(inv.amount)||0)-(state.incomingPayments||[]).filter(p=>p.invoiceId===inv.id).reduce((a,p)=>a+(Number(p.amount)||0),0)),inv.status]));
    }else if(kind==='accounts-payable'){
      csv=rowsToCsv(['Bill ID','Supplier','Invoice No','Invoice Date','Due Date','Project','Cost Centre','Original Amount','Supplier Debits','Supplier Credits','Balance','Status','Linked Payment'],(state.businessBills||[]).map(b=>[b.id,b.supplier,b.invoiceNo,b.invoiceDate,b.dueDate,b.project||'',b.costCentre||'',b.amount,window.DalasiDebits?.supplierDebited?.(state,b.id)||0,window.DalasiReturns?.supplierCredited?.(state,b.id)||0,window.DalasiReturns?.billBalance?.(state,b)??(Number(b.amount)||0),b.status,b.paymentId||'']));
    }else if(kind==='customer-balances'){
      csv=rowsToCsv(['Customer ID','Customer','Status','Payment Terms Days','Invoiced','Collected','Outstanding','Overdue'],customerRows(state).map(x=>[x.id,x.name,x.status,x.terms,x.invoiced,x.collected,x.outstanding,x.overdue]));
    }else if(kind==='incoming-payments'){
      csv=rowsToCsv(['Receipt No','Customer','Invoice ID','Amount','Received Date','Method','Reference','Recorded By'],(state.incomingPayments||[]).map(p=>[p.receiptNumber||p.id,p.customerName,p.invoiceId,p.amount,p.receivedDate,p.method,p.reference,p.createdBy]));
    }else if(kind==='outgoing-payments'){
      csv=rowsToCsv(['Payment ID','Payee','Type','Amount','Method','Due Date','Reference','Status','Voucher No','Receipt No'],(state.businessPayments||[]).map(p=>[p.id,p.payee,p.type,p.amount,p.method,p.dueDate,p.reference,p.status,p.voucherNumber||'',p.receiptNumber||'']));
    }else if(kind==='recurring-commitments'){
      csv=rowsToCsv(['Recurring ID','Name','Payee','Amount','Frequency','Next Due Date','Monthly Equivalent','Method','Status'],(state.recurringBusinessPayments||[]).map(r=>[r.id,r.name,r.payee,r.amount,r.frequency,r.nextDueDate,r.frequency==='Weekly'?(Number(r.amount)||0)*52/12:r.frequency==='Quarterly'?(Number(r.amount)||0)/3:r.frequency==='Yearly'?(Number(r.amount)||0)/12:Number(r.amount)||0,r.method,r.status]));
    }else if(kind==='expense-register'){
      csv=rowsToCsv(['Expense No','Merchant','Supplier ID','Category','Expense Date','Project','Cost Centre','Amount','Method','Reference','Receipt','Status','Created By'],(state.businessExpenses||[]).map(x=>[x.expenseNo||x.id,x.merchant,x.supplierId||'',x.category,x.expenseDate,x.project||'',x.costCentre||'',x.amount,x.method,x.reference,x.receiptName||'',x.status,x.createdBy]));
    }else if(kind==='purchase-orders'){
      csv=rowsToCsv(['PO Number','Supplier','Supplier ID','Category','Description','Request Date','Required Date','Project','Cost Centre','Lines','Subtotal','Discount','Amount','Requested By','Reference','Status','Inventory Received'],(state.purchaseOrders||[]).map(x=>[x.poNumber||x.id,x.supplierName||'',x.supplierId||'',x.category,x.description,x.requestDate,x.requiredDate,x.project||'',x.costCentre||'',(x.lineItems||[]).length,x.subtotal??x.amount,x.discountTotal||0,x.amount,x.requestedBy,x.reference,x.status,x.inventoryReceivedAt||'']));
    }else if(kind==='inventory-summary'){
      csv=rowsToCsv(['Code','Item','Type','Unit','Selling Price','Costing Method','Valuation Unit Cost','Stock On Hand','Reorder Level','Stock Value','Status'],(state.salesCatalog||[]).map(x=>{const v=window.DalasiInventory?.valuation?.(state,x)||{unitCost:x.costPrice||0,value:(Number(x.stockOnHand)||0)*(Number(x.costPrice)||0)};return [x.code||x.id,x.name,x.type||'Product',x.unit||'Unit',x.unitPrice||0,x.type==='Product'?(window.DalasiInventory?.method?.(x)||'Weighted Average'):'',x.type==='Product'?v.unitCost:'',x.type==='Product'?(Number(x.stockOnHand)||0):'',x.type==='Product'?(Number(x.reorderLevel)||0):'',x.type==='Product'?v.value:'',x.status||'Active'];}));
    }else if(kind==='product-margin'){
      const period=state.inventoryPeriod||state.currentPeriod,rows=window.DalasiInventory?.productMargins?.(state,period)||[];csv=rowsToCsv(['Period','Code','Product','Quantity Sold','Net Revenue','COGS','Gross Profit','Margin %'],rows.map(x=>[period,x.code||x.id,x.name,x.qty,x.revenue,x.cogs,x.grossProfit,x.margin]));
    }else if(kind==='inventory-movements'){
      csv=rowsToCsv(['Movement ID','Date','Sales Period Date','Item Code','Item','Type','Quantity','Unit Cost','Cost Amount','Balance Before','Balance After','Reference','Note','Created By'],(state.inventoryMovements||[]).map(mv=>{const item=(state.salesCatalog||[]).find(x=>x.id===mv.catalogId);return [mv.id,mv.movementDate||mv.createdAt,mv.revenueDate||'',item?.code||'',item?.name||mv.catalogId,mv.type,mv.quantity,mv.unitCost??'',mv.costAmount??'',mv.balanceBefore??'',mv.balanceAfter??'',mv.reference||'',mv.note||'',mv.createdBy||''];}));
    }else if(kind==='cash-flow-statement'){window.DalasiCashFlow?.exportStatement(state,state.cashStatementPeriod||state.currentPeriod,ctx);return;
    }else if(kind==='cash-forecast'){window.DalasiCashFlow?.exportForecast(state,{...ctx,payrollCalc:ctx.payrollCalc},Number(state.cashForecastHorizon||90));return;
    }else{return}
    ctx.downloadText('dalasipay-'+name+'-'+today+'.csv',csv);ctx.toast('Business report downloaded');
  }
  window.DalasiBusinessReports={render,tabs,exportReport,metrics,viewReport,reportModal,reportTitle,reportCategory,categoryLabel};
})();
