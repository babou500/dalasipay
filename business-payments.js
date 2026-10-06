(function(){
  'use strict';
  const TYPES=['Supplier / vendor','Contractor / freelancer','Expense reimbursement','Rent / utilities','Government / statutory','Other payment'];
  const BENEFICIARY_TYPES=['Supplier / vendor','Contractor / freelancer','Landlord / utility','Government / statutory','Other beneficiary'];
  const METHODS=['Bank transfer','Mobile money','Cash','Cheque','Other'];
  const FREQUENCIES=['Weekly','Monthly','Quarterly','Yearly'];

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
  function isoDate(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function addDaysIso(iso,days){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+Number(days||0));return isoDate(d);}
  function advanceRecurringDate(iso,frequency){
    const d=new Date(iso+'T12:00:00'),day=d.getDate();
    if(frequency==='Weekly'){d.setDate(d.getDate()+7);return isoDate(d);}
    const months=frequency==='Quarterly'?3:frequency==='Yearly'?12:1;
    d.setDate(1);d.setMonth(d.getMonth()+months);
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return isoDate(d);
  }
  function recurringById(state,id){return (state.recurringBusinessPayments||[]).find(x=>x.id===id)||null;}
  function monthlyEquivalent(r){
    const amount=Number(r.amount)||0;
    return r.frequency==='Weekly'?amount*52/12:r.frequency==='Quarterly'?amount/3:r.frequency==='Yearly'?amount/12:amount;
  }
  function recurringMetrics(state){
    const rows=state.recurringBusinessPayments||[],active=rows.filter(x=>(x.status||'Active')==='Active'),today=todayIso(),soon=addDaysIso(today,30);
    return {count:rows.length,active:active.length,monthly:active.reduce((a,x)=>a+monthlyEquivalent(x),0),dueNow:active.filter(x=>x.nextDueDate&&x.nextDueDate<=addDaysIso(today,Number(x.leadDays||0))).reduce((a,x)=>a+(Number(x.amount)||0),0),next30:active.filter(x=>x.nextDueDate&&x.nextDueDate>=today&&x.nextDueDate<=soon).reduce((a,x)=>a+(Number(x.amount)||0),0)};
  }
  function materializeRecurring(state){
    state.recurringBusinessPayments=state.recurringBusinessPayments||[];
    state.businessPayments=state.businessPayments||[];
    const today=todayIso();let created=0;
    for(const r of state.recurringBusinessPayments){
      if((r.status||'Active')!=='Active'||!r.nextDueDate)continue;
      let guard=0;
      while(r.nextDueDate<=addDaysIso(today,Number(r.leadDays||0))&&guard<24){
        if(r.endDate&&r.nextDueDate>r.endDate){r.status='Completed';break;}
        const scheduledDate=r.nextDueDate;
        const exists=state.businessPayments.some(p=>p.recurringId===r.id&&p.recurringDueDate===scheduledDate);
        if(!exists){
          const ben=beneficiaryById(state,r.beneficiaryId),id='BP-'+Date.now().toString(36).toUpperCase()+'-'+String(created+1);
          state.businessPayments.unshift({id,recurringId:r.id,recurringDueDate:scheduledDate,beneficiaryId:r.beneficiaryId||null,payee:ben?.name||r.payee||r.name,type:r.type||paymentTypeForBeneficiary(ben?.kind),amount:Number(r.amount)||0,method:r.method||ben?.preferredMethod||'Bank transfer',dueDate:scheduledDate,reference:r.reference||'',description:r.description||r.name,status:'Draft',createdAt:new Date().toISOString(),createdBy:'Recurring schedule',updatedAt:new Date().toISOString()});
          created++;
        }
        r.lastGeneratedDueDate=scheduledDate;r.nextDueDate=advanceRecurringDate(scheduledDate,r.frequency||'Monthly');r.updatedAt=new Date().toISOString();guard++;
      }
    }
    return created;
  }

  function billMetrics(state){
    const rows=state.businessBills||[],today=todayIso(),week=new Date();week.setDate(week.getDate()+7);const w=week.toISOString().slice(0,10);
    const bal=x=>window.DalasiReturns?.billBalance?.(state,x)??(Number(x.amount)||0),open=rows.filter(x=>(x.status||'Draft')!=='Draft'&&bal(x)>.004),sum=xs=>xs.reduce((a,x)=>a+bal(x),0);
    return {count:rows.length,outstanding:sum(open),overdue:sum(open.filter(x=>x.dueDate&&x.dueDate<today)),dueSoon:sum(open.filter(x=>x.dueDate&&x.dueDate>=today&&x.dueDate<=w)),paid:(state.businessPayments||[]).filter(x=>x.billId&&x.status==='Paid').reduce((a,x)=>a+(Number(x.amount)||0),0),credited:(state.supplierCreditNotes||[]).reduce((a,x)=>a+(Number(x.amount)||0),0),debited:(state.supplierDebitNotes||[]).reduce((a,x)=>a+(Number(x.amount)||0),0)};
  }
  function billAction(state,b){
    const balance=window.DalasiReturns?.billBalance?.(state,b)??(Number(b.amount)||0),pending=(state.businessPayments||[]).find(x=>x.billId===b.id&&x.status!=='Paid');
    if(b.status==='Draft')return '<button class="secondary" data-action="bill-submit:'+b.id+'">Submit</button>';
    if(b.status==='Pending approval')return '<button class="secondary" data-action="bill-approve:'+b.id+'">Approve</button>';
    if(balance<=.004)return '<span class="payment-complete">'+(b.status==='Paid'?'Paid':'Credited')+'</span>';
    if(pending)return '<span class="payment-complete">Payment created</span>';
    return '<button class="primary" data-action="pay-bill:'+b.id+'">Create payment</button>';
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




  function customerById(state,id){return (state.customers||[]).find(x=>x.id===id)||null;}
  function customerInvoicesFor(state,id){return (state.customerInvoices||[]).filter(x=>x.customerId===id);}
  function customerAccount(state,id){
    const customer=customerById(state,id),invoices=customerInvoicesFor(state,id),today=todayIso();
    let invoiced=0,collected=0,outstanding=0,overdue=0;
    invoices.forEach(inv=>{const paid=receivablePaid(state,inv.id),bal=receivableBalance(state,inv);invoiced+=Number(inv.amount)||0;collected+=paid;outstanding+=bal;if(bal>0&&inv.dueDate&&inv.dueDate<today)overdue+=bal;});
    return {customer,invoices,invoiced,collected,outstanding,overdue};
  }
  function supplierAccount(state,id){
    const supplier=beneficiaryById(state,id),bills=(state.businessBills||[]).filter(x=>x.beneficiaryId===id),payments=beneficiaryPayments(state,id),today=todayIso();
    const totalBilled=bills.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const outstanding=bills.filter(x=>(x.status||'Draft')!=='Draft').reduce((a,x)=>a+(window.DalasiReturns?.billBalance?.(state,x)??(Number(x.amount)||0)),0);
    const overdue=bills.filter(x=>(x.status||'Draft')!=='Draft'&&(window.DalasiReturns?.billBalance?.(state,x)??0)>.004&&x.dueDate&&x.dueDate<today).reduce((a,x)=>a+(window.DalasiReturns?.billBalance?.(state,x)??(Number(x.amount)||0)),0);
    const paid=payments.filter(x=>x.status==='Paid').reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {supplier,bills,payments,totalBilled,outstanding,overdue,paid};
  }
  function paymentTermsLabel(days){const n=Number(days)||0;return n<=0?'Due on receipt':'Net '+n+' days';}
  function customerDueDate(issueDate,days){return addDaysIso(issueDate||todayIso(),Math.max(0,Number(days)||0));}
  function customerStatusClass(status){return status==='Inactive'?'neutral':'ready';}
  function receivableById(state,id){return (state.customerInvoices||[]).find(x=>x.id===id)||null;}
  function incomingPaymentById(state,id){return (state.incomingPayments||[]).find(x=>x.id===id)||null;}
  function incomingForInvoice(state,id){return (state.incomingPayments||[]).filter(x=>x.invoiceId===id);}
  function receivablePaid(state,id){return incomingForInvoice(state,id).reduce((a,x)=>a+(Number(x.amount)||0),0);}
  function receivableBalance(state,invoice){return window.DalasiReturns?.invoiceBalance?.(state,invoice)??Math.max(0,(Number(invoice?.amount)||0)-receivablePaid(state,invoice?.id));}
  function receivableStatus(state,invoice){
    const paid=receivablePaid(state,invoice.id),balance=Math.max(0,(Number(invoice.amount)||0)-paid);
    if(balance<=0.004)return 'Paid';
    if(paid>0)return 'Part paid';
    if((invoice.status||'Draft')==='Draft')return 'Draft';
    if(invoice.dueDate&&invoice.dueDate<todayIso())return 'Overdue';
    return invoice.status||'Sent';
  }
  function receivableStatusClass(status){return status==='Paid'?'paid':status==='Sent'?'approved':status==='Overdue'?'neutral':status==='Part paid'?'neutral':'ready';}
  function nextReceivableNumber(prefix,state){
    const year=new Date().getFullYear(),base=prefix+'-'+year+'-',rows=prefix==='CR'?(state.incomingPayments||[]):(state.customerInvoices||[]),key=prefix==='CR'?'receiptNumber':'invoiceNo';
    let max=0;rows.forEach(x=>{const v=String(x[key]||'');if(v.startsWith(base)){const n=Number(v.slice(base.length));if(Number.isFinite(n)&&n>max)max=n;}});
    let n=max+1,number=base+String(n).padStart(5,'0');while(rows.some(x=>String(x[key]||'').toLowerCase()===number.toLowerCase())){n++;number=base+String(n).padStart(5,'0');}
    return number;
  }
  function receivableMetrics(state){
    const rows=state.customerInvoices||[],payments=state.incomingPayments||[],today=todayIso();
    let outstanding=0,overdue=0,open=0;
    rows.forEach(inv=>{const status=receivableStatus(state,inv),bal=receivableBalance(state,inv);if(status!=='Draft'&&status!=='Paid'){outstanding+=bal;open++;if(inv.dueDate&&inv.dueDate<today)overdue+=bal;}});
    return {count:rows.length,open,outstanding,overdue,collected:payments.reduce((a,x)=>a+(Number(x.amount)||0),0)};
  }
  function receivableAction(state,invoice){
    const status=receivableStatus(state,invoice);
    if(status==='Draft')return '<button class="secondary" data-action="receivable-doc:invoice:'+invoice.id+'">Invoice PDF</button><button class="primary" data-action="receivable-send:'+invoice.id+'">Mark sent</button>';
    const adjust='<button class="secondary" data-action="credit-invoice:'+invoice.id+'">Credit</button><button class="secondary" data-action="debit-invoice:'+invoice.id+'">Debit</button>';
    if(status==='Paid')return '<button class="secondary" data-action="receivable-doc:invoice:'+invoice.id+'">Invoice PDF</button>'+adjust+'<span class="payment-complete">Paid</span>';
    return '<button class="secondary" data-action="receivable-doc:invoice:'+invoice.id+'">Invoice PDF</button>'+adjust+'<button class="primary" data-action="record-incoming:'+invoice.id+'">Record payment</button>';
  }

  function customersPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,rows=(state.customers||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    const active=rows.filter(x=>(x.status||'Active')==='Active').length;
    const totals=rows.reduce((a,cust)=>{const m=customerAccount(state,cust.id);a.invoiced+=m.invoiced;a.collected+=m.collected;a.outstanding+=m.outstanding;a.overdue+=m.overdue;return a;},{invoiced:0,collected:0,outstanding:0,overdue:0});
    const tableRows=rows.length?rows.map(cust=>{
      const m=customerAccount(state,cust.id),status=cust.status||'Active';
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(cust.name)+'</b><small>'+esc(cust.contact||cust.email||cust.phone||cust.id)+'</small></div></td>'+
        '<td><div class="customer-terms"><b>'+esc(paymentTermsLabel(cust.termDays))+'</b><small>'+esc(cust.reference||'No account reference')+'</small></div></td>'+
        '<td class="payment-amount">'+money2(m.invoiced)+'</td>'+
        '<td class="customer-collected">'+money2(m.collected)+'</td>'+
        '<td><div class="receivable-balance"><b>'+money2(m.outstanding)+'</b><small>'+(m.overdue?money2(m.overdue)+' overdue':'No overdue balance')+'</small></div></td>'+
        '<td>'+pill(status,customerStatusClass(status))+'</td>'+
        '<td><div class="payment-status-actions"><button class="secondary" data-action="customer-view:'+cust.id+'">View</button>'+(status==='Active'?'<button class="primary" data-action="invoice-customer:'+cust.id+'">Invoice</button>':'<button class="secondary" data-action="customer-status:'+cust.id+':Active">Activate</button>')+(status==='Active'?'<button class="secondary" data-action="customer-status:'+cust.id+':Inactive">Deactivate</button>':'')+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No customer accounts yet. Add a customer to reuse contact details and payment terms on future invoices.</div></td></tr>';
    return '<div class="customer-summary">'+
      '<div class="surface"><span>Active customers</span><b>'+active+'</b><small>'+rows.length+' total accounts</small></div>'+
      '<div class="surface"><span>Lifetime invoiced</span><b>'+money2(totals.invoiced)+'</b><small>across saved customers</small></div>'+
      '<div class="surface"><span>Outstanding</span><b>'+money2(totals.outstanding)+'</b><small>customer balances due</small></div>'+
      '<div class="surface '+(totals.overdue?'cash-alert':'')+'"><span>Overdue</span><b>'+money2(totals.overdue)+'</b><small>past due customer balances</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('user',17)+'</span><div><b>Reusable customer accounts</b><p>Save a client once, keep their contact details and payment terms, and create future invoices without retyping the customer profile.</p></div></div>'+
    '<div class="surface employee-card">'+
      '<div class="table-tools"><div><h3>Customers / client accounts</h3><p>Customer terms, invoice history, collections and balances</p></div><button class="primary" data-action="open-customer">'+icon('plus',14)+' Add customer</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>PAYMENT TERMS</th><th>INVOICED</th><th>COLLECTED</th><th>OUTSTANDING</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
    '</div>';
  }
  function suppliersPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon;
    const rows=(state.paymentBeneficiaries||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    const active=rows.filter(x=>(x.status||'Active')==='Active').length;
    const totals=rows.reduce((a,s)=>{const m=supplierAccount(state,s.id);a.billed+=m.totalBilled;a.paid+=m.paid;a.outstanding+=m.outstanding;a.overdue+=m.overdue;return a;},{billed:0,paid:0,outstanding:0,overdue:0});
    const tableRows=rows.length?rows.map(s=>{
      const m=supplierAccount(state,s.id),status=s.status||'Active';
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(s.name)+'</b><small>'+esc(s.contact||s.email||s.phone||s.id)+'</small></div></td>'+
        '<td>'+esc(s.kind||'Supplier / vendor')+'</td>'+
        '<td><div class="payment-destination"><b>'+esc(s.preferredMethod||'Bank transfer')+'</b><small>'+esc(destinationSummary(s))+'</small></div></td>'+
        '<td class="payment-amount">'+money2(m.totalBilled)+'</td>'+
        '<td class="customer-collected">'+money2(m.paid)+'</td>'+
        '<td><div class="receivable-balance"><b>'+money2(m.outstanding)+'</b><small>'+(m.overdue?money2(m.overdue)+' overdue':'No overdue bills')+'</small></div></td>'+
        '<td>'+pill(status,status==='Active'?'ready':'neutral')+'</td>'+
        '<td><div class="payment-status-actions"><button class="secondary" data-action="supplier-view:'+s.id+'">View</button>'+(status==='Active'?'<button class="primary" data-action="pay-supplier:'+s.id+'">Pay</button><button class="secondary" data-action="bill-supplier:'+s.id+'">Bill</button><button class="secondary" data-action="beneficiary-status:'+s.id+':Inactive">Deactivate</button>':'<button class="secondary" data-action="beneficiary-status:'+s.id+':Active">Activate</button>')+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="8"><div class="empty-inline">No supplier or vendor accounts yet. Add a supplier to reuse payment details and link future bills and payments.</div></td></tr>';
    return '<div class="customer-summary">'+
      '<div class="surface"><span>Active suppliers</span><b>'+active+'</b><small>'+rows.length+' total vendor accounts</small></div>'+
      '<div class="surface"><span>Bills recorded</span><b>'+money2(totals.billed)+'</b><small>supplier invoice value</small></div>'+
      '<div class="surface"><span>Outstanding</span><b>'+money2(totals.outstanding)+'</b><small>open supplier bills</small></div>'+
      '<div class="surface '+(totals.overdue?'cash-alert':'')+'"><span>Overdue</span><b>'+money2(totals.overdue)+'</b><small>past due supplier bills</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('building',17)+'</span><div><b>Reusable supplier accounts</b><p>Keep supplier contacts and payment details in one place, then link bills and payments to the same vendor account.</p></div></div>'+
    '<div class="surface employee-card">'+
      '<div class="table-tools"><div><h3>Suppliers & vendors</h3><p>Vendor details, bills, payments and outstanding balances</p></div><button class="primary" data-action="open-supplier">'+icon('plus',14)+' Add supplier</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>SUPPLIER</th><th>TYPE</th><th>PAYMENT DETAILS</th><th>BILLED</th><th>PAID</th><th>OUTSTANDING</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
    '</div>';
  }

  function receivablesPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,rows=(state.customerInvoices||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))),m=receivableMetrics(state),today=todayIso();
    const invoiceRows=rows.length?rows.map(inv=>{
      const status=receivableStatus(state,inv),paid=receivablePaid(state,inv),balance=receivableBalance(state,inv),overdue=status==='Overdue';
      return '<tr class="'+(overdue?'receivable-overdue':'')+'">'+
        '<td><div class="payment-payee"><b>'+esc(inv.customerName)+'</b><small>'+esc(inv.invoiceNo||inv.id)+'</small></div></td>'+
        '<td class="payment-amount">'+money2(inv.amount)+'</td>'+
        '<td><div class="receivable-balance"><b>'+money2(balance)+'</b><small>'+money2(paid)+' received</small></div></td>'+
        '<td><div class="bill-date"><b>'+dueDate(inv.dueDate)+'</b><small>'+dueDate(inv.issueDate)+'</small></div></td>'+
        '<td>'+pill(status,receivableStatusClass(status))+'</td>'+
        '<td><div class="payment-status-actions">'+receivableAction(state,inv)+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="6"><div class="empty-inline">No customer invoices yet. Create your first invoice to start tracking money owed to the business.</div></td></tr>';
    const recent=(state.incomingPayments||[]).slice().sort((a,b)=>String(b.receivedDate||b.createdAt||'').localeCompare(String(a.receivedDate||a.createdAt||''))).slice(0,8);
    const receiptRows=recent.length?recent.map(p=>{const inv=receivableById(state,p.invoiceId);return '<tr><td><div class="payment-payee"><b>'+esc(inv?.customerName||p.customerName||'Customer')+'</b><small>'+esc(p.receiptNumber||p.id)+'</small></div></td><td>'+esc(inv?.invoiceNo||'—')+'</td><td class="payment-amount">'+money2(p.amount)+'</td><td>'+dueDate(p.receivedDate)+'</td><td>'+esc(p.method||'Other')+'</td><td><button class="secondary tiny" data-action="receivable-doc:receipt:'+p.id+'">'+icon('download',13)+' Receipt PDF</button></td></tr>';}).join(''):'<tr><td colspan="6"><div class="empty-inline">No incoming customer payments recorded yet.</div></td></tr>';
    return '<div class="receivable-summary">'+
      '<div class="surface"><span>Outstanding</span><b>'+money2(m.outstanding)+'</b><small>'+m.open+' open invoice'+(m.open===1?'':'s')+'</small></div>'+
      '<div class="surface '+(m.overdue?'cash-alert':'')+'"><span>Overdue receivables</span><b>'+money2(m.overdue)+'</b><small>past due and unpaid</small></div>'+
      '<div class="surface"><span>Collected</span><b>'+money2(m.collected)+'</b><small>incoming payments recorded</small></div>'+
      '<div class="surface"><span>Invoices</span><b>'+m.count+'</b><small>draft, sent and paid</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('send',17)+'</span><div><b>Money in, with a clear audit trail</b><p>Create customer invoices, mark them sent, record full or partial collections and generate a receipt for each incoming payment.</p></div></div>'+
    '<div class="surface employee-card">'+
      '<div class="table-tools"><div><h3>Customer invoices</h3><p>Amounts due to the business and their collection status</p></div><button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / INVOICE</th><th>INVOICE TOTAL</th><th>BALANCE DUE</th><th>DUE / ISSUE DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+invoiceRows+'</tbody></table></div>'+
    '</div>'+
    '<div class="surface employee-card receivable-receipts">'+
      '<div class="table-tools"><div><h3>Recent incoming payments</h3><p>Customer collections and generated receipts</p></div></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / RECEIPT</th><th>INVOICE</th><th>AMOUNT RECEIVED</th><th>DATE</th><th>METHOD</th><th>DOCUMENT</th></tr></thead><tbody>'+receiptRows+'</tbody></table></div>'+
    '</div>';
  }
  function receivableModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,customers=(state.customers||[]).filter(x=>(x.status||'Active')==='Active'),selected=customerById(state,state.receivableCustomerId);
    const issue=todayIso(),due=selected?customerDueDate(issue,selected.termDays):'';
    const options=['<option value="">Manual / one-off customer</option>'].concat(customers.map(c=>'<option value="'+esc(c.id)+'" '+(selected&&selected.id===c.id?'selected':'')+'>'+esc(c.name)+' · '+esc(paymentTermsLabel(c.termDays))+'</option>')).join('');
    const selectedInfo=selected?'<div class="selected-customer"><b>'+esc(selected.name)+'</b><span>'+esc(paymentTermsLabel(selected.termDays))+(selected.email?' · '+esc(selected.email):'')+'</span></div>':'';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-receivable"></div><form id="receivable-form" class="modal-box sales-document-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">CUSTOMER INVOICE</div><h2>Create invoice</h2><p>Build an itemized customer invoice and track the amount due.</p></div><button type="button" class="close" data-action="close-receivable">×</button></div>'+
      field('Saved customer','<select id="invoice-customer-select" name="customerId">'+options+'</select>')+selectedInfo+
      '<div class="form-grid">'+
        field('Customer / client name','<input name="customerName" value="'+esc(selected?.name||'')+'" placeholder="e.g. Kaira Trading Ltd" required>')+
        field('Invoice number','<input name="invoiceNo" placeholder="Leave blank for automatic number">')+
        field('Customer email','<input name="customerEmail" type="email" value="'+esc(selected?.email||'')+'" placeholder="accounts@example.com">')+
        field('Customer phone','<input name="customerPhone" value="'+esc(selected?.phone||'')+'" placeholder="+220 ...">')+
        field('Issue date','<input name="issueDate" type="date" value="'+issue+'" required>')+
        field('Due date','<input name="dueDate" type="date" value="'+due+'" required>')+
        field('Customer reference','<input name="reference" value="'+esc(selected?.reference||'')+'" placeholder="PO, contract or customer reference">')+
        field('VAT treatment',window.DalasiTax?.salesOptions?.(state)||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+
        field('Project',window.DalasiDimensions?.projectSelect?.(state,'project')||'<select name="project"><option value="">Unassigned</option></select>')+
        field('Cost centre',window.DalasiDimensions?.costCentreSelect?.(state,'costCentre')||'<select name="costCentre"><option value="">Unassigned</option></select>')+
      '</div>'+
      '<div class="sales-line-note">Choose saved Products & Services or enter custom lines. The invoice total is calculated automatically.</div>'+
      window.DalasiCatalog.lineItemsForm(state,[])+
      field('Overall description / note','<input name="description" placeholder="Optional invoice summary">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-receivable">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save draft invoice</button></div>'+
    '</form></div>';
  }
  function customerModal(state,h){
    const field=h.field,icon=h.icon;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-customer"></div><form id="customer-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">CUSTOMER ACCOUNT</div><h2>Add customer</h2><p>Save a repeat customer for faster invoicing and account tracking.</p></div><button type="button" class="close" data-action="close-customer">×</button></div>'+
      '<div class="form-grid">'+
        field('Customer / business name','<input name="name" placeholder="e.g. Kaira Trading Ltd" required>')+
        field('Contact person','<input name="contact" placeholder="Optional contact name">')+
        field('Email','<input name="email" type="email" placeholder="accounts@example.com">')+
        field('Phone','<input name="phone" placeholder="+220 ...">')+
        field('Payment terms','<select name="termDays"><option value="0">Due on receipt</option><option value="7">Net 7 days</option><option value="14">Net 14 days</option><option value="30" selected>Net 30 days</option><option value="60">Net 60 days</option></select>')+
        field('Credit limit (GMD)','<input name="creditLimit" type="number" min="0" step="0.01" value="0" placeholder="0 = no formal limit">')+
        field('Credit status','<select name="creditStatus"><option>Open</option><option>Hold</option></select>')+
        field('Account / customer reference','<input name="reference" placeholder="Customer code, contract or account ref">')+
      '</div>'+
      field('Address','<input name="address" placeholder="Business or billing address">')+
      field('Notes','<input name="notes" placeholder="Optional internal customer note">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-customer">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save customer</button></div>'+
    '</form></div>';
  }
  function customerAccountModal(state,h){
    const esc=h.esc,money2=h.money2,icon=h.icon,m=customerAccount(state,state.customerAccountId),cust=m.customer;if(!cust)return '';
    const invoices=m.invoices.slice().sort((a,b)=>String(b.issueDate||'').localeCompare(String(a.issueDate||'')));
    const rows=invoices.length?invoices.map(inv=>'<tr><td><b>'+esc(inv.invoiceNo)+'</b></td><td>'+dueDate(inv.issueDate)+'</td><td>'+dueDate(inv.dueDate)+'</td><td>'+money2(inv.amount)+'</td><td>'+money2(receivableBalance(state,inv))+'</td><td>'+esc(receivableStatus(state,inv))+'</td></tr>').join(''):'<tr><td colspan="6"><div class="empty-inline">No invoices for this customer yet.</div></td></tr>';
    return '<div class="center-modal payment-modal customer-account-modal"><div class="modal-scrim" data-action="close-customer-account"></div><div class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">CLIENT ACCOUNT</div><h2>'+esc(cust.name)+'</h2><p>'+esc(cust.contact||cust.email||cust.phone||paymentTermsLabel(cust.termDays))+'</p></div><button type="button" class="close" data-action="close-customer-account">×</button></div>'+
      '<div class="customer-account-summary"><div><span>Invoiced</span><b>'+money2(m.invoiced)+'</b></div><div><span>Collected</span><b>'+money2(m.collected)+'</b></div><div><span>Outstanding</span><b>'+money2(m.outstanding)+'</b></div><div><span>Overdue</span><b>'+money2(m.overdue)+'</b></div></div>'+
      '<div class="customer-account-details"><div><span>Payment terms</span><b>'+esc(paymentTermsLabel(cust.termDays))+'</b></div><div><span>Credit limit</span><b>'+money2(cust.creditLimit||0)+'</b></div><div><span>Credit status</span><b>'+esc(cust.creditStatus||'Open')+'</b></div><div><span>Email</span><b>'+esc(cust.email||'—')+'</b></div><div><span>Phone</span><b>'+esc(cust.phone||'—')+'</b></div><div><span>Reference</span><b>'+esc(cust.reference||'—')+'</b></div></div>'+
      '<div class="table-scroll customer-history"><table><thead><tr><th>INVOICE</th><th>ISSUED</th><th>DUE</th><th>TOTAL</th><th>BALANCE</th><th>STATUS</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-customer-account">Close</button><button class="primary" data-action="invoice-customer:'+cust.id+'">'+icon('plus',14)+' New invoice</button></div>'+
    '</div></div>';
  }
  function supplierAccountModal(state,h){
    const esc=h.esc,money2=h.money2,icon=h.icon,m=supplierAccount(state,state.supplierAccountId),s=m.supplier;if(!s)return '';
    const bills=m.bills.slice().sort((a,b)=>String(b.invoiceDate||b.createdAt||'').localeCompare(String(a.invoiceDate||a.createdAt||'')));
    const billRows=bills.length?bills.map(b=>'<tr><td><b>'+esc(b.invoiceNo||b.id)+'</b></td><td>'+dueDate(b.invoiceDate)+'</td><td>'+dueDate(b.dueDate)+'</td><td><b>'+money2(window.DalasiReturns?.billBalance?.(state,b)??b.amount)+'</b><small class="cash-sub">original '+money2(b.amount)+'</small></td><td>'+esc(b.status||'Draft')+'</td></tr>').join(''):'<tr><td colspan="5"><div class="empty-inline">No supplier bills linked to this account yet.</div></td></tr>';
    const pays=m.payments.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const payRows=pays.length?pays.slice(0,8).map(p=>'<tr><td><b>'+esc(p.voucherNumber||p.receiptNumber||p.id)+'</b></td><td>'+dueDate(p.dueDate)+'</td><td>'+money2(p.amount)+'</td><td>'+esc(p.method||'Other')+'</td><td>'+esc(p.status||'Draft')+'</td></tr>').join(''):'<tr><td colspan="5"><div class="empty-inline">No payments linked to this supplier yet.</div></td></tr>';
    return '<div class="center-modal payment-modal customer-account-modal"><div class="modal-scrim" data-action="close-supplier-account"></div><div class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">SUPPLIER ACCOUNT</div><h2>'+esc(s.name)+'</h2><p>'+esc(s.contact||s.email||s.phone||s.kind||'Supplier / vendor')+'</p></div><button type="button" class="close" data-action="close-supplier-account">×</button></div>'+
      '<div class="customer-account-summary"><div><span>Billed</span><b>'+money2(m.totalBilled)+'</b></div><div><span>Paid</span><b>'+money2(m.paid)+'</b></div><div><span>Outstanding</span><b>'+money2(m.outstanding)+'</b></div><div><span>Overdue</span><b>'+money2(m.overdue)+'</b></div></div>'+
      '<div class="customer-account-details"><div><span>Type</span><b>'+esc(s.kind||'Supplier / vendor')+'</b></div><div><span>Email</span><b>'+esc(s.email||'—')+'</b></div><div><span>Phone</span><b>'+esc(s.phone||'—')+'</b></div><div><span>Payment method</span><b>'+esc(s.preferredMethod||'—')+'</b></div></div>'+
      '<div class="table-scroll customer-history"><table><thead><tr><th>BILL / INVOICE</th><th>INVOICE DATE</th><th>DUE DATE</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>'+billRows+'</tbody></table></div>'+
      '<div class="table-scroll customer-history"><table><thead><tr><th>PAYMENT REF</th><th>DUE DATE</th><th>AMOUNT</th><th>METHOD</th><th>STATUS</th></tr></thead><tbody>'+payRows+'</tbody></table></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-supplier-account">Close</button><button class="secondary" data-action="bill-supplier:'+s.id+'">'+icon('plus',14)+' Add bill</button><button class="primary" data-action="pay-supplier:'+s.id+'">'+icon('plus',14)+' New payment</button></div>'+
    '</div></div>';
  }

  function createCustomer(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add customers.');return;}
    const fd=new FormData(ev.target),name=String(fd.get('name')||'').trim();if(!name){ctx.toast('Enter the customer name.');return;}
    const id='CUS-'+Date.now().toString(36).toUpperCase();state.customers=state.customers||[];
    state.customers.push({id,name,contact:String(fd.get('contact')||'').trim(),email:String(fd.get('email')||'').trim(),phone:String(fd.get('phone')||'').trim(),termDays:Number(fd.get('termDays')||0),creditLimit:Math.max(0,Number(fd.get('creditLimit'))||0),creditStatus:String(fd.get('creditStatus'))==='Hold'?'Hold':'Open',creditNote:'',reference:String(fd.get('reference')||'').trim(),address:String(fd.get('address')||'').trim(),notes:String(fd.get('notes')||'').trim(),status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.customerOpen=false;ctx.audit('customer.created',{customerId:id,name,termDays:Number(fd.get('termDays')||0)});ctx.save();ctx.toast(name+' added as a customer');ctx.render();
  }
  function updateCustomer(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update customers.');return;}
    const cust=customerById(state,id);if(!cust)return;cust.status=status;cust.updatedAt=new Date().toISOString();cust.updatedBy=state.session?.name||'User';ctx.audit('customer.status_updated',{customerId:id,status});ctx.save();ctx.toast(cust.name+': '+status);ctx.render();
  }

  function incomingPaymentModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,money2=h.money2,inv=receivableById(state,state.incomingPaymentInvoiceId);
    if(!inv)return '';
    const balance=receivableBalance(state,inv);
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-incoming-payment"></div><form id="incoming-payment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">MONEY IN</div><h2>Record customer payment</h2><p>'+esc(inv.customerName)+' · '+esc(inv.invoiceNo)+'</p></div><button type="button" class="close" data-action="close-incoming-payment">×</button></div>'+
      '<div class="selected-bill"><b>Balance outstanding</b><span>'+money2(balance)+'</span></div>'+
      '<input type="hidden" name="invoiceId" value="'+esc(inv.id)+'">'+
      '<div class="form-grid">'+
        field('Amount received (GMD)','<input name="amount" type="number" min="0.01" max="'+balance+'" step="0.01" value="'+balance.toFixed(2)+'" required>')+
        field('Date received','<input name="receivedDate" type="date" value="'+todayIso()+'" required>')+
        field('Payment method','<select name="method"><option>Bank transfer</option><option>Mobile money</option><option>Cash</option><option>Cheque</option><option>Other</option></select>')+
        field('Deposit to account',window.DalasiCashBank.accountSelect(state,'accountId','','Select cash / bank account'))+
        field('Payment reference','<input name="reference" placeholder="Bank, transfer or receipt reference">')+
      '</div>'+
      field('Note','<input name="note" placeholder="Optional collection note">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-incoming-payment">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Record payment</button></div>'+
    '</form></div>';
  }
  function createReceivable(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create customer invoices.');return;}
    const fd=new FormData(ev.target),customerId=String(fd.get('customerId')||''),saved=customerById(state,customerId),customerName=String(fd.get('customerName')||'').trim()||saved?.name||'',issueDate=String(fd.get('issueDate')||''),dueDate=String(fd.get('dueDate')||''),lines=window.DalasiCatalog.readLines(ev.target),totals=window.DalasiCatalog.lineTotals(lines),description=String(fd.get('description')||'').trim()||lines.map(x=>x.description).slice(0,3).join(', ');
    if(!customerName||totals.total<=0||!issueDate||!dueDate||!lines.length){ctx.toast('Customer, at least one priced line item, issue date and due date are required.');return;}
    if(saved?.creditStatus==='Hold'){ctx.toast(saved.name+' is on credit hold. Release the hold before creating a new invoice.');return;}
    if(window.DalasiMonthClose?.isClosed(state,issueDate)){ctx.toast('That accounting period is closed. Reopen it before creating this invoice.');return;}
    let invoiceNo=String(fd.get('invoiceNo')||'').trim();if(!invoiceNo)invoiceNo=nextReceivableNumber('INV',state);
    if((state.customerInvoices||[]).some(x=>String(x.invoiceNo).toLowerCase()===invoiceNo.toLowerCase())){ctx.toast('That customer invoice number already exists.');return;}
    const id='AR-'+Date.now().toString(36).toUpperCase(),tax=window.DalasiTax?.snapshot?.(state,totals.total,String(fd.get('taxCode')||window.DalasiTax?.defaultSalesCode?.(state)||'OUT'),'sale')||{taxCode:'OUT',vatRate:0,taxGross:totals.total,taxNet:totals.total,vatAmount:0,vatRecoverable:false,taxableTurnover:false};state.customerInvoices=state.customerInvoices||[];
    state.customerInvoices.unshift({id,invoiceNo,customerId:customerId||null,customerName,customerEmail:String(fd.get('customerEmail')||saved?.email||'').trim(),customerPhone:String(fd.get('customerPhone')||saved?.phone||'').trim(),lineItems:lines,subtotal:totals.subtotal,discountTotal:totals.discount,amount:totals.total,...tax,...(window.DalasiDimensions?.tag?.(fd)||{}),issueDate,dueDate,reference:String(fd.get('reference')||saved?.reference||'').trim(),description,status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.receivableOpen=false;state.receivableCustomerId=null;ctx.audit('receivable.created',{invoiceId:id,invoiceNo,customerName,amount:totals.total,lineCount:lines.length,dueDate});ctx.save();ctx.toast('Customer invoice '+invoiceNo+' saved as draft');ctx.render();
  }
  function updateReceivable(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update customer invoices.');return;}
    const inv=receivableById(state,id);if(!inv)return;if(window.DalasiMonthClose?.isClosed(state,inv.issueDate||inv.createdAt)){ctx.toast('This invoice belongs to a closed accounting period. Reopen the period before changing it.');return;}inv.status=status;inv.updatedAt=new Date().toISOString();inv.updatedBy=state.session?.name||'User';if(status==='Sent'){inv.sentAt=inv.sentAt||inv.updatedAt;inv.sentBy=inv.sentBy||inv.updatedBy;}
    ctx.audit('receivable.status_updated',{invoiceId:id,invoiceNo:inv.invoiceNo,status});ctx.save();ctx.toast(inv.invoiceNo+': '+status);ctx.render();
  }
  function recordIncomingPayment(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to record incoming payments.');return;}
    const fd=new FormData(ev.target),invoiceId=String(fd.get('invoiceId')||''),inv=receivableById(state,invoiceId);if(!inv)return;
    const amount=Number(fd.get('amount')||0),balance=receivableBalance(state,inv);if(amount<=0||amount>balance+0.004){ctx.toast('Enter an amount no greater than the outstanding balance.');return;}
    const id='IN-'+Date.now().toString(36).toUpperCase(),receiptNumber=nextReceivableNumber('CR',state);
    state.incomingPayments=state.incomingPayments||[];
    const receivedDate=String(fd.get('receivedDate')||todayIso()),accountId=String(fd.get('accountId')||'')||null;
    if(window.DalasiMonthClose?.isClosed(state,receivedDate)){ctx.toast('That accounting period is closed. Reopen it before recording this receipt.');return;}
    state.incomingPayments.unshift({id,invoiceId,customerName:inv.customerName,amount,receivedDate,method:String(fd.get('method')||'Bank transfer'),accountId,reference:String(fd.get('reference')||'').trim(),note:String(fd.get('note')||'').trim(),receiptNumber,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    if(accountId)window.DalasiCashBank?.post(state,{accountId,date:receivedDate,direction:'in',amount,type:'Customer collection',counterparty:inv.customerName,reference:String(fd.get('reference')||receiptNumber).trim(),description:'Collection for '+(inv.invoiceNo||invoiceId),sourceType:'customer-collection',sourceId:id,sourceKey:'customer-collection:'+id+':in',createdBy:state.session?.name||'User'});
    const remaining=Math.max(0,balance-amount);inv.status=remaining<=0.004?'Paid':'Part paid';inv.updatedAt=new Date().toISOString();inv.updatedBy=state.session?.name||'User';if(inv.status==='Paid')inv.paidAt=inv.updatedAt;
    state.incomingPaymentOpen=false;state.incomingPaymentInvoiceId=null;ctx.audit('receivable.payment_recorded',{invoiceId,invoiceNo:inv.invoiceNo,incomingPaymentId:id,receiptNumber,amount,balanceRemaining:remaining});ctx.save();ctx.toast('Payment recorded · Receipt '+receiptNumber+' created');ctx.render();
  }
  function downloadReceivableDocument(id,type,state,ctx){
    const isReceipt=type==='receipt',payment=isReceipt?incomingPaymentById(state,id):null,inv=isReceipt?receivableById(state,payment?.invoiceId):receivableById(state,id);
    if(!inv){ctx.toast('Customer invoice not found');return;}
    if(isReceipt&&!payment){ctx.toast('Incoming payment record not found');return;}
    const tax=window.DalasiTax?.meta?.(state,inv,'sale')||{taxCode:'OUT',taxNet:Number(inv.amount)||0,vatAmount:0,vatRate:0},taxInvoice=!isReceipt&&window.DalasiTax?.settings?.(state)?.vatRegistered&&['STD','ZERO'].includes(tax.taxCode),title=isReceipt?'PAYMENT RECEIPT':(taxInvoice?'VAT INVOICE':'CUSTOMER INVOICE'),number=isReceipt?payment.receiptNumber:inv.invoiceNo,amount=isReceipt?payment.amount:inv.amount;
    const balance=receivableBalance(state,inv),paid=receivablePaid(state,inv),out=[],ink='0.06 0.13 0.11',muted='0.36 0.43 0.40',green='0.04 0.31 0.26',mint='0.92 0.97 0.95',line='0.84 0.88 0.86',white='1 1 1',soft='0.97 0.98 0.975';
    const safeText=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const clip=(v,max=48)=>{const s=String(v??'');return s.length>max?s.slice(0,max-3)+'...':s};
    const text=(x,y,size,value,bold=false,color=ink)=>out.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+safeText(value)+') Tj ET');
    const fill=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
    const stroke=(x1,y1,x2,y2,color=line,width=.7)=>out.push(color+' RG '+width+' w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
    const rect=(x,y,w,h,fillColor=white,strokeColor=line,width=.65)=>{fill(x,y,w,h,fillColor);out.push(strokeColor+' RG '+width+' w '+x+' '+y+' '+w+' '+h+' re S')};
    const label=(x,y,value)=>text(x,y,7.2,String(value).toUpperCase(),true,'0.42 0.49 0.46');
    fill(0,0,595,842,white);out.push('0.88 0.91 0.90 RG 0.75 w 24 24 547 794 re S');
    fill(24,746,547,72,green);fill(24,746,5,72,'0.37 0.82 0.68');
    if(state.branding?.logoData){out.push('q 42 0 0 42 43 765 cm /Im1 Do Q')}else{fill(43,765,42,42,'0.88 0.97 0.94');text(57,780,14,clip(state.branding?.logoText||state.company.slice(0,1),3),true,green)}
    text(99,790,17,clip(state.company,29),true,white);text(99,771,8.2,(window.DalasiTax?.settings?.(state)?.tin?'TIN '+window.DalasiTax.settings(state).tin:'DALASIPAY MONEY IN'),true,'0.74 0.91 0.86');
    text(394,791,17,title,true,white);text(394,772,7.6,(isReceipt?'CUSTOMER COLLECTION':'AMOUNT DUE').toUpperCase(),true,'0.74 0.91 0.86');
    rect(24,695,547,38,soft,line,.55);label(40,718,isReceipt?'Receipt no.':'Invoice no.');text(40,703,10,number,true);stroke(218,701,218,726,line,.55);label(235,718,isReceipt?'Date received':'Issue date');text(235,703,9.4,dueDate(isReceipt?payment.receivedDate:inv.issueDate),true);stroke(391,701,391,726,line,.55);label(408,718,isReceipt?'Invoice':'Due date');text(408,703,9.4,isReceipt?inv.invoiceNo:dueDate(inv.dueDate),true);
    rect(24,607,547,73,'0.945 0.97 0.96',line,.55);label(40,662,'Customer');text(40,644,13,clip(inv.customerName,42),true);text(40,628,8.4,clip([inv.customerEmail,inv.customerPhone].filter(Boolean).join(' · ')||'Customer account',58),false,muted);label(385,662,isReceipt?'Amount received':'Invoice amount');text(385,638,19,ctx.money2(amount),true,green);
    const invLines=inv.lineItems||[];
    if(!isReceipt&&invLines.length){
      rect(24,433,547,159,white,line,.55);label(40,570,'Invoice items');
      text(40,550,7.5,'DESCRIPTION',true,muted);text(300,550,7.5,'QTY',true,muted);text(350,550,7.5,'UNIT PRICE',true,muted);text(430,550,7.5,'DISC.',true,muted);text(487,550,7.5,'AMOUNT',true,muted);stroke(40,540,555,540,'0.91 0.93 0.92',.45);
      invLines.slice(0,5).forEach((x,i)=>{const y=520-i*20;text(40,y,8.4,clip(x.description,43),false,ink);text(302,y,8,String(x.quantity)+' '+clip(x.unit||'Unit',7),false,muted);text(350,y,8,ctx.money2(x.unitPrice),false,ink);text(438,y,8,(Number(x.discount)||0)+'%',false,muted);text(487,y,8,ctx.money2(x.amount??window.DalasiCatalog.lineAmount(x)),true,ink);});
      if(invLines.length>5)text(40,440,7.8,'+'+(invLines.length-5)+' more line item'+(invLines.length-5===1?'':'s'),true,muted);
    }else{
      rect(24,470,547,122,white,line,.55);label(40,570,isReceipt?'Receipt details':'Invoice details');
      const details=isReceipt?[['Invoice',inv.invoiceNo],['Payment method',payment.method||'Not recorded'],['Payment reference',payment.reference||'Not recorded'],['Description',payment.note||inv.description||'Customer payment']]:[['Description',inv.description||'Customer invoice'],['Customer reference',inv.reference||'Not recorded'],['Status',receivableStatus(state,inv)],['Due date',dueDate(inv.dueDate)]];
      details.forEach((r,i)=>{const y=544-i*24;text(40,y,8.8,r[0],false,muted);text(190,y,9.2,clip(r[1],50),true,ink);if(i<details.length-1)stroke(40,y-8,555,y-8,'0.91 0.93 0.92',.45)});
    }
    rect(24,335,547,80,mint,line,.55);
    if(isReceipt){label(40,396,'Invoice collection summary');text(40,374,9,'Invoice total',false,muted);text(160,374,10,ctx.money2(inv.amount),true);text(300,374,9,'Total received',false,muted);text(410,374,10,ctx.money2(paid),true,green);text(40,352,9,'Balance remaining',false,muted);text(160,352,13,ctx.money2(balance),true,balance>0?ink:green);}
    else{label(40,396,'Invoice totals');text(40,374,8.6,'Net value',false,muted);text(120,374,9.2,ctx.money2(tax.taxNet),true);text(230,374,8.6,'VAT '+(tax.vatRate?tax.vatRate+'%':''),false,muted);text(305,374,9.2,ctx.money2(tax.vatAmount),true);text(400,374,8.6,'Amount due',false,muted);text(477,371,14,ctx.money2(balance),true,green);text(40,351,8,(window.DalasiTax?.code?.(tax.taxCode)?.short||tax.taxCode)+(paid>0?' · Payments received '+ctx.money2(paid):''),true,muted);}
    rect(24,230,547,82,soft,line,.55);label(40,291,isReceipt?'Collection record':'Payment instructions');text(40,269,8.5,isReceipt?'Recorded by':'Invoice prepared by',false,muted);text(175,269,9.2,clip(isReceipt?(payment.createdBy||'Workspace user'):(inv.createdBy||'Workspace user'),38),true);text(40,249,8.5,isReceipt?'Recorded on':'Invoice status',false,muted);text(175,249,9.2,isReceipt?new Date(payment.createdAt).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):receivableStatus(state,inv),true);
    fill(24,146,547,59,green);text(42,182,8.2,isReceipt?'PAYMENT RECEIVED':'CUSTOMER AMOUNT DUE',true,'0.74 0.91 0.86');text(42,160,20,ctx.money2(isReceipt?payment.amount:balance),true,white);text(356,166,8,clip(isReceipt?(payment.method||''):(inv.dueDate?'Due '+dueDate(inv.dueDate):''),26),true,'0.84 0.95 0.91');
    stroke(24,82,571,82,line,.55);text(24,63,7.3,isReceipt?'This receipt records a customer payment received in DalasiPay.':(taxInvoice?'VAT is included in the invoice total according to the saved tax treatment.':'This invoice records an amount due to the business.'),true,'0.45 0.51 0.49');text(24,48,6.9,isReceipt?'Bank or mobile-money settlement is not independently verified unless a payment-provider integration confirms it.':'Please use the invoice number as the payment reference unless otherwise agreed.',false,'0.53 0.58 0.56');text(421,63,7.3,'Generated by DalasiPay',true,green);
    const safe=(String(inv.customerName||'Customer').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Customer'),filename=(isReceipt?'Customer_Receipt_':'Customer_Invoice_')+safe+'_'+number+'.pdf';
    ctx.pdfDownload(filename,out.join('\n'),state.branding?.logoData||'');ctx.toast((isReceipt?'Customer receipt':'Customer invoice')+' downloaded');
  }

  function dateDiffDays(a,b){
    const A=new Date(a+'T12:00:00'),B=new Date(b+'T12:00:00');return Math.round((B-A)/86400000);
  }
  function periodPayday(period,day){
    const parts=String(period||'').split('-').map(Number),y=parts[0],m=parts[1];if(!y||!m)return todayIso();
    const last=new Date(y,m,0).getDate(),d=Math.min(Math.max(1,Number(day)||28),last);return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }

  function cashFlowItems(state,ctx,horizon=90){
    const today=todayIso(),end=addDaysIso(today,horizon),items=[],seen=new Set();
    const add=item=>{if(!item.date||item.date>end)return;const key=item.key||[item.source,item.id,item.date].join('|');if(seen.has(key))return;seen.add(key);items.push(item);};

    (state.businessPayments||[]).forEach(p=>{
      if(p.status==='Paid')return;
      const date=p.dueDate||today;
      add({key:'payment|'+p.id,date,dateOriginal:p.dueDate||'',source:'Payment',direction:'out',id:p.id,label:p.payee||'Business payment',detail:p.reference||p.description||p.type||'',amount:Number(p.amount)||0,status:p.status||'Draft',priority:p.status==='Approved'?3:p.status==='Pending approval'?2:1});
    });

    (state.businessBills||[]).forEach(b=>{
      if(b.status==='Paid'||b.paymentId)return;
      add({key:'bill|'+b.id,date:b.dueDate||today,dateOriginal:b.dueDate||'',source:'Bill',direction:'out',id:b.id,label:b.supplier||'Supplier bill',detail:b.invoiceNo||b.description||'',amount:Number(b.amount)||0,status:b.status||'Draft',priority:b.status==='Approved'?3:b.status==='Pending approval'?2:1});
    });

    (state.recurringBusinessPayments||[]).forEach(r=>{
      if((r.status||'Active')!=='Active'||!r.nextDueDate)return;
      let due=r.nextDueDate,guard=0;
      while(due<=end&&guard<40){
        if(r.endDate&&due>r.endDate)break;
        const already=(state.businessPayments||[]).some(p=>p.recurringId===r.id&&p.recurringDueDate===due);
        if(!already)add({key:'recurring|'+r.id+'|'+due,date:due,dateOriginal:due,source:'Recurring',direction:'out',id:r.id,label:r.name||r.payee||'Recurring payment',detail:(r.frequency||'Monthly')+' · '+(r.reference||r.description||'Standing obligation'),amount:Number(r.amount)||0,status:'Scheduled',priority:1});
        due=advanceRecurringDate(due,r.frequency||'Monthly');guard++;
      }
    });

    (state.businessExpenses||[]).forEach(x=>{
      if(x.status==='Paid'||x.status==='Draft')return;
      add({key:'expense|'+x.id,date:x.expenseDate||today,dateOriginal:x.expenseDate||'',source:'Expense',direction:'out',id:x.id,label:x.merchant||'Business expense',detail:(x.expenseNo||x.id)+' · '+(x.category||x.description||x.status),amount:Number(x.amount)||0,status:x.status||'Pending approval',priority:x.status==='Approved'?3:2});
    });

    (state.purchaseOrders||[]).forEach(x=>{
      if(!['Approved','Ordered'].includes(x.status||'Draft'))return;
      const date=x.requiredDate||x.requestDate||today;
      add({key:'purchase|'+x.id,date,dateOriginal:x.requiredDate||x.requestDate||'',source:'Purchase',direction:'out',id:x.id,label:x.supplierName||supplierByPurchase(state,x)||'Purchase order',detail:(x.poNumber||x.id)+' · '+(x.description||x.category||x.status),amount:Number(x.amount)||0,status:x.status||'Approved',priority:x.status==='Ordered'?3:2});
    });

    (state.customerInvoices||[]).forEach(inv=>{
      const status=receivableStatus(state,inv),balance=receivableBalance(state,inv);
      if(status==='Draft'||status==='Paid'||balance<=0)return;
      add({key:'receivable|'+inv.id,date:inv.dueDate||today,dateOriginal:inv.dueDate||'',source:'Receivable',direction:'in',id:inv.id,label:inv.customerName||'Customer invoice',detail:(inv.invoiceNo||inv.id)+' · '+(inv.description||status),amount:balance,status,priority:status==='Overdue'?3:2});
    });

    if(ctx&&typeof ctx.payrollCalc==='function'){
      const payroll=ctx.payrollCalc(),status=state.payrollStatus||'Draft';
      if(!['Paid','Closed'].includes(status)){
        let date=periodPayday(state.currentPeriod,state.opsConfig?.paydayDay||28);
        if(date<today)date=today;
        if(date<=end)add({key:'payroll|'+state.currentPeriod,date,dateOriginal:periodPayday(state.currentPeriod,state.opsConfig?.paydayDay||28),source:'Payroll',direction:'out',id:state.currentPeriod,label:'Employee net payroll',detail:(ctx.periodLabel?ctx.periodLabel(state.currentPeriod):state.currentPeriod)+' · '+status,amount:Number(payroll?.totals?.net)||0,status,priority:3});
      }
    }
    return items.sort((a,b)=>a.date.localeCompare(b.date)||b.priority-a.priority||b.amount-a.amount);
  }
  function cashFlowSummary(state,ctx,horizon=90){
    const today=todayIso(),items=cashFlowItems(state,ctx,horizon),sum=xs=>xs.reduce((a,x)=>a+(Number(x.amount)||0),0),future=items.filter(x=>x.date>=today);
    const by=(direction,days)=>sum(future.filter(x=>x.direction===direction&&dateDiffDays(today,x.date)<=days));
    const overdueOut=items.filter(x=>x.direction==='out'&&x.dateOriginal&&x.dateOriginal<today),overdueIn=items.filter(x=>x.direction==='in'&&x.dateOriginal&&x.dateOriginal<today);
    const out7=by('out',7),in7=by('in',7),out30=by('out',30),in30=by('in',30),out90=by('out',90),in90=by('in',90);
    return {items,out7,in7,out30,in30,out90,in90,need7:Math.max(0,out7-in7),need30:Math.max(0,out30-in30),need90:Math.max(0,out90-in90),surplus7:Math.max(0,in7-out7),surplus30:Math.max(0,in30-out30),surplus90:Math.max(0,in90-out90),overdueOut:sum(overdueOut),overdueOutCount:overdueOut.length,overdueIn:sum(overdueIn),overdueInCount:overdueIn.length};
  }
  function supplierByPurchase(state,x){
    const s=beneficiaryById(state,x?.supplierId);return s?.name||x?.supplierName||'';
  }
  function cashSourceClass(source){
    return source==='Payroll'?'cash-payroll':source==='Bill'?'cash-bill':source==='Recurring'?'cash-recurring':source==='Receivable'?'cash-receivable':source==='Expense'?'cash-expense':source==='Purchase'?'cash-purchase':'cash-payment';
  }
  function cashFlowPanel(state,h){
    const esc=h.esc,money2=h.money2,ctx={payrollCalc:h.payrollCalc,periodLabel:h.periodLabel},view=Number(state.cashFlowWindow||90),s=cashFlowSummary(state,ctx,view),today=todayIso();
    const groups=new Map();s.items.forEach(x=>{const key=x.date;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x);});
    const dates=[...groups.keys()].sort(),maxDay=Math.max(1,...dates.map(d=>{const xs=groups.get(d);return Math.max(xs.filter(x=>x.direction==='out').reduce((a,x)=>a+x.amount,0),xs.filter(x=>x.direction==='in').reduce((a,x)=>a+x.amount,0));}));
    const card=(label,out,inflow,need,surplus)=>'<div class="surface"><span>'+label+'</span><b>'+(need>0?money2(need)+' needed':money2(surplus)+' surplus')+'</b><small>Out '+money2(out)+' · In '+money2(inflow)+'</small></div>';
    const timeline=dates.length?dates.map(d=>{
      const items=groups.get(d),out=items.filter(x=>x.direction==='out').reduce((a,x)=>a+x.amount,0),inflow=items.filter(x=>x.direction==='in').reduce((a,x)=>a+x.amount,0),relative=d<today?'Overdue':d===today?'Today':dateDiffDays(today,d)===1?'Tomorrow':dateDiffDays(today,d)<=7?'In '+dateDiffDays(today,d)+' days':'';
      return '<section class="cash-day '+(d<today?'overdue':'')+'">'+
        '<div class="cash-date"><div><b>'+new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+'</b><span>'+relative+'</span></div><div class="cash-date-totals"><strong class="cash-out">Out '+money2(out)+'</strong><strong class="cash-in">In '+money2(inflow)+'</strong></div></div>'+
        '<div class="cash-paired-bars"><div class="cash-day-bar cash-out-bar"><i style="width:'+Math.max(out?4:0,Math.round(out/maxDay*100))+'%"></i></div><div class="cash-day-bar cash-in-bar"><i style="width:'+Math.max(inflow?4:0,Math.round(inflow/maxDay*100))+'%"></i></div></div>'+
        '<div class="cash-items">'+items.map(x=>'<div class="cash-item '+(x.direction==='in'?'inflow':'outflow')+'"><span class="cash-source '+cashSourceClass(x.source)+'">'+esc(x.source)+'</span><div class="cash-item-main"><b>'+esc(x.label)+'</b><small>'+esc(x.detail||x.status)+'</small></div><span class="cash-status">'+esc(x.status)+'</span><strong>'+(x.direction==='in'?'+ ':'- ')+money2(x.amount)+'</strong></div>').join('')+'</div>'+
      '</section>';
    }).join(''):'<div class="surface cash-empty"><b>No planned cash movements in this window</b><p>Add customer invoices, bills, payments or recurring obligations to build the cash-flow calendar.</p></div>';
    return '<div class="cash-summary">'+
      card('Next 7 days',s.out7,s.in7,s.need7,s.surplus7)+
      card('Next 30 days',s.out30,s.in30,s.need30,s.surplus30)+
      card('Next 90 days',s.out90,s.in90,s.need90,s.surplus90)+
      '<div class="surface '+(s.overdueIn?'cash-alert':'')+'"><span>Overdue receivables</span><b>'+money2(s.overdueIn)+'</b><small>'+s.overdueInCount+' customer invoice'+(s.overdueInCount===1?'':'s')+' past due</small></div>'+
    '</div>'+
    '<div class="cash-toolbar"><div><b>Cash flow calendar</b><span>Expected inflows versus planned outflows · not a live bank balance</span></div><div class="cash-window"><button class="'+(view===30?'active':'')+'" data-action="cash-window:30">30 days</button><button class="'+(view===60?'active':'')+'" data-action="cash-window:60">60 days</button><button class="'+(view===90?'active':'')+'" data-action="cash-window:90">90 days</button></div></div>'+
    '<div class="cash-legend"><span><i class="cash-payroll"></i>Payroll</span><span><i class="cash-payment"></i>Payments</span><span><i class="cash-bill"></i>Bills</span><span><i class="cash-recurring"></i>Recurring</span><span><i class="cash-expense"></i>Expenses</span><span><i class="cash-purchase"></i>Purchases</span><span><i class="cash-receivable"></i>Receivables</span></div>'+
    '<div class="cash-timeline">'+timeline+'</div>';
  }

  function tabs(state){
    return '<div class="payment-tabs"><button class="'+(state.paymentTab==='payments'?'active':'')+'" data-action="payment-tab:payments">Payments</button><button class="'+(state.paymentTab==='bills'?'active':'')+'" data-action="payment-tab:bills">Bills & invoices</button><button class="'+(state.paymentTab==='receivables'?'active':'')+'" data-action="payment-tab:receivables">Money In</button><button class="'+(state.paymentTab==='customers'?'active':'')+'" data-action="payment-tab:customers">Customers</button><button class="'+(state.paymentTab==='recurring'?'active':'')+'" data-action="payment-tab:recurring">Recurring</button><button class="'+(state.paymentTab==='cashflow'?'active':'')+'" data-action="payment-tab:cashflow">Cash Flow</button><button class="'+(state.paymentTab==='beneficiaries'?'active':'')+'" data-action="payment-tab:beneficiaries">Beneficiaries</button></div>';
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
      const ben=beneficiaryById(state,b.beneficiaryId),balance=window.DalasiReturns?.billBalance?.(state,b)??(Number(b.amount)||0),overdue=balance>.004&&b.dueDate&&b.dueDate<today,displayStatus=b.status==='Paid'&&balance>.004?'Additional due':b.status;
      return '<tr class="'+(overdue?'bill-overdue':'')+'>'+
        '<td><div class="payment-payee"><b>'+esc(b.supplier)+'</b><small>'+esc(b.invoiceNo||b.id)+'</small></div></td>'+
        '<td>'+esc(ben?.name||'One-off supplier')+'</td>'+
        '<td class="payment-amount"><b>'+money2(balance)+'</b><small>'+money2(window.DalasiDebits?.supplierDebited?.(state,b.id)||0)+' debit · '+money2(window.DalasiReturns?.supplierCredited?.(state,b.id)||0)+' credit</small></td>'+
        '<td><div class="bill-date"><b>'+dueDate(b.dueDate)+'</b><small>'+(overdue?'Overdue':dueDate(b.invoiceDate))+'</small></div></td>'+
        '<td>'+pill(displayStatus,displayStatus==='Additional due'?'neutral':billStatusClass(b.status))+'</td>'+
        '<td>'+(b.attachmentData?'<a class="text-btn" href="'+esc(b.attachmentData)+'" download="'+esc(b.attachmentName||'invoice')+'">'+icon('download',13)+' Invoice</a>':'<span class="bill-no-file">No file</span>')+'</td>'+
        '<td><div class="payment-status-actions">'+billAction(state,b)+(b.status!=='Draft'&&(window.DalasiReturns?.billRemainingCredit?.(state,b)??0)>.004?'<button class="secondary" data-action="credit-bill:'+b.id+'">Credit</button>':'')+(b.status!=='Draft'?'<button class="secondary" data-action="debit-bill:'+b.id+'">Debit</button>':'')+'</div></td>'+
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


  function recurringPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,rows=(state.recurringBusinessPayments||[]).slice().sort((a,b)=>String(a.nextDueDate||'9999').localeCompare(String(b.nextDueDate||'9999'))),m=recurringMetrics(state);
    const tableRows=rows.length?rows.map(r=>{
      const ben=beneficiaryById(state,r.beneficiaryId),active=(r.status||'Active')==='Active';
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(r.name)+'</b><small>'+esc(ben?.name||r.payee||'No beneficiary linked')+'</small></div></td>'+
        '<td>'+esc(r.frequency)+'</td>'+
        '<td class="payment-amount">'+money2(r.amount)+'</td>'+
        '<td>'+dueDate(r.nextDueDate)+'</td>'+
        '<td><div class="payment-destination"><b>'+esc(r.method||ben?.preferredMethod||'Bank transfer')+'</b><small>'+esc(r.reference||'No reference')+'</small></div></td>'+
        '<td>'+pill(r.status||'Active',active?'ready':'neutral')+'</td>'+
        '<td><div class="payment-status-actions">'+(active?'<button class="secondary" data-action="recurring-generate:'+r.id+'">Generate now</button><button class="secondary" data-action="recurring-status:'+r.id+':Paused">Pause</button>':'<button class="secondary" data-action="recurring-status:'+r.id+':Active">Resume</button>')+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No recurring obligations yet. Add rent, subscriptions, retainers, utilities or another repeating payment.</div></td></tr>';
    return '<div class="recurring-summary">'+
      '<div class="surface"><span>Active schedules</span><b>'+m.active+'</b><small>'+m.count+' total recurring records</small></div>'+
      '<div class="surface"><span>Monthly equivalent</span><b>'+money2(m.monthly)+'</b><small>estimated recurring commitment</small></div>'+
      '<div class="surface"><span>Due within 30 days</span><b>'+money2(m.next30)+'</b><small>upcoming scheduled obligations</small></div>'+
      '<div class="surface"><span>Ready to generate</span><b>'+money2(m.dueNow)+'</b><small>based on due date and lead time</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('calendar',17)+'</span><div><b>Recurring obligations create draft payments</b><p>Active schedules create one draft payment per due cycle. DalasiPay never duplicates the same scheduled date and does not move funds automatically.</p></div></div>'+
    '<div class="surface employee-card">'+
      '<div class="table-tools"><div><h3>Recurring payments & standing obligations</h3><p>Rent, utilities, subscriptions, retainers and regular supplier commitments</p></div><button class="primary" data-action="open-recurring-payment">'+icon('plus',14)+' Add recurring</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>OBLIGATION</th><th>FREQUENCY</th><th>AMOUNT</th><th>NEXT DUE</th><th>PAYMENT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+tableRows+'</tbody></table></div>'+
    '</div>';
  }

  function renderCustomers(state,h){
    const icon=h.icon,pageTitle=h.pageTitle;
    const actions='<button class="primary" data-action="open-customer">'+icon('plus',14)+' Add customer</button>';
    return pageTitle('CLIENT ACCOUNTS','Customers','Manage repeat customers, payment terms, invoice history, collections and outstanding balances.',actions)+customersPanel(state,h);
  }
  function renderSuppliers(state,h){
    const icon=h.icon,pageTitle=h.pageTitle;
    const actions='<button class="primary" data-action="open-supplier">'+icon('plus',14)+' Add supplier</button>';
    return pageTitle('SUPPLIER ACCOUNTS','Suppliers','Manage vendors, payment details, supplier bills, payment history and outstanding balances.',actions)+suppliersPanel(state,h);
  }

  function render(state,h){
    const icon=h.icon,pageTitle=h.pageTitle,tab=state.paymentTab||'payments';
    const actions=tab==='payments'?'<button class="secondary" data-action="download-payment-register">'+icon('download',14)+' Export register</button><button class="primary" data-action="open-business-payment">'+icon('plus',14)+' New payment</button>':tab==='bills'?'<button class="primary" data-action="open-business-bill">'+icon('plus',14)+' Add bill</button>':tab==='receivables'?'<button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button>':tab==='customers'?'<button class="primary" data-action="open-customer">'+icon('plus',14)+' Add customer</button>':tab==='recurring'?'<button class="primary" data-action="open-recurring-payment">'+icon('plus',14)+' Add recurring</button>':tab==='cashflow'?'<button class="primary" data-action="open-business-payment">'+icon('plus',14)+' Add payment</button>':'<button class="primary" data-action="open-beneficiary">'+icon('plus',14)+' Add beneficiary</button>';
    const body=tab==='bills'?billsPanel(state,h):tab==='receivables'?receivablesPanel(state,h):tab==='customers'?customersPanel(state,h):tab==='recurring'?recurringPanel(state,h):tab==='cashflow'?cashFlowPanel(state,h):tab==='beneficiaries'?beneficiaryPanel(state,h):paymentPanel(state,h);
    return pageTitle('BUSINESS PAYMENTS','Payments','Manage money out, money in, customers, bills, recurring obligations, cash requirements and beneficiaries in one place.',actions)+tabs(state)+body;
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
    const billBalance=bill?(window.DalasiReturns?.billBalance?.(state,bill)??(Number(bill.amount)||0)):0,billInfo=bill?'<div class="selected-bill"><b>Invoice '+esc(bill.invoiceNo||bill.id)+'</b><span>'+esc(bill.supplier)+' · balance '+h.money2(billBalance)+'</span></div>':'';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-business-payment"></div><form id="business-payment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">NEW BUSINESS PAYMENT</div><h2>Record payment</h2><p>Create a controlled payment record outside payroll.</p></div><button type="button" class="close" data-action="close-business-payment">×</button></div>'+
      '<div class="payment-modal-note">This creates a payment record only. It does not send funds from a bank or mobile-money account.</div>'+
      field('Saved beneficiary','<select id="payment-beneficiary-select" name="beneficiaryId">'+beneficiaryOptions+'</select>')+beneficiaryInfo+billInfo+'<input type="hidden" name="billId" value="'+esc(bill?.id||'')+'">'+
      '<div class="form-grid">'+
        field('Payee / beneficiary','<input name="payee" value="'+esc(bill?.supplier||selected?.name||'')+'" placeholder="e.g. ABC Supplies Ltd" required>')+
        field('Payment type','<select name="type">'+typeOptions+'</select>')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" '+(bill?'max="'+billBalance+'" ':'')+'step="0.01" value="'+esc(bill?billBalance:'')+'" placeholder="0.00" required>')+
        field('Payment method','<select name="method">'+methodOptions+'</select>')+
        field('Pay from account',window.DalasiCashBank.accountSelect(state,'accountId','','Select cash / bank account'))+
        field('Due date','<input name="dueDate" type="date" value="'+esc(bill?.dueDate||'')+'">')+
        field('Reference / invoice no.','<input name="reference" value="'+esc(bill?.invoiceNo||'')+'" placeholder="Invoice, bill or internal reference">')+
      '</div>'+
      field('Description / purpose','<input name="description" value="'+esc(bill?.description||'')+'" placeholder="What is this payment for?">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-business-payment">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save draft</button></div>'+
    '</form></div>';
  }
  function beneficiaryModal(state,h){
    const field=h.field,icon=h.icon,selectedKind=state.beneficiaryDefaultKind||BENEFICIARY_TYPES[0];
    const kindOptions=BENEFICIARY_TYPES.map(x=>'<option '+(x===selectedKind?'selected':'')+'>'+x+'</option>').join('');
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

  function recurringModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,beneficiaries=(state.paymentBeneficiaries||[]).filter(x=>(x.status||'Active')==='Active');
    const beneficiaryOptions=['<option value="">Manual / one-off payee</option>'].concat(beneficiaries.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+' · '+esc(b.kind)+'</option>')).join('');
    const frequencyOptions=FREQUENCIES.map(x=>'<option>'+x+'</option>').join('');
    const methodOptions=METHODS.map(x=>'<option>'+x+'</option>').join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-recurring-payment"></div><form id="recurring-payment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">RECURRING OBLIGATION</div><h2>Add recurring payment</h2><p>Create a standing schedule for a regular business obligation.</p></div><button type="button" class="close" data-action="close-recurring-payment">×</button></div>'+
      '<div class="payment-modal-note">DalasiPay creates draft payment records from the schedule. It will not automatically transfer money.</div>'+
      '<div class="form-grid">'+
        field('Obligation name','<input name="name" placeholder="e.g. Office rent" required>')+
        field('Saved beneficiary','<select name="beneficiaryId">'+beneficiaryOptions+'</select>')+
        field('Payee if not saved','<input name="payee" placeholder="Optional manual payee">')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>')+
        field('Frequency','<select name="frequency">'+frequencyOptions+'</select>')+
        field('Next due date','<input name="nextDueDate" type="date" required>')+
        field('Create draft before due','<select name="leadDays"><option value="0">On due date</option><option value="3">3 days before</option><option value="5" selected>5 days before</option><option value="7">7 days before</option><option value="14">14 days before</option></select>')+
        field('End date','<input name="endDate" type="date">')+
        field('Payment method','<select name="method">'+methodOptions+'</select>')+
        field('Reference','<input name="reference" placeholder="Contract, account or subscription reference">')+
      '</div>'+
      field('Description / purpose','<input name="description" placeholder="What is this recurring payment for?">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-recurring-payment">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save recurring payment</button></div>'+
    '</form></div>';
  }
  function createRecurring(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add recurring payments.');return;}
    const fd=new FormData(ev.target),beneficiaryId=String(fd.get('beneficiaryId')||''),ben=beneficiaryById(state,beneficiaryId),name=String(fd.get('name')||'').trim(),payee=String(fd.get('payee')||'').trim(),amount=Number(fd.get('amount')||0),nextDueDate=String(fd.get('nextDueDate')||'');
    if(!name||amount<=0||!nextDueDate||(!beneficiaryId&&!payee)){ctx.toast('Name, payee or beneficiary, amount and next due date are required.');return;}
    const id='REC-'+Date.now().toString(36).toUpperCase();state.recurringBusinessPayments=state.recurringBusinessPayments||[];
    state.recurringBusinessPayments.push({id,name,beneficiaryId:beneficiaryId||null,payee:ben?.name||payee,type:paymentTypeForBeneficiary(ben?.kind),amount,frequency:String(fd.get('frequency')||'Monthly'),nextDueDate,leadDays:Number(fd.get('leadDays')||0),endDate:String(fd.get('endDate')||''),method:String(fd.get('method')||ben?.preferredMethod||'Bank transfer'),reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.recurringOpen=false;ctx.audit('payment.recurring_created',{recurringId:id,name,amount,frequency:String(fd.get('frequency')||'Monthly'),nextDueDate});ctx.save();ctx.toast(name+' recurring payment added');ctx.render();
  }
  function updateRecurring(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update recurring payments.');return;}
    const r=recurringById(state,id);if(!r)return;r.status=status;r.updatedAt=new Date().toISOString();r.updatedBy=state.session?.name||'User';ctx.audit('payment.recurring_status_updated',{recurringId:id,status});ctx.save();ctx.toast(r.name+': '+status);ctx.render();
  }
  function generateRecurringNow(id,state,ctx){
    const r=recurringById(state,id);if(!r)return;
    if((r.status||'Active')!=='Active'){ctx.toast('Resume this recurring payment before generating it.');return;}
    const ben=beneficiaryById(state,r.beneficiaryId),scheduledDate=r.nextDueDate;
    if(!scheduledDate){ctx.toast('No next due date is set.');return;}
    const exists=(state.businessPayments||[]).some(p=>p.recurringId===r.id&&p.recurringDueDate===scheduledDate);
    if(exists){ctx.toast('A payment already exists for '+dueDate(scheduledDate)+'.');return;}
    const pid='BP-'+Date.now().toString(36).toUpperCase();
    state.businessPayments.unshift({id:pid,recurringId:r.id,recurringDueDate:scheduledDate,beneficiaryId:r.beneficiaryId||null,payee:ben?.name||r.payee||r.name,type:r.type||paymentTypeForBeneficiary(ben?.kind),amount:Number(r.amount)||0,method:r.method||ben?.preferredMethod||'Bank transfer',dueDate:scheduledDate,reference:r.reference||'',description:r.description||r.name,status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    r.lastGeneratedDueDate=scheduledDate;r.nextDueDate=advanceRecurringDate(scheduledDate,r.frequency||'Monthly');r.updatedAt=new Date().toISOString();ctx.audit('payment.recurring_generated',{recurringId:r.id,paymentId:pid,dueDate:scheduledDate,amount:r.amount});ctx.save();ctx.toast('Draft payment generated for '+r.name);ctx.render();
  }

  function billModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,beneficiaries=(state.paymentBeneficiaries||[]).filter(x=>(x.status||'Active')==='Active');
    const beneficiaryOptions=['<option value="">One-off supplier</option>'].concat(beneficiaries.map(b=>'<option value="'+esc(b.id)+'" '+(state.paymentBeneficiaryId===b.id?'selected':'')+'>'+esc(b.name)+' · '+esc(b.kind)+'</option>')).join('');
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
        field('VAT treatment',window.DalasiTax?.purchaseOptions?.(state)||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+
        field('Project',window.DalasiDimensions?.projectSelect?.(state,'project')||'<select name="project"><option value="">Unassigned</option></select>')+
        field('Cost centre',window.DalasiDimensions?.costCentreSelect?.(state,'costCentre')||'<select name="costCentre"><option value="">Unassigned</option></select>')+
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
    const invoiceDate=String(fd.get('invoiceDate')||'');if(invoiceDate&&window.DalasiMonthClose?.isClosed(state,invoiceDate)){ctx.toast('That accounting period is closed. Reopen it before recording this supplier bill.');return;}
    if((state.businessBills||[]).some(x=>String(x.invoiceNo).toLowerCase()===invoiceNo.toLowerCase()&&String(x.supplier).toLowerCase()===supplier.toLowerCase())){ctx.toast('That supplier invoice is already recorded.');return;}
    let attachment={name:'',data:''};try{attachment=await readBillAttachment(fd.get('attachment'));}catch(err){ctx.toast(err?.message||'Unable to attach invoice');return;}
    const id='BILL-'+Date.now().toString(36).toUpperCase(),tax=window.DalasiTax?.snapshot?.(state,amount,String(fd.get('taxCode')||window.DalasiTax?.defaultPurchaseCode?.(state)||'OUT'),'purchase')||{taxCode:'OUT',vatRate:0,taxGross:amount,taxNet:amount,vatAmount:0,vatRecoverable:false,taxableTurnover:false};state.businessBills=state.businessBills||[];
    state.businessBills.unshift({id,beneficiaryId:beneficiaryId||null,supplier,invoiceNo,amount,...tax,...(window.DalasiDimensions?.tag?.(fd)||{}),invoiceDate,dueDate:due,category:String(fd.get('category')||'Other expense'),description:String(fd.get('description')||'').trim(),attachmentName:attachment.name,attachmentData:attachment.data,status:'Draft',paymentId:null,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.billOpen=false;state.paymentBeneficiaryId=null;ctx.audit('bill.created',{billId:id,beneficiaryId:beneficiaryId||null,supplier,invoiceNo,amount,dueDate:due});ctx.save();ctx.toast('Supplier bill saved as draft');ctx.render();
  }
  function updateBill(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update bills.');return;}
    const b=billById(state,id);if(!b)return;if(window.DalasiMonthClose?.isClosed(state,b.invoiceDate||b.createdAt)){ctx.toast('This supplier bill belongs to a closed accounting period. Reopen the period before changing it.');return;}b.status=status;b.updatedAt=new Date().toISOString();b.updatedBy=state.session?.name||'User';ctx.audit('bill.status_updated',{billId:id,status,amount:b.amount,supplier:b.supplier});ctx.save();ctx.toast(b.invoiceNo+': '+status);ctx.render();
  }

  function create(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create business payments.');return;}
    const fd=new FormData(ev.target),amount=Number(fd.get('amount')||0),payee=String(fd.get('payee')||'').trim(),beneficiaryId=String(fd.get('beneficiaryId')||''),billId=String(fd.get('billId')||state.paymentBillId||'');
    if(!payee||amount<=0){ctx.toast('Enter a payee and a valid payment amount.');return;}
    if(billId){const linked=billById(state,billId),bal=window.DalasiReturns?.billBalance?.(state,linked)??(Number(linked?.amount)||0);if(!linked||bal<=.004){ctx.toast('This supplier bill has no payable balance remaining.');return;}if(amount>bal+.004){ctx.toast('Payment amount cannot exceed the supplier bill balance after credits.');return;}}
    const id='BP-'+Date.now().toString(36).toUpperCase();
    state.businessPayments=state.businessPayments||[];
    state.businessPayments.unshift({id,billId:billId||null,beneficiaryId:beneficiaryId||null,payee,type:String(fd.get('type')||'Other payment'),amount,method:String(fd.get('method')||'Bank transfer'),accountId:String(fd.get('accountId')||'')||null,dueDate:String(fd.get('dueDate')||''),reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
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
    const kind=String(fd.get('kind')||'Other beneficiary');
    state.paymentBeneficiaries.push({id,name,kind,contact:String(fd.get('contact')||'').trim(),phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim(),preferredMethod:String(fd.get('preferredMethod')||'Bank transfer'),bankName:String(fd.get('bankName')||'').trim(),accountName:String(fd.get('accountName')||'').trim(),accountNumber:String(fd.get('accountNumber')||'').trim(),mobileProvider:String(fd.get('mobileProvider')||'').trim(),mobileNumber:String(fd.get('mobileNumber')||'').trim(),reference:String(fd.get('reference')||'').trim(),status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.beneficiaryOpen=false;state.beneficiaryDefaultKind='';ctx.audit('payment.beneficiary_created',{beneficiaryId:id,name,kind});ctx.save();ctx.toast(name+(kind==='Supplier / vendor'?' added as a supplier':' added as a beneficiary'));ctx.render();
  }
  function update(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update business payments.');return;}
    const p=(state.businessPayments||[]).find(x=>x.id===id);if(!p)return;
    if(status==='Paid'&&window.DalasiMonthClose?.isClosed(state,todayIso())){ctx.toast('The current accounting period is closed. Reopen it before posting this payment.');return;}
    p.status=status;p.updatedAt=new Date().toISOString();p.updatedBy=state.session?.name||'User';if(status==='Approved'){p.approvedAt=p.approvedAt||p.updatedAt;p.approvedBy=p.approvedBy||p.updatedBy;p.voucherNumber=p.voucherNumber||nextDocumentNumber('PV',state);}if(status==='Paid'){p.paidAt=p.paidAt||new Date().toISOString();p.receiptNumber=p.receiptNumber||nextDocumentNumber('PR',state);p.voucherNumber=p.voucherNumber||nextDocumentNumber('PV',state);if(p.accountId)window.DalasiCashBank?.post(state,{accountId:p.accountId,date:p.paidAt.slice(0,10),direction:'out',amount:p.amount,type:'Business payment',counterparty:p.payee,reference:p.reference||p.receiptNumber||'',description:p.description||p.type,sourceType:'business-payment',sourceId:p.id,sourceKey:'business-payment:'+p.id+':out',createdBy:state.session?.name||'User'});if(p.billId){const bill=billById(state,p.billId);if(bill){bill.status='Paid';bill.paidAt=p.paidAt;bill.paymentId=p.id;bill.updatedAt=p.paidAt;}}}
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
  window.DalasiBusinessPayments={render,renderCustomers,renderSuppliers,modal,beneficiaryModal,billModal,recurringModal,receivableModal,incomingPaymentModal,customerModal,customerAccountModal,supplierAccountModal,create,createBeneficiary,createBill,createRecurring,createReceivable,createCustomer,recordIncomingPayment,update,updateBeneficiary,updateBill,updateRecurring,updateReceivable,updateCustomer,generateRecurringNow,materializeRecurring,exportRegister,downloadDocument:paymentDocumentPdf,downloadReceivableDocument,summary:totals,receivableSummary:receivableMetrics,recurringSummary:recurringMetrics,cashFlowSummary,beneficiaryById,billById,receivableById,customerById,customerAccount,supplierAccount,types:TYPES.slice(),methods:METHODS.slice(),frequencies:FREQUENCIES.slice()};
})();
