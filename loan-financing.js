(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const periodOf=v=>String(v||'').slice(0,7);
  function addMonths(dateStr,months){
    const [y,m,d]=String(dateStr||'').split('-').map(Number);if(!y||!m||!d)return '';
    const dt=new Date(Date.UTC(y,m-1+months,1)),last=new Date(Date.UTC(dt.getUTCFullYear(),dt.getUTCMonth()+1,0)).getUTCDate();
    return dt.getUTCFullYear()+'-'+String(dt.getUTCMonth()+1).padStart(2,'0')+'-'+String(Math.min(d,last)).padStart(2,'0');
  }
  function pmt(principal,annualRate,termMonths){
    const p=Math.max(0,Number(principal)||0),n=Math.max(1,Number(termMonths)||1),r=Math.max(0,Number(annualRate)||0)/100/12;
    if(!r)return round(p/n);
    return round(p*r/(1-Math.pow(1+r,-n)));
  }
  function schedule(loan){
    const p=Math.max(0,Number(loan?.principal)||0),n=Math.max(1,Number(loan?.termMonths)||1),annualRate=Math.max(0,Number(loan?.annualRate)||0),rate=annualRate/100/12,payment=pmt(p,annualRate,n),rows=[];
    let balance=round(p);
    for(let i=0;i<n;i++){
      const interest=round(balance*rate),principal=round(i===n-1?balance:Math.max(0,payment-interest)),amount=round(principal+interest),after=round(Math.max(0,balance-principal));
      rows.push({index:i+1,dueDate:addMonths(loan.firstPaymentDate,i),period:periodOf(addMonths(loan.firstPaymentDate,i)),openingBalance:balance,principal,interest,amount,balanceAfter:after});
      balance=after;
    }
    return rows;
  }
  function byId(state,id){return (state.businessLoans||[]).find(x=>x.id===id)||null;}
  function repayments(state,id){return (state.loanRepayments||[]).filter(x=>x.loanId===id);}
  function accruals(state,id){return (state.loanInterestAccruals||[]).filter(x=>x.loanId===id&&x.status==='Posted');}
  function rowPaid(state,loan,row){return repayments(state,loan.id).some(x=>Number(x.scheduleIndex)===Number(row.index));}
  function rowAccrued(state,loan,row){return accruals(state,loan.id).some(x=>Number(x.scheduleIndex)===Number(row.index));}
  function outstandingPrincipal(state,loan){
    const paid=repayments(state,loan.id).reduce((a,x)=>a+(Number(x.principal)||0),0);return round(Math.max(0,(Number(loan.principal)||0)-paid));
  }
  function accruedInterestPayable(state,loan){
    const accrued=accruals(state,loan.id).reduce((a,x)=>a+(Number(x.amount)||0),0),paid=repayments(state,loan.id).reduce((a,x)=>a+(Number(x.interest)||0),0);return round(Math.max(0,accrued-paid));
  }
  function status(state,loan){
    const out=outstandingPrincipal(state,loan);if(loan.status==='Closed'||out<=0.005)return 'Closed';if(loan.status==='Cancelled')return 'Cancelled';return 'Active';
  }
  function nextDue(state,loan){
    return schedule(loan).find(r=>!rowPaid(state,loan,r))||null;
  }
  function summary(state){
    const loans=(state.businessLoans||[]).filter(x=>status(state,x)!=='Cancelled'),active=loans.filter(x=>status(state,x)==='Active');
    const principal=round(loans.reduce((a,x)=>a+(Number(x.principal)||0),0)),outstanding=round(active.reduce((a,x)=>a+outstandingPrincipal(state,x),0)),interestPayable=round(active.reduce((a,x)=>a+accruedInterestPayable(state,x),0));
    const thisPeriod=String(state.loanPeriod||state.currentPeriod||'');
    const interestDue=round(active.reduce((a,l)=>a+schedule(l).filter(r=>r.period===thisPeriod&&!rowAccrued(state,l,r)).reduce((s,r)=>s+r.interest,0),0));
    const overdue=active.reduce((a,l)=>a+schedule(l).filter(r=>r.dueDate<todayIso()&&!rowPaid(state,l,r)).length,0);
    return {count:loans.length,active:active.length,principal,outstanding,interestPayable,interestDue,overdue};
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));
    (state.businessLoans||[]).forEach(l=>schedule(l).forEach(r=>set.add(r.period)));
    (state.loanInterestAccruals||[]).forEach(x=>set.add(x.period));
    (state.loanRepayments||[]).forEach(x=>set.add(periodOf(x.date)));
    if(state.currentPeriod)set.add(state.currentPeriod);
    return [...set].filter(x=>/^\d{4}-\d{2}$/.test(x)).sort().reverse();
  }
  function periodStatus(state,period){
    const due=[];
    (state.businessLoans||[]).filter(l=>status(state,l)==='Active').forEach(l=>schedule(l).filter(r=>r.period===period&&r.interest>0).forEach(r=>due.push({loan:l,row:r,posted:rowAccrued(state,l,r)})));
    return {eligible:due.length,posted:due.filter(x=>x.posted).length,missing:due.filter(x=>!x.posted).length,missingRows:due.filter(x=>!x.posted)};
  }
  function loanModal(state,h){
    const {field,icon}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-loan"></div><form id="loan-form" class="modal-box loan-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">BUSINESS FINANCING</div><h2>Add loan / borrowing</h2><p>Create a principal register and monthly reducing-balance repayment schedule.</p></div><button type="button" class="close" data-action="close-loan">×</button></div>'+
      '<div class="form-grid">'+
        field('Lender','<input name="lender" placeholder="Bank, finance company or lender" required>')+
        field('Facility / agreement reference','<input name="reference" placeholder="Loan agreement or facility number">')+
        field('Recognition source','<select name="source"><option>Cash drawdown</option><option>Opening balance</option></select>')+
        field('Principal amount (GMD)','<input name="principal" type="number" min="0.01" step="0.01" required>')+
        field('Annual interest rate (%)','<input name="annualRate" type="number" min="0" max="100" step="0.01" value="0" required>')+
        field('Term (months)','<input name="termMonths" type="number" min="1" max="600" step="1" value="12" required>')+
        field('Loan / drawdown date','<input name="startDate" type="date" value="'+todayIso()+'" required>')+
        field('First repayment date','<input name="firstPaymentDate" type="date" value="'+addMonths(todayIso(),1)+'" required>')+
        field('Receive funds into',window.DalasiCashBank?.accountSelect?.(state,'accountId','','Required for cash drawdown')||'<select name="accountId"><option value="">No cash account</option></select>')+
      '</div>'+
      field('Purpose / note','<input name="note" placeholder="Optional financing purpose or covenant note">')+
      '<div class="modal-note">Cash drawdown increases Cash & Bank and Loans & Borrowings. Opening balance records the loan against Opening Balance Equity without inventing a cash movement.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-loan">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Add loan</button></div></form></div>';
  }
  function createLoan(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add financing.');return;}
    const fd=new FormData(ev.target),lender=String(fd.get('lender')||'').trim(),principal=round(fd.get('principal')),annualRate=Math.max(0,Number(fd.get('annualRate'))||0),termMonths=Math.max(1,Math.round(Number(fd.get('termMonths'))||0)),startDate=String(fd.get('startDate')||''),firstPaymentDate=String(fd.get('firstPaymentDate')||''),source=String(fd.get('source'))==='Opening balance'?'Opening balance':'Cash drawdown',accountId=String(fd.get('accountId')||'');
    if(!lender||principal<=0||!startDate||!firstPaymentDate){ctx.toast('Lender, principal, loan date and first repayment date are required.');return;}
    if(firstPaymentDate<startDate){ctx.toast('First repayment date cannot be before the loan date.');return;}
    if(window.DalasiMonthClose?.isClosed(state,startDate)){ctx.toast('The loan date falls in a closed accounting period. Reopen it before adding the loan.');return;}
    if(source==='Cash drawdown'&&!window.DalasiCashBank?.accountById?.(state,accountId)){ctx.toast('Choose the Cash & Bank account that received the loan funds.');return;}
    const id='LOAN-'+Date.now().toString(36).toUpperCase(),now=new Date().toISOString(),record={id,lender,reference:String(fd.get('reference')||'').trim(),source,principal,annualRate,termMonths,startDate,firstPaymentDate,accountId:source==='Cash drawdown'?accountId:null,note:String(fd.get('note')||'').trim(),status:'Active',createdAt:now,createdBy:state.session?.name||'User'};
    state.businessLoans=state.businessLoans||[];state.businessLoans.unshift(record);
    if(source==='Cash drawdown')window.DalasiCashBank?.post?.(state,{accountId,date:startDate,direction:'in',amount:principal,type:'Loan drawdown',counterparty:lender,reference:record.reference||id,description:record.note||'Business loan proceeds',sourceType:'loan-drawdown',sourceId:id,sourceKey:'loan:'+id+':drawdown',createdBy:state.session?.name||'User'});
    state.loanOpen=false;ctx.audit('loan.created',{loanId:id,lender,principal,annualRate,termMonths,source});ctx.save();ctx.toast('Loan added');ctx.render();
  }
  function accruePeriod(period,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to post loan interest.');return;}
    if(window.DalasiMonthClose?.isClosed(state,period)){ctx.toast('That accounting period is closed. Reopen it before posting loan interest.');return;}
    const ps=periodStatus(state,period);if(!ps.missing){ctx.toast('No loan interest is waiting to be posted for '+period+'.');return;}
    state.loanInterestAccruals=state.loanInterestAccruals||[];const now=new Date().toISOString();
    ps.missingRows.forEach(({loan,row})=>state.loanInterestAccruals.unshift({id:'LINT-'+Date.now().toString(36).toUpperCase()+'-'+loan.id+'-'+row.index,loanId:loan.id,lender:loan.lender,scheduleIndex:row.index,period,date:row.dueDate,amount:row.interest,status:'Posted',postedAt:now,postedBy:state.session?.name||'User'}));
    ctx.audit('loan.interest_accrued',{period,count:ps.missing,amount:round(ps.missingRows.reduce((a,x)=>a+x.row.interest,0))});ctx.save();ctx.toast('Loan interest posted for '+period);ctx.render();
  }
  function repaymentModal(state,h){
    const {field,icon,money2}=h,loan=byId(state,state.loanRepayId);if(!loan)return '';
    const row=nextDue(state,loan);if(!row)return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-loan-repayment"></div><div class="modal-box"><div class="modal-head"><div><h2>Loan fully repaid</h2></div><button class="close" data-action="close-loan-repayment">×</button></div></div></div>';
    const account=window.DalasiCashBank?.accountSelect?.(state,'accountId','','Account used for repayment')||'<select name="accountId"><option value="">No cash account</option></select>';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-loan-repayment"></div><form id="loan-repayment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">LOAN REPAYMENT</div><h2>'+esc(loan.lender)+'</h2><p>Installment '+row.index+' of '+loan.termMonths+' · due '+esc(row.dueDate)+'</p></div><button type="button" class="close" data-action="close-loan-repayment">×</button></div>'+
      '<div class="loan-payment-split"><div><span>Total installment</span><b>'+money2(row.amount)+'</b></div><div><span>Principal</span><b>'+money2(row.principal)+'</b></div><div><span>Interest</span><b>'+money2(row.interest)+'</b></div><div><span>Balance after</span><b>'+money2(row.balanceAfter)+'</b></div></div>'+
      '<input type="hidden" name="loanId" value="'+esc(loan.id)+'"><input type="hidden" name="scheduleIndex" value="'+row.index+'">'+
      '<div class="form-grid">'+field('Payment date','<input name="date" type="date" value="'+todayIso()+'" required>')+field('Cash & Bank account',account)+field('Reference','<input name="reference" placeholder="Bank reference or receipt">')+'</div>'+
      '<div class="modal-note">DalasiPay records the scheduled installment exactly. Interest must be accrued to the installment month before repayment can be posted; if it is still open, DalasiPay will post that accrual automatically.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-loan-repayment">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Record repayment</button></div></form></div>';
  }
  function saveRepayment(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to record loan repayments.');return;}
    const fd=new FormData(ev.target),loan=byId(state,String(fd.get('loanId')||'')),idx=Number(fd.get('scheduleIndex')),date=String(fd.get('date')||''),accountId=String(fd.get('accountId')||''),reference=String(fd.get('reference')||'').trim();if(!loan)return;
    const row=schedule(loan).find(x=>x.index===idx);if(!row||rowPaid(state,loan,row)){ctx.toast('That installment is already paid or no longer available.');return;}
    if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('The repayment date falls in a closed accounting period. Reopen it before posting payment.');return;}
    if(!window.DalasiCashBank?.accountById?.(state,accountId)){ctx.toast('Choose the Cash & Bank account used for repayment.');return;}
    if(row.interest>0&&!rowAccrued(state,loan,row)){
      if(window.DalasiMonthClose?.isClosed(state,row.period)){ctx.toast('Interest for '+row.period+' was not accrued and that period is closed. Reopen it before recording this repayment.');return;}
      state.loanInterestAccruals=state.loanInterestAccruals||[];state.loanInterestAccruals.unshift({id:'LINT-'+Date.now().toString(36).toUpperCase()+'-'+loan.id+'-'+row.index,loanId:loan.id,lender:loan.lender,scheduleIndex:row.index,period:row.period,date:row.dueDate,amount:row.interest,status:'Posted',postedAt:new Date().toISOString(),postedBy:state.session?.name||'User'});
    }
    const tx=window.DalasiCashBank?.post?.(state,{accountId,date,direction:'out',amount:row.amount,type:'Loan repayment',counterparty:loan.lender,reference:reference||loan.reference||loan.id,description:'Installment '+row.index+' · principal '+row.principal+' · interest '+row.interest,sourceType:'loan-repayment',sourceId:loan.id,sourceKey:'loan:'+loan.id+':repayment:'+row.index,createdBy:state.session?.name||'User'});
    if(!tx){ctx.toast('Unable to record the cash repayment.');return;}
    state.loanRepayments=state.loanRepayments||[];const rec={id:'LRP-'+Date.now().toString(36).toUpperCase(),loanId:loan.id,lender:loan.lender,scheduleIndex:row.index,dueDate:row.dueDate,date,amount:row.amount,principal:row.principal,interest:row.interest,accountId,reference,cashTransactionId:tx.id,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'};state.loanRepayments.unshift(rec);
    if(outstandingPrincipal(state,loan)<=0.005){loan.status='Closed';loan.closedAt=rec.createdAt;loan.closedBy=rec.createdBy;}
    state.loanRepayId=null;ctx.audit('loan.repayment_recorded',{loanId:loan.id,scheduleIndex:row.index,amount:row.amount,principal:row.principal,interest:row.interest,date});ctx.save();ctx.toast('Loan repayment recorded');ctx.render();
  }
  function exportCsv(state,ctx){
    const rows=[['Loan Financing Register'],[],['Loan ID','Lender','Reference','Source','Principal','Annual Rate %','Term Months','Start Date','First Payment','Outstanding Principal','Accrued Interest Payable','Status']];
    (state.businessLoans||[]).forEach(l=>rows.push([l.id,l.lender,l.reference||'',l.source,l.principal,l.annualRate,l.termMonths,l.startDate,l.firstPaymentDate,outstandingPrincipal(state,l),accruedInterestPayable(state,l),status(state,l)]));
    rows.push([],['Repayment Schedule'],['Loan ID','Installment','Due Date','Opening Balance','Principal','Interest','Total','Balance After','Interest Accrued','Paid']);
    (state.businessLoans||[]).forEach(l=>schedule(l).forEach(r=>rows.push([l.id,r.index,r.dueDate,r.openingBalance,r.principal,r.interest,r.amount,r.balanceAfter,rowAccrued(state,l,r)?'Yes':'No',rowPaid(state,l,r)?'Yes':'No'])));
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-loans-'+todayIso()+'.csv',csv);ctx.toast('Loan register downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,s=summary(state),period=state.loanPeriod||state.currentPeriod||periods(state)[0],ps=periodStatus(state,period),opts=periods(state).map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(p)+'</option>').join('');
    const loans=(state.businessLoans||[]).slice().sort((a,b)=>String(b.startDate).localeCompare(String(a.startDate)));
    const table=loans.length?loans.map(l=>{const nd=nextDue(state,l),out=outstandingPrincipal(state,l),int=accruedInterestPayable(state,l),st=status(state,l);return '<tr><td><div class="payment-payee"><b>'+esc(l.lender)+'</b><small>'+esc(l.reference||l.id)+'</small></div></td><td>'+money2(l.principal)+'</td><td>'+Number(l.annualRate||0).toFixed(2)+'%</td><td>'+l.termMonths+' mo</td><td><b>'+money2(out)+'</b><small class="cash-sub">interest payable '+money2(int)+'</small></td><td>'+(nd?('<b>'+esc(nd.dueDate)+'</b><small class="cash-sub">'+money2(nd.amount)+'</small>'):'—')+'</td><td>'+pill(st,st==='Closed'?'paid':'ready')+'</td><td>'+(st==='Active'?'<button class="primary tiny" data-action="loan-repay:'+esc(l.id)+'">Repay next</button>':'')+'</td></tr>';}).join(''):'<tr><td colspan="8"><div class="empty-inline">No business loans have been added yet.</div></td></tr>';
    const history=(state.loanRepayments||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60),historyRows=history.length?history.map(x=>'<tr><td>'+esc(x.date)+'</td><td><b>'+esc(x.lender||x.loanId)+'</b><small>'+esc(x.reference||'')+'</small></td><td>'+money2(x.principal)+'</td><td>'+money2(x.interest)+'</td><td><b>'+money2(x.amount)+'</b></td><td>'+x.scheduleIndex+'</td></tr>').join(''):'<tr><td colspan="6"><div class="empty-inline">No loan repayments recorded yet.</div></td></tr>';
    return pageTitle('FINANCING','Loans & Debt','Track borrowings, monthly interest accruals, scheduled repayments and outstanding principal.','<div class="inline-buttons"><button class="secondary" data-action="loan-export">'+icon('download',14)+' Export</button><button class="primary" data-action="open-loan">'+icon('plus',14)+' Add loan</button></div>')+
      '<div class="loan-kpis"><div class="surface"><span>Active loans</span><b>'+s.active+'</b><small>'+s.count+' total facilities</small></div><div class="surface"><span>Outstanding principal</span><b>'+money2(s.outstanding)+'</b><small>registered loan balance</small></div><div class="surface"><span>Accrued interest payable</span><b>'+money2(s.interestPayable)+'</b><small>posted but unpaid</small></div><div class="surface '+(s.overdue?'loan-alert':'')+'"><span>Overdue installments</span><b>'+s.overdue+'</b><small>scheduled payments past due</small></div></div>'+
      '<section class="surface loan-interest-card"><div class="table-tools"><div><h3>Monthly interest accrual</h3><p>Recognize finance cost in the month it relates to, independently of the cash repayment date.</p></div><div class="inline-buttons"><select id="loan-period-select">'+opts+'</select><button class="primary" data-action="loan-accrue" '+(!ps.missing?'disabled':'')+'>'+icon('check',14)+' Post interest</button></div></div><div class="loan-interest-grid"><div><span>Installments with interest</span><b>'+ps.eligible+'</b></div><div><span>Accrued</span><b>'+ps.posted+'</b></div><div><span>Still due</span><b>'+ps.missing+'</b></div><div><span>Interest awaiting accrual</span><b>'+money2(s.interestDue)+'</b></div></div></section>'+
      '<section class="surface employee-card loan-register"><div class="table-tools"><div><h3>Loan register</h3><p>Reducing-balance monthly schedules and liability tracking</p></div></div><div class="table-scroll"><table><thead><tr><th>LENDER / FACILITY</th><th>ORIGINAL PRINCIPAL</th><th>RATE</th><th>TERM</th><th>OUTSTANDING</th><th>NEXT DUE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></section>'+
      '<section class="surface employee-card loan-history"><div class="table-tools"><div><h3>Repayment history</h3><p>Principal and interest split for recorded repayments</p></div></div><div class="table-scroll"><table><thead><tr><th>DATE</th><th>LENDER</th><th>PRINCIPAL</th><th>INTEREST</th><th>TOTAL</th><th>INSTALLMENT</th></tr></thead><tbody>'+historyRows+'</tbody></table></div></section>';
  }

  window.DalasiLoans={addMonths,pmt,schedule,byId,repayments,accruals,rowPaid,rowAccrued,outstandingPrincipal,accruedInterestPayable,status,nextDue,summary,periods,periodStatus,loanModal,createLoan,accruePeriod,repaymentModal,saveRepayment,exportCsv,render};
})();