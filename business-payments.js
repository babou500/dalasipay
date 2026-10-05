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
  function billById(state,id){return (state.businessBills||[]).find(x=>x.id===id)||null;}
  function billStatusClass(status){return status==='Paid'?'paid':status==='Approved'?'approved':status==='Pending approval'?'neutral':'ready';}
  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function billMetrics(state){
    const rows=state.businessBills||[],today=todayIso(),week=new Date();week.setDate(week.getDate()+7);const w=week.toISOString().slice(0,10);
    const open=rows.filter(x=>x.status!=='Paid'),sum=xs=>xs.reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {count:rows.length,outstanding:sum(open),overdue:sum(open.filter(x=>x.dueDate&&x.dueDate<today)),dueSoon:sum(open.filter(x=>x.dueDate&&x.dueDate>=today&&x.dueDate<=w)),paid:sum(rows.filter(x=>x.status==='Paid'))};
  }
  function billAction(b){
    if(b.status==='Draft')return '<button class="secondary" data-action="bill-submit:'+b.id+'">Submit</button>';
    if(b.status==='Pending approval')return '<button class="secondary" data-action="bill-approve:'+b.id+'">Approve</button>';
    if(b.status==='Approved')return b.paymentId?'<span class="payment-complete">Payment created</span>':'<button class="primary" data-action="pay-bill:'+b.id+'">Create payment</button>';
    return '<span class="payment-complete">Paid</span>';
  }
  function readBillAttachment(file){
    return new Promise((resolve,reject)=>{
      if(!file){resolve({name:'',data:''});return}
      if(file.size>1500000){reject(new Error('Invoice attachment must be smaller than 1.5 MB.'));return}
      if(!/^(application\/pdf|image\/(png|jpeg|webp))$/i.test(file.type||'')){reject(new Error('Use a PDF, PNG, JPG or WebP invoice file.'));return}
      const r=new FileReader();r.onerror=()=>reject(new Error('Unable to read the invoice attachment.'));r.onload=()=>resolve({name:file.name||'invoice',data:String(r.result||'')});r.readAsDataURL(file);
    });
  }
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
    if(p.status==='Approved')return '<button class="secondary" data-action="payment-doc:voucher:'+p.id+'">Voucher PDF</button><button class="primary" data-action="payment-paid:'+p.id+'">Mark paid</button>';
    return '<button class="secondary" data-action="payment-doc:voucher:'+p.id+'">Voucher PDF</button><button class="primary" data-action="payment-doc:receipt:'+p.id+'">Receipt PDF</button>';
  }

  function nextDocumentNumber(prefix,state){
    const year=new Date().getFullYear(),rows=state.businessPayments||[];
    const count=rows.filter(x=>prefix==='PV'?x.voucherNumber:x.receiptNumber).length+1;
    return prefix+'-'+year+'-'+String(count).padStart(5,'0');
  }
  function numWords(n){
    n=Math.round(Math.abs(Number(n)||0));
    if(n===0)return 'Zero';
    const ones=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const under1000=x=>{let s='';if(x>=100){s+=ones[Math.floor(x/100)]+' Hundred';x%=100;if(x)s+=' and ';}if(x>=20){s+=tens[Math.floor(x/10)];if(x%10)s+=' '+ones[x%10];}else if(x)s+=ones[x];return s;};
    const parts=[];if(n>=1000000){parts.push(under1000(Math.floor(n/1000000))+' Million');n%=1000000;}if(n>=1000){parts.push(under1000(Math.floor(n/1000))+' Thousand');n%=1000;}if(n)parts.push(under1000(n));return parts.join(' ');
  }
  function paymentDocumentPdf(id,type,state,ctx){
    const p=(state.businessPayments||[]).find(x=>x.id===id);if(!p){ctx.toast('Payment record not found');return}
    if(type==='receipt'&&p.status!=='Paid'){ctx.toast('A receipt is available only after the payment is marked Paid.');return}
    if(type==='voucher'&&!['Approved','Paid'].includes(p.status)){ctx.toast('Approve the payment before generating a voucher.');return}
    const isReceipt=type==='receipt',bill=billById(state,p.billId),ben=beneficiaryById(state,p.beneficiaryId);
    if(isReceipt&&!p.receiptNumber){p.receiptNumber=nextDocumentNumber('PR',state);ctx.save?.();}if(!isReceipt&&!p.voucherNumber){p.voucherNumber=nextDocumentNumber('PV',state);ctx.save?.();}
    const number=isReceipt?p.receiptNumber:p.voucherNumber,title=isReceipt?'PAYMENT RECEIPT':'PAYMENT VOUCHER',subtitle=isReceipt?'Recorded payment confirmation':'Approved payment instruction';
    const out=[],ink='0.06 0.13 0.11',muted='0.36 0.43 0.40',green='0.04 0.31 0.26',mint='0.92 0.97 0.95',line='0.84 0.88 0.86',white='1 1 1',soft='0.97 0.98 0.975';
    const escText=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const clip=(v,max=44)=>{const s=String(v??'');return s.length>max?s.slice(0,max-3)+'...':s};
    const text=(x,y,size,value,bold=false,color=ink)=>out.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+escText(value)+') Tj ET');
    const fill=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
    const stroke=(x1,y1,x2,y2,color=line,width=.7)=>out.push(color+' RG '+width+' w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
    const rect=(x,y,w,h,fillColor=white,strokeColor=line,width=.65)=>{fill(x,y,w,h,fillColor);out.push(strokeColor+' RG '+width+' w '+x+' '+y+' '+w+' '+h+' re S')};
    const label=(x,y,value)=>text(x,y,7.2,String(value).toUpperCase(),true,'0.42 0.49 0.46');
    const dateVal=isReceipt?(p.paidAt||p.updatedAt):(p.approvedAt||p.updatedAt);
    fill(0,0,595,842,white);out.push('0.88 0.91 0.90 RG 0.75 w 24 24 547 794 re S');
    fill(24,746,547,72,green);fill(24,746,5,72,'0.37 0.82 0.68');
    if(state.branding?.logoData){out.push('q 42 0 0 42 43 765 cm /Im1 Do Q')}else{fill(43,765,42,42,'0.88 0.97 0.94');text(57,780,14,clip(state.branding?.logoText||state.company.slice(0,1),3),true,green)}
    text(99,790,17,clip(state.company,29),true,white);text(99,771,8.2,'DALASIPAY BUSINESS PAYMENTS',true,'0.74 0.91 0.86');
    text(388,791,17,title,true,white);text(388,772,7.6,subtitle.toUpperCase(),true,'0.74 0.91 0.86');
    rect(24,695,547,38,soft,line,.55);
    label(40,718,'Document no.');text(40,703,10,number||'Pending',true);
    stroke(218,701,218,726,line,.55);label(235,718,isReceipt?'Paid date':'Approval date');text(235,703,9.4,dateVal?new Date(dateVal).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'Not recorded',true);
    stroke(391,701,391,726,line,.55);label(408,718,'Payment ID');text(408,703,9.4,p.id,true);
    rect(24,607,547,73,'0.945 0.97 0.96',line,.55);
    label(40,662,'Payee / beneficiary');text(40,644,13,clip(p.payee,42),true);text(40,628,8.4,clip(ben?destinationSummary(ben):(p.method||''),56),false,muted);
    label(385,662,'Amount');text(385,638,19,ctx.money2(p.amount),true,green);
    rect(24,459,547,133,white,line,.55);
    label(40,570,'Payment details');
    const rows=[
      ['Payment type',p.type||'Other payment'],
      ['Payment method',p.method||'Not recorded'],
      ['Reference / invoice',p.reference||bill?.invoiceNo||'Not recorded'],
      ['Linked bill',bill?(bill.invoiceNo+' · '+bill.supplier):'No linked bill'],
      ['Purpose',p.description||bill?.description||'Business payment']
    ];
    rows.forEach((r,i)=>{const y=545-i*23;text(40,y,8.8,r[0],false,muted);text(190,y,9,clip(r[1],50),true,ink);if(i<rows.length-1)stroke(40,y-8,555,y-8,'0.91 0.93 0.92',.45)});
    rect(24,380,547,64,mint,line,.55);label(40,423,'Amount in words');text(40,401,10,clip(numWords(p.amount)+' Dalasis only',76),true,green);
    rect(24,269,547,95,soft,line,.55);
    label(40,344,isReceipt?'Payment record':'Approval record');
    text(40,324,8.6,isReceipt?'Recorded as paid by':'Approved by',false,muted);text(170,324,9.2,clip(isReceipt?(p.updatedBy||'Workspace user'):(p.approvedBy||p.updatedBy||'Workspace user'),38),true);
    text(40,302,8.6,'Prepared by',false,muted);text(170,302,9.2,clip(p.createdBy||'Workspace user',38),true);
    text(40,280,8.6,'Created',false,muted);text(170,280,9.2,p.createdAt?new Date(p.createdAt).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded',true);
    fill(24,190,547,59,green);text(42,226,8.2,isReceipt?'PAYMENT RECORDED AS PAID':'APPROVED FOR PAYMENT',true,'0.74 0.91 0.86');text(42,203,20,ctx.money2(p.amount),true,white);text(362,210,8,clip(p.method||'',24),true,'0.84 0.95 0.91');
    stroke(24,82,571,82,line,.55);
    text(24,63,7.3,isReceipt?'This receipt confirms DalasiPay recorded the payment as paid.':'This voucher records an approved payment instruction.',true,'0.45 0.51 0.49');
    text(24,48,6.9,'It is not independent bank or mobile-money settlement confirmation unless a payment-provider integration verifies it.',false,'0.53 0.58 0.56');
    text(421,63,7.3,'Generated by DalasiPay',true,green);
    const safe=(String(p.payee||'Payee').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Payee');
    const filename=(isReceipt?'Payment_Receipt_':'Payment_Voucher_')+safe+'_'+(number||p.id)+'.pdf';
    ctx.pdfDownload(filename,out.join('\n'),state.branding?.logoData||'');ctx.toast((isReceipt?'Payment receipt':'Payment voucher')+' downloaded');
  }

  function tabs(state){
    return '<div class="payment-tabs"><button class="'+(state.paymentTab==='payments'?'active':'')+'" data-action="payment-tab:payments">Payments</button><button class="'+(state.paymentTab==='bills'?'active':'')+'" data-action="payment-tab:bills">Bills & invoices</button><button class="'+(state.paymentTab==='beneficiaries'?'active':'')+'" data-action="payment-tab:beneficiaries">Beneficiaries</button></div>';
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
  function billsPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,rows=(state.businessBills||[]).slice().sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))),m=billMetrics(state),today=todayIso();
    const tableRows=rows.length?rows.map(b=>{
      const ben=beneficiaryById(state,b.beneficiaryId),overdue=b.status!=='Paid'&&b.dueDate&&b.dueDate<today;
      return '<tr class="'+(overdue?'bill-overdue':'')+'>'+
        '<td><div class="payment-payee"><b>'+esc(b.supplier)+'</b><small>'+esc(b.invoiceNo||b.id)+'</small></div></td>'+
        '<td>'+esc(ben?.name||'One-off supplier')+'</td>'+
        '<td class="payment-amount">'+money2(b.amount)+'</td>'+
        '<td><div class="bill-date"><b>'+dueDate(b.dueDate)+'</b><small>'+(overdue?'Overdue':dueDate(b.invoiceDate))+'</small></div></td>'+
        '<td>'+pill(b.status,billStatusClass(b.status))+'</td>'+
        '<td>'+(b.attachmentData?'<a class="text-btn" href="'+esc(b.attachmentData)+'" download="'+esc(b.attachmentName||'invoice')+'">'+icon('download',13)+' Invoice</a>':'<span class="bill-no-file">No file</span>')+'</td>'+
        '<td><div class="payment-status-actions">'+billAction(b)+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No supplier bills recorded yet. Add an invoice to start tracking what the business owes.</div></td></tr>';
    return '<div class="bill-summary">'+
      '<div class="surface"><span>Outstanding</span><b>'+money2(m.outstanding)+'</b><small>'+m.count+' bills recorded</small></div>'+
      '<div class="surface '+(m.overdue?'bill-alert':'')+'"><span>Overdue</span><b>'+money2(m.overdue)+'</b><small>past due and unpaid</small></div>'+
      '<div class="surface"><span>Due in 7 days</span><b>'+money2(m.dueSoon)+'</b><small>upcoming obligations</small></div>'+
      '<div class="surface"><span>Paid bills</span><b>'+money2(m.paid)+'</b><small>settled through payments</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('file',17)+'</span><div><b>Invoice-to-payment control</b><p>Record the supplier invoice first, approve the obligation, then create the linked payment. When that payment is marked paid, DalasiPay closes the bill automatically.</p></div></div>'+
    '<div class="surface employee-card">'+
      '<div class="table-tools"><div><h3>Bills & invoices payable</h3><p>Supplier invoices, due dates, approvals and linked payments</p></div><button class="primary" data-action="open-business-bill">'+icon('plus',14)+' Add bill</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>SUPPLIER / INVOICE</th><th>BENEFICIARY</th><th>AMOUNT</th><th>DUE / INVOICE DATE</th><th>STATUS</th><th>DOCUMENT</th><th>ACTION</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
    '</div>';
  }

  function render(state,h){
    const icon=h.icon,pageTitle=h.pageTitle,tab=state.paymentTab||'payments';
    const actions=tab==='payments'?'<button class="secondary" data-action="download-payment-register">'+icon('download',14)+' Export register</button><button class="primary" data-action="open-business-payment">'+icon('plus',14)+' New payment</button>':tab==='bills'?'<button class="primary" data-action="open-business-bill">'+icon('plus',14)+' Add bill</button>':'<button class="primary" data-action="open-beneficiary">'+icon('plus',14)+' Add beneficiary</button>';
    const body=tab==='bills'?billsPanel(state,h):tab==='beneficiaries'?beneficiaryPanel(state,h):paymentPanel(state,h);
    return pageTitle('BUSINESS PAYMENTS','Payments','Manage business payments, supplier bills, beneficiaries and approval controls in one place.',actions)+tabs(state)+body;
  }
  function modal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc;
    const beneficiaries=(state.paymentBeneficiaries||[]).filter(x=>(x.status||'Active')==='Active');
    const bill=billById(state,state.paymentBillId);
    const selected=beneficiaryById(state,state.paymentBeneficiaryId||bill?.beneficiaryId);
    const typeValue=selected?paymentTypeForBeneficiary(selected.kind):(bill?'Supplier / vendor':TYPES[0]);
    const methodValue=selected?.preferredMethod||METHODS[0];
    const beneficiaryOptions=['<option value="">Manual / one-off payee</option>'].concat(beneficiaries.map(b=>'<option value="'+esc(b.id)+'" '+(selected&&selected.id===b.id?'selected':'')+'>'+esc(b.name)+' · '+esc(b.kind)+'</option>')).join('');
    const typeOptions=TYPES.map(x=>'<option '+(x===typeValue?'selected':'')+'>'+x+'</option>').join('');
    const methodOptions=METHODS.map(x=>'<option '+(x===methodValue?'selected':'')+'>'+x+'</option>').join('');
    const beneficiaryInfo=selected?'<div class="selected-beneficiary"><b>'+esc(selected.name)+'</b><span>'+esc(destinationSummary(selected))+'</span></div>':'';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-business-payment"></div><form id="business-payment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">NEW BUSINESS PAYMENT</div><h2>Record payment</h2><p>Create a controlled payment record outside payroll.</p></div><button type="button" class="close" data-action="close-business-payment">×</button></div>'+
      '<div class="payment-modal-note">This creates a payment record only. It does not send funds from a bank or mobile-money account.</div>'+
      field('Saved beneficiary','<select id="payment-beneficiary-select" name="beneficiaryId">'+beneficiaryOptions+'</select>')+beneficiaryInfo+billInfo+'<input type="hidden" name="billId" value="'+esc(bill?.id||'')+'">'+
      '<div class="form-grid">'+
        field('Payee / beneficiary','<input name="payee" value="'+esc(bill?.supplier||selected?.name||'')+'" placeholder="e.g. ABC Supplies Ltd" required>')+
        field('Payment type','<select name="type">'+typeOptions+'</select>')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" value="'+esc(bill?.amount||'')+'" placeholder="0.00" required>')+
        field('Payment method','<select name="method">'+methodOptions+'</select>')+
        field('Due date','<input name="dueDate" type="date" value="'+esc(bill?.dueDate||'')+'">')+
        field('Reference / invoice no.','<input name="reference" value="'+esc(bill?.invoiceNo||'')+'" placeholder="Invoice, bill or internal reference">')+
      '</div>'+
      field('Description / purpose','<input name="description" value="'+esc(bill?.description||'')+'" placeholder="What is this payment for?">')+
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
  function billModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,beneficiaries=(state.paymentBeneficiaries||[]).filter(x=>(x.status||'Active')==='Active');
    const beneficiaryOptions=['<option value="">One-off supplier</option>'].concat(beneficiaries.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+' · '+esc(b.kind)+'</option>')).join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-business-bill"></div><form id="business-bill-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">NEW BILL / INVOICE</div><h2>Record supplier invoice</h2><p>Track an obligation before it becomes a payment.</p></div><button type="button" class="close" data-action="close-business-bill">×</button></div>'+
      '<div class="payment-modal-note">Attach a small invoice file if useful. Files are stored with this workspace record; maximum 1.5 MB in this version.</div>'+
      '<div class="form-grid">'+
        field('Saved beneficiary','<select name="beneficiaryId">'+beneficiaryOptions+'</select>')+
        field('Supplier name','<input name="supplier" placeholder="e.g. ABC Supplies Ltd">')+
        field('Invoice number','<input name="invoiceNo" placeholder="e.g. INV-1042" required>')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>')+
        field('Invoice date','<input name="invoiceDate" type="date">')+
        field('Due date','<input name="dueDate" type="date" required>')+
        field('Category','<select name="category"><option>Supplies / inventory</option><option>Professional services</option><option>Rent / utilities</option><option>Government / statutory</option><option>Travel / logistics</option><option>Other expense</option></select>')+
        field('Invoice document','<input name="attachment" type="file" accept="application/pdf,image/png,image/jpeg,image/webp">')+
      '</div>'+
      field('Description / purpose','<input name="description" placeholder="What was purchased or billed?">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-business-bill">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save bill</button></div>'+
    '</form></div>';
  }
  async function createBill(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add bills.');return;}
    const fd=new FormData(ev.target),beneficiaryId=String(fd.get('beneficiaryId')||''),ben=beneficiaryById(state,beneficiaryId),supplier=String(fd.get('supplier')||'').trim()||ben?.name||'',invoiceNo=String(fd.get('invoiceNo')||'').trim(),amount=Number(fd.get('amount')||0),due=String(fd.get('dueDate')||'');
    if(!supplier||!invoiceNo||amount<=0||!due){ctx.toast('Supplier, invoice number, amount and due date are required.');return;}
    if((state.businessBills||[]).some(x=>String(x.invoiceNo).toLowerCase()===invoiceNo.toLowerCase()&&String(x.supplier).toLowerCase()===supplier.toLowerCase())){ctx.toast('That supplier invoice is already recorded.');return;}
    let attachment={name:'',data:''};try{attachment=await readBillAttachment(fd.get('attachment'));}catch(err){ctx.toast(err?.message||'Unable to attach invoice');return;}
    const id='BILL-'+Date.now().toString(36).toUpperCase();state.businessBills=state.businessBills||[];
    state.businessBills.unshift({id,beneficiaryId:beneficiaryId||null,supplier,invoiceNo,amount,invoiceDate:String(fd.get('invoiceDate')||''),dueDate:due,category:String(fd.get('category')||'Other expense'),description:String(fd.get('description')||'').trim(),attachmentName:attachment.name,attachmentData:attachment.data,status:'Draft',paymentId:null,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.billOpen=false;ctx.audit('bill.created',{billId:id,beneficiaryId:beneficiaryId||null,supplier,invoiceNo,amount,dueDate:due});ctx.save();ctx.toast('Supplier bill saved as draft');ctx.render();
  }
  function updateBill(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update bills.');return;}
    const b=billById(state,id);if(!b)return;b.status=status;b.updatedAt=new Date().toISOString();b.updatedBy=state.session?.name||'User';ctx.audit('bill.status_updated',{billId:id,status,amount:b.amount,supplier:b.supplier});ctx.save();ctx.toast(b.invoiceNo+': '+status);ctx.render();
  }

  function create(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create business payments.');return;}
    const fd=new FormData(ev.target),amount=Number(fd.get('amount')||0),payee=String(fd.get('payee')||'').trim(),beneficiaryId=String(fd.get('beneficiaryId')||''),billId=String(fd.get('billId')||state.paymentBillId||'');
    if(!payee||amount<=0){ctx.toast('Enter a payee and a valid payment amount.');return;}
    const id='BP-'+Date.now().toString(36).toUpperCase();
    state.businessPayments=state.businessPayments||[];
    state.businessPayments.unshift({id,billId:billId||null,beneficiaryId:beneficiaryId||null,payee,type:String(fd.get('type')||'Other payment'),amount,method:String(fd.get('method')||'Bank transfer'),dueDate:String(fd.get('dueDate')||''),reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    if(billId){const bill=billById(state,billId);if(bill){bill.paymentId=id;bill.updatedAt=new Date().toISOString();}}
    state.paymentOpen=false;state.paymentBeneficiaryId=null;state.paymentBillId=null;
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
    p.status=status;p.updatedAt=new Date().toISOString();p.updatedBy=state.session?.name||'User';if(status==='Approved'){p.approvedAt=p.approvedAt||p.updatedAt;p.approvedBy=p.approvedBy||p.updatedBy;p.voucherNumber=p.voucherNumber||nextDocumentNumber('PV',state);}if(status==='Paid'){p.paidAt=new Date().toISOString();p.receiptNumber=p.receiptNumber||nextDocumentNumber('PR',state);p.voucherNumber=p.voucherNumber||nextDocumentNumber('PV',state);if(p.billId){const bill=billById(state,p.billId);if(bill){bill.status='Paid';bill.paidAt=p.paidAt;bill.paymentId=p.id;bill.updatedAt=p.paidAt;}}}
    ctx.audit('payment.status_updated',{paymentId:id,status,amount:p.amount,payee:p.payee,voucherNumber:p.voucherNumber||null,receiptNumber:p.receiptNumber||null});ctx.save();ctx.toast(status==='Paid'?(p.payee+': Paid · Receipt '+p.receiptNumber+' created'):status==='Approved'?(p.payee+': Approved · Voucher '+p.voucherNumber+' created'):(p.payee+': '+status));ctx.render();
  }
  function updateBeneficiary(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update beneficiaries.');return;}
    const b=beneficiaryById(state,id);if(!b)return;b.status=status;b.updatedAt=new Date().toISOString();b.updatedBy=state.session?.name||'User';
    ctx.audit('payment.beneficiary_status_updated',{beneficiaryId:id,status});ctx.save();ctx.toast(b.name+': '+status);ctx.render();
  }
  function exportRegister(state,ctx){
    const rows=(state.businessPayments||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const csv=['Payment ID,Payee,Beneficiary ID,Bill ID,Voucher Number,Receipt Number,Type,Amount,Method,Due Date,Reference,Status,Created By,Created At,Paid At'].concat(rows.map(p=>[p.id,p.payee,p.beneficiaryId||'',p.billId||'',p.voucherNumber||'',p.receiptNumber||'',p.type,p.amount,p.method,p.dueDate,p.reference,p.status,p.createdBy,p.createdAt,p.paidAt||''].map(ctx.csvEscape).join(','))).join('\n');
    ctx.downloadText('dalasipay-business-payments.csv',csv);ctx.toast('Business payment register downloaded');
  }
  window.DalasiBusinessPayments={render,modal,beneficiaryModal,billModal,create,createBeneficiary,createBill,update,updateBeneficiary,updateBill,exportRegister,downloadDocument:paymentDocumentPdf,summary:totals,beneficiaryById,billById,types:TYPES.slice(),methods:METHODS.slice()};
})();
