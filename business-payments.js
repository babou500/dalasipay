(function(){
  'use strict';
  const TYPES=['Supplier / vendor','Contractor / freelancer','Expense reimbursement','Rent / utilities','Government / statutory','Other payment'];
  const BENEFICIARY_TYPES=['Supplier / vendor','Contractor / freelancer','Landlord / utility','Government / statutory','Other beneficiary'];
  const METHODS=['Bank transfer','Mobile money','Cash','Cheque','Other'];

  function statusClass(status){return status==='Paid'?'paid':status==='Approved'?'approved':status==='Pending approval'?'neutral':'ready';}
  function totals(rows){
    rows=rows||[];
    const sum=s=>rows.filter(x=>!s||x.status===s).reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {count:rows.length,total:sum(),pending:sum('Pending approval'),approved:sum('Approved'),paid:sum('Paid')};
  }
  function dueDate(v){if(!v)return '—';try{return new Date(v+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function mask(value){const s=String(value||'').replace(/\s+/g,'');if(!s)return 'Not added';return s.length<=4?'•••• '+s:'•••• '+s.slice(-4);}
  function beneficiaryById(state,id){return (state.paymentBeneficiaries||[]).find(x=>x.id===id)||null;}
  function beneficiaryPayments(state,id){return (state.businessPayments||[]).filter(x=>x.beneficiaryId===id);}
  function paymentTypeForBeneficiary(kind){
    if(kind==='Supplier / vendor')return 'Supplier / vendor';
    if(kind==='Contractor / freelancer')return 'Contractor / freelancer';
    if(kind==='Landlord / utility')return 'Rent / utilities';
    if(kind==='Government / statutory')return 'Government / statutory';
    return 'Other payment';
  }
  function destinationSummary(b){
    if(!b)return '';
    if(b.preferredMethod==='Bank transfer')return [b.bankName,mask(b.accountNumber)].filter(Boolean).join(' · ');
    if(b.preferredMethod==='Mobile money')return [b.mobileProvider,mask(b.mobileNumber)].filter(Boolean).join(' · ');
    return b.preferredMethod||'Payment method not set';
  }
  function action(p){
    if(p.status==='Draft')return '<button class="secondary" data-action="payment-submit:'+p.id+'">Submit</button>';
    if(p.status==='Pending approval')return '<button class="secondary" data-action="payment-approve:'+p.id+'">Approve</button>';
    if(p.status==='Approved')return '<button class="primary" data-action="payment-paid:'+p.id+'">Mark paid</button>';
    return '<span class="payment-complete">Paid</span>';
  }
  function tabs(state){
    return '<div class="payment-tabs"><button class="'+(state.paymentTab==='payments'?'active':'')+'" data-action="payment-tab:payments">Payments</button><button class="'+(state.paymentTab==='beneficiaries'?'active':'')+'" data-action="payment-tab:beneficiaries">Beneficiaries</button></div>';
  }
  function paymentPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon;
    const rows=(state.businessPayments||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const t=totals(rows);
    const chips=TYPES.map(x=>'<span>'+esc(x)+'</span>').join('');
    const tableRows=rows.length?rows.map(p=>{
      const b=beneficiaryById(state,p.beneficiaryId);
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(p.payee)+'</b><small>'+esc(p.reference||p.id)+(b?' · Saved beneficiary':'')+'</small></div></td>'+
        '<td>'+esc(p.type)+'</td>'+
        '<td class="payment-amount">'+money2(p.amount)+'</td>'+
        '<td>'+esc(p.method)+'</td>'+
        '<td>'+dueDate(p.dueDate)+'</td>'+
        '<td>'+pill(p.status,statusClass(p.status))+'</td>'+
        '<td><div class="payment-status-actions">'+action(p)+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No business payments recorded yet. Add your first supplier, contractor, reimbursement or other payment.</div></td></tr>';
    return '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Payment control, not money movement</b><p>DalasiPay records, approves and tracks business payments. Bank and mobile-money transfers remain disabled until a verified payment-provider integration is connected.</p></div></div>'+
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
  function beneficiaryPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon;
    const rows=(state.paymentBeneficiaries||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    const active=rows.filter(x=>x.status!=='Inactive').length;
    const totalPaid=(state.businessPayments||[]).filter(x=>x.status==='Paid'&&x.beneficiaryId).reduce((a,x)=>a+(Number(x.amount)||0),0);
    const tableRows=rows.length?rows.map(b=>{
      const pays=beneficiaryPayments(state,b.id),paid=pays.filter(x=>x.status==='Paid').reduce((a,x)=>a+(Number(x.amount)||0),0);
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(b.name)+'</b><small>'+esc(b.contact||b.email||b.phone||b.id)+'</small></div></td>'+
        '<td>'+esc(b.kind)+'</td>'+
        '<td><div class="payment-destination"><b>'+esc(b.preferredMethod)+'</b><small>'+esc(destinationSummary(b))+'</small></div></td>'+
        '<td><b>'+pays.length+'</b><small class="beneficiary-paid">'+money2(paid)+' paid</small></td>'+
        '<td>'+pill(b.status||'Active',(b.status||'Active')==='Active'?'ready':'neutral')+'</td>'+
        '<td><div class="payment-status-actions">'+((b.status||'Active')==='Active'?'<button class="primary" data-action="pay-beneficiary:'+b.id+'">Pay</button><button class="secondary" data-action="beneficiary-status:'+b.id+':Inactive">Deactivate</button>':'<button class="secondary" data-action="beneficiary-status:'+b.id+':Active">Activate</button>')+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="6"><div class="empty-inline">No beneficiaries saved yet. Add a supplier, contractor or other regular payee.</div></td></tr>';
    return '<div class="beneficiary-summary">'+
      '<div class="surface"><span>Saved beneficiaries</span><b>'+rows.length+'</b><small>'+active+' active</small></div>'+
      '<div class="surface"><span>Paid to beneficiaries</span><b>'+money2(totalPaid)+'</b><small>completed business payments</small></div>'+
      '<div class="surface beneficiary-guide"><span>Reusable payment details</span><b>Pay faster</b><small>Select a saved payee when creating a payment.</small></div>'+
    '</div>'+
    '<div class="surface employee-card">'+
      '<div class="table-tools"><div><h3>Beneficiaries & vendors</h3><p>Save regular payees and their preferred payment details once.</p></div><button class="primary" data-action="open-beneficiary">'+icon('plus',14)+' Add beneficiary</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>BENEFICIARY</th><th>TYPE</th><th>PAYMENT DETAILS</th><th>PAYMENTS</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
    '</div>';
  }
  function render(state,h){
    const icon=h.icon,pageTitle=h.pageTitle;
    const paymentsActive=state.paymentTab!=='beneficiaries';
    const actions=paymentsActive?'<button class="secondary" data-action="download-payment-register">'+icon('download',14)+' Export register</button><button class="primary" data-action="open-business-payment">'+icon('plus',14)+' New payment</button>':'<button class="primary" data-action="open-beneficiary">'+icon('plus',14)+' Add beneficiary</button>';
    return pageTitle('BUSINESS PAYMENTS','Payments','Manage payroll-adjacent business payments, beneficiaries and approval controls in one place.',actions)+tabs(state)+(paymentsActive?paymentPanel(state,h):beneficiaryPanel(state,h));
  }
  function modal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc;
    const beneficiaries=(state.paymentBeneficiaries||[]).filter(x=>(x.status||'Active')==='Active');
    const selected=beneficiaryById(state,state.paymentBeneficiaryId);
    const typeValue=selected?paymentTypeForBeneficiary(selected.kind):TYPES[0];
    const methodValue=selected?.preferredMethod||METHODS[0];
    const beneficiaryOptions=['<option value="">Manual / one-off payee</option>'].concat(beneficiaries.map(b=>'<option value="'+esc(b.id)+'" '+(selected&&selected.id===b.id?'selected':'')+'>'+esc(b.name)+' · '+esc(b.kind)+'</option>')).join('');
    const typeOptions=TYPES.map(x=>'<option '+(x===typeValue?'selected':'')+'>'+x+'</option>').join('');
    const methodOptions=METHODS.map(x=>'<option '+(x===methodValue?'selected':'')+'>'+x+'</option>').join('');
    const beneficiaryInfo=selected?'<div class="selected-beneficiary"><b>'+esc(selected.name)+'</b><span>'+esc(destinationSummary(selected))+'</span></div>':'';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-business-payment"></div><form id="business-payment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">NEW BUSINESS PAYMENT</div><h2>Record payment</h2><p>Create a controlled payment record outside payroll.</p></div><button type="button" class="close" data-action="close-business-payment">×</button></div>'+
      '<div class="payment-modal-note">This creates a payment record only. It does not send funds from a bank or mobile-money account.</div>'+
      field('Saved beneficiary','<select id="payment-beneficiary-select" name="beneficiaryId">'+beneficiaryOptions+'</select>')+beneficiaryInfo+
      '<div class="form-grid">'+
        field('Payee / beneficiary','<input name="payee" value="'+esc(selected?.name||'')+'" placeholder="e.g. ABC Supplies Ltd" required>')+
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
  function beneficiaryModal(state,h){
    const field=h.field,icon=h.icon;
    const kindOptions=BENEFICIARY_TYPES.map(x=>'<option>'+x+'</option>').join('');
    const methodOptions=METHODS.map(x=>'<option>'+x+'</option>').join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-beneficiary"></div><form id="beneficiary-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">NEW BENEFICIARY</div><h2>Add beneficiary</h2><p>Save a regular supplier, contractor or other payee.</p></div><button type="button" class="close" data-action="close-beneficiary">×</button></div>'+
      '<div class="payment-modal-note">Payment details are saved to this workspace for reuse. DalasiPay will not initiate a transfer until a supported payment integration is connected.</div>'+
      '<div class="form-grid">'+
        field('Beneficiary / business name','<input name="name" placeholder="e.g. ABC Supplies Ltd" required>')+
        field('Beneficiary type','<select name="kind">'+kindOptions+'</select>')+
        field('Contact person','<input name="contact" placeholder="Optional contact name">')+
        field('Phone','<input name="phone" placeholder="e.g. +220 ...">')+
        field('Email','<input name="email" type="email" placeholder="accounts@example.com">')+
        field('Preferred payment method','<select name="preferredMethod">'+methodOptions+'</select>')+
        field('Bank name','<input name="bankName" placeholder="For bank transfers">')+
        field('Account name','<input name="accountName" placeholder="Name on bank account">')+
        field('Bank account number','<input name="accountNumber" autocomplete="off" placeholder="Optional">')+
        field('Mobile-money provider','<input name="mobileProvider" placeholder="Provider name">')+
        field('Mobile-money number','<input name="mobileNumber" autocomplete="off" placeholder="Optional">')+
        field('Internal reference','<input name="reference" placeholder="Vendor code or note">')+
      '</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-beneficiary">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save beneficiary</button></div>'+
    '</form></div>';
  }
  function create(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create business payments.');return;}
    const fd=new FormData(ev.target),amount=Number(fd.get('amount')||0),payee=String(fd.get('payee')||'').trim(),beneficiaryId=String(fd.get('beneficiaryId')||'');
    if(!payee||amount<=0){ctx.toast('Enter a payee and a valid payment amount.');return;}
    const id='BP-'+Date.now().toString(36).toUpperCase();
    state.businessPayments=state.businessPayments||[];
    state.businessPayments.unshift({id,beneficiaryId:beneficiaryId||null,payee,type:String(fd.get('type')||'Other payment'),amount,method:String(fd.get('method')||'Bank transfer'),dueDate:String(fd.get('dueDate')||''),reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.paymentOpen=false;state.paymentBeneficiaryId=null;
    ctx.audit('payment.created',{paymentId:id,beneficiaryId:beneficiaryId||null,payee,amount});ctx.save();ctx.toast('Business payment saved as draft');ctx.render();
  }
  function createBeneficiary(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add beneficiaries.');return;}
    const fd=new FormData(ev.target),name=String(fd.get('name')||'').trim();if(!name){ctx.toast('Enter the beneficiary name.');return;}
    const id='BEN-'+Date.now().toString(36).toUpperCase();
    state.paymentBeneficiaries=state.paymentBeneficiaries||[];
    state.paymentBeneficiaries.push({id,name,kind:String(fd.get('kind')||'Other beneficiary'),contact:String(fd.get('contact')||'').trim(),phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim(),preferredMethod:String(fd.get('preferredMethod')||'Bank transfer'),bankName:String(fd.get('bankName')||'').trim(),accountName:String(fd.get('accountName')||'').trim(),accountNumber:String(fd.get('accountNumber')||'').trim(),mobileProvider:String(fd.get('mobileProvider')||'').trim(),mobileNumber:String(fd.get('mobileNumber')||'').trim(),reference:String(fd.get('reference')||'').trim(),status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.beneficiaryOpen=false;ctx.audit('payment.beneficiary_created',{beneficiaryId:id,name});ctx.save();ctx.toast(name+' added as a beneficiary');ctx.render();
  }
  function update(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update business payments.');return;}
    const p=(state.businessPayments||[]).find(x=>x.id===id);if(!p)return;
    p.status=status;p.updatedAt=new Date().toISOString();p.updatedBy=state.session?.name||'User';if(status==='Paid')p.paidAt=new Date().toISOString();
    ctx.audit('payment.status_updated',{paymentId:id,status,amount:p.amount,payee:p.payee});ctx.save();ctx.toast(p.payee+': '+status);ctx.render();
  }
  function updateBeneficiary(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update beneficiaries.');return;}
    const b=beneficiaryById(state,id);if(!b)return;b.status=status;b.updatedAt=new Date().toISOString();b.updatedBy=state.session?.name||'User';
    ctx.audit('payment.beneficiary_status_updated',{beneficiaryId:id,status});ctx.save();ctx.toast(b.name+': '+status);ctx.render();
  }
  function exportRegister(state,ctx){
    const rows=(state.businessPayments||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const csv=['Payment ID,Payee,Beneficiary ID,Type,Amount,Method,Due Date,Reference,Status,Created By,Created At,Paid At'].concat(rows.map(p=>[p.id,p.payee,p.beneficiaryId||'',p.type,p.amount,p.method,p.dueDate,p.reference,p.status,p.createdBy,p.createdAt,p.paidAt||''].map(ctx.csvEscape).join(','))).join('\n');
    ctx.downloadText('dalasipay-business-payments.csv',csv);ctx.toast('Business payment register downloaded');
  }
  window.DalasiBusinessPayments={render,modal,beneficiaryModal,create,createBeneficiary,update,updateBeneficiary,exportRegister,summary:totals,beneficiaryById,types:TYPES.slice(),methods:METHODS.slice()};
})();
