(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const periodOf=v=>String(v||'').slice(0,7);
  function periodRange(period){
    const [y,m]=String(period||'').split('-').map(Number);if(!y||!m)return {start:'',end:''};
    const last=new Date(Date.UTC(y,m,0)).getUTCDate();return {start:y+'-'+String(m).padStart(2,'0')+'-01',end:y+'-'+String(m).padStart(2,'0')+'-'+String(last).padStart(2,'0')};
  }
  function addDays(dateStr,days){const d=new Date(dateStr+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function addMonths(dateStr,months){const d=new Date(dateStr+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);}
  function payday(period,day=28){
    const [y,m]=String(period||'').split('-').map(Number);if(!y||!m)return '';
    const last=new Date(Date.UTC(y,m,0)).getUTCDate(),d=Math.min(last,Math.max(1,Number(day)||28));return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  function classify(state,tx){
    if(tx?.cashFlowClass&&['Operating','Investing','Financing'].includes(tx.cashFlowClass))return tx.cashFlowClass;
    const source=String(tx?.sourceType||'');
    if(source==='fixed_asset')return 'Investing';
    if(['loan-drawdown','loan-repayment'].includes(source))return 'Financing';
    if(source==='transfer')return 'Transfer';
    if(source==='reversal'){
      const original=(state.cashTransactions||[]).find(x=>x.id===tx.sourceId);return original?classify(state,original):'Operating';
    }
    return 'Operating';
  }
  function detailClass(state,tx){
    const source=String(tx?.sourceType||'manual');
    if(source==='customer-collection')return 'Customer collections';
    if(source==='revenue')return 'Direct cash income';
    if(source==='business-payment')return 'Business payments';
    if(source==='expense')return 'Operating expenses';
    if(source==='payroll')return 'Payroll';
    if(source==='vat-payment')return 'VAT / tax payments';
    if(source==='customer-refund')return 'Customer refunds';
    if(source==='supplier-refund')return 'Supplier refunds';
    if(source==='fixed_asset')return Number(tx.amount)>=0?'Asset disposal proceeds':'Capital expenditure';
    if(source==='loan-drawdown')return 'Loan proceeds';
    if(source==='loan-repayment')return 'Loan repayments';
    if(source==='transfer')return 'Internal transfers';
    if(source==='reversal')return 'Reversals';
    return tx?.cashFlowDetail||tx?.type||'Other cash movements';
  }
  function activeAccountIds(state){return new Set((state.cashAccounts||[]).filter(x=>(x.status||'Active')==='Active').map(x=>x.id));}
  function balanceAt(state,date){
    const active=activeAccountIds(state);
    let total=(state.cashAccounts||[]).filter(x=>active.has(x.id)).reduce((a,x)=>{const od=String(x.openingDate||x.createdAt||'').slice(0,10);return a+((!od||od<=date)?(Number(x.openingBalance)||0):0);},0);
    (state.cashTransactions||[]).forEach(tx=>{if(active.has(tx.accountId)&&String(tx.date||'')<=date)total+=Number(tx.amount)||0;});
    return round(total);
  }
  function statement(state,period){
    const r=periodRange(period),active=activeAccountIds(state);
    const tx=(state.cashTransactions||[]).filter(x=>active.has(x.accountId)&&String(x.date||'')>=r.start&&String(x.date||'')<=r.end&&classify(state,x)!=='Transfer');
    const sections={Operating:{in:0,out:0,net:0,rows:[]},Investing:{in:0,out:0,net:0,rows:[]},Financing:{in:0,out:0,net:0,rows:[]}};
    tx.forEach(x=>{const cls=classify(state,x),amt=Number(x.amount)||0;if(!sections[cls])return;const d=detailClass(state,x),row=sections[cls].rows.find(a=>a.label===d)||{label:d,in:0,out:0,net:0};if(!sections[cls].rows.includes(row))sections[cls].rows.push(row);if(amt>=0){sections[cls].in+=amt;row.in+=amt}else{sections[cls].out+=Math.abs(amt);row.out+=Math.abs(amt)}row.net+=amt;sections[cls].net+=amt;});
    Object.values(sections).forEach(s=>{s.in=round(s.in);s.out=round(s.out);s.net=round(s.net);s.rows.forEach(x=>{x.in=round(x.in);x.out=round(x.out);x.net=round(x.net)});s.rows.sort((a,b)=>Math.abs(b.net)-Math.abs(a.net));});
    const activeIds=activeAccountIds(state),opening=round((state.cashAccounts||[]).filter(a=>activeIds.has(a.id)&&String(a.openingDate||a.createdAt||'').slice(0,10)<=r.end).reduce((sum,a)=>sum+(Number(a.openingBalance)||0),0)+(state.cashTransactions||[]).filter(x=>activeIds.has(x.accountId)&&String(x.date||'')<r.start).reduce((sum,x)=>sum+(Number(x.amount)||0),0)),net=round(sections.Operating.net+sections.Investing.net+sections.Financing.net),closing=round(opening+net),actualClosing=balanceAt(state,r.end),difference=round(closing-actualClosing);
    const reconciled=tx.filter(x=>x.reconciliationId).length;
    return {period,r,opening,closing,actualClosing,difference,net,sections,transactions:tx.length,reconciled,reconPct:tx.length?Math.round(reconciled/tx.length*100):100};
  }
  function receivablePaid(state,id){return (state.incomingPayments||[]).filter(x=>x.invoiceId===id).reduce((a,x)=>a+(Number(x.amount)||0),0);}
  function invoiceStatus(state,inv){return window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');}
  function forecastItems(state,ctx,horizon=90){
    const today=todayIso(),end=addDays(today,horizon),items=[],seen=new Set();
    const add=x=>{if(!x.date||x.date>end)return;const key=x.key||[x.type,x.id,x.date].join('|');if(seen.has(key))return;seen.add(key);items.push(x);};

    (state.customerInvoices||[]).forEach(inv=>{
      const st=invoiceStatus(state,inv),balance=window.DalasiReturns?.invoiceBalance?.(state,inv)??Math.max(0,(Number(inv.amount)||0)-receivablePaid(state,inv.id));if(st==='Draft'||balance<=0)return;
      add({key:'ar:'+inv.id,date:inv.dueDate||today,direction:'in',type:'Receivable',label:inv.customerName||'Customer',detail:inv.invoiceNo||inv.id,amount:round(balance),confidence:'High'});
    });

    const billsWithPayment=new Set((state.businessPayments||[]).filter(p=>p.billId&&p.status!=='Paid').map(p=>p.billId));
    (state.businessBills||[]).forEach(b=>{if((b.status||'Draft')==='Draft'||billsWithPayment.has(b.id))return;const balance=window.DalasiReturns?.billBalance?.(state,b)??round(b.amount);if(balance<=.004)return;add({key:'bill:'+b.id,date:b.dueDate||today,direction:'out',type:'Supplier bill',label:b.supplier||'Supplier',detail:b.invoiceNo||b.id,amount:balance,confidence:'High'});});
    (state.businessPayments||[]).forEach(p=>{if(p.status==='Paid')return;add({key:'payment:'+p.id,date:p.dueDate||today,direction:'out',type:'Business payment',label:p.payee||'Payee',detail:p.reference||p.description||p.id,amount:round(p.amount),confidence:p.status==='Approved'?'High':'Medium'});});
    (state.businessExpenses||[]).forEach(x=>{if(!['Approved'].includes(x.status))return;add({key:'expense:'+x.id,date:x.expenseDate||today,direction:'out',type:'Approved expense',label:x.merchant||'Expense',detail:x.expenseNo||x.id,amount:round(x.amount),confidence:'High'});});

    (state.recurringBusinessPayments||[]).forEach(r=>{
      if((r.status||'Active')!=='Active'||!r.nextDueDate)return;let due=r.nextDueDate,guard=0;
      while(due<=end&&guard<40){if(r.endDate&&due>r.endDate)break;const already=(state.businessPayments||[]).some(p=>p.recurringId===r.id&&p.recurringDueDate===due);if(!already)add({key:'rec:'+r.id+':'+due,date:due,direction:'out',type:'Recurring',label:r.name||r.payee||'Recurring payment',detail:r.frequency||'Monthly',amount:round(r.amount),confidence:'Medium'});due=window.DalasiBusinessPayments?.advanceRecurringDate?.(due,r.frequency)||nextRecurring(due,r.frequency);guard++;}
    });

    (state.businessLoans||[]).filter(l=>window.DalasiLoans?.status?.(state,l)==='Active').forEach(l=>{
      (window.DalasiLoans?.schedule?.(l)||[]).forEach(row=>{if(row.dueDate<today||row.dueDate>end||window.DalasiLoans?.rowPaid?.(state,l,row))return;add({key:'loan:'+l.id+':'+row.index,date:row.dueDate,direction:'out',type:'Loan repayment',label:l.lender||'Lender',detail:'Installment '+row.index,amount:round(row.amount),confidence:'High'});});
    });

    const taxPeriods=window.DalasiTax?.periodList?.(state)||[];
    taxPeriods.forEach(p=>{const s=window.DalasiTax?.returnSummary?.(state,p);if(!s||s.outstanding<=0)return;const date=s.dueDate||today;if(date>end)return;add({key:'vat:'+p,date:date<today?today:date,direction:'out',type:'VAT payment',label:'Gambia Revenue Authority',detail:p+' VAT',amount:round(s.outstanding),confidence:s.filed?'High':'Medium'});});

    if(ctx?.payrollCalc){
      const net=round(ctx.payrollCalc()?.totals?.net||0),basePeriod=state.currentPeriod||periodOf(today);
      for(let i=0;i<4;i++){const p=periodOf(addMonths(basePeriod+'-01',i)),date=payday(p,state.opsConfig?.paydayDay||28);if(!date||date<today||date>end)continue;const existingPaid=(state.cashTransactions||[]).some(x=>x.sourceType==='payroll'&&x.sourceId===p);if(existingPaid)continue;add({key:'payroll:'+p,date,direction:'out',type:'Payroll',label:'Employee net payroll',detail:p,amount:net,confidence:i===0?'High':'Medium'});}
    }

    (state.customerCreditNotes||[]).forEach(c=>{const due=window.DalasiReturns?.customerRefundDue?.(state,c)||0;if(due>0)add({key:'customer-refund:'+c.id,date:today,direction:'out',type:'Customer refund',label:c.customerName||'Customer',detail:c.creditNo||c.id,amount:round(due),confidence:'High'});});
    (state.supplierCreditNotes||[]).forEach(c=>{const due=window.DalasiReturns?.supplierRefundDue?.(state,c)||0;if(due>0)add({key:'supplier-refund:'+c.id,date:today,direction:'in',type:'Supplier refund',label:c.supplier||'Supplier',detail:c.creditNo||c.id,amount:round(due),confidence:'High'});});

    (state.purchaseOrders||[]).forEach(po=>{if(!['Approved','Ordered'].includes(po.status||'Draft'))return;if(po.inventoryReceivedAt)return;const date=po.requiredDate||po.requestDate||today;if(date>end)return;add({key:'po:'+po.id,date,direction:'out',type:'Purchase commitment',label:po.supplierName||'Supplier',detail:po.poNumber||po.id,amount:round(po.amount),confidence:'Low'});});

    return items.sort((a,b)=>a.date.localeCompare(b.date)||String(a.direction).localeCompare(String(b.direction)));
  }
  function nextRecurring(date,freq){
    const d=new Date(date+'T00:00:00Z'),day=d.getUTCDate(),f=String(freq||'Monthly');
    if(f==='Weekly'){d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10);}
    if(f==='Quarterly')d.setUTCMonth(d.getUTCMonth()+3);else if(f==='Yearly')d.setUTCFullYear(d.getUTCFullYear()+1);else d.setUTCMonth(d.getUTCMonth()+1);
    if(['Monthly','Quarterly'].includes(f)){const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));}
    return d.toISOString().slice(0,10);
  }
  function forecast(state,ctx,horizon=90){
    const items=forecastItems(state,ctx,horizon),start=window.DalasiCashBank?.totals?.(state)?.total||0;
    let balance=round(start),minBalance=balance,minDate=todayIso(),firstDeficit='';
    const daily=new Map();
    items.forEach(x=>{if(!daily.has(x.date))daily.set(x.date,{date:x.date,in:0,out:0,items:[]});const d=daily.get(x.date);if(x.direction==='in')d.in+=x.amount;else d.out+=x.amount;d.items.push(x);});
    const days=[];[...daily.keys()].sort().forEach(date=>{const d=daily.get(date);d.in=round(d.in);d.out=round(d.out);balance=round(balance+d.in-d.out);if(balance<minBalance){minBalance=balance;minDate=date}if(balance<0&&!firstDeficit)firstDeficit=date;days.push({...d,balance});});
    const inflows=round(items.filter(x=>x.direction==='in').reduce((a,x)=>a+x.amount,0)),outflows=round(items.filter(x=>x.direction==='out').reduce((a,x)=>a+x.amount,0)),closing=round(start+inflows-outflows);
    return {horizon,start:round(start),inflows,outflows,net:round(inflows-outflows),closing,minBalance:round(minBalance),minDate,firstDeficit,items,days};
  }
  function weeklyForecast(state,ctx,horizon=90){
    const f=forecast(state,ctx,horizon),today=todayIso(),weeks=[];
    let opening=f.start;
    for(let i=0;i<Math.ceil(horizon/7);i++){
      const start=addDays(today,i*7),end=addDays(start,6),xs=f.items.filter(x=>x.date>=start&&x.date<=end),inflow=round(xs.filter(x=>x.direction==='in').reduce((a,x)=>a+x.amount,0)),out=round(xs.filter(x=>x.direction==='out').reduce((a,x)=>a+x.amount,0)),closing=round(opening+inflow-out);
      weeks.push({week:i+1,start,end,opening:round(opening),inflow,outflow:out,net:round(inflow-out),closing});opening=closing;
    }
    return {forecast:f,weeks};
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));(state.cashTransactions||[]).forEach(x=>{const p=periodOf(x.date);if(p)set.add(p)});if(state.currentPeriod)set.add(state.currentPeriod);return [...set].filter(x=>/^\d{4}-\d{2}$/.test(x)).sort().reverse();
  }
  function exportStatement(state,period,ctx){
    const s=statement(state,period),rows=[['Cash Flow Statement',period],['Opening cash',s.opening],[],['OPERATING ACTIVITIES','Money In','Money Out','Net'],...s.sections.Operating.rows.map(x=>[x.label,x.in,x.out,x.net]),['Net cash from operating activities','','',s.sections.Operating.net],[],['INVESTING ACTIVITIES','Money In','Money Out','Net'],...s.sections.Investing.rows.map(x=>[x.label,x.in,x.out,x.net]),['Net cash from investing activities','','',s.sections.Investing.net],[],['FINANCING ACTIVITIES','Money In','Money Out','Net'],...s.sections.Financing.rows.map(x=>[x.label,x.in,x.out,x.net]),['Net cash from financing activities','','',s.sections.Financing.net],[],['Net change in cash','','',s.net],['Closing cash','','',s.closing],['Cashbook closing balance','','',s.actualClosing],['Reconciliation difference','','',s.difference]];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-cash-flow-statement-'+period+'.csv',csv);ctx.toast('Cash flow statement downloaded');
  }
  function exportForecast(state,ctx,horizon=90){
    const f=forecast(state,ctx,horizon),rows=[['Cash Forecast',todayIso()+' to '+addDays(todayIso(),horizon)],['Starting cash',f.start],['Forecast inflows',f.inflows],['Forecast outflows',f.outflows],['Forecast closing cash',f.closing],['Minimum projected cash',f.minBalance],['First projected deficit',f.firstDeficit||'None'],[],['Date','Direction','Type','Counterparty / Source','Detail','Amount','Confidence'],...f.items.map(x=>[x.date,x.direction==='in'?'Inflow':'Outflow',x.type,x.label,x.detail,x.amount,x.confidence])];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-cash-forecast-'+horizon+'d-'+todayIso()+'.csv',csv);ctx.toast('Cash forecast downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2}=h,period=state.cashStatementPeriod||state.currentPeriod||periods(state)[0],horizon=Number(state.cashForecastHorizon||90),s=statement(state,period),wf=weeklyForecast(state,{payrollCalc:h.payrollCalc},horizon),f=wf.forecast,opts=periods(state).map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(p)+'</option>').join('');
    const section=(title,obj)=>'<div class="cashflow-section"><h4>'+title+'</h4>'+(obj.rows.length?obj.rows.map(x=>'<div><span>'+esc(x.label)+'</span><b class="'+(x.net>=0?'cf-in':'cf-out')+'">'+(x.net>=0?'+':'')+money2(x.net)+'</b></div>').join(''):'<div><span>No movements</span><b>'+money2(0)+'</b></div>')+'<div class="cashflow-section-total"><span>Net '+title.toLowerCase()+'</span><b>'+money2(obj.net)+'</b></div></div>';
    const weekly=wf.weeks.map(w=>'<tr><td><b>Week '+w.week+'</b><small>'+esc(w.start)+' → '+esc(w.end)+'</small></td><td>'+money2(w.opening)+'</td><td class="cf-in">+'+money2(w.inflow)+'</td><td class="cf-out">− '+money2(w.outflow)+'</td><td class="'+(w.net>=0?'cf-in':'cf-out')+'">'+(w.net>=0?'+':'')+money2(w.net)+'</td><td class="'+(w.closing<0?'cf-out':'')+'"><b>'+money2(w.closing)+'</b></td></tr>').join('');
    const topItems=f.items.slice(0,12).map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.type)+'</td><td><b>'+esc(x.label)+'</b><small>'+esc(x.detail||'')+'</small></td><td>'+esc(x.confidence)+'</td><td class="'+(x.direction==='in'?'cf-in':'cf-out')+'">'+(x.direction==='in'?'+':'− ')+money2(x.amount)+'</td></tr>').join('');
    return pageTitle('TREASURY & LIQUIDITY','Cash Flow','Actual cash-flow statement plus forward liquidity forecasting from receivables, payables, payroll, VAT and financing.','<div class="inline-buttons"><button class="secondary" data-action="cashflow-export-statement">'+icon('download',14)+' Statement CSV</button><button class="primary" data-action="cashflow-export-forecast">'+icon('download',14)+' Forecast CSV</button></div>')+
      '<div class="cf-toolbar surface"><div><span>Statement period</span><select id="cash-statement-period">'+opts+'</select></div><div><span>Forecast horizon</span><select id="cash-forecast-horizon"><option value="30" '+(horizon===30?'selected':'')+'>30 days</option><option value="60" '+(horizon===60?'selected':'')+'>60 days</option><option value="90" '+(horizon===90?'selected':'')+'>90 days</option></select></div><div><span>Cashbook reconciliation</span><b>'+s.reconPct+'%</b><small>'+s.reconciled+' / '+s.transactions+' period transactions reconciled</small></div></div>'+
      '<div class="cf-kpis"><div class="surface"><span>Opening cash</span><b>'+money2(s.opening)+'</b><small>'+esc(period)+'</small></div><div class="surface"><span>Net cash movement</span><b class="'+(s.net>=0?'cf-in':'cf-out')+'">'+money2(s.net)+'</b><small>operating + investing + financing</small></div><div class="surface"><span>Closing cash</span><b>'+money2(s.closing)+'</b><small>cashbook '+money2(s.actualClosing)+'</small></div><div class="surface '+(Math.abs(s.difference)>.01?'cf-alert':'')+'"><span>Cash-flow reconciliation</span><b>'+money2(Math.abs(s.difference))+'</b><small>'+(Math.abs(s.difference)<.01?'statement reconciles':'difference to investigate')+'</small></div></div>'+
      '<section class="surface cf-statement"><div class="table-tools"><div><h3>Statement of cash flows</h3><p>Direct method using posted Cash & Bank transactions. Internal transfers are excluded.</p></div></div><div class="cashflow-sections">'+section('Operating activities',s.sections.Operating)+section('Investing activities',s.sections.Investing)+section('Financing activities',s.sections.Financing)+'</div><div class="cf-reconcile"><div><span>Net change in cash</span><b>'+money2(s.net)+'</b></div><div><span>Closing cash</span><b>'+money2(s.closing)+'</b></div></div></section>'+
      '<div class="cf-kpis cf-forecast-kpis"><div class="surface"><span>Current cash</span><b>'+money2(f.start)+'</b><small>forecast starting point</small></div><div class="surface"><span>'+horizon+'d inflows</span><b class="cf-in">'+money2(f.inflows)+'</b><small>receivables and expected cash in</small></div><div class="surface"><span>'+horizon+'d outflows</span><b class="cf-out">'+money2(f.outflows)+'</b><small>payables, payroll, VAT, loans and commitments</small></div><div class="surface '+(f.minBalance<0?'cf-alert':'')+'"><span>Minimum projected cash</span><b>'+money2(f.minBalance)+'</b><small>'+(f.firstDeficit?'deficit begins '+esc(f.firstDeficit):'no projected cash deficit')+'</small></div></div>'+
      '<section class="surface employee-card cf-weekly"><div class="table-tools"><div><h3>Weekly cash forecast</h3><p>Forward liquidity position based on currently recorded obligations and collections</p></div></div><div class="table-scroll"><table><thead><tr><th>WEEK</th><th>OPENING</th><th>INFLOWS</th><th>OUTFLOWS</th><th>NET</th><th>CLOSING</th></tr></thead><tbody>'+weekly+'</tbody></table></div></section>'+
      '<section class="surface employee-card cf-upcoming"><div class="table-tools"><div><h3>Upcoming forecast drivers</h3><p>High, medium and low confidence items. Purchase orders are low-confidence commitments.</p></div></div><div class="table-scroll"><table><thead><tr><th>DATE</th><th>TYPE</th><th>SOURCE</th><th>CONFIDENCE</th><th>AMOUNT</th></tr></thead><tbody>'+(topItems||'<tr><td colspan="5"><div class="empty-inline">No forecast cash movements in this horizon.</div></td></tr>')+'</tbody></table></div></section>';
  }

  window.DalasiCashFlow={classify,detailClass,balanceAt,statement,forecastItems,forecast,weeklyForecast,periods,exportStatement,exportForecast,render};
})();