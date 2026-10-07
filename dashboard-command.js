(function(){
  'use strict';
  function sum(rows,fn){return (rows||[]).reduce((a,x)=>a+(fn?Number(fn(x)||0):Number(x||0)),0)}
  function previousPeriod(period){
    const [y,m]=String(period||'').split('-').map(Number);if(!y||!m)return '';
    const d=new Date(y,m-2,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function pulse(state,h,data){
    const {money2,esc,icon}=h,{ar,overdueBills,inv,salesThisPeriod,cashBalance,billOutstanding,payrollNet}=data;
    const prev=previousPeriod(state.currentPeriod);
    const prevSales=sum((state.customerInvoices||[]).filter(x=>String(x.issueDate||x.createdAt||'').slice(0,7)===prev),x=>x.amount);
    const salesChange=prevSales?Math.round((salesThisPeriod-prevSales)/prevSales*100):null;
    const pnl=window.DalasiProfitLoss?.statement?.(state,state.currentPeriod)||null;
    const obligations=billOutstanding+(state.payrollStatus==='Paid'?0:payrollNet);
    const coverage=obligations>0?cashBalance/obligations:null;
    const items=[];
    if(ar.overdue>0){
      const share=ar.outstanding?Math.round(ar.overdue/ar.outstanding*100):100;
      items.push({tone:share>=40?'urgent':'watch',icon:'reports',eyebrow:'COLLECTIONS',title:share+'% of receivables are overdue',copy:money2(ar.overdue)+' is past due. Prioritise the oldest customer balances first.',page:'credit',action:'Review collections'});
    }else if(ar.outstanding>0){
      items.push({tone:'good',icon:'check',eyebrow:'COLLECTIONS',title:'Receivables are current',copy:money2(ar.outstanding)+' remains open with no overdue balance detected.',page:'credit',action:'View receivables'});
    }
    if(overdueBills>0){
      items.push({tone:'urgent',icon:'file',eyebrow:'PAYABLES',title:'Supplier payments need attention',copy:money2(overdueBills)+' of supplier bills are overdue.',action:'dashboard-bills',actionLabel:'Review bills'});
    }else if(coverage!==null){
      items.push({tone:coverage<1?'urgent':coverage<1.5?'watch':'good',icon:'bank',eyebrow:'LIQUIDITY',title:coverage<1?'Cash is below near-term obligations':coverage<1.5?'Cash cover is tight':'Cash cover looks comfortable',copy:'Available cash covers '+coverage.toFixed(1)+'× open bills'+(state.payrollStatus==='Paid'?'': ' and current payroll')+'.',page:'cashbank',actionLabel:'View cash'});
    }
    if(inv.low>0){
      items.push({tone:'watch',icon:'box',eyebrow:'INVENTORY',title:inv.low+' product'+(inv.low===1?'':'s')+' need replenishment',copy:'Low-stock items may affect fulfilment if demand continues.',page:'inventory',actionLabel:'Review stock'});
    }else if(inv.products>0){
      items.push({tone:'good',icon:'box',eyebrow:'INVENTORY',title:'Stock levels are clear',copy:inv.products+' tracked product'+(inv.products===1?'':'s')+' currently sit above reorder levels.',page:'inventory',actionLabel:'View inventory'});
    }
    if(salesChange!==null){
      items.push({tone:salesChange>=0?'good':'watch',icon:'chart',eyebrow:'MOMENTUM',title:'Sales '+(salesChange>=0?'up ':'down ')+Math.abs(salesChange)+'% vs last month',copy:money2(salesThisPeriod)+' invoiced this period versus '+money2(prevSales)+' previously.',page:'invoices',actionLabel:'View sales'});
    }else if(salesThisPeriod>0){
      items.push({tone:'neutral',icon:'chart',eyebrow:'MOMENTUM',title:'This month is building',copy:money2(salesThisPeriod)+' has been invoiced so far. A prior-period comparison will appear when history exists.',page:'invoices',actionLabel:'View sales'});
    }
    if(pnl){
      items.push({tone:pnl.netProfit<0?'urgent':pnl.netMargin<10?'watch':'good',icon:'reports',eyebrow:'PROFITABILITY',title:pnl.netProfit<0?'Current period is loss-making':pnl.netMargin<10?'Profit margin is thin':'Profitability is healthy',copy:money2(pnl.netProfit)+' net profit at '+Number(pnl.netMargin||0).toFixed(1)+'% margin.',action:'business-report-view:profit-loss',actionLabel:'View P&L'});
    }
    const priority={urgent:0,watch:1,neutral:2,good:3};
    items.sort((a,b)=>priority[a.tone]-priority[b.tone]);
    const urgent=items.filter(x=>x.tone==='urgent').length,watch=items.filter(x=>x.tone==='watch').length;
    const status=urgent?'Action needed':watch?'Watch closely':'Looking healthy';
    const statusTone=urgent?'urgent':watch?'watch':'good';
    const top=items.slice(0,4);
    return '<section class="surface dalasipay-pulse '+statusTone+'"><div class="pulse-head"><div class="pulse-brand"><span class="pulse-mark">'+icon('chart',17)+'</span><div><span class="eyebrow">DALASIPAY PULSE</span><h3>'+status+'</h3><p>A live briefing generated from your current business records.</p></div></div><div class="pulse-status '+statusTone+'"><i></i><span>'+(urgent?urgent+' urgent':watch?watch+' watch item'+(watch===1?'':'s'):'Core signals clear')+'</span></div></div><div class="pulse-grid">'+top.map(x=>'<article class="pulse-insight '+x.tone+'"><div class="pulse-insight-top"><span class="pulse-insight-icon">'+icon(x.icon,15)+'</span><small>'+x.eyebrow+'</small></div><b>'+esc(x.title)+'</b><p>'+esc(x.copy)+'</p><button '+(x.action?'data-action="'+x.action+'"':'data-page="'+x.page+'"')+'>'+(x.actionLabel||x.action||'Open')+' '+icon('chevron',12)+'</button></article>').join('')+'</div></section>';
  }
  function agenda(state,h){
    const {money2,esc,icon}=h,today=new Date(),todayIso=today.toISOString().slice(0,10),end=new Date(today.getTime()+14*86400000).toISOString().slice(0,10),items=[];
    const add=x=>{if(!x.date)return;const d=String(x.date).slice(0,10);if(d>end)return;items.push({...x,date:d,overdue:d<todayIso});};
    (state.customerInvoices||[]).forEach(inv=>{
      const st=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');
      const bal=window.DalasiReturns?.invoiceBalance?.(state,inv)??Math.max(0,Number(inv.amount)||0);
      if(st==='Draft'||st==='Paid'||bal<=.004)return;
      add({type:'Receivable',icon:'reports',title:inv.customerName||'Customer invoice',detail:inv.invoiceNo||inv.id,date:inv.dueDate,amount:bal,action:'invoice-view:'+inv.id});
    });
    (state.businessBills||[]).forEach(b=>{
      if((b.status||'Draft')==='Draft'||b.status==='Paid')return;
      const bal=window.DalasiReturns?.billBalance?.(state,b)??Math.max(0,Number(b.amount)||0);if(bal<=.004)return;
      add({type:'Supplier bill',icon:'file',title:b.supplier||'Supplier bill',detail:b.invoiceNo||b.id,date:b.dueDate,amount:bal,page:'payments'});
    });
    (state.purchaseOrders||[]).forEach(po=>{
      if(['Received','Closed','Cancelled'].includes(po.status))return;
      const d=po.requestedDeliveryDate||po.requiredDate;
      add({type:'Purchase order',icon:'building',title:po.supplierName||'Purchase delivery',detail:po.poNumber||po.id,date:d,amount:Number(po.amount)||0,action:'purchase-view:'+po.id});
    });
    (state.recurringBusinessPayments||[]).forEach(r=>{
      if((r.status||'Active')!=='Active')return;
      add({type:'Recurring payment',icon:'calendar',title:r.payee||r.name||'Recurring commitment',detail:r.description||r.reference||'Scheduled payment',date:r.nextDueDate,amount:Number(r.amount)||0,page:'payments'});
    });
    if(window.DalasiTax?.returnSummary){
      const tax=window.DalasiTax.returnSummary(state,state.taxPeriod||state.currentPeriod),cfg=window.DalasiTax.settings?.(state)||{};
      if(cfg.vatRegistered&&!tax.filed)add({type:'VAT',icon:'shield',title:'VAT return due',detail:'GRA · '+esc(tax.period),date:tax.dueDate,amount:Math.max(0,Number(tax.netVat)||0),page:'tax'});
    }
    items.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const show=items.slice(0,7),overdue=items.filter(x=>x.overdue).length;
    const dateLabel=d=>{
      if(d<todayIso)return 'Overdue';
      if(d===todayIso)return 'Today';
      const days=Math.ceil((new Date(d+'T00:00:00')-new Date(todayIso+'T00:00:00'))/86400000);
      if(days===1)return 'Tomorrow';
      return 'In '+days+' days';
    };
    return '<section class="surface dalasipay-agenda"><div class="agenda-head"><div><span class="eyebrow">DALASIPAY AGENDA</span><h3>Next 14 days</h3><p>Upcoming money, compliance and delivery events in one timeline.</p></div><div class="agenda-summary '+(overdue?'urgent':'')+'"><b>'+items.length+'</b><span>scheduled'+(overdue?' · '+overdue+' overdue':'')+'</span></div></div>'+
      (show.length?'<div class="agenda-list">'+show.map(x=>'<button class="agenda-item '+(x.overdue?'overdue':'')+'" '+(x.action?'data-action="'+x.action+'"':'data-page="'+x.page+'"')+'><span class="agenda-date"><b>'+esc(String(x.date).slice(8,10))+'</b><small>'+esc(new Intl.DateTimeFormat('en-GB',{month:'short'}).format(new Date(x.date+'T00:00:00')))+'</small></span><span class="agenda-icon">'+icon(x.icon,14)+'</span><span class="agenda-copy"><small>'+esc(x.type)+'</small><b>'+esc(x.title)+'</b><em>'+esc(x.detail||'')+'</em></span><span class="agenda-value"><b>'+(x.amount?money2(x.amount):'')+'</b><small>'+esc(dateLabel(x.date))+'</small></span>'+icon('chevron',13)+'</button>').join('')+'</div>':'<div class="agenda-empty">'+icon('check',16)+' Nothing due in the next 14 days.</div>')+
      (items.length>7?'<div class="agenda-more">Showing the next 7 of '+items.length+' scheduled items.</div>':'')+
    '</section>';
  }
  function story(state,h,data){
    const {money2,esc,icon,periodLabel}=h,{ar,inv,salesThisPeriod,cashBalance,billOutstanding,payrollNet}=data;
    const prev=previousPeriod(state.currentPeriod),prevSales=sum((state.customerInvoices||[]).filter(x=>String(x.issueDate||x.createdAt||'').slice(0,7)===prev),x=>x.amount);
    const pnl=window.DalasiProfitLoss?.statement?.(state,state.currentPeriod)||null;
    const prevPnl=prev&&window.DalasiProfitLoss?.statement?.(state,prev)||null;
    const salesDelta=prevSales?Math.round((salesThisPeriod-prevSales)/prevSales*100):null;
    const profitDelta=prevPnl&&Math.abs(prevPnl.netProfit)>.004?Math.round(((pnl?.netProfit||0)-prevPnl.netProfit)/Math.abs(prevPnl.netProfit)*100):null;
    const sentences=[];
    if(salesDelta===null)sentences.push('Sales for '+periodLabel(state.currentPeriod)+' stand at '+money2(salesThisPeriod)+'.');
    else sentences.push('Sales are '+(salesDelta>=0?'up ':'down ')+Math.abs(salesDelta)+'% from last month, at '+money2(salesThisPeriod)+'.');
    if(pnl)sentences.push((pnl.netProfit>=0?'The business is profitable at ':'The business is currently loss-making at ')+money2(pnl.netProfit)+' net '+(pnl.netProfit>=0?'profit':'loss')+', with a '+Number(pnl.netMargin||0).toFixed(1)+'% net margin.');
    if(ar.overdue>0)sentences.push(money2(ar.overdue)+' of receivables is overdue, making collections the clearest working-capital pressure.');
    else if(ar.outstanding>0)sentences.push('Receivables of '+money2(ar.outstanding)+' are currently open with no overdue balance detected.');
    const obligations=billOutstanding+(state.payrollStatus==='Paid'?0:payrollNet);
    if(obligations>0)sentences.push('Available cash of '+money2(cashBalance)+' covers '+(cashBalance/obligations).toFixed(1)+'× open bills'+(state.payrollStatus==='Paid'?'':' and the current payroll')+'.');
    if(inv.low>0)sentences.push(inv.low+' product'+(inv.low===1?' is':'s are')+' at or below reorder level.');
    const changes=[
      {label:'Sales vs prior month',value:salesDelta===null?'New baseline':(salesDelta>=0?'+':'')+salesDelta+'%',tone:salesDelta===null?'neutral':salesDelta>=0?'good':'watch'},
      {label:'Net margin',value:pnl?Number(pnl.netMargin||0).toFixed(1)+'%':'—',tone:!pnl?'neutral':pnl.netProfit<0?'urgent':pnl.netMargin<10?'watch':'good'},
      {label:'Overdue receivables',value:money2(ar.overdue||0),tone:ar.overdue>0?'watch':'good'},
      {label:'Low stock',value:String(inv.low||0),tone:inv.low>0?'watch':'good'}
    ];
    return '<section class="surface dalasipay-story"><div class="story-head"><div class="story-brand"><span>'+icon('file',16)+'</span><div><span class="eyebrow">DALASIPAY STORY</span><h3>'+esc(periodLabel(state.currentPeriod))+' in one minute</h3><p>A plain-language executive summary built from your live records.</p></div></div><button class="secondary tiny" data-action="business-report-view:business-summary">'+icon('eye',12)+' Open summary</button></div><div class="story-body"><div class="story-narrative">'+sentences.slice(0,5).map((s,i)=>'<p><span>'+String(i+1).padStart(2,'0')+'</span>'+esc(s)+'</p>').join('')+'</div><div class="story-changes">'+changes.map(x=>'<div class="'+x.tone+'"><span>'+esc(x.label)+'</span><b>'+esc(x.value)+'</b></div>').join('')+'</div></div></section>';
  }
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
    const hour=new Date().getHours(),part=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
    const greet=part+', '+esc((state.session?.name||'there').split(/\s+/)[0])+'.';
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
    html+=pulse(state,h,{ar,overdueBills,inv,salesThisPeriod,cashBalance,billOutstanding,payrollNet:t.net});
    html+=agenda(state,h);
    html+=story(state,h,{ar,inv,salesThisPeriod,cashBalance,billOutstanding,payrollNet:t.net});
    html+='<div class="surface payroll-summary-strip"><div><span class="eyebrow">'+periodLabel(state.currentPeriod).toUpperCase()+' PAYROLL</span><b>'+(state.payrollStatus==='Ready'?'Ready for approval':esc(state.payrollStatus))+'</b></div><div><small>Gross payroll</small><strong>'+money2(t.gross)+'</strong></div><div><small>Employer cost</small><strong>'+money2(t.employerCost)+'</strong></div><button class="secondary" data-page="payroll">'+(state.payrollStatus==='Ready'?'Review payroll':'Open payroll')+' '+icon('chevron',14)+'</button></div>';
    return html;
  }
  window.DalasiCommandCenter={render};
})();
