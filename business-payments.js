(function(){
  'use strict';
  const TYPES=['Supplier / vendor','Contractor / freelancer','Expense reimbursement','Rent / utilities','Government / statutory','Other payment'];
  const METHODS=['Bank transfer','Mobile money','Cash','Cheque','Other'];
  function statusClass(status){return status==='Paid'?'paid':status==='Approved'?'approved':status==='Pending approval'?'neutral':'ready';}
  function totals(rows){
    rows=rows||[];
    const sum=s=>rows.filter(x=>!s||x.status===s).reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {count:rows.length,total:sum(),pending:sum('Pending approval'),approved:sum('Approved'),paid:sum('Paid')};
  }
  function dueDate(v){if(!v)return '—';try{return new Date(v+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function action(p){
    if(p.status==='Draft')return '<button class="secondary" data-action="payment-submit:'+p.id+'">Submit</button>';
    if(p.status==='Pending approval')return '<button class="secondary" data-action="payment-approve:'+p.id+'">Approve</button>';
    if(p.status==='Approved')return '<button class="primary" data-action="payment-paid:'+p.id+'">Mark paid</button>';
    return '<span class="payment-complete">Paid</span>';
  }
  function render(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,pageTitle=h.pageTitle;
    const rows=(state.businessPayments||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const t=totals(rows);
    const pageActions='<button class="secondary" data-action="download-payment-register">'+icon('download',14)+' Export register</button><button class="primary" data-action="open-business-payment">'+icon('plus',14)+' New payment</button>';
    const chips=TYPES.map(x=>'<span>'+esc(x)+'</span>').join('');
    const tableRows=rows.length?rows.map(p=>'<tr>'+
      '<td><div class="payment-payee"><b>'+esc(p.payee)+'</b><small>'+esc(p.reference||p.id)+'</small></div></td>'+
      '<td>'+esc(p.type)+'</td>'+
      '<td class="payment-amount">'+money2(p.amount)+'</td>'+
      '<td>'+esc(p.method)+'</td>'+
      '<td>'+dueDate(p.dueDate)+'</td>'+
      '<td>'+pill(p.status,statusClass(p.status))+'</td>'+
      '<td><div class="payment-status-actions">'+action(p)+'</div></td>'+
      '</tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No business payments recorded yet. Add your first supplier, contractor, reimbursement or other payment.</div></td></tr>';
    return pageTitle('BUSINESS PAYMENTS','Payments','Manage non-payroll business payments alongside payroll, with a clear approval and payment trail.',pageActions)+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Payment control, not money movement</b><p>DalasiPay records, approves and tracks business payments. Bank and mobile-money transfers remain disabled until a verified payment-provider integration is connected.</p></div></div>'+
      '<div class="payment-overview">'+
        '<div class="surface"><span>Recorded payments</span><b>'+t.count+'</b><small>'+money2(t.total)+' total value</small></div>'+
        '<div class="surface"><span>Pending approval</span><b>'+money2(t.pending)+'</b><small>awaiting review</small></div>'+
        '<div class="surface"><span>Approved</span><b>'+money2(t.approved)+'</b><small>ready to pay</small></div>'+
        '<div class="surface"><span>Paid</span><b>'+money2(t.paid)+'</b><small>recorded as completed</small></div>'+
      '</div>'+
      '<div class="payment-type-chips">'+chips+'</div>'+
      '<div class="surface employee-card">'+
        '<div class="table-tools"><div><h3>Business payment register</h3><p>Suppliers, contractors, expenses and other business obligations</p></div><button class="primary" data-action="open-business-payment">'+icon('plus',14)+' Add payment</button></div>'+
        '<div class="table-scroll"><table><thead><tr><th>PAYEE</th><th>TYPE</th><th>AMOUNT</th><th>METHOD</th><th>DUE DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
      '</div>';
  }
  function modal(state,h){
    const field=h.field,icon=h.icon;
    const typeOptions=TYPES.map(x=>'<option>'+x+'</option>').join('');
    const methodOptions=METHODS.map(x=>'<option>'+x+'</option>').join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-business-payment"></div><form id="business-payment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">NEW BUSINESS PAYMENT</div><h2>Record payment</h2><p>Create a controlled payment record outside payroll.</p></div><button type="button" class="close" data-action="close-business-payment">×</button></div>'+
      '<div class="payment-modal-note">This creates a payment record only. It does not send funds from a bank or mobile-money account.</div>'+
      '<div class="form-grid">'+
        field('Payee / beneficiary','<input name="payee" placeholder="e.g. ABC Supplies Ltd" required>')+
        field('Payment type','<select name="type">'+typeOptions+'</select>')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>')+
        field('Payment method','<select name="method">'+methodOptions+'</select>')+
        field('Due date','<input name="dueDate" type="date">')+
        field('Reference / invoice no.','<input name="reference" placeholder="Invoice, bill or internal reference">')+
      '</div>'+
      field('Description / purpose','<input name="description" placeholder="What is this payment for?">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-business-payment">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save draft</button></div>'+
    '</form></div>';
  }
  function create(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create business payments.');return;}
    const fd=new FormData(ev.target),amount=Number(fd.get('amount')||0),payee=String(fd.get('payee')||'').trim();
    if(!payee||amount<=0){ctx.toast('Enter a payee and a valid payment amount.');return;}
    const id='BP-'+Date.now().toString(36).toUpperCase();
    state.businessPayments=state.businessPayments||[];
    state.businessPayments.unshift({id,payee,type:String(fd.get('type')||'Other payment'),amount,method:String(fd.get('method')||'Bank transfer'),dueDate:String(fd.get('dueDate')||''),reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.paymentOpen=false;
    ctx.audit('payment.created',{paymentId:id,payee,amount});ctx.save();ctx.toast('Business payment saved as draft');ctx.render();
  }
  function update(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update business payments.');return;}
    const p=(state.businessPayments||[]).find(x=>x.id===id);if(!p)return;
    p.status=status;p.updatedAt=new Date().toISOString();p.updatedBy=state.session?.name||'User';if(status==='Paid')p.paidAt=new Date().toISOString();
    ctx.audit('payment.status_updated',{paymentId:id,status,amount:p.amount,payee:p.payee});ctx.save();ctx.toast(p.payee+': '+status);ctx.render();
  }
  function exportRegister(state,ctx){
    const rows=(state.businessPayments||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const csv=['Payment ID,Payee,Type,Amount,Method,Due Date,Reference,Status,Created By,Created At,Paid At'].concat(rows.map(p=>[p.id,p.payee,p.type,p.amount,p.method,p.dueDate,p.reference,p.status,p.createdBy,p.createdAt,p.paidAt||''].map(ctx.csvEscape).join(','))).join('\n');
    ctx.downloadText('dalasipay-business-payments.csv',csv);ctx.toast('Business payment register downloaded');
  }
  window.DalasiBusinessPayments={render,modal,create,update,exportRegister,summary:totals,types:TYPES.slice(),methods:METHODS.slice()};
})();
