(function(){
  'use strict';

  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function dateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function invoiceById(state,id){return (state.customerInvoices||[]).find(x=>x.id===id)||null;}
  function quoteById(state,id){return (state.salesQuotes||[]).find(x=>x.id===id)||null;}
  function customerById(state,id){return (state.customers||[]).find(x=>x.id===id)||null;}
  function paymentsFor(state,id){return (state.incomingPayments||[]).filter(x=>x.invoiceId===id);}
  function addDaysIso(date,days){const d=new Date((date||todayIso())+'T12:00:00');d.setDate(d.getDate()+(Number(days)||0));return d.toISOString().slice(0,10);}
  function nextNumber(prefix,rows,key){const year=new Date().getFullYear(),n=(rows||[]).filter(x=>String(x[key]||'').startsWith(prefix+'-'+year+'-')).length+1;return prefix+'-'+year+'-'+String(n).padStart(5,'0');}
  function quoteStatus(q){if(!q)return 'Draft';const s=q.status||'Draft';if(['Accepted','Declined','Converted'].includes(s))return s;if(q.validUntil&&q.validUntil<todayIso()&&s!=='Draft')return 'Expired';return s;}
  function paid(state,inv){return paymentsFor(state,inv.id).reduce((a,x)=>a+(Number(x.amount)||0),0);}
  function balance(state,inv){return Math.max(0,(Number(inv.amount)||0)-paid(state,inv));}
  function status(state,inv){
    const p=paid(state,inv),b=balance(state,inv);
    if(b<=0.004)return 'Paid';
    if(p>0)return 'Part paid';
    if((inv.status||'Draft')==='Draft')return 'Draft';
    if(inv.dueDate&&inv.dueDate<todayIso())return 'Overdue';
    return inv.status||'Sent';
  }
  function statusClass(s){return s==='Paid'?'paid':s==='Sent'?'approved':s==='Overdue'?'neutral':s==='Part paid'?'neutral':'ready';}
  function metrics(state){
    const rows=state.customerInvoices||[],payments=state.incomingPayments||[],today=todayIso();
    let invoiced=0,collected=0,outstanding=0,overdue=0,draft=0,open=0;
    rows.forEach(inv=>{const s=status(state,inv),p=paid(state,inv),b=balance(state,inv);invoiced+=Number(inv.amount)||0;collected+=p;outstanding+=b;if(b>0&&inv.dueDate&&inv.dueDate<today)overdue+=b;if(s==='Draft')draft++;if(!['Draft','Paid'].includes(s))open++;});
    return {count:rows.length,invoiced,collected,outstanding,overdue,draft,open,collectionRate:invoiced?Math.round(collected/invoiced*100):0,payments:payments.length};
  }
  function tabs(state){
    const tab=state.salesTab||'invoices';
    return '<div class="sales-tabs"><button class="'+(tab==='quotes'?'active':'')+'" data-action="sales-tab:quotes">Quotations</button><button class="'+(tab==='invoices'?'active':'')+'" data-action="sales-tab:invoices">Invoices</button><button class="'+(tab==='collections'?'active':'')+'" data-action="sales-tab:collections">Collections & receipts</button></div>';
  }
  function quoteMetrics(state){
    const rows=state.salesQuotes||[],sum=xs=>xs.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const active=rows.filter(x=>['Draft','Sent','Accepted'].includes(quoteStatus(x)));
    return {count:rows.length,total:sum(rows),active:active.length,activeValue:sum(active),accepted:sum(rows.filter(x=>quoteStatus(x)==='Accepted')),converted:sum(rows.filter(x=>quoteStatus(x)==='Converted')),convertedCount:rows.filter(x=>quoteStatus(x)==='Converted').length};
  }
  function quoteAction(q,icon){
    const s=quoteStatus(q);
    if(s==='Draft')return '<button class="secondary" data-action="quote-doc:'+q.id+'">'+icon('download',13)+' PDF</button><button class="primary" data-action="quote-status:'+q.id+':Sent">Mark sent</button>';
    if(s==='Sent')return '<button class="secondary" data-action="quote-doc:'+q.id+'">'+icon('download',13)+' PDF</button><button class="primary" data-action="quote-status:'+q.id+':Accepted">Accept</button><button class="secondary" data-action="quote-status:'+q.id+':Declined">Decline</button>';
    if(s==='Accepted')return '<button class="secondary" data-action="quote-doc:'+q.id+'">'+icon('download',13)+' PDF</button><button class="primary" data-action="quote-convert:'+q.id+'">Convert to invoice</button>';
    if(s==='Converted')return '<button class="secondary" data-action="quote-doc:'+q.id+'">'+icon('download',13)+' PDF</button><span class="payment-complete">'+(q.invoiceNo?'Invoice '+q.invoiceNo:'Converted')+'</span>';
    return '<button class="secondary" data-action="quote-doc:'+q.id+'">'+icon('download',13)+' PDF</button><span class="payment-complete">'+s+'</span>';
  }
  function quotePanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,m=quoteMetrics(state),rows=(state.salesQuotes||[]).slice().sort((a,b)=>String(b.quoteDate||b.createdAt||'').localeCompare(String(a.quoteDate||a.createdAt||'')));
    const table=rows.length?rows.map(q=>{const s=quoteStatus(q);return '<tr>'+
      '<td><div class="payment-payee"><b>'+esc(q.customerName||'Customer')+'</b><small>'+esc(q.quoteNo||q.id)+'</small></div></td>'+
      '<td>'+dateLabel(q.quoteDate)+'</td>'+
      '<td>'+dateLabel(q.validUntil)+'</td>'+
      '<td class="payment-amount">'+money2(q.amount)+'</td>'+
      '<td>'+esc(q.description||'Quotation')+'</td>'+
      '<td>'+pill(s,statusClass(s))+'</td>'+
      '<td><div class="payment-status-actions">'+quoteAction(q,icon)+'</div></td>'+
    '</tr>';}).join(''):'<tr><td colspan="7"><div class="empty-inline">No quotations yet. Create an estimate before raising a customer invoice.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Quotation value</span><b>'+money2(m.total)+'</b><small>'+m.count+' quotation'+(m.count===1?'':'s')+'</small></div>'+
      '<div class="surface"><span>Active pipeline</span><b>'+money2(m.activeValue)+'</b><small>'+m.active+' draft, sent or accepted</small></div>'+
      '<div class="surface"><span>Accepted</span><b>'+money2(m.accepted)+'</b><small>ready to convert to invoice</small></div>'+
      '<div class="surface"><span>Converted</span><b>'+money2(m.converted)+'</b><small>'+m.convertedCount+' converted quotation'+(m.convertedCount===1?'':'s')+'</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('file',17)+'</span><div><b>Quotation to invoice without retyping</b><p>Create an estimate, send it to the customer, mark it accepted and convert it into a draft invoice with the same customer, value and description.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Quotation register</h3><p>Estimates, validity dates, acceptance and conversion status</p></div><div class="inline-buttons"><button class="secondary" data-action="sales-export:quotes">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-quote">'+icon('plus',14)+' New quotation</button></div></div>'+
    '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / QUOTE</th><th>DATE</th><th>VALID UNTIL</th><th>VALUE</th><th>DESCRIPTION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function quoteModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,customers=(state.customers||[]).filter(x=>(x.status||'Active')==='Active'),issue=todayIso(),valid=addDaysIso(issue,14);
    const options=['<option value="">Manual / one-off customer</option>'].concat(customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>')).join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-quote"></div><form id="quote-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">SALES QUOTATION</div><h2>Create quotation</h2><p>Prepare an estimate that can later become a customer invoice.</p></div><button type="button" class="close" data-action="close-quote">×</button></div>'+
      '<div class="form-grid">'+
        field('Saved customer','<select name="customerId">'+options+'</select>')+
        field('Customer / client name','<input name="customerName" placeholder="e.g. Kaira Trading Ltd">')+
        field('Customer email','<input name="customerEmail" type="email" placeholder="accounts@example.com">')+
        field('Customer phone','<input name="customerPhone" placeholder="+220 ...">')+
        field('Quotation date','<input name="quoteDate" type="date" value="'+issue+'" required>')+
        field('Valid until','<input name="validUntil" type="date" value="'+valid+'" required>')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>')+
        field('Payment terms after invoice','<select name="termDays"><option value="0">Due on receipt</option><option value="7">Net 7 days</option><option value="14">Net 14 days</option><option value="30" selected>Net 30 days</option><option value="60">Net 60 days</option></select>')+
        field('Customer reference','<input name="reference" placeholder="RFQ, PO, contract or customer reference">')+
      '</div>'+
      field('Goods / service description','<input name="description" placeholder="What are you quoting for?" required>')+
      field('Terms / notes','<input name="notes" placeholder="Optional quotation terms or commercial note">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-quote">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save quotation</button></div>'+
    '</form></div>';
  }
  function createQuote(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create quotations.');return;}
    const fd=new FormData(ev.target),customerId=String(fd.get('customerId')||''),saved=customerById(state,customerId),customerName=String(fd.get('customerName')||'').trim()||saved?.name||'',amount=Number(fd.get('amount')||0),quoteDate=String(fd.get('quoteDate')||''),validUntil=String(fd.get('validUntil')||''),description=String(fd.get('description')||'').trim();
    if(!customerName||amount<=0||!quoteDate||!validUntil||!description){ctx.toast('Customer, amount, quotation date, validity date and description are required.');return;}
    state.salesQuotes=state.salesQuotes||[];
    const id='QUO-'+Date.now().toString(36).toUpperCase(),quoteNo=nextNumber('QUO',state.salesQuotes,'quoteNo');
    state.salesQuotes.unshift({id,quoteNo,customerId:customerId||null,customerName,customerEmail:String(fd.get('customerEmail')||saved?.email||'').trim(),customerPhone:String(fd.get('customerPhone')||saved?.phone||'').trim(),amount,quoteDate,validUntil,termDays:Number(fd.get('termDays')||saved?.termDays||30),reference:String(fd.get('reference')||saved?.reference||'').trim(),description,notes:String(fd.get('notes')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.salesQuoteOpen=false;ctx.audit('quote.created',{quoteId:id,quoteNo,customerName,amount,validUntil});ctx.save();ctx.toast('Quotation '+quoteNo+' saved as draft');ctx.render();
  }
  function updateQuote(id,newStatus,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update quotations.');return;}
    const q=quoteById(state,id);if(!q)return;if(q.status==='Converted'){ctx.toast('Converted quotations cannot be changed.');return;}
    q.status=newStatus;q.updatedAt=new Date().toISOString();q.updatedBy=state.session?.name||'User';
    if(newStatus==='Sent'){q.sentAt=q.sentAt||q.updatedAt;q.sentBy=q.sentBy||q.updatedBy}
    if(newStatus==='Accepted'){q.acceptedAt=q.acceptedAt||q.updatedAt;q.acceptedBy=q.acceptedBy||q.updatedBy}
    if(newStatus==='Declined')q.declinedAt=q.declinedAt||q.updatedAt;
    ctx.audit('quote.status_updated',{quoteId:id,quoteNo:q.quoteNo,status:newStatus});ctx.save();ctx.toast(q.quoteNo+': '+newStatus);ctx.render();
  }
  function convertQuote(id,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to convert quotations.');return;}
    const q=quoteById(state,id);if(!q)return;
    if(quoteStatus(q)!=='Accepted'){ctx.toast('Mark the quotation accepted before converting it to an invoice.');return;}
    state.customerInvoices=state.customerInvoices||[];
    const invoiceNo=nextNumber('INV',state.customerInvoices,'invoiceNo'),invoiceId='AR-'+Date.now().toString(36).toUpperCase(),issueDate=todayIso(),dueDate=addDaysIso(issueDate,Number(q.termDays)||0);
    state.customerInvoices.unshift({id:invoiceId,invoiceNo,customerId:q.customerId||null,customerName:q.customerName,customerEmail:q.customerEmail||'',customerPhone:q.customerPhone||'',amount:Number(q.amount)||0,issueDate,dueDate,reference:q.reference||q.quoteNo,description:q.description||'Converted quotation',status:'Draft',quoteId:q.id,quoteNo:q.quoteNo,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    q.status='Converted';q.invoiceId=invoiceId;q.invoiceNo=invoiceNo;q.convertedAt=new Date().toISOString();q.convertedBy=state.session?.name||'User';q.updatedAt=q.convertedAt;
    ctx.audit('quote.converted',{quoteId:q.id,quoteNo:q.quoteNo,invoiceId,invoiceNo,amount:q.amount});ctx.save();ctx.toast(q.quoteNo+' converted to '+invoiceNo);state.salesTab='invoices';ctx.render();
  }
  function downloadQuote(id,state,ctx){
    const q=quoteById(state,id);if(!q){ctx.toast('Quotation not found');return;}
    const out=[],ink='0.06 0.13 0.11',muted='0.36 0.43 0.40',green='0.04 0.31 0.26',line='0.84 0.88 0.86',white='1 1 1',soft='0.97 0.98 0.975';
    const safe=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const clip=(v,max=56)=>{const s=String(v??'');return s.length>max?s.slice(0,max-3)+'...':s};
    const text=(x,y,size,value,bold=false,color=ink)=>out.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+safe(value)+') Tj ET');
    const fill=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
    const stroke=(x1,y1,x2,y2,color=line,width=.7)=>out.push(color+' RG '+width+' w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
    const rect=(x,y,w,h,fc=white,sc=line,width=.65)=>{fill(x,y,w,h,fc);out.push(sc+' RG '+width+' w '+x+' '+y+' '+w+' '+h+' re S')};
    const label=(x,y,v)=>text(x,y,7.2,String(v).toUpperCase(),true,'0.42 0.49 0.46');
    fill(0,0,595,842,white);out.push('0.88 0.91 0.90 RG 0.75 w 24 24 547 794 re S');fill(24,746,547,72,green);fill(24,746,5,72,'0.37 0.82 0.68');
    if(state.branding?.logoData){out.push('q 42 0 0 42 43 765 cm /Im1 Do Q')}else{fill(43,765,42,42,'0.88 0.97 0.94');text(57,780,14,clip(state.branding?.logoText||state.company.slice(0,1),3),true,green)}
    text(99,790,17,clip(state.company,29),true,white);text(99,771,8.2,'DALASIPAY SALES',true,'0.74 0.91 0.86');text(405,791,18,'QUOTATION',true,white);text(405,772,7.6,'ESTIMATE / OFFER',true,'0.74 0.91 0.86');
    rect(24,690,547,43,soft,line,.55);label(40,716,'Quotation no.');text(40,699,10,q.quoteNo||q.id,true);label(235,716,'Quotation date');text(235,699,9.4,dateLabel(q.quoteDate),true);label(410,716,'Valid until');text(410,699,9.4,dateLabel(q.validUntil),true);
    rect(24,594,547,77,'0.945 0.97 0.96',line,.55);label(40,651,'Prepared for');text(40,631,13,clip(q.customerName,42),true);text(40,613,8.5,clip([q.customerEmail,q.customerPhone].filter(Boolean).join(' · ')||'Customer account',64),false,muted);label(405,651,'Quotation value');text(405,625,18,ctx.money2(q.amount),true,green);
    rect(24,414,547,159,white,line,.55);label(40,551,'Goods / service');text(40,523,11,clip(q.description||'Quotation',70),true);stroke(40,502,555,502,'0.91 0.93 0.92',.5);label(40,482,'Customer reference');text(190,482,9.3,clip(q.reference||'Not recorded',52),true);label(40,454,'Payment terms');text(190,454,9.3,(Number(q.termDays)||0)?'Net '+Number(q.termDays)+' days':'Due on receipt',true);label(40,428,'Status');text(190,428,9.3,quoteStatus(q),true,green);
    rect(24,292,547,98,soft,line,.55);label(40,369,'Terms / notes');text(40,344,9.2,clip(q.notes||'Prices and scope are valid until the date shown above.',82),false,ink);text(40,320,8.4,'Acceptance of this quotation can be converted into a formal DalasiPay customer invoice.',false,muted);
    stroke(40,244,260,244,line,.7);text(40,225,8,'Prepared / authorised by',false,muted);stroke(335,244,555,244,line,.7);text(335,225,8,'Customer acceptance',false,muted);
    stroke(24,82,571,82,line,.55);text(24,63,7.3,'This quotation is an estimate and is not a payment receipt or tax invoice.',true,'0.45 0.51 0.49');text(420,63,7.3,'Generated by DalasiPay',true,green);
    const customer=(String(q.customerName||'Customer').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Customer');ctx.pdfDownload('Quotation_'+customer+'_'+(q.quoteNo||q.id)+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Quotation PDF downloaded');
  }

  function invoiceAction(state,inv,icon){
    const s=status(state,inv);
    if(s==='Draft')return '<button class="secondary" data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' PDF</button><button class="primary" data-action="receivable-send:'+inv.id+'">Mark sent</button>';
    if(s==='Paid')return '<button class="secondary" data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' Invoice</button><button class="secondary" data-action="sales-doc:delivery:'+inv.id+'">'+icon('file',13)+' Delivery note</button>';
    return '<button class="secondary" data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' Invoice</button><button class="primary" data-action="record-incoming:'+inv.id+'">Record payment</button>';
  }
  function invoicePanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,m=metrics(state),filter=state.salesFilter||'all';
    let rows=(state.customerInvoices||[]).slice().sort((a,b)=>String(b.issueDate||b.createdAt||'').localeCompare(String(a.issueDate||a.createdAt||'')));
    if(filter!=='all')rows=rows.filter(inv=>status(state,inv).toLowerCase().replace(' ','-')===filter);
    const table=rows.length?rows.map(inv=>{
      const s=status(state,inv),p=paid(state,inv),b=balance(state,inv);
      return '<tr class="'+(s==='Overdue'?'receivable-overdue':'')+'">'+
        '<td><div class="payment-payee"><b>'+esc(inv.customerName||'Customer')+'</b><small>'+esc(inv.invoiceNo||inv.id)+'</small></div></td>'+
        '<td>'+dateLabel(inv.issueDate)+'</td>'+
        '<td>'+dateLabel(inv.dueDate)+'</td>'+
        '<td class="payment-amount">'+money2(inv.amount)+'</td>'+
        '<td><div class="receivable-balance"><b>'+money2(b)+'</b><small>'+money2(p)+' collected</small></div></td>'+
        '<td>'+pill(s,statusClass(s))+'</td>'+
        '<td><div class="payment-status-actions">'+invoiceAction(state,inv,icon)+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No invoices match this view.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Total invoiced</span><b>'+money2(m.invoiced)+'</b><small>'+m.count+' invoice'+(m.count===1?'':'s')+'</small></div>'+
      '<div class="surface"><span>Collected</span><b>'+money2(m.collected)+'</b><small>'+m.collectionRate+'% collection rate</small></div>'+
      '<div class="surface"><span>Outstanding</span><b>'+money2(m.outstanding)+'</b><small>'+m.open+' open invoice'+(m.open===1?'':'s')+'</small></div>'+
      '<div class="surface '+(m.overdue?'cash-alert':'')+'"><span>Overdue</span><b>'+money2(m.overdue)+'</b><small>past due customer balances</small></div>'+
    '</div>'+
    '<div class="sales-toolbar"><div><b>Customer invoices</b><span>Create, send, collect and close sales invoices</span></div><div class="sales-filters">'+
      [['all','All'],['draft','Draft'],['sent','Sent'],['part-paid','Part paid'],['overdue','Overdue'],['paid','Paid']].map(x=>'<button class="'+(filter===x[0]?'active':'')+'" data-action="sales-filter:'+x[0]+'">'+x[1]+'</button>').join('')+
    '</div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Invoice register</h3><p>Sales invoices, due dates, collections and customer balances</p></div><div class="inline-buttons"><button class="secondary" data-action="sales-export:invoices">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button></div></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / INVOICE</th><th>ISSUED</th><th>DUE</th><th>TOTAL</th><th>BALANCE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function collectionsPanel(state,h){
    const esc=h.esc,money2=h.money2,icon=h.icon,m=metrics(state),rows=(state.incomingPayments||[]).slice().sort((a,b)=>String(b.receivedDate||b.createdAt||'').localeCompare(String(a.receivedDate||a.createdAt||'')));
    const table=rows.length?rows.map(p=>{
      const inv=invoiceById(state,p.invoiceId);
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(inv?.customerName||p.customerName||'Customer')+'</b><small>'+esc(p.receiptNumber||p.id)+'</small></div></td>'+
        '<td>'+esc(inv?.invoiceNo||'—')+'</td>'+
        '<td>'+dateLabel(p.receivedDate)+'</td>'+
        '<td class="payment-amount">'+money2(p.amount)+'</td>'+
        '<td>'+esc(p.method||'Other')+'</td>'+
        '<td>'+esc(p.reference||'—')+'</td>'+
        '<td><div class="payment-status-actions"><button class="secondary" data-action="receivable-doc:receipt:'+p.id+'">'+icon('download',13)+' Receipt PDF</button>'+(inv&&status(state,inv)==='Paid'?'<button class="secondary" data-action="sales-doc:delivery:'+inv.id+'">'+icon('file',13)+' Delivery note</button>':'')+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No customer collections recorded yet.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Collections recorded</span><b>'+money2(m.collected)+'</b><small>'+m.payments+' payment record'+(m.payments===1?'':'s')+'</small></div>'+
      '<div class="surface"><span>Invoices raised</span><b>'+money2(m.invoiced)+'</b><small>'+m.count+' invoices</small></div>'+
      '<div class="surface"><span>Still outstanding</span><b>'+money2(m.outstanding)+'</b><small>customer balances due</small></div>'+
      '<div class="surface"><span>Collection rate</span><b>'+m.collectionRate+'%</b><small>collected vs invoiced value</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('bank',17)+'</span><div><b>Receipts tied directly to invoices</b><p>Each recorded customer payment creates a receipt number. Fully paid invoices can also produce a delivery note from the same record.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Collections & receipts</h3><p>Incoming customer payments and their supporting documents</p></div><button class="secondary" data-action="sales-export:collections">'+icon('download',14)+' Export CSV</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / RECEIPT</th><th>INVOICE</th><th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>REFERENCE</th><th>DOCUMENT</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function render(state,h){
    const pageTitle=h.pageTitle,icon=h.icon,tab=state.salesTab||'invoices';
    const action=tab==='quotes'?'<button class="primary" data-action="open-quote">'+icon('plus',14)+' New quotation</button>':tab==='invoices'?'<button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button>':'<button class="secondary" data-action="sales-export:collections">'+icon('download',14)+' Export collections</button>';
    return tabs(state)+pageTitle('SALES & RECEIVABLES','Invoices','Manage quotations, customer invoices, collections, receipts and delivery notes.',action)+(tab==='quotes'?quotePanel(state,h):tab==='collections'?collectionsPanel(state,h):invoicePanel(state,h));
  }
  function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function rowsToCsv(headers,rows){return [headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n');}
  function exportCsv(kind,state,ctx){
    let csv='';
    if(kind==='quotes'){
      csv=rowsToCsv(['Quotation No','Customer','Quotation Date','Valid Until','Amount','Status','Description','Reference','Invoice No'],(state.salesQuotes||[]).map(q=>[q.quoteNo||q.id,q.customerName,q.quoteDate,q.validUntil,q.amount,quoteStatus(q),q.description||'',q.reference||'',q.invoiceNo||'']));
    }else if(kind==='invoices'){
      csv=rowsToCsv(['Invoice No','Customer','Issue Date','Due Date','Amount','Collected','Balance','Status','Description','Reference'],(state.customerInvoices||[]).map(inv=>[inv.invoiceNo||inv.id,inv.customerName,inv.issueDate,inv.dueDate,inv.amount,paid(state,inv),balance(state,inv),status(state,inv),inv.description||'',inv.reference||'']));
    }else if(kind==='collections'){
      csv=rowsToCsv(['Receipt No','Customer','Invoice No','Date Received','Amount','Method','Reference','Recorded By'],(state.incomingPayments||[]).map(p=>{const inv=invoiceById(state,p.invoiceId);return [p.receiptNumber||p.id,inv?.customerName||p.customerName||'',inv?.invoiceNo||'',p.receivedDate,p.amount,p.method,p.reference||'',p.createdBy||''];}));
    }else return;
    ctx.downloadText('dalasipay-'+kind+'-'+todayIso()+'.csv',csv);ctx.toast((kind==='quotes'?'Quotation':kind==='invoices'?'Invoice':'Collections')+' report downloaded');
  }
  function downloadDeliveryNote(id,state,ctx){
    const inv=invoiceById(state,id);if(!inv){ctx.toast('Customer invoice not found');return;}
    if(status(state,inv)!=='Paid'){ctx.toast('Delivery note is available after the invoice is fully paid.');return;}
    const out=[],ink='0.06 0.13 0.11',muted='0.36 0.43 0.40',green='0.04 0.31 0.26',line='0.84 0.88 0.86',white='1 1 1',soft='0.97 0.98 0.975';
    const safe=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const clip=(v,max=52)=>{const s=String(v??'');return s.length>max?s.slice(0,max-3)+'...':s};
    const text=(x,y,size,value,bold=false,color=ink)=>out.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+safe(value)+') Tj ET');
    const fill=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
    const stroke=(x1,y1,x2,y2,color=line,width=.7)=>out.push(color+' RG '+width+' w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
    const rect=(x,y,w,h,fc=white,sc=line,width=.65)=>{fill(x,y,w,h,fc);out.push(sc+' RG '+width+' w '+x+' '+y+' '+w+' '+h+' re S')};
    const label=(x,y,v)=>text(x,y,7.2,String(v).toUpperCase(),true,'0.42 0.49 0.46');
    fill(0,0,595,842,white);out.push('0.88 0.91 0.90 RG 0.75 w 24 24 547 794 re S');
    fill(24,746,547,72,green);fill(24,746,5,72,'0.37 0.82 0.68');
    if(state.branding?.logoData){out.push('q 42 0 0 42 43 765 cm /Im1 Do Q')}else{fill(43,765,42,42,'0.88 0.97 0.94');text(57,780,14,clip(state.branding?.logoText||state.company.slice(0,1),3),true,green)}
    text(99,790,17,clip(state.company,29),true,white);text(99,771,8.2,'DALASIPAY SALES',true,'0.74 0.91 0.86');
    text(384,791,18,'DELIVERY NOTE',true,white);text(384,772,7.6,'PAID CUSTOMER ORDER',true,'0.74 0.91 0.86');
    rect(24,690,547,43,soft,line,.55);label(40,716,'Invoice no.');text(40,699,10,inv.invoiceNo||inv.id,true);label(236,716,'Issue date');text(236,699,9.5,dateLabel(inv.issueDate),true);label(410,716,'Delivery date');text(410,699,9.5,dateLabel(todayIso()),true);
    rect(24,594,547,77,'0.945 0.97 0.96',line,.55);label(40,651,'Deliver to');text(40,631,13,clip(inv.customerName,42),true);text(40,613,8.5,clip([inv.customerEmail,inv.customerPhone].filter(Boolean).join(' · ')||'Customer account',64),false,muted);
    rect(24,425,547,148,white,line,.55);label(40,552,'Goods / service delivered');
    text(40,524,11,clip(inv.description||'Goods / services as invoiced',66),true);stroke(40,505,555,505,'0.91 0.93 0.92',.5);
    label(40,486,'Customer reference');text(190,486,9.4,clip(inv.reference||'Not recorded',48),true);
    label(40,458,'Invoice value');text(190,458,10.5,ctx.money2(inv.amount),true,green);
    label(335,458,'Payment status');text(430,458,10,'PAID',true,green);
    rect(24,305,547,94,soft,line,.55);label(40,377,'Confirmation');text(40,352,9.2,'The items or services above correspond to the fully paid invoice shown on this note.',false,ink);text(40,330,8.5,'Use this document as delivery/fulfilment evidence together with the invoice and payment receipt.',false,muted);
    stroke(40,254,260,254,line,.7);text(40,235,8,'Delivered / prepared by',false,muted);stroke(335,254,555,254,line,.7);text(335,235,8,'Received / acknowledged by',false,muted);
    stroke(24,82,571,82,line,.55);text(24,63,7.3,'This delivery note is generated from a fully paid DalasiPay customer invoice.',true,'0.45 0.51 0.49');text(420,63,7.3,'Generated by DalasiPay',true,green);
    const customer=(String(inv.customerName||'Customer').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Customer');
    ctx.pdfDownload('Delivery_Note_'+customer+'_'+(inv.invoiceNo||inv.id)+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Delivery note downloaded');
  }
  window.DalasiSalesInvoices={render,metrics,status,balance,paid,quoteStatus,quoteMetrics,quoteModal,createQuote,updateQuote,convertQuote,downloadQuote,exportCsv,downloadDeliveryNote};
})();