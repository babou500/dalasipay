(function(){
  'use strict';

  const MONTHS=[
    ['01','Jan'],['02','Feb'],['03','Mar'],['04','Apr'],['05','May'],['06','Jun'],
    ['07','Jul'],['08','Aug'],['09','Sep'],['10','Oct'],['11','Nov'],['12','Dec']
  ];
  const BASE_CATEGORIES=[
    {kind:'Revenue',code:'sales-revenue',label:'Sales Revenue'},
    {kind:'Revenue',code:'other-income',label:'Direct / Other Business Income'},
    {kind:'Revenue',code:'asset-gain',label:'Gain on Asset Disposal'},
    {kind:'Expense',code:'cogs',label:'Cost of Goods Sold'},
    {kind:'Expense',code:'payroll',label:'Payroll & Employer Costs'},
    {kind:'Expense',code:'depreciation',label:'Depreciation Expense'},
    {kind:'Expense',code:'asset-loss',label:'Loss on Asset Disposal'},
    {kind:'Expense',code:'manual-operating',label:'Manual / Unallocated Operating Adjustments'}
  ];
  const DEFAULT_EXPENSE_CATEGORIES=['Office & administration','Travel & transport','Utilities','Rent & facilities','Marketing & sales','Professional services','Repairs & maintenance','Supplies & inventory','Meals & hospitality','Staff welfare','Government & statutory','Other expense'];
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const currentYear=state=>String(state.budgetYear||state.currentPeriod||new Date().getFullYear()).slice(0,4);
  const currentMonth=state=>String(state.budgetMonth||state.currentPeriod||'').slice(5,7)||String(new Date().getMonth()+1).padStart(2,'0');
  const monthIndex=m=>Math.max(0,MONTHS.findIndex(x=>x[0]===String(m)));
  function categories(state){
    const seen=new Set(DEFAULT_EXPENSE_CATEGORIES);
    (state.businessExpenses||[]).forEach(x=>{if(x.category)seen.add(String(x.category));});
    return BASE_CATEGORIES.concat([...seen].sort().map(x=>({kind:'Expense',code:'opex:'+x,label:'Operating · '+x,expenseCategory:x})));
  }
  function categoryByCode(state,code){return categories(state).find(x=>x.code===code)||null;}
  function lineMonths(line){
    const out={};MONTHS.forEach(([m])=>out[m]=round(line?.months?.[m]||0));return out;
  }
  function annual(line){return round(Object.values(lineMonths(line)).reduce((a,x)=>a+Number(x||0),0));}
  function ytdBudget(line,month){const idx=monthIndex(month);return round(MONTHS.slice(0,idx+1).reduce((a,[m])=>a+(Number(line?.months?.[m])||0),0));}
  function periodStatement(state,year,month){return window.DalasiProfitLoss?.statement?.(state,year+'-'+month)||null;}
  function actualFor(state,line,year,month){
    const p=periodStatement(state,year,month);if(!p)return 0;
    const code=line.categoryCode;
    if(code==='sales-revenue')return round(p.invoiceRevenue);
    if(code==='other-income')return round((Number(p.directIncome)||0)+(Number(p.manualRevenue)||0));
    if(code==='asset-gain')return round(p.assetDisposalGain);
    if(code==='cogs')return round(p.cogs);
    if(code==='payroll')return round(p.payroll);
    if(code==='depreciation')return round(p.depreciationExpense);
    if(code==='asset-loss')return round(p.assetDisposalLoss);
    if(code==='manual-operating')return round(p.manualOperatingExpenses);
    if(String(code||'').startsWith('opex:')){
      const cat=String(code).slice(5);return round((p.expenseBreakdown||[]).find(x=>x.category===cat)?.amount||0);
    }
    return 0;
  }
  function annualActual(state,line,year){return round(MONTHS.reduce((a,[m])=>a+actualFor(state,line,year,m),0));}
  function ytdActual(state,line,year,month){const idx=monthIndex(month);return round(MONTHS.slice(0,idx+1).reduce((a,[m])=>a+actualFor(state,line,year,m),0));}
  function favorable(line,budget,actual){
    const variance=round(actual-budget);
    return line.kind==='Revenue'?variance:round(budget-actual);
  }
  function status(state,year){return state.budgetStatuses?.[year]||{status:'Draft'};}
  function locked(state,year){return status(state,year).status==='Approved';}
  function years(state){
    const set=new Set((state.businessBudgets||[]).map(x=>String(x.year)));
    (state.periods||[]).forEach(x=>set.add(String(x.id||'').slice(0,4)));
    if(state.currentPeriod)set.add(String(state.currentPeriod).slice(0,4));
    set.add(String(new Date().getFullYear()));
    return [...set].filter(x=>/^\d{4}$/.test(x)).sort().reverse();
  }
  function linesFor(state,year){return (state.businessBudgets||[]).filter(x=>String(x.year)===String(year)).slice().sort((a,b)=>(a.kind||'').localeCompare(b.kind||'')||(a.label||'').localeCompare(b.label||''));}
  function summary(state,year,month){
    const lines=linesFor(state,year),idx=monthIndex(month);
    let annualBudgetRevenue=0,annualActualRevenue=0,annualBudgetExpense=0,annualActualExpense=0,ytdBudgetRevenue=0,ytdActualRevenue=0,ytdBudgetExpense=0,ytdActualExpense=0;
    lines.forEach(line=>{
      const ab=annual(line),aa=annualActual(state,line,year),yb=ytdBudget(line,month),ya=ytdActual(state,line,year,month);
      if(line.kind==='Revenue'){annualBudgetRevenue+=ab;annualActualRevenue+=aa;ytdBudgetRevenue+=yb;ytdActualRevenue+=ya;}
      else{annualBudgetExpense+=ab;annualActualExpense+=aa;ytdBudgetExpense+=yb;ytdActualExpense+=ya;}
    });
    const monthly=[];
    MONTHS.forEach(([m,label],i)=>{
      let br=0,ar=0,be=0,ae=0;
      lines.forEach(line=>{const b=Number(line.months?.[m])||0,a=actualFor(state,line,year,m);if(line.kind==='Revenue'){br+=b;ar+=a}else{be+=b;ae+=a}});
      monthly.push({month:m,label,budgetRevenue:round(br),actualRevenue:round(ar),budgetExpense:round(be),actualExpense:round(ae),budgetProfit:round(br-be),actualProfit:round(ar-ae),isFuture:i>idx});
    });
    return {
      lines:lines.length,annualBudgetRevenue:round(annualBudgetRevenue),annualActualRevenue:round(annualActualRevenue),annualBudgetExpense:round(annualBudgetExpense),annualActualExpense:round(annualActualExpense),
      annualBudgetProfit:round(annualBudgetRevenue-annualBudgetExpense),annualActualProfit:round(annualActualRevenue-annualActualExpense),
      ytdBudgetRevenue:round(ytdBudgetRevenue),ytdActualRevenue:round(ytdActualRevenue),ytdBudgetExpense:round(ytdBudgetExpense),ytdActualExpense:round(ytdActualExpense),
      ytdBudgetProfit:round(ytdBudgetRevenue-ytdBudgetExpense),ytdActualProfit:round(ytdActualRevenue-ytdActualExpense),monthly
    };
  }
  function nextId(){return 'BUD-'+Date.now().toString(36).toUpperCase();}
  function modal(state,h){
    const {field,icon}=h,year=currentYear(state),id=state.budgetLineId||'',existing=(state.businessBudgets||[]).find(x=>x.id===id),cats=categories(state),selectedKind=existing?.kind||'Expense',selectedCode=existing?.categoryCode||(selectedKind==='Revenue'?'sales-revenue':'opex:Office & administration'),months=lineMonths(existing);
    const options=cats.map(c=>'<option value="'+esc(c.code)+'" '+(c.code===selectedCode?'selected':'')+'>'+esc(c.kind+' · '+c.label)+'</option>').join('');
    const monthFields=MONTHS.map(([m,label])=>field(label+' (GMD)','<input name="m'+m+'" type="number" min="0" step="0.01" value="'+Number(months[m]||0)+'">')).join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-budget-line"></div><form id="budget-line-form" class="modal-box budget-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">MANAGEMENT BUDGET</div><h2>'+(existing?'Edit budget line':'Add budget line')+'</h2><p>'+esc(year)+' planning amounts. Actuals remain calculated from the accounting records.</p></div><button type="button" class="close" data-action="close-budget-line">×</button></div>'+
      '<input type="hidden" name="id" value="'+esc(existing?.id||'')+'"><input type="hidden" name="year" value="'+esc(year)+'">'+
      '<div class="form-grid">'+field('Budget category','<select name="categoryCode">'+options+'</select>')+field('Annual amount · optional quick spread','<input name="annualAmount" type="number" min="0" step="0.01" value="0" placeholder="Enter annual total only if monthly boxes are blank">')+'</div>'+
      '<div class="budget-month-grid">'+monthFields+'</div>'+
      field('Budget note','<input name="note" value="'+esc(existing?.note||'')+'" placeholder="Optional assumption, target or planning note">')+
      '<div class="modal-note">If all monthly amounts are zero and you enter an annual amount, DalasiPay spreads it equally across the 12 months. You can then edit individual months later.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-budget-line">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' '+(existing?'Save changes':'Add budget line')+'</button></div></form></div>';
  }
  function saveLine(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to manage budgets.');return;}
    const fd=new FormData(ev.target),year=String(fd.get('year')||currentYear(state));if(locked(state,year)){ctx.toast('This annual budget is approved. Reopen it before editing.');return;}
    const cat=categoryByCode(state,String(fd.get('categoryCode')||''));if(!cat){ctx.toast('Choose a valid budget category.');return;}
    let months={};MONTHS.forEach(([m])=>months[m]=Math.max(0,round(fd.get('m'+m))));
    const annualAmount=Math.max(0,round(fd.get('annualAmount'))),monthTotal=Object.values(months).reduce((a,x)=>a+x,0);
    if(monthTotal<=0&&annualAmount>0){
      const base=Math.floor((annualAmount/12)*100)/100;MONTHS.forEach(([m])=>months[m]=base);
      months['12']=round(months['12']+(annualAmount-round(base*12)));
    }
    if(Object.values(months).every(x=>x<=0)){ctx.toast('Enter at least one monthly budget amount or an annual amount.');return;}
    state.businessBudgets=state.businessBudgets||[];
    const id=String(fd.get('id')||''),duplicate=state.businessBudgets.find(x=>String(x.year)===year&&x.categoryCode===cat.code&&x.id!==id);
    if(duplicate){ctx.toast('That category already has a budget line for '+year+'. Edit the existing line instead.');return;}
    const now=new Date().toISOString(),record={id:id||nextId(),year,kind:cat.kind,categoryCode:cat.code,label:cat.label,months,note:String(fd.get('note')||'').trim(),updatedAt:now,updatedBy:state.session?.name||'User'};
    if(id){const i=state.businessBudgets.findIndex(x=>x.id===id);if(i>=0)record.createdAt=state.businessBudgets[i].createdAt||now,record.createdBy=state.businessBudgets[i].createdBy||state.session?.name||'User',state.businessBudgets[i]=record;else state.businessBudgets.unshift({...record,createdAt:now,createdBy:state.session?.name||'User'});}
    else state.businessBudgets.unshift({...record,createdAt:now,createdBy:state.session?.name||'User'});
    state.budgetLineOpen=false;state.budgetLineId=null;ctx.audit('budget.line_saved',{id:record.id,year,category:cat.label,annualAmount:annual(record)});ctx.save();ctx.toast('Budget line saved');ctx.render();
  }
  function removeLine(id,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to manage budgets.');return;}
    const line=(state.businessBudgets||[]).find(x=>x.id===id);if(!line)return;if(locked(state,line.year)){ctx.toast('This annual budget is approved. Reopen it before deleting lines.');return;}
    state.businessBudgets=state.businessBudgets.filter(x=>x.id!==id);ctx.audit('budget.line_deleted',{id,year:line.year,category:line.label});ctx.save();ctx.toast('Budget line removed');ctx.render();
  }
  function approve(year,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can approve an annual budget.');return;}
    if(!linesFor(state,year).length){ctx.toast('Add at least one budget line before approval.');return;}
    state.budgetStatuses=state.budgetStatuses||{};state.budgetStatuses[year]={status:'Approved',approvedAt:new Date().toISOString(),approvedBy:state.session?.name||'User'};ctx.audit('budget.approved',{year,lines:linesFor(state,year).length});ctx.save();ctx.toast(year+' budget approved and locked');ctx.render();
  }
  function reopen(year,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen an approved budget.');return;}
    state.budgetStatuses=state.budgetStatuses||{};state.budgetStatuses[year]={status:'Draft',reopenedAt:new Date().toISOString(),reopenedBy:state.session?.name||'User'};ctx.audit('budget.reopened',{year});ctx.save();ctx.toast(year+' budget reopened');ctx.render();
  }
  function exportCsv(state,year,ctx){
    const month=currentMonth(state),rows=linesFor(state,year);
    const header=['Type','Category',...MONTHS.map(x=>x[1]+' Budget'),'Annual Budget','YTD Budget','YTD Actual','YTD Favorable/(Unfavorable)','Annual Actual','Annual Favorable/(Unfavorable)','Note'];
    const data=rows.map(line=>[line.kind,line.label,...MONTHS.map(([m])=>line.months?.[m]||0),annual(line),ytdBudget(line,month),ytdActual(state,line,year,month),favorable(line,ytdBudget(line,month),ytdActual(state,line,year,month)),annualActual(state,line,year),favorable(line,annual(line),annualActual(state,line,year)),line.note||'']);
    const csv=[header,...data].map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-budget-vs-actual-'+year+'.csv',csv);ctx.toast('Budget vs actual report downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,year=currentYear(state),month=currentMonth(state),lines=linesFor(state,year),sum=summary(state,year,month),st=status(state,year),isLocked=st.status==='Approved',yearOpts=years(state).map(y=>'<option value="'+esc(y)+'" '+(y===year?'selected':'')+'>'+esc(y)+'</option>').join(''),monthOpts=MONTHS.map(([m,l])=>'<option value="'+m+'" '+(m===month?'selected':'')+'>'+l+'</option>').join('');
    const rows=lines.length?lines.map(line=>{const yb=ytdBudget(line,month),ya=ytdActual(state,line,year,month),fav=favorable(line,yb,ya),aa=annualActual(state,line,year),afav=favorable(line,annual(line),aa);return '<tr>'+
      '<td><div class="payment-payee"><b>'+esc(line.label)+'</b><small>'+esc(line.kind)+(line.note?' · '+esc(line.note):'')+'</small></div></td>'+
      '<td>'+money2(annual(line))+'</td><td>'+money2(yb)+'</td><td>'+money2(ya)+'</td><td class="'+(fav<0?'budget-bad':'budget-good')+'">'+(fav>=0?'+':'')+money2(fav)+'</td><td>'+money2(aa)+'</td><td class="'+(afav<0?'budget-bad':'budget-good')+'">'+(afav>=0?'+':'')+money2(afav)+'</td>'+
      '<td><div class="inline-buttons"><button class="secondary tiny" data-action="budget-edit:'+esc(line.id)+'" '+(isLocked?'disabled':'')+'>Edit</button><button class="secondary tiny" data-action="budget-delete:'+esc(line.id)+'" '+(isLocked?'disabled':'')+'>Delete</button></div></td></tr>';}).join(''):'<tr><td colspan="8"><div class="empty-inline">No budget lines for '+esc(year)+'. Add revenue and expense targets to begin budget vs actual reporting.</div></td></tr>';
    const monthlyRows=sum.monthly.map(x=>{const b=x.budgetProfit,a=x.actualProfit,v=round(a-b);return '<tr class="'+(x.month===month?'budget-current-month':'')+'"><td><b>'+esc(x.label)+'</b></td><td>'+money2(x.budgetRevenue)+'</td><td>'+money2(x.actualRevenue)+'</td><td>'+money2(x.budgetExpense)+'</td><td>'+money2(x.actualExpense)+'</td><td>'+money2(b)+'</td><td>'+money2(a)+'</td><td class="'+(v<0?'budget-bad':'budget-good')+'">'+(v>=0?'+':'')+money2(v)+'</td></tr>';}).join('');
    const ytdProfitVar=round(sum.ytdActualProfit-sum.ytdBudgetProfit),annualProfitVar=round(sum.annualActualProfit-sum.annualBudgetProfit);
    const actions='<div class="inline-buttons"><button class="secondary" data-action="budget-export">'+icon('download',14)+' Export</button>'+(isLocked?'<button class="secondary" data-action="budget-reopen:'+esc(year)+'">Reopen budget</button>':'<button class="secondary" data-action="budget-approve:'+esc(year)+'" '+(!lines.length?'disabled':'')+'>'+icon('check',14)+' Approve budget</button><button class="primary" data-action="open-budget-line">'+icon('plus',14)+' Add budget line</button>')+'</div>';
    return pageTitle('PLANNING & PERFORMANCE','Budgets','Set annual financial targets and compare them with actual P&L performance without changing the accounting records.',actions)+
      '<div class="budget-toolbar surface"><div><span>Budget year</span><select id="budget-year-select">'+yearOpts+'</select></div><div><span>YTD through</span><select id="budget-month-select">'+monthOpts+'</select></div><div class="budget-status"><span>Status</span>'+pill(st.status||'Draft',isLocked?'paid':'neutral')+(isLocked&&st.approvedBy?'<small>Approved by '+esc(st.approvedBy)+'</small>':'')+'</div></div>'+
      '<div class="budget-kpis"><div class="surface"><span>YTD revenue</span><b>'+money2(sum.ytdActualRevenue)+'</b><small>budget '+money2(sum.ytdBudgetRevenue)+'</small></div><div class="surface"><span>YTD expenses</span><b>'+money2(sum.ytdActualExpense)+'</b><small>budget '+money2(sum.ytdBudgetExpense)+'</small></div><div class="surface"><span>YTD profit</span><b>'+money2(sum.ytdActualProfit)+'</b><small>budget '+money2(sum.ytdBudgetProfit)+'</small></div><div class="surface '+(ytdProfitVar<0?'budget-alert':'')+'"><span>YTD profit variance</span><b>'+(ytdProfitVar>=0?'+':'')+money2(ytdProfitVar)+'</b><small>'+(ytdProfitVar>=0?'ahead of plan':'below plan')+'</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('reports',17)+'</span><div><b>Actuals come directly from the P&L</b><p>Sales, direct income, cost of goods sold, payroll, operating expenses, depreciation and asset disposal results use the same accounting calculations as DalasiPay financial statements. Budgets never post journals.</p></div></div>'+
      '<section class="surface employee-card budget-lines"><div class="table-tools"><div><h3>'+esc(year)+' budget vs actual</h3><p>YTD through '+esc(MONTHS[monthIndex(month)][1])+' · favorable variance is positive</p></div><div><b class="'+(annualProfitVar<0?'budget-bad':'budget-good')+'">Annual profit variance '+(annualProfitVar>=0?'+':'')+money2(annualProfitVar)+'</b></div></div><div class="table-scroll"><table><thead><tr><th>CATEGORY</th><th>ANNUAL BUDGET</th><th>YTD BUDGET</th><th>YTD ACTUAL</th><th>YTD VARIANCE</th><th>ANNUAL ACTUAL</th><th>ANNUAL VARIANCE</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>'+
      '<section class="surface employee-card budget-monthly"><div class="table-tools"><div><h3>Monthly management performance</h3><p>Revenue, expenses and profit by month</p></div></div><div class="table-scroll"><table><thead><tr><th>MONTH</th><th>BUDGET REVENUE</th><th>ACTUAL REVENUE</th><th>BUDGET EXPENSE</th><th>ACTUAL EXPENSE</th><th>BUDGET PROFIT</th><th>ACTUAL PROFIT</th><th>PROFIT VARIANCE</th></tr></thead><tbody>'+monthlyRows+'</tbody></table></div></section>';
  }

  window.DalasiBudgets={MONTHS,categories,categoryByCode,annual,ytdBudget,actualFor,annualActual,ytdActual,favorable,status,locked,years,linesFor,summary,modal,saveLine,removeLine,approve,reopen,exportCsv,render};
})();