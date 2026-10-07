(function(){
  'use strict';

  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function dateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function addDaysIso(date,days){const d=new Date((date||todayIso())+'T12:00:00');d.setDate(d.getDate()+(Number(days)||0));return d.toISOString().slice(0,10);}
  function addMonthsIso(date,months){
    const d=new Date((date||todayIso())+'T12:00:00'),day=d.getDate();
    d.setDate(1);d.setMonth(d.getMonth()+(Number(months)||0));
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    d.setDate(Math.min(day,last));return d.toISOString().slice(0,10);
  }
  function nextDate(date,frequency){
    if(frequency==='Weekly')return addDaysIso(date,7);
    if(frequency==='Fortnightly')return addDaysIso(date,14);
    if(frequency==='Quarterly')return addMonthsIso(date,3);
    if(frequency==='Yearly')return addMonthsIso(date,12);
    return addMonthsIso(date,1);
  }
  function monthlyEquivalent(amount,frequency){
    const n=Number(amount)||0;
    return frequency==='Weekly'?n*52/12:frequency==='Fortnightly'?n*26/12:frequency==='Quarterly'?n/3:frequency==='Yearly'?n/12:n;
  }
  function scheduleById(state,id){return (state.recurringCustomerInvoices||[]).find(x=>x.id===id)||null;}
  function customerById(state,id){return (state.customers||[]).find(x=>x.id===id)||null;}
  function runsFor(state,id){return (state.customerInvoices||[]).filter(x=>x.recurringScheduleId===id).sort((a,b)=>String(b.issueDate||'').localeCompare(String(a.issueDate||'')));}
  function activeRows(state){return (state.recurringCustomerInvoices||[]).filter(x=>(x.status||'Active')==='Active');}
  function isFinished(s){
    if(!s)return true;
    if((s.status||'Active')!=='Active')return true;
    if(s.endDate&&s.nextRunDate&&s.nextRunDate>s.endDate)return true;
    if(Number(s.maxRuns)>0&&(Number(s.generatedCount)||0)>=Number(s.maxRuns))return true;
    return false;
  }
  function dueLabel(date){
    if(!date)return 'No next run';
    const today=todayIso(),a=new Date(today+'T12:00:00'),b=new Date(date+'T12:00:00'),days=Math.round((b-a)/86400000);
    if(days===0)return 'Today';
    if(days===1)return 'Tomorrow';
    if(days>1)return 'In '+days+' days';
    return Math.abs(days)+' day'+(Math.abs(days)===1?'':'s')+' overdue';
  }
  function statusPill(s,h){
    const status=(s.status||'Active');
    return h.pill(status,status==='Active'?'ready':status==='Paused'?'neutral':'paid');
  }
  function metrics(state){
    const rows=state.recurringCustomerInvoices||[],active=activeRows(state),today=todayIso();
    return {
      total:rows.length,
      active:active.length,
      paused:rows.filter(x=>x.status==='Paused').length,
      due:active.filter(x=>x.nextRunDate&&x.nextRunDate<=today&&!isFinished(x)).length,
      monthly:active.reduce((a,x)=>a+monthlyEquivalent(x.amount,x.frequency),0),
      generated:rows.reduce((a,x)=>a+(Number(x.generatedCount)||runsFor(state,x.id).length),0)
    };
  }
  function panel(state,h){
    const esc=h.esc,money2=h.money2,icon=h.icon,m=metrics(state),rows=(state.recurringCustomerInvoices||[]).slice().sort((a,b)=>String(a.nextRunDate||'9999').localeCompare(String(b.nextRunDate||'9999')));
    const table=rows.length?rows.map(s=>{
      const history=runsFor(state,s.id),last=history[0],finished=isFinished(s),st=finished&&s.status==='Active'?'Completed':(s.status||'Active');
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(s.customerName||'Customer')+'</b><small>'+esc(s.name||s.id)+'</small></div></td>'+
        '<td><b>'+money2(s.amount)+'</b><small class="table-sub">'+esc(s.frequency||'Monthly')+'</small></td>'+
        '<td><b>'+dateLabel(s.nextRunDate)+'</b><small class="table-sub '+((s.nextRunDate||'')<=todayIso()&&st==='Active'?'warn-text':'')+'">'+esc(finished?'Schedule complete':dueLabel(s.nextRunDate))+'</small></td>'+
        '<td><div class="payment-payee"><b>'+history.length+'</b><small>invoice'+(history.length===1?'':'s')+(last?' · last '+dateLabel(last.issueDate):'')+'</small></div></td>'+
        '<td>'+h.pill(st,st==='Active'?'ready':st==='Paused'?'neutral':'paid')+'</td>'+
        '<td><div class="recurring-actions">'+
          (st==='Active'?'<button class="secondary" data-action="recurring-invoice-generate:'+s.id+'">'+icon('plus',13)+' Generate now</button>':'')+
          (st==='Active'?'<button class="secondary" data-action="recurring-invoice-status:'+s.id+':Paused">Pause</button>':st==='Paused'?'<button class="secondary" data-action="recurring-invoice-status:'+s.id+':Active">Resume</button>':'')+
          '<button class="text-btn" data-action="recurring-invoice-history:'+s.id+'">History</button>'+
        '</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="6"><div class="empty-inline">No recurring invoice schedules yet. Create one for retainers, rent, subscriptions, maintenance, memberships or any repeating customer charge.</div></td></tr>';

    return '<div class="recurring-invoice-kpis">'+
      '<div class="surface"><span>Active schedules</span><b>'+m.active+'</b><small>'+m.paused+' paused</small></div>'+
      '<div class="surface"><span>Monthly recurring value</span><b>'+money2(m.monthly)+'</b><small>frequency-adjusted estimate</small></div>'+
      '<div class="surface"><span>Due now</span><b>'+m.due+'</b><small>schedules ready to bill</small></div>'+
      '<div class="surface"><span>Invoices generated</span><b>'+m.generated+'</b><small>from recurring schedules</small></div>'+
    '</div>'+
    '<div class="payment-notice recurring-invoice-notice"><span>'+icon('calendar',17)+'</span><div><b>Automatic billing without duplicate invoices</b><p>DalasiPay checks active schedules when the workspace is used. Each scheduled date can generate only one invoice, and every generated invoice remains linked to its billing schedule for audit history.</p></div><button class="secondary" data-action="recurring-invoice-run-due">'+icon('refresh',13)+' Run due billing</button></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Recurring billing schedules</h3><p>Customer, frequency, next run, generated invoice history and schedule controls</p></div><div class="inline-buttons"><button class="secondary" data-action="recurring-invoice-export">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-recurring-invoice">'+icon('plus',14)+' New schedule</button></div></div>'+
    '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / SCHEDULE</th><th>VALUE / FREQUENCY</th><th>NEXT BILLING</th><th>GENERATED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function modal(state,h){
    const field=h.field,esc=h.esc,icon=h.icon,customers=(state.customers||[]).filter(x=>(x.status||'Active')==='Active');
    const options=['<option value="">Manual / one-off customer</option>'].concat(customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>')).join('');
    const start=addDaysIso(todayIso(),1);
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-recurring-invoice"></div><form id="recurring-invoice-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">AUTOMATIC BILLING</div><h2>Create recurring invoice schedule</h2><p>Set the customer, repeating charge, billing frequency and invoice terms.</p></div><button type="button" class="close" data-action="close-recurring-invoice">×</button></div>'+
      '<div class="form-grid">'+
        field('Schedule name','<input name="name" placeholder="e.g. Monthly support retainer" required>')+
        field('Saved customer','<select name="customerId">'+options+'</select>')+
        field('Customer / client name','<input name="customerName" placeholder="e.g. Kaira Trading Ltd">')+
        field('Customer email','<input name="customerEmail" type="email" placeholder="accounts@example.com">')+
        field('Description','<input name="description" placeholder="Service or recurring charge" required>')+
        field('Recurring amount','<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>')+
        field('Frequency','<select name="frequency"><option>Weekly</option><option>Fortnightly</option><option selected>Monthly</option><option>Quarterly</option><option>Yearly</option></select>')+
        field('First billing date','<input name="startDate" type="date" value="'+start+'" required>')+
        field('Invoice payment terms','<select name="termDays"><option value="0">Due on receipt</option><option value="7">Net 7 days</option><option value="14">Net 14 days</option><option value="30" selected>Net 30 days</option><option value="60">Net 60 days</option></select>')+
        field('Maximum invoices','<input name="maxRuns" type="number" min="0" step="1" value="0" placeholder="0 = no limit">')+
        field('End date','<input name="endDate" type="date"><small>Optional. Leave empty to continue until paused.</small>')+
        field('Invoice status','<select name="invoiceStatus"><option value="Draft">Create as draft</option><option value="Sent">Create as sent</option></select>')+
        field('VAT treatment',window.DalasiTax?.salesOptions?.(state)||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+
        field('Project',window.DalasiDimensions?.projectSelect?.(state,'project')||'<select name="project"><option value="">Unassigned</option></select>')+
        field('Cost centre',window.DalasiDimensions?.costCentreSelect?.(state,'costCentre')||'<select name="costCentre"><option value="">Unassigned</option></select>')+
      '</div>'+
      '<div class="recurring-form-note"><b>Duplicate protection:</b> DalasiPay stores the schedule ID and billing date on each generated invoice, preventing the same scheduled billing date from being created twice.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-recurring-invoice">Cancel</button><button class="primary" type="submit">'+icon('calendar',14)+' Save schedule</button></div>'+
    '</form></div>';
  }
  function historyModal(state,h){
    const id=state.recurringInvoiceHistoryId,s=scheduleById(state,id);if(!s)return '';
    const rows=runsFor(state,id),esc=h.esc,money2=h.money2;
    const body=rows.length?rows.map(inv=>'<tr><td><b>'+esc(inv.invoiceNo||inv.id)+'</b></td><td>'+dateLabel(inv.issueDate)+'</td><td>'+dateLabel(inv.dueDate)+'</td><td>'+money2(inv.amount)+'</td><td>'+h.pill(inv.status||'Draft',(inv.status||'Draft')==='Sent'?'approved':'ready')+'</td><td><span class="table-sub">'+esc(inv.recurringRunDate||inv.issueDate||'')+'</span></td></tr>').join(''):'<tr><td colspan="6"><div class="empty-inline">No invoices have been generated from this schedule yet.</div></td></tr>';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-recurring-invoice-history"></div><div class="modal-box recurring-history-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">RECURRING BILLING HISTORY</div><h2>'+esc(s.name||'Schedule')+'</h2><p>'+esc(s.customerName||'Customer')+' · '+esc(s.frequency||'Monthly')+' · '+money2(s.amount)+'</p></div><button class="close" data-action="close-recurring-invoice-history">×</button></div>'+
      '<div class="table-scroll"><table class="recurring-history-table"><thead><tr><th>INVOICE</th><th>ISSUED</th><th>DUE</th><th>AMOUNT</th><th>STATUS</th><th>SCHEDULED RUN</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
      '<div class="modal-actions"><button class="secondary" data-action="close-recurring-invoice-history">Close</button></div></div></div>';
  }
  function create(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create recurring invoice schedules.');return;}
    const fd=new FormData(ev.target),selectedCustomerId=String(fd.get('customerId')||''),typedName=String(fd.get('customerName')||'').trim(),typedEmail=String(fd.get('customerEmail')||'').trim(),saved=window.DalasiBusinessPayments?.resolveCustomerForInvoice?.(state,{customerId:selectedCustomerId,customerName:typedName,customerEmail:typedEmail})||customerById(state,selectedCustomerId),customerId=saved?.id||selectedCustomerId,customerName=saved?.name||typedName||'',amount=Number(fd.get('amount')||0),startDate=String(fd.get('startDate')||''),endDate=String(fd.get('endDate')||'');
    if(!customerName||!amount||amount<=0||!startDate){ctx.toast('Customer, amount and first billing date are required.');return;}
    if(endDate&&endDate<startDate){ctx.toast('End date cannot be before the first billing date.');return;}
    state.recurringCustomerInvoices=state.recurringCustomerInvoices||[];
    const id='RCI-'+Date.now().toString(36).toUpperCase(),frequency=String(fd.get('frequency')||'Monthly');
    const row={id,name:String(fd.get('name')||'Recurring invoice').trim(),customerId:saved?.id||customerId||null,customerName:saved?.name||customerName,customerEmail:String(fd.get('customerEmail')||saved?.email||'').trim(),description:String(fd.get('description')||'Recurring charge').trim(),amount,frequency,startDate,nextRunDate:startDate,termDays:Number(fd.get('termDays')||saved?.termDays||30),maxRuns:Number(fd.get('maxRuns')||0),endDate,status:'Active',invoiceStatus:String(fd.get('invoiceStatus')||'Draft'),taxCode:String(fd.get('taxCode')||window.DalasiTax?.defaultSalesCode?.(state)||'OUT'),project:String(fd.get('project')||''),costCentre:String(fd.get('costCentre')||''),generatedCount:0,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()};
    state.recurringCustomerInvoices.unshift(row);state.recurringInvoiceOpen=false;
    ctx.audit('recurring_invoice.created',{scheduleId:id,customerName,amount,frequency,startDate,endDate,maxRuns:row.maxRuns||null});ctx.save();ctx.toast('Recurring invoice schedule created');ctx.render();
  }
  function updateStatus(id,newStatus,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to change billing schedules.');return;}
    const s=scheduleById(state,id);if(!s)return;
    if(newStatus==='Active'&&isFinished({...s,status:'Active'})){ctx.toast('This schedule has reached its end condition.');return;}
    s.status=newStatus;s.updatedAt=new Date().toISOString();s.updatedBy=state.session?.name||'User';
    ctx.audit('recurring_invoice.status_updated',{scheduleId:id,status:newStatus});ctx.save();ctx.toast((s.name||'Schedule')+' '+newStatus.toLowerCase());ctx.render();
  }
  function nextInvoiceNumber(state){
    const rows=state.customerInvoices||[],year=new Date().getFullYear(),base='INV-'+year+'-';let max=0;
    rows.forEach(x=>{const v=String(x.invoiceNo||'');if(v.startsWith(base)){const n=Number(v.slice(base.length));if(Number.isFinite(n)&&n>max)max=n;}});
    let n=max+1,no=base+String(n).padStart(5,'0');while(rows.some(x=>x.invoiceNo===no)){n++;no=base+String(n).padStart(5,'0');}return no;
  }
  function generateForRun(s,runDate,state,ctx,manual){
    state.customerInvoices=state.customerInvoices||[];
    if(state.customerInvoices.some(x=>x.recurringScheduleId===s.id&&x.recurringRunDate===runDate))return false;
    if(window.DalasiMonthClose?.isClosed?.(state,runDate)){if(manual)ctx.toast('The accounting period for '+dateLabel(runDate)+' is closed. Reopen it before generating this invoice.');return false;}
    const customer=window.DalasiBusinessPayments?.resolveCustomerForInvoice?.(state,{customerId:s.customerId,customerName:s.customerName,customerEmail:s.customerEmail})||(s.customerId?customerById(state,s.customerId):null);if(customer&&!s.customerId){s.customerId=customer.id;s.customerName=customer.name;s.customerEmail=s.customerEmail||customer.email||'';}
    if(customer?.creditStatus==='Hold'){if(manual)ctx.toast((customer.name||s.customerName)+' is on credit hold.');return false;}
    const amount=Number(s.amount)||0,tax=window.DalasiTax?.snapshot?.(state,amount,s.taxCode||window.DalasiTax?.defaultSalesCode?.(state)||'OUT','sale')||{taxCode:'OUT',vatRate:0,taxGross:amount,taxNet:amount,vatAmount:0,vatRecoverable:false,taxableTurnover:false};
    const invoiceNo=nextInvoiceNumber(state),id='AR-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase(),dueDate=addDaysIso(runDate,Number(s.termDays)||0);
    const inv={id,invoiceNo,customerId:customer?.id||s.customerId||null,customerName:customer?.name||s.customerName,customerEmail:s.customerEmail||customer?.email||'',customerPhone:customer?.phone||'',lineItems:[],subtotal:amount,discountTotal:0,amount,...tax,project:s.project||'',costCentre:s.costCentre||'',issueDate:runDate,dueDate,reference:'Recurring · '+(s.name||s.id),description:s.description||'Recurring charge',status:s.invoiceStatus==='Sent'?'Sent':'Draft',recurringScheduleId:s.id,recurringScheduleName:s.name||'',recurringRunDate:runDate,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'};
    if(inv.status==='Sent'){inv.sentAt=new Date().toISOString();inv.sentBy=state.session?.name||'User';}
    state.customerInvoices.unshift(inv);
    s.generatedCount=(Number(s.generatedCount)||0)+1;s.lastRunDate=runDate;s.lastInvoiceId=id;s.lastInvoiceNo=invoiceNo;s.updatedAt=new Date().toISOString();
    ctx.audit('recurring_invoice.generated',{scheduleId:s.id,invoiceId:id,invoiceNo,runDate,customerName:s.customerName,amount,status:inv.status,manual:!!manual});
    return inv;
  }
  function advance(s,fromDate){
    s.nextRunDate=nextDate(fromDate,s.frequency||'Monthly');
    if((s.endDate&&s.nextRunDate>s.endDate)||(Number(s.maxRuns)>0&&(Number(s.generatedCount)||0)>=Number(s.maxRuns)))s.status='Completed';
  }
  function generateNow(id,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to generate recurring invoices.');return;}
    const s=scheduleById(state,id);if(!s)return;if((s.status||'Active')!=='Active'){ctx.toast('Resume this billing schedule before generating an invoice.');return;}
    const runDate=s.nextRunDate||todayIso(),inv=generateForRun(s,runDate,state,ctx,true);
    if(!inv){if(state.customerInvoices.some(x=>x.recurringScheduleId===s.id&&x.recurringRunDate===runDate))ctx.toast('This scheduled billing date has already generated an invoice.');return;}
    advance(s,runDate);ctx.save();ctx.toast(inv.invoiceNo+' generated from recurring schedule');ctx.render();
  }
  function materializeDue(state,ctx){
    const today=todayIso();let generated=0;
    (state.recurringCustomerInvoices||[]).forEach(s=>{
      let guard=0;
      while((s.status||'Active')==='Active'&&s.nextRunDate&&s.nextRunDate<=today&&!isFinished(s)&&guard<24){
        const runDate=s.nextRunDate;
        const inv=generateForRun(s,runDate,state,ctx,false);
        if(inv)generated++;
        else if(!state.customerInvoices.some(x=>x.recurringScheduleId===s.id&&x.recurringRunDate===runDate))break;
        advance(s,runDate);guard++;
      }
    });
    return generated;
  }
  function runDue(state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to run recurring billing.');return;}
    const n=materializeDue(state,ctx);ctx.save();ctx.toast(n?n+' recurring invoice'+(n===1?'':'s')+' generated':'No recurring invoices are due');ctx.render();
  }
  function exportCsv(state,ctx){
    const esc=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const head=['Schedule','Customer','Amount','Frequency','Start Date','Next Run','End Date','Max Runs','Generated','Status','Description','VAT Code','Project','Cost Centre'];
    const rows=(state.recurringCustomerInvoices||[]).map(s=>[s.name,s.customerName,s.amount,s.frequency,s.startDate,s.nextRunDate,s.endDate||'',s.maxRuns||'',s.generatedCount||runsFor(state,s.id).length,s.status||'Active',s.description||'',s.taxCode||'',s.project||'',s.costCentre||'']);
    ctx.downloadText('dalasipay-recurring-invoices-'+todayIso()+'.csv',[head,...rows].map(r=>r.map(esc).join(',')).join('\n'));ctx.toast('Recurring invoice schedule report downloaded');
  }
  window.DalasiRecurringInvoices={panel,modal,historyModal,create,updateStatus,generateNow,materializeDue,runDue,exportCsv,metrics,runsFor};
})();