(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const periodOf=v=>String(v||'').slice(0,7);
  function cfg(state){return state.controlConfig||{projects:[],costCentres:[]};}
  function projects(state){return (cfg(state).projects||[]).map(x=>({...x,status:x.status||'Active'}));}
  function costCentres(state){return (cfg(state).costCentres||[]).map(x=>({...x,status:x.status||'Active'}));}
  function projectById(state,id){return projects(state).find(x=>x.id===id)||null;}
  function costCentreById(state,id){return costCentres(state).find(x=>x.id===id)||null;}
  function projectSelect(state,name='project',selected='',label='No project / unassigned'){
    return '<select name="'+esc(name)+'"><option value="">'+esc(label)+'</option>'+projects(state).filter(x=>x.status!=='Inactive').map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(x.id)+' · '+esc(x.name)+'</option>').join('')+'</select>';
  }
  function costCentreSelect(state,name='costCentre',selected='',label='No cost centre / unassigned'){
    return '<select name="'+esc(name)+'"><option value="">'+esc(label)+'</option>'+costCentres(state).filter(x=>x.status!=='Inactive').map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?'selected':'')+'>'+esc(x.id)+' · '+esc(x.name)+'</option>').join('')+'</select>';
  }
  function tag(fd){return {project:String(fd.get('project')||''),costCentre:String(fd.get('costCentre')||'')};}
  function label(state,id,type){const x=type==='project'?projectById(state,id):costCentreById(state,id);return x?x.name:(id||'Unassigned');}
  function invoiceStatus(state,inv){return window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');}
  function inPeriod(date,period){return periodOf(date)===period;}
  function taxNetSale(state,x){return round(window.DalasiTax?.meta?.(state,x,'sale')?.taxNet??x.amount??0);}
  function taxNetPurchase(state,x){const t=window.DalasiTax?.meta?.(state,x,'purchase');return round(t?.vatRecoverable?t.taxNet:(x.amount||0));}
  function payrollRows(state,period){
    const run=(state.runs||[]).find(r=>r.period===period&&['Approved','Paid','Closed'].includes(r.status));
    return run?.rows||[];
  }
  function assignment(row,period){return window.DalasiControls?.movementForPeriod?.(row.employee,period)||{project:row.employee?.project||'',costCentre:row.employee?.costCentre||''};}
  function matchDim(x,project,costCentre){
    if(project!==null&&project!==undefined&&String(x.project||'')!==String(project))return false;
    if(costCentre!==null&&costCentre!==undefined&&String(x.costCentre||'')!==String(costCentre))return false;
    return true;
  }
  function cogsForInvoices(state,invoices,period){
    const refs=new Set();
    invoices.forEach(inv=>{if(inv.invoiceNo)refs.add(String(inv.invoiceNo));if(inv.id)refs.add(String(inv.id));});
    let total=0;
    (state.inventoryMovements||[]).forEach(mv=>{
      if(mv.type!=='Sales issue'||!inPeriod(mv.revenueDate||mv.createdAt,period)||!refs.has(String(mv.reference||'')))return;
      let amount=Number(mv.costAmount);
      if(!Number.isFinite(amount)||amount<0){
        const qty=Math.abs(Number(mv.quantity)||0),item=(state.salesCatalog||[]).find(x=>x.id===mv.catalogId),unit=Number.isFinite(Number(mv.unitCost))?Number(mv.unitCost):(Number(item?.costPrice)||0);
        amount=qty*Math.max(0,unit);
      }
      total+=amount;
    });
    return round(total);
  }
  function actuals(state,period,project=null,costCentre=null){
    const invoices=(state.customerInvoices||[]).filter(x=>invoiceStatus(state,x)!=='Draft'&&inPeriod(x.issueDate||x.createdAt,period)&&matchDim(x,project,costCentre));
    const direct=(state.revenueEntries||[]).filter(x=>inPeriod(x.revenueDate||x.createdAt,period)&&matchDim(x,project,costCentre));
    const expenses=(state.businessExpenses||[]).filter(x=>['Approved','Paid'].includes(x.status)&&inPeriod(x.expenseDate||x.createdAt,period)&&matchDim(x,project,costCentre));
    const bills=(state.businessBills||[]).filter(x=>(x.status||'Draft')!=='Draft'&&x.status!=='Paid'&&inPeriod(x.invoiceDate||x.createdAt,period)&&matchDim(x,project,costCentre));
    const revenue=round(invoices.reduce((a,x)=>a+taxNetSale(state,x),0)+direct.reduce((a,x)=>a+taxNetSale(state,x),0));
    const cogs=cogsForInvoices(state,invoices,period);
    const operating=round(expenses.reduce((a,x)=>a+taxNetPurchase(state,x),0));
    let payroll=0,employees=0;
    payrollRows(state,period).forEach(r=>{const a=assignment(r,period);if(project!==null&&project!==undefined&&String(a.project||'')!==String(project))return;if(costCentre!==null&&costCentre!==undefined&&String(a.costCentre||'')!==String(costCentre))return;employees++;payroll+=Number(r.employerCost)||0;});
    payroll=round(payroll);
    const commitments=round(bills.reduce((a,x)=>a+(Number(x.amount)||0),0));
    return {period,project,costCentre,revenue,cogs,operating,payroll,totalCost:round(cogs+operating+payroll),profit:round(revenue-cogs-operating-payroll),margin:revenue?round((revenue-cogs-operating-payroll)/revenue*100):0,invoiceCount:invoices.length,directCount:direct.length,expenseCount:expenses.length,billCount:bills.length,commitments,employees};
  }
  function yearActuals(state,year,project=null,costCentre=null){
    const months=[];for(let m=1;m<=12;m++)months.push(actuals(state,year+'-'+String(m).padStart(2,'0'),project,costCentre));
    const sum=k=>round(months.reduce((a,x)=>a+(Number(x[k])||0),0)),revenue=sum('revenue'),profit=sum('profit');
    return {year,project,costCentre,revenue,cogs:sum('cogs'),operating:sum('operating'),payroll:sum('payroll'),totalCost:sum('totalCost'),profit,margin:revenue?round(profit/revenue*100):0,commitments:sum('commitments'),invoiceCount:sum('invoiceCount'),expenseCount:sum('expenseCount'),billCount:sum('billCount'),months};
  }
  function budgetActual(state,line,year,month){
    const a=actuals(state,year+'-'+month,line.project||'',line.costCentre||'');
    const code=line.categoryCode;
    if(code==='sales-revenue'){
      const invoices=(state.customerInvoices||[]).filter(x=>invoiceStatus(state,x)!=='Draft'&&inPeriod(x.issueDate||x.createdAt,year+'-'+month)&&matchDim(x,line.project||'',line.costCentre||''));
      return round(invoices.reduce((n,x)=>n+taxNetSale(state,x),0));
    }
    if(code==='other-income'){
      return round((state.revenueEntries||[]).filter(x=>inPeriod(x.revenueDate||x.createdAt,year+'-'+month)&&matchDim(x,line.project||'',line.costCentre||'')).reduce((n,x)=>n+taxNetSale(state,x),0));
    }
    if(code==='cogs')return a.cogs;
    if(code==='payroll')return a.payroll;
    if(String(code||'').startsWith('opex:')){
      const cat=String(code).slice(5);return round((state.businessExpenses||[]).filter(x=>['Approved','Paid'].includes(x.status)&&inPeriod(x.expenseDate||x.createdAt,year+'-'+month)&&matchDim(x,line.project||'',line.costCentre||'')&&String(x.category||'Other expense')===cat).reduce((n,x)=>n+taxNetPurchase(state,x),0));
    }
    // Depreciation, asset disposal and manual journals are not dimension-tagged in this version.
    return 0;
  }
  function budgetForDimension(state,year,month,project=null,costCentre=null){
    const lines=(state.businessBudgets||[]).filter(x=>String(x.year)===String(year)&&(project===null||project===undefined||String(x.project||'')===String(project))&&(costCentre===null||costCentre===undefined||String(x.costCentre||'')===String(costCentre)));
    let revenue=0,expense=0;
    const idx=Math.max(0,Number(month)-1);
    lines.forEach(line=>{
      const value=round(Object.entries(line.months||{}).filter(([m])=>Number(m)<=idx+1).reduce((a,[,v])=>a+(Number(v)||0),0));
      if(line.kind==='Revenue')revenue+=value;else expense+=value;
    });
    return {revenue:round(revenue),expense:round(expense),profit:round(revenue-expense),lines:lines.length};
  }
  function dimensionRows(state,type,period){
    const list=type==='project'?projects(state):costCentres(state);
    const key=type==='project'?'project':'costCentre',ids=[...list.map(x=>x.id),''];
    return ids.map(id=>{
      const a=actuals(state,period,type==='project'?id:null,type==='costCentre'?id:null);
      return {id,name:id?label(state,id,type):'Unassigned',...a};
    }).filter(x=>x.revenue||x.totalCost||x.commitments||x.employees||x.id);
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));
    const add=v=>{const p=periodOf(v);if(/^\d{4}-\d{2}$/.test(p))set.add(p);};
    (state.customerInvoices||[]).forEach(x=>add(x.issueDate));(state.revenueEntries||[]).forEach(x=>add(x.revenueDate));(state.businessExpenses||[]).forEach(x=>add(x.expenseDate));(state.businessBills||[]).forEach(x=>add(x.invoiceDate));(state.runs||[]).forEach(x=>set.add(x.period));
    if(state.currentPeriod)set.add(state.currentPeriod);return [...set].sort().reverse();
  }
  function exportCsv(state,type,period,ctx){
    const rows=dimensionRows(state,type,period),title=type==='project'?'Project':'Cost Centre';
    const csv=[[title+' Code',title,'Period','Revenue','COGS','Operating Expenses','Payroll Employer Cost','Total Cost','Profit','Margin %','Open Supplier Commitments','Employees','Invoices','Expenses','Open Bills'],...rows.map(x=>[x.id||'UNASSIGNED',x.name,period,x.revenue,x.cogs,x.operating,x.payroll,x.totalCost,x.profit,x.margin,x.commitments,x.employees,x.invoiceCount,x.expenseCount,x.billCount])].map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');
    ctx.downloadText('dalasipay-'+(type==='project'?'projects':'cost-centres')+'-'+period+'.csv',csv);ctx.toast((type==='project'?'Project':'Cost centre')+' report downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,type=state.dimensionView==='costCentre'?'costCentre':'project',period=state.dimensionPeriod||state.currentPeriod||periods(state)[0],rows=dimensionRows(state,type,period),year=String(period).slice(0,4),month=String(period).slice(5,7);
    const opts=periods(state).map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(p)+'</option>').join('');
    const totals=rows.reduce((a,x)=>({revenue:a.revenue+x.revenue,cost:a.cost+x.totalCost,profit:a.profit+x.profit,commitments:a.commitments+x.commitments}),{revenue:0,cost:0,profit:0,commitments:0});
    const table=rows.length?rows.map(x=>{
      const budget=budgetForDimension(state,year,month,type==='project'?x.id:null,type==='costCentre'?x.id:null);
      const profitVar=round(x.profit-budget.profit);
      return '<tr><td><div class="payment-payee"><b>'+esc(x.id||'UNASSIGNED')+'</b><small>'+esc(x.name)+'</small></div></td><td>'+money2(x.revenue)+'</td><td>'+money2(x.cogs)+'</td><td>'+money2(x.operating)+'</td><td>'+money2(x.payroll)+'</td><td><b>'+money2(x.profit)+'</b><small class="cash-sub">'+x.margin.toFixed(1)+'% margin</small></td><td>'+money2(budget.profit)+'</td><td class="'+(profitVar<0?'dimension-bad':'dimension-good')+'">'+(profitVar>=0?'+':'')+money2(profitVar)+'</td><td>'+money2(x.commitments)+'</td><td>'+x.employees+'</td></tr>';
    }).join(''):'<tr><td colspan="10"><div class="empty-inline">No '+(type==='project'?'project':'cost-centre')+' activity for '+esc(period)+'.</div></td></tr>';
    const actions='<div class="inline-buttons"><button class="secondary" data-action="dimension-export">'+icon('download',14)+' Export</button><button class="secondary" data-action="add-cost-centre">'+icon('plus',14)+' Cost centre</button><button class="primary" data-action="add-project">'+icon('plus',14)+' Project</button></div>';
    return pageTitle('MANAGEMENT ACCOUNTING','Projects & Cost Centres','Track revenue, costs, payroll and budgets by business activity without changing the general ledger.',actions)+
      '<div class="dimension-tabs"><button class="'+(type==='project'?'active':'')+'" data-action="dimension-view:project">Projects</button><button class="'+(type==='costCentre'?'active':'')+'" data-action="dimension-view:costCentre">Cost centres</button><select id="dimension-period-select">'+opts+'</select></div>'+
      '<div class="dimension-kpis"><div class="surface"><span>Linked revenue</span><b>'+money2(totals.revenue)+'</b><small>'+esc(period)+'</small></div><div class="surface"><span>Linked cost</span><b>'+money2(totals.cost)+'</b><small>COGS + expenses + payroll</small></div><div class="surface '+(totals.profit<0?'dimension-alert':'')+'"><span>Linked profit</span><b>'+money2(totals.profit)+'</b><small>before unallocated depreciation/journals</small></div><div class="surface"><span>Open supplier commitments</span><b>'+money2(totals.commitments)+'</b><small>tracked separately from profit</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('reports',17)+'</span><div><b>Management view, not a second ledger</b><p>Project and cost-centre tags classify existing transactions. Supplier bills are shown as commitments and are not added to project expense unless an approved/paid expense exists, which prevents double counting.</p></div></div>'+
      '<section class="surface employee-card dimension-table"><div class="table-tools"><div><h3>'+(type==='project'?'Project profitability':'Cost-centre performance')+'</h3><p>'+esc(period)+' actuals with linked budget profit where available</p></div></div><div class="table-scroll"><table><thead><tr><th>'+(type==='project'?'PROJECT':'COST CENTRE')+'</th><th>REVENUE</th><th>COGS</th><th>OPERATING</th><th>PAYROLL</th><th>PROFIT</th><th>BUDGET PROFIT</th><th>VARIANCE</th><th>OPEN BILLS</th><th>EMPLOYEES</th></tr></thead><tbody>'+table+'</tbody></table></div></section>';
  }

  window.DalasiDimensions={projects,costCentres,projectById,costCentreById,projectSelect,costCentreSelect,tag,actuals,yearActuals,budgetActual,budgetForDimension,dimensionRows,periods,exportCsv,render};
})();