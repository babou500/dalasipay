(function(){
  'use strict';
  function sum(rows,fn){return (rows||[]).reduce((a,x)=>a+(fn?Number(fn(x)||0):Number(x||0)),0)}
  function render(state,h){
    const icon=h.icon,money2=h.money2,esc=h.esc,pageTitle=h.pageTitle,periodLabel=h.periodLabel,shortPeriod=h.shortPeriod,periodControls=h.periodControls,pill=h.pill;
    const payroll=h.payrollCalc(),t=payroll.totals,active=(state.employees||[]).filter(e=>e.status==='Active').length;
    const pay=window.DalasiBusinessPayments.summary(state.businessPayments||[]);
    const ar=window.DalasiBusinessPayments.receivableSummary(state);
    const recurring=window.DalasiBusinessPayments.recurringSummary(state);
    const cash=window.DalasiBusinessPayments.cashFlowSummary(state,{payrollCalc:h.payrollCalc,periodLabel},30);
    const today=new Date().toISOString().slice(0,10);
    const openBills=(state.businessBills||[]).filter(x=>x.status!=='Paid');
    const billOutstanding=sum(openBills,x=>x.amount);
    const overdueBills=sum(openBills.filter(x=>x.dueDate&&x.dueDate<today),x=>x.amount);
    const customers=(state.customers||[]).filter(x=>(x.status||'Active')==='Active').length;
    const inv=window.DalasiInventory?.summary?.(state)||{value:0,low:0,products:0};
    const salesOrders=window.DalasiSalesOrders?.metrics?.(state)||{open:0,openValue:0};
    const salesInvoices=(state.customerInvoices||[]).filter(x=>String(x.issueDate||x.createdAt||'').slice(0,7)===state.currentPeriod);
    const salesThisPeriod=sum(salesInvoices,x=>x.amount);
    const cashAccounts=(state.cashAccounts||[]),cashBalance=sum(cashAccounts,x=>x.balance);
    const healthFlags=[
      ar.overdue>0?{label:'Overdue receivables',value:money2(ar.overdue),page:'credit'}:null,
      overdueBills>0?{label:'Overdue supplier bills',value:money2(overdueBills),page:'payments'}:null,
      inv.low>0?{label:'Low-stock products',value:String(inv.low),page:'inventory'}:null,
      state.payrollStatus!=='Paid'?{label:'Payroll status',value:esc(state.payrollStatus),page:'payroll'}:null
    ].filter(Boolean);
    const greet='Good evening, '+esc((state.session?.name||'there').split(/\s+/)[0])+'.';
    const actions=periodControls(true)+'<button class="primary" data-page="payments">New payment '+icon('arrow',15)+'</button>';
    const card=(cls,page,action,ic,label,value,copy)=>'<button class="surface command-card '+(cls||'')+'" '+(action?'data-action="'+action+'"':'data-page="'+page+'"')+'><span class="command-icon">'+icon(ic,17)+'</span><div><small>'+label+'</small><b>'+value+'</b><p>'+copy+'</p></div>'+icon('chevron',14)+'</button>';
    let html=pageTitle('DALASIPAY COMMAND CENTER',greet,'Payroll, money in, money out, customers and upcoming cash requirements in one view.',actions);
    html+='<div class="command-grid business-command-grid">';
    html+=card('cash-command','cashbank','','bank','CASH POSITION',money2(cashBalance),cashAccounts.length+' cash / bank account'+(cashAccounts.length===1?'':'s'));
    html+=card('money-in-command','credit','','reports','RECEIVABLES',money2(ar.outstanding),money2(ar.overdue)+' overdue');
    html+=card('','payments','dashboard-bills','file','PAYABLES',money2(billOutstanding),overdueBills?money2(overdueBills)+' overdue':openBills.length+' open bill'+(openBills.length===1?'':'s'));
    html+=card('','invoices','','chart','SALES · '+shortPeriod(state.currentPeriod),money2(salesThisPeriod),salesInvoices.length+' invoice'+(salesInvoices.length===1?'':'s')+' this period');
    html+=card('','inventory','','box','INVENTORY',money2(inv.value),inv.low+' low-stock · '+inv.products+' products');
    html+=card('','invoices','','file','OPEN SALES ORDERS',money2(salesOrders.openValue),salesOrders.open+' order'+(salesOrders.open===1?'':'s')+' not invoiced');
    html+=card('payroll-command','payroll','','payroll','PAYROLL · '+shortPeriod(state.currentPeriod),money2(t.net),active+' employees · '+esc(state.payrollStatus));
    html+=card('','customers','','employees','CUSTOMERS',String(customers),ar.open+' open invoice'+(ar.open===1?'':'s'));
    html+='</div>';
    html+='<div class="surface business-health-strip"><div class="health-title"><span class="eyebrow">BUSINESS HEALTH</span><b>'+(healthFlags.length?healthFlags.length+' item'+(healthFlags.length===1?'':'s')+' need attention':'No urgent exceptions')+'</b></div><div class="health-items">'+(healthFlags.length?healthFlags.slice(0,4).map(x=>'<button data-page="'+x.page+'"><span>'+x.label+'</span><b>'+x.value+'</b>'+icon('chevron',13)+'</button>').join(''):'<div class="health-clear">'+icon('check',15)+' Core cash, collections, stock and payroll checks are clear.</div>')+'</div></div>';
    html+='<div class="surface payroll-summary-strip"><div><span class="eyebrow">'+periodLabel(state.currentPeriod).toUpperCase()+' PAYROLL</span><b>'+(state.payrollStatus==='Ready'?'Ready for approval':esc(state.payrollStatus))+'</b></div><div><small>Gross payroll</small><strong>'+money2(t.gross)+'</strong></div><div><small>Employer cost</small><strong>'+money2(t.employerCost)+'</strong></div><button class="secondary" data-page="payroll">'+(state.payrollStatus==='Ready'?'Review payroll':'Open payroll')+' '+icon('chevron',14)+'</button></div>';
    return html;
  }
  window.DalasiCommandCenter={render};
})();
