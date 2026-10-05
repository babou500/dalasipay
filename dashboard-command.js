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
    const greet='Good evening, '+esc((state.session?.name||'there').split(/\s+/)[0])+'.';
    const actions=periodControls(true)+'<button class="primary" data-page="payments">New payment '+icon('arrow',15)+'</button>';
    const card=(cls,page,action,ic,label,value,copy)=>'<button class="surface command-card '+(cls||'')+'" '+(action?'data-action="'+action+'"':'data-page="'+page+'"')+'><span class="command-icon">'+icon(ic,17)+'</span><div><small>'+label+'</small><b>'+value+'</b><p>'+copy+'</p></div>'+icon('chevron',14)+'</button>';
    let html=pageTitle('DALASIPAY COMMAND CENTER',greet,'Payroll, money in, money out, customers and upcoming cash requirements in one view.',actions);
    html+='<div class="command-grid">';
    html+=card('payroll-command','payroll','','payroll','PAYROLL · '+shortPeriod(state.currentPeriod),money2(t.net),active+' employees · '+esc(state.payrollStatus));
    html+=card('','payments','dashboard-payments','bank','MONEY OUT',money2(pay.pending+pay.approved),money2(pay.approved)+' approved to pay');
    html+=card('money-in-command','payments','dashboard-receivables','reports','MONEY IN',money2(ar.outstanding),money2(ar.overdue)+' overdue');
    html+=card('','payments','dashboard-bills','file','BILLS',money2(billOutstanding),overdueBills?money2(overdueBills)+' overdue':openBills.length+' open bill'+(openBills.length===1?'':'s'));
    html+=card('','customers','','employees','CUSTOMERS',String(customers),ar.open+' open invoice'+(ar.open===1?'':'s'));
    html+=card('','payments','dashboard-recurring','calendar','RECURRING',money2(recurring.monthly),recurring.active+' active schedule'+(recurring.active===1?'':'s'));
    html+=card('cash-command','payments','dashboard-cashflow','reports','30-DAY CASH NEED',cash.need30?money2(cash.need30):money2(cash.surplus30),(cash.need30?'Funding required':'Projected surplus')+' · In '+money2(cash.in30)+' / Out '+money2(cash.out30));
    html+='</div>';
    html+='<div class="surface payroll-summary-strip"><div><span class="eyebrow">'+periodLabel(state.currentPeriod).toUpperCase()+' PAYROLL</span><b>'+(state.payrollStatus==='Ready'?'Ready for approval':esc(state.payrollStatus))+'</b></div><div><small>Gross payroll</small><strong>'+money2(t.gross)+'</strong></div><div><small>Employer cost</small><strong>'+money2(t.employerCost)+'</strong></div><button class="secondary" data-page="payroll">'+(state.payrollStatus==='Ready'?'Review payroll':'Open payroll')+' '+icon('chevron',14)+'</button></div>';
    return html;
  }
  window.DalasiCommandCenter={render};
})();
