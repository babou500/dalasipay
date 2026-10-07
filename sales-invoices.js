(function(){
  'use strict';

  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function dateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function invoiceById(state,id){return (state.customerInvoices||[]).find(x=>x.id===id)||null;}
  function quoteById(state,id){return (state.salesQuotes||[]).find(x=>x.id===id)||null;}
  function customerById(state,id){return (state.customers||[]).find(x=>x.id===id)||null;}
  function paymentsFor(state,id){return (state.incomingPayments||[]).filter(x=>x.invoiceId===id);}
  function addDaysIso(date,days){const d=new Date((date||todayIso())+'T12:00:00');d.setDate(d.getDate()+(Number(days)||0));return d.toISOString().slice(0,10);}
  function nextNumber(prefix,rows,key){
    const year=new Date().getFullYear(),base=prefix+'-'+year+'-',list=rows||[];
    let max=0;list.forEach(x=>{const v=String(x[key]||'');if(v.startsWith(base)){const n=Number(v.slice(base.length));if(Number.isFinite(n)&&n>max)max=n;}});
    let n=max+1,number=base+String(n).padStart(5,'0');
    while(list.some(x=>String(x[key]||'').toLowerCase()===number.toLowerCase())){n++;number=base+String(n).padStart(5,'0');}
    return number;
  }
  function quoteStatus(q){if(!q)return 'Draft';const s=q.status||'Draft';if(['Accepted','Declined','Converted'].includes(s))return s;if(q.validUntil&&q.validUntil<todayIso()&&s!=='Draft')return 'Expired';return s;}
  function paid(state,inv){return paymentsFor(state,inv.id).reduce((a,x)=>a+(Number(x.amount)||0),0);}
  function balance(state,inv){return window.DalasiReturns?.invoiceBalance?.(state,inv)??Math.max(0,(Number(inv.amount)||0)-paid(state,inv));}
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
    const rows=state.customerInvoices||[],payments=state.incomingPayments||[],today=todayIso(),credited=window.DalasiReturns?(state.customerCreditNotes||[]).reduce((a,x)=>a+(Number(x.amount)||0),0):0,debited=window.DalasiDebits?(state.customerDebitNotes||[]).reduce((a,x)=>a+(Number(x.amount)||0),0):0;
    let invoiced=0,collected=0,outstanding=0,overdue=0,draft=0,open=0;
    rows.forEach(inv=>{const s=status(state,inv),p=paid(state,inv),b=balance(state,inv);invoiced+=Number(inv.amount)||0;collected+=p;outstanding+=b;if(b>0&&inv.dueDate&&inv.dueDate<today)overdue+=b;if(s==='Draft')draft++;if(!['Draft','Paid'].includes(s))open++;});
    const netInvoiced=Math.max(0,invoiced+debited-credited);return {count:rows.length,invoiced,credited,debited,netInvoiced,collected,outstanding,overdue,draft,open,collectionRate:netInvoiced?Math.round(collected/netInvoiced*100):0,payments:payments.length};
  }
  function tabs(state){
    const tab=state.salesTab||'invoices';
    return '<div class="sales-tabs"><button class="'+(tab==='revenue'?'active':'')+'" data-action="sales-tab:revenue">Revenue</button><button class="'+(tab==='catalog'?'active':'')+'" data-action="sales-tab:catalog">Products & services</button><button class="'+(tab==='quotes'?'active':'')+'" data-action="sales-tab:quotes">Quotations</button><button class="'+(tab==='orders'?'active':'')+'" data-action="sales-tab:orders">Sales orders</button><button class="'+(tab==='invoices'?'active':'')+'" data-action="sales-tab:invoices">Invoices</button><button class="'+(tab==='recurring'?'active':'')+'" data-action="sales-tab:recurring">Recurring billing</button><button class="'+(tab==='collections'?'active':'')+'" data-action="sales-tab:collections">Collections & receipts</button></div>';
  }
  function quoteMetrics(state){
    const rows=state.salesQuotes||[],sum=xs=>xs.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const active=rows.filter(x=>['Draft','Sent','Accepted'].includes(quoteStatus(x)));
    return {count:rows.length,total:sum(rows),active:active.length,activeValue:sum(active),accepted:sum(rows.filter(x=>quoteStatus(x)==='Accepted')),converted:sum(rows.filter(x=>quoteStatus(x)==='Converted')),convertedCount:rows.filter(x=>quoteStatus(x)==='Converted').length};
  }
  function actionMenu(primary,items,label='More'){
    return '<div class="row-action-shell">'+(primary||'')+(items&&items.length?'<details class="row-actions-menu"><summary>'+label+'</summary><div class="row-actions-popover">'+items.join('')+'</div></details>':'')+'</div>';
  }
  function quoteAction(q,icon){
    const s=quoteStatus(q),pdf='<button data-action="quote-doc:'+q.id+'">'+icon('download',13)+' Download PDF</button>';
    if(s==='Draft')return actionMenu('<button class="primary tiny" data-action="quote-status:'+q.id+':Sent">Mark sent</button>',[pdf]);
    if(s==='Sent')return actionMenu('<button class="primary tiny" data-action="quote-status:'+q.id+':Accepted">Accept</button>',[pdf,'<button data-action="quote-status:'+q.id+':Declined">Decline</button>']);
    if(s==='Accepted'){
      const primary=q.salesOrderId?'<span class="payment-complete">'+esc(q.salesOrderNo||'Order created')+'</span>':'<button class="primary tiny" data-action="quote-to-order:'+q.id+'">Create order</button>';
      return actionMenu(primary,[pdf,'<button data-action="quote-convert:'+q.id+'">Create invoice now</button>']);
    }
    if(s==='Converted')return actionMenu('<span class="payment-complete">'+(q.invoiceNo?'Invoice '+q.invoiceNo:'Converted')+'</span>',[pdf]);
    return actionMenu('<span class="payment-complete">'+s+'</span>',[pdf]);
  }
  function quotePanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,m=quoteMetrics(state),rows=(state.salesQuotes||[]).slice().sort((a,b)=>String(b.quoteDate||b.createdAt||'').localeCompare(String(a.quoteDate||a.createdAt||'')));
    const table=rows.length?rows.map(q=>{const s=quoteStatus(q);return '<tr>'+
      '<td><div class="payment-payee"><b>'+esc(q.customerName||'Customer')+'</b><small>'+esc(q.quoteNo||q.id)+'</small></div></td>'+
      '<td>'+dateLabel(q.quoteDate)+'</td>'+
      '<td>'+dateLabel(q.validUntil)+'</td>'+
      '<td class="payment-amount">'+money2(q.amount)+'</td>'+
      '<td><div class="payment-payee"><b>'+esc(q.description||'Quotation')+'</b><small>'+((q.lineItems||[]).length?((q.lineItems||[]).length+' line item'+((q.lineItems||[]).length===1?'':'s')):'Legacy total')+'</small></div></td>'+
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
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Quotation register</h3><p>Estimates, validity dates, acceptance and conversion status</p></div><div class="register-tools"><label class="register-search">'+icon('search',13)+'<input data-table-search="quotes-register" placeholder="Search quotations"></label><div class="inline-buttons"><button class="secondary" data-action="sales-export:quotes">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-quote">'+icon('plus',14)+' New quotation</button></div></div></div>'+
    '<div class="table-scroll"><table data-register-table="quotes-register"><thead><tr><th>CUSTOMER / QUOTE</th><th>DATE</th><th>VALID UNTIL</th><th>VALUE</th><th>DESCRIPTION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function quoteModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,customers=(state.customers||[]).filter(x=>(x.status||'Active')==='Active'),issue=todayIso(),valid=addDaysIso(issue,14);
    const options=['<option value="">Manual / one-off customer</option>'].concat(customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>')).join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-quote"></div><form id="quote-form" class="modal-box sales-document-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">SALES QUOTATION</div><h2>Create quotation</h2><p>Build a detailed estimate that can later become a customer invoice.</p></div><button type="button" class="close" data-action="close-quote">×</button></div>'+
      '<div class="form-grid">'+
        field('Saved customer','<select name="customerId">'+options+'</select>')+
        field('Customer / client name','<input name="customerName" placeholder="e.g. Kaira Trading Ltd">')+
        field('Customer email','<input name="customerEmail" type="email" placeholder="accounts@example.com">')+
        field('Customer phone','<input name="customerPhone" placeholder="+220 ...">')+
        field('Quotation date','<input name="quoteDate" type="date" value="'+issue+'" required>')+
        field('Valid until','<input name="validUntil" type="date" value="'+valid+'" required>')+
        field('Payment terms after invoice','<select name="termDays"><option value="0">Due on receipt</option><option value="7">Net 7 days</option><option value="14">Net 14 days</option><option value="30" selected>Net 30 days</option><option value="60">Net 60 days</option></select>')+
        field('Customer reference','<input name="reference" placeholder="RFQ, PO, contract or customer reference">')+
        field('VAT treatment if converted',window.DalasiTax?.salesOptions?.(state)||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+
        field('Project',window.DalasiDimensions?.projectSelect?.(state,'project')||'<select name="project"><option value="">Unassigned</option></select>')+
        field('Cost centre',window.DalasiDimensions?.costCentreSelect?.(state,'costCentre')||'<select name="costCentre"><option value="">Unassigned</option></select>')+
      '</div>'+
      '<div class="sales-line-note">Add products/services from your catalog or enter a custom line. Discounts are applied per line.</div>'+
      window.DalasiCatalog.lineItemsForm(state,[])+
      field('Overall scope / summary','<input name="description" placeholder="Optional short summary for the quotation">')+
      field('Terms / notes','<input name="notes" placeholder="Optional quotation terms or commercial note">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-quote">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save quotation</button></div>'+
    '</form></div>';
  }
  function createQuote(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create quotations.');return;}
    const fd=new FormData(ev.target),customerId=String(fd.get('customerId')||''),saved=customerById(state,customerId),customerName=String(fd.get('customerName')||'').trim()||saved?.name||'',quoteDate=String(fd.get('quoteDate')||''),validUntil=String(fd.get('validUntil')||''),lines=window.DalasiCatalog.readLines(ev.target),totals=window.DalasiCatalog.lineTotals(lines),description=String(fd.get('description')||'').trim()||lines.map(x=>x.description).slice(0,3).join(', ');
    if(!customerName||totals.total<=0||!quoteDate||!validUntil||!lines.length){ctx.toast('Customer, at least one priced line item, quotation date and validity date are required.');return;}
    state.salesQuotes=state.salesQuotes||[];
    const id='QUO-'+Date.now().toString(36).toUpperCase(),quoteNo=nextNumber('QUO',state.salesQuotes,'quoteNo'),taxCode=String(fd.get('taxCode')||window.DalasiTax?.defaultSalesCode?.(state)||'OUT');
    state.salesQuotes.unshift({id,quoteNo,customerId:customerId||null,customerName,customerEmail:String(fd.get('customerEmail')||saved?.email||'').trim(),customerPhone:String(fd.get('customerPhone')||saved?.phone||'').trim(),lineItems:lines,subtotal:totals.subtotal,discountTotal:totals.discount,amount:totals.total,taxCode,...(window.DalasiDimensions?.tag?.(fd)||{}),quoteDate,validUntil,termDays:Number(fd.get('termDays')||saved?.termDays||30),reference:String(fd.get('reference')||saved?.reference||'').trim(),description,notes:String(fd.get('notes')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.salesQuoteOpen=false;ctx.audit('quote.created',{quoteId:id,quoteNo,customerName,amount:totals.total,lineCount:lines.length,validUntil});ctx.save();ctx.toast('Quotation '+quoteNo+' saved as draft');ctx.render();
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
    const saved=q.customerId?customerById(state,q.customerId):null;if(saved?.creditStatus==='Hold'){ctx.toast(saved.name+' is on credit hold. Release the hold before converting this quotation to an invoice.');return;}
    if(quoteStatus(q)!=='Accepted'){ctx.toast('Mark the quotation accepted before converting it to an invoice.');return;}
    state.customerInvoices=state.customerInvoices||[];
    const invoiceNo=nextNumber('INV',state.customerInvoices,'invoiceNo'),invoiceId='AR-'+Date.now().toString(36).toUpperCase(),issueDate=todayIso(),dueDate=addDaysIso(issueDate,Number(q.termDays)||0);
    if(window.DalasiMonthClose?.isClosed(state,issueDate)){ctx.toast('The current accounting period is closed. Reopen it before converting this quotation to an invoice.');return;}
    const lines=(q.lineItems||[]).map(x=>({...x})),totals=lines.length?window.DalasiCatalog.lineTotals(lines):{subtotal:Number(q.amount)||0,discount:0,total:Number(q.amount)||0},tax=window.DalasiTax?.snapshot?.(state,totals.total,q.taxCode||window.DalasiTax?.defaultSalesCode?.(state)||'OUT','sale')||{taxCode:'OUT',vatRate:0,taxGross:totals.total,taxNet:totals.total,vatAmount:0,vatRecoverable:false,taxableTurnover:false};
    state.customerInvoices.unshift({id:invoiceId,invoiceNo,customerId:q.customerId||null,customerName:q.customerName,customerEmail:q.customerEmail||'',customerPhone:q.customerPhone||'',lineItems:lines,subtotal:totals.subtotal,discountTotal:totals.discount,amount:totals.total,...tax,project:q.project||'',costCentre:q.costCentre||'',issueDate,dueDate,reference:q.reference||q.quoteNo,description:q.description||'Converted quotation',status:'Draft',quoteId:q.id,quoteNo:q.quoteNo,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    q.status='Converted';q.invoiceId=invoiceId;q.invoiceNo=invoiceNo;q.convertedAt=new Date().toISOString();q.convertedBy=state.session?.name||'User';q.updatedAt=q.convertedAt;
    ctx.audit('quote.converted',{quoteId:q.id,quoteNo:q.quoteNo,invoiceId,invoiceNo,amount:totals.total,lineCount:lines.length});ctx.save();ctx.toast(q.quoteNo+' converted to '+invoiceNo);state.salesTab='invoices';ctx.render();
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
    const qLines=q.lineItems||[];
    if(qLines.length){
      rect(24,390,547,183,white,line,.55);label(40,551,'Quotation items');
      text(40,530,7.6,'DESCRIPTION',true,muted);text(300,530,7.6,'QTY',true,muted);text(350,530,7.6,'UNIT PRICE',true,muted);text(430,530,7.6,'DISC.',true,muted);text(487,530,7.6,'AMOUNT',true,muted);stroke(40,520,555,520,'0.91 0.93 0.92',.5);
      qLines.slice(0,5).forEach((x,i)=>{const y=500-i*20;text(40,y,8.5,clip(x.description,43),i===0,false?ink:ink);text(302,y,8.2,String(x.quantity)+' '+clip(x.unit||'Unit',7),false,muted);text(350,y,8.2,ctx.money2(x.unitPrice),false,ink);text(438,y,8.2,(Number(x.discount)||0)+'%',false,muted);text(487,y,8.2,ctx.money2(x.amount??window.DalasiCatalog.lineAmount(x)),true,ink);});
      if(qLines.length>5)text(40,396,7.8,'+'+(qLines.length-5)+' more line item'+(qLines.length-5===1?'':'s'),true,muted);
      const qt=window.DalasiCatalog.lineTotals(qLines);text(330,414,8,'Subtotal',false,muted);text(410,414,8.6,ctx.money2(qt.subtotal),true);text(330,398,8,'Discount',false,muted);text(410,398,8.6,ctx.money2(qt.discount),true);text(470,406,8,'TOTAL',true,green);text(510,406,10,ctx.money2(qt.total),true,green);
    }else{
      rect(24,414,547,159,white,line,.55);label(40,551,'Goods / service');text(40,523,11,clip(q.description||'Quotation',70),true);stroke(40,502,555,502,'0.91 0.93 0.92',.5);label(40,482,'Customer reference');text(190,482,9.3,clip(q.reference||'Not recorded',52),true);label(40,454,'Payment terms');text(190,454,9.3,(Number(q.termDays)||0)?'Net '+Number(q.termDays)+' days':'Due on receipt',true);label(40,428,'Status');text(190,428,9.3,quoteStatus(q),true,green);
    }
    rect(24,272,547,95,soft,line,.55);label(40,347,'Terms / notes');text(40,322,9.2,clip(q.notes||'Prices and scope are valid until the date shown above.',82),false,ink);text(40,300,8.4,'Reference: '+clip(q.reference||'Not recorded',55)+' · '+((Number(q.termDays)||0)?'Net '+Number(q.termDays)+' days':'Due on receipt'),false,muted);text(40,282,8.2,'Acceptance can be converted into a formal DalasiPay customer invoice.',false,muted);
    stroke(40,226,260,226,line,.7);text(40,207,8,'Prepared / authorised by',false,muted);stroke(335,226,555,226,line,.7);text(335,207,8,'Customer acceptance',false,muted);
    stroke(24,82,571,82,line,.55);text(24,63,7.3,'This quotation is an estimate and is not a payment receipt or tax invoice.',true,'0.45 0.51 0.49');text(420,63,7.3,'Generated by DalasiPay',true,green);
    const customer=(String(q.customerName||'Customer').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Customer');ctx.pdfDownload('Quotation_'+customer+'_'+(q.quoteNo||q.id)+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Quotation PDF downloaded');
  }

  function invoiceHasStockLines(state,inv){
    return (inv.lineItems||[]).some(x=>{const item=x.catalogId?window.DalasiCatalog?.itemById(state,x.catalogId):null;return item?.type==='Product';});
  }
  function invoiceAction(state,inv,icon){
    const s=status(state,inv),invoice='<button data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' Invoice PDF</button>',view='<button data-action="invoice-view:'+inv.id+'">View details</button>';
    if(s==='Draft')return actionMenu('<button class="primary tiny" data-action="receivable-send:'+inv.id+'">'+icon('check',13)+' Approve & send</button>',[view,invoice]);
    const remainingCredit=window.DalasiReturns?.invoiceRemainingCredit?.(state,inv)??(Number(inv.amount)||0),extras=[view,invoice];
    if(remainingCredit>.004)extras.push('<button data-action="credit-invoice:'+inv.id+'">Create credit note</button>');
    extras.push('<button data-action="debit-invoice:'+inv.id+'">Create debit note</button>');
    if(s==='Paid'){
      const needsStock=invoiceHasStockLines(state,inv);
      if(needsStock&&!inv.fulfilledAt)return actionMenu('<button class="primary tiny" data-action="invoice-fulfill:'+inv.id+'">'+icon('check',13)+' Fulfil</button>',extras);
      extras.push('<button data-action="sales-doc:delivery:'+inv.id+'">'+icon('file',13)+' Delivery note</button>');
      return actionMenu('<span class="payment-complete">Paid</span>',extras);
    }
    return actionMenu('<button class="primary tiny" data-action="record-incoming:'+inv.id+'">Record payment</button>',extras);
  }
  function invoiceDetailModal(state,h){
    const inv=invoiceById(state,state.invoiceDetailId);if(!inv)return '';
    const s=status(state,inv),p=paid(state,inv),b=balance(state,inv),lines=inv.lineItems||[],icon=h.icon,esc=h.esc,money2=h.money2,pill=h.pill;
    const lineRows=lines.length?lines.map(x=>'<div class="record-line"><div><b>'+esc(x.description||'Item')+'</b><small>'+esc(x.unit||'Unit')+' · '+Number(x.quantity||0).toLocaleString('en-GB')+'</small></div><span>'+money2(x.unitPrice||0)+'</span><strong>'+money2(x.amount??((Number(x.quantity)||0)*(Number(x.unitPrice)||0)))+'</strong></div>').join(''):'<div class="empty-inline">No itemized lines on this invoice.</div>';
    const payments=paymentsFor(state,inv.id).slice().sort((a,b)=>String(b.receivedDate||b.createdAt||'').localeCompare(String(a.receivedDate||a.createdAt||'')));
    const timeline=[
      {label:'Invoice created',at:inv.createdAt,by:inv.createdBy},
      inv.sentAt?{label:'Approved & sent',at:inv.sentAt,by:inv.sentBy}:null,
      ...payments.map(x=>({label:'Payment '+(x.receiptNumber||x.id)+' · '+money2(x.amount),at:x.receivedDate||x.createdAt,by:x.createdBy})),
      inv.fulfilledAt?{label:'Order fulfilled / stock issued',at:inv.fulfilledAt,by:inv.fulfilledBy}:null
    ].filter(Boolean).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
    const total=Math.max(0,Number(inv.amount)||0),collected=Math.min(total,Math.max(0,p)),percentage=total>0?Math.min(100,Math.round(collected/total*100)):0;
    const sourceTrail=[inv.quoteNo?'<button data-action="sales-tab:quotes">Quotation '+esc(inv.quoteNo)+'</button>':null,inv.salesOrderNo?'<button data-action="sales-tab:orders">Order '+esc(inv.salesOrderNo)+'</button>':null,'<span>Invoice '+esc(inv.invoiceNo||inv.id)+'</span>'].filter(Boolean).join('<i aria-hidden="true">›</i>');
    const dueLabel=b<=.004?'Settled in full':(inv.dueDate&&inv.dueDate<todayIso()?'Past due · '+dateLabel(inv.dueDate):'Due '+dateLabel(inv.dueDate));
    const paymentRows=payments.length?payments.map(x=>'<div class="invoice-payment-row"><div><strong>'+esc(x.receiptNumber||'Payment')+'</strong><small>'+dateLabel(x.receivedDate||String(x.createdAt||'').slice(0,10))+'</small></div><b>'+money2(x.amount)+'</b></div>').join(''):'<div class="empty-inline">No payments recorded against this invoice.</div>';
    return '<div class="record-drawer-wrap"><div class="modal-scrim" data-action="close-invoice-detail"></div><aside class="record-drawer"><div class="record-drawer-head"><div><div class="eyebrow">CUSTOMER INVOICE</div><h2>'+esc(inv.invoiceNo||inv.id)+'</h2><p>'+esc(inv.customerName||'Customer')+'</p></div><button class="close" data-action="close-invoice-detail">×</button></div>'+
      '<nav class="invoice-source-trail" aria-label="Document journey">'+sourceTrail+'</nav>'+
      '<div class="record-hero"><div><span>Outstanding</span><b>'+money2(b)+'</b><small>'+money2(p)+' collected of '+money2(inv.amount)+'</small></div>'+pill(s,statusClass(s))+'</div>'+
      '<div class="invoice-collection-progress"><div class="invoice-progress-label"><b>'+percentage+'% collected</b><span>'+esc(dueLabel)+'</span></div><div class="invoice-progress-track" role="progressbar" aria-label="Invoice amount collected" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percentage+'"><span style="width:'+percentage+'%"></span></div><div class="invoice-progress-amounts"><span>Total '+money2(total)+'</span><span>Remaining '+money2(b)+'</span></div></div>'+
      '<div class="record-facts"><div><span>Issue date</span><b>'+dateLabel(inv.issueDate)+'</b></div><div><span>Due date</span><b>'+dateLabel(inv.dueDate)+'</b></div><div><span>Reference</span><b>'+esc(inv.reference||'—')+'</b></div><div><span>Project</span><b>'+esc(inv.project||'Unassigned')+'</b></div><div><span>Cost centre</span><b>'+esc(inv.costCentre||'Unassigned')+'</b></div><div><span>Customer account</span><b>'+(inv.customerId?'<button class="customer-doc-link" data-action="customer-view:'+esc(inv.customerId)+'">'+esc(inv.customerName||'View customer')+'</button>':esc(inv.customerName||'One-off customer'))+'</b></div><div><span>Source</span><b>'+esc(inv.salesOrderNo||inv.quoteNo||'Direct invoice')+'</b></div></div>'+
      '<section class="record-section"><div class="record-section-head"><b>Invoice lines</b><span>'+lines.length+' item'+(lines.length===1?'':'s')+'</span></div><div class="record-lines">'+lineRows+'</div></section>'+
      '<section class="record-section"><div class="record-section-head"><b>Payment history</b><span>'+payments.length+' payment'+(payments.length===1?'':'s')+'</span></div><div class="invoice-payment-list">'+paymentRows+'</div></section>'+
      '<section class="record-section"><div class="record-section-head"><b>Activity</b><span>'+timeline.length+' event'+(timeline.length===1?'':'s')+'</span></div><div class="record-timeline">'+(timeline.length?timeline.map(x=>'<div><i></i><span><b>'+esc(x.label)+'</b><small>'+esc(x.at?String(x.at).slice(0,10):'')+(x.by?' · '+esc(x.by):'')+'</small></span></div>').join(''):'<div class="empty-inline">No activity yet.</div>')+'</div></section>'+
      '<div class="record-drawer-actions"><button class="secondary" data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' Invoice PDF</button>'+(s==='Draft'?'<button class="primary" data-action="receivable-send:'+inv.id+'">'+icon('check',13)+' Approve & send</button>':(b>.004?'<button class="primary" data-action="record-incoming:'+inv.id+'">Record payment</button>':(invoiceHasStockLines(state,inv)&&!inv.fulfilledAt?'<button class="primary" data-action="invoice-fulfill:'+inv.id+'">Fulfil order</button>':'<button class="secondary" data-action="sales-doc:delivery:'+inv.id+'">Delivery note</button>')))+'</div>'+
    '</aside></div>';
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
      '<div class="surface"><span>Net invoiced</span><b>'+money2(m.netInvoiced)+'</b><small>'+money2(m.debited||0)+' debit · '+money2(m.credited||0)+' credit</small></div>'+
      '<div class="surface"><span>Collected</span><b>'+money2(m.collected)+'</b><small>'+m.collectionRate+'% collection rate</small></div>'+
      '<div class="surface"><span>Outstanding</span><b>'+money2(m.outstanding)+'</b><small>'+m.open+' open invoice'+(m.open===1?'':'s')+'</small></div>'+
      '<div class="surface '+(m.overdue?'cash-alert':'')+'"><span>Overdue</span><b>'+money2(m.overdue)+'</b><small>past due customer balances</small></div>'+
    '</div>'+
    '<div class="sales-toolbar"><div><b>Customer invoices</b><span>Create, send, collect and close sales invoices</span></div><div class="sales-filters">'+
      [['all','All'],['draft','Draft'],['sent','Sent'],['part-paid','Part paid'],['overdue','Overdue'],['paid','Paid']].map(x=>'<button class="'+(filter===x[0]?'active':'')+'" data-action="sales-filter:'+x[0]+'">'+x[1]+'</button>').join('')+
    '</div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Invoice register</h3><p>Sales invoices, due dates, collections and customer balances</p></div><div class="register-tools"><label class="register-search">'+icon('search',13)+'<input data-table-search="invoice-register" placeholder="Search invoices"></label><div class="inline-buttons"><button class="secondary" data-action="sales-export:invoices">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button></div></div></div>'+
      '<div class="table-scroll"><table data-register-table="invoice-register"><thead><tr><th>CUSTOMER / INVOICE</th><th>ISSUED</th><th>DUE</th><th>TOTAL</th><th>BALANCE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
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
  function salesPipeline(state,h){
    const {money2,icon,esc}=h;
    const quotes=state.salesQuotes||[],orders=state.salesOrders||[],invoices=state.customerInvoices||[],payments=state.incomingPayments||[];
    const activeQuotes=quotes.filter(q=>['Draft','Sent','Accepted'].includes(quoteStatus(q))),activeQuoteValue=activeQuotes.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const openOrders=orders.filter(x=>!['Invoiced','Cancelled'].includes(x.status||'Draft')),openOrderValue=openOrders.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const issued=invoices.filter(x=>status(state,x)!=='Draft'),invoiceValue=issued.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const collected=payments.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const paidInvoices=issued.filter(x=>status(state,x)==='Paid'),fulfilled=paidInvoices.filter(x=>!invoiceHasStockLines(state,x)||x.fulfilledAt),fulfilledValue=fulfilled.reduce((a,x)=>a+(Number(x.amount)||0),0);
    const stages=[
      {tab:'quotes',icon:'file',label:'Quotation',count:activeQuotes.length,value:activeQuoteValue,copy:'active opportunities'},
      {tab:'orders',icon:'building',label:'Sales order',count:openOrders.length,value:openOrderValue,copy:'confirmed demand'},
      {tab:'invoices',icon:'reports',label:'Invoice',count:issued.length,value:invoiceValue,copy:'issued to customers'},
      {tab:'collections',icon:'bank',label:'Payment',count:payments.length,value:collected,copy:'cash collected'},
      {tab:'invoices',icon:'check',label:'Fulfilment',count:fulfilled.length,value:fulfilledValue,copy:'paid & fulfilled'}
    ];
    return '<section class="surface sales-pipeline"><div class="sales-pipeline-head"><div><span class="eyebrow">DALASIPAY SALES FLOW</span><h3>Quotation to cash</h3><p>Follow customer revenue from opportunity through fulfilment.</p></div><span class="sales-pipeline-total">'+issued.length+' issued invoice'+(issued.length===1?'':'s')+'</span></div><div class="sales-pipeline-track">'+stages.map((x,i)=>'<button class="sales-pipeline-stage" data-action="sales-tab:'+x.tab+'"><span class="sales-stage-number">'+String(i+1).padStart(2,'0')+'</span><span class="sales-stage-icon">'+icon(x.icon,15)+'</span><span class="sales-stage-copy"><small>'+esc(x.label)+'</small><b>'+money2(x.value)+'</b><em>'+x.count+' · '+esc(x.copy)+'</em></span>'+(i<stages.length-1?'<i class="sales-stage-arrow">'+icon('chevron',12)+'</i>':'')+'</button>').join('')+'</div></section>';
  }
  function salesConversionIntelligence(state,h){
    const {icon,esc}=h,quotes=state.salesQuotes||[],orders=state.salesOrders||[],invoices=(state.customerInvoices||[]).filter(x=>status(state,x)!=='Draft'),payments=state.incomingPayments||[];
    const acceptedQuotes=quotes.filter(q=>['Accepted','Converted'].includes(quoteStatus(q))||q.salesOrderId||q.invoiceNo).length;
    const quoteRate=quotes.length?Math.round(acceptedQuotes/quotes.length*100):null;
    const invoicedOrders=orders.filter(o=>(o.status||'Draft')==='Invoiced'||o.invoiceId).length;
    const orderRate=orders.length?Math.round(invoicedOrders/orders.length*100):null;
    const paidInvoices=invoices.filter(inv=>status(state,inv)==='Paid').length;
    const cashRate=invoices.length?Math.round(paidInvoices/invoices.length*100):null;
    const paidDays=invoices.filter(inv=>status(state,inv)==='Paid').map(inv=>{
      const dates=payments.filter(p=>p.invoiceId===inv.id).map(p=>String(p.receivedDate||p.createdAt||'').slice(0,10)).filter(Boolean).sort();
      const paidDate=dates[dates.length-1],issue=String(inv.issueDate||inv.createdAt||'').slice(0,10);
      if(!paidDate||!issue)return null;
      return Math.max(0,Math.round((new Date(paidDate+'T00:00:00')-new Date(issue+'T00:00:00'))/86400000));
    }).filter(x=>x!==null);
    const avgDays=paidDays.length?Math.round(paidDays.reduce((a,x)=>a+x,0)/paidDays.length):null;
    const stages=[
      {label:'Quote acceptance',score:quoteRate,copy:quotes.length?acceptedQuotes+' of '+quotes.length+' quotations accepted':'No quotation history yet',tab:'quotes'},
      {label:'Order → invoice',score:orderRate,copy:orders.length?invoicedOrders+' of '+orders.length+' sales orders invoiced':'No sales order history yet',tab:'orders'},
      {label:'Invoice → cash',score:cashRate,copy:invoices.length?paidInvoices+' of '+invoices.length+' issued invoices fully paid':'No issued invoice history yet',tab:'invoices'}
    ];
    const measurable=stages.filter(x=>x.score!==null),weakest=measurable.length?measurable.slice().sort((a,b)=>a.score-b.score)[0]:null;
    const overall=measurable.length?Math.round(measurable.reduce((a,x)=>a+x.score,0)/measurable.length):null;
    const label=overall===null?'Building history':overall>=80?'Strong conversion':overall>=60?'Healthy pipeline':overall>=40?'Conversion opportunity':'Needs attention';
    return '<section class="surface sales-intelligence"><div class="sales-intel-head"><div><span class="eyebrow">SALES CONVERSION INTELLIGENCE</span><h3>'+esc(label)+'</h3><p>See where customer revenue is moving smoothly and where it is slowing down.</p></div><div class="sales-intel-score"><b>'+(overall===null?'—':overall+'%')+'</b><span>conversion health</span></div></div><div class="sales-intel-grid">'+stages.map(x=>'<button data-action="sales-tab:'+x.tab+'"><div><span>'+esc(x.label)+'</span><b>'+(x.score===null?'—':x.score+'%')+'</b></div><i><em style="width:'+(x.score===null?0:x.score)+'%"></em></i><small>'+esc(x.copy)+'</small></button>').join('')+'<button data-action="sales-tab:collections"><div><span>Average time to cash</span><b>'+(avgDays===null?'—':avgDays+'d')+'</b></div><i><em style="width:'+(avgDays===null?0:Math.max(8,Math.min(100,100-avgDays*2)))+'%"></em></i><small>'+(avgDays===null?'Appears after invoices are fully paid':avgDays<=7?'Customers are paying quickly':avgDays<=30?'Collection speed is within a normal cycle':'Collections are taking more than 30 days')+'</small></button></div>'+(weakest?'<div class="sales-intel-focus"><span>'+icon('alert',14)+'</span><div><b>Current bottleneck: '+esc(weakest.label)+'</b><p>'+esc(weakest.copy)+'. Focus here for the biggest improvement in sales flow.</p></div><button data-action="sales-tab:'+weakest.tab+'">Review '+icon('chevron',12)+'</button></div>':'<div class="sales-intel-focus clear"><span>'+icon('check',14)+'</span><div><b>Conversion insight will build with use</b><p>Create quotations, orders and invoices to establish a reliable sales-flow baseline.</p></div></div>')+'</section>';
  }
  function salesActionQueue(state,h){
    const {icon,esc,money2}=h,today=todayIso(),items=[];
    const daysUntil=d=>{if(!d)return null;return Math.ceil((new Date(String(d).slice(0,10)+'T00:00:00')-new Date(today+'T00:00:00'))/86400000);};
    (state.salesQuotes||[]).forEach(q=>{
      const s=quoteStatus(q),days=daysUntil(q.validUntil);
      if(s==='Sent'&&days!==null&&days>=0&&days<=3)items.push({priority:days===0?0:1,tone:days===0?'urgent':'watch',icon:'clock',type:'Quotation',title:(q.quoteNo||q.id)+' expires '+(days===0?'today':'in '+days+' day'+(days===1?'':'s')),copy:(q.customerName||'Customer')+' · '+money2(q.amount),action:'sales-tab:quotes',cta:'Review quote'});
      if(s==='Accepted'&&!q.salesOrderId&&!q.invoiceNo)items.push({priority:1,tone:'watch',icon:'file',type:'Accepted quotation',title:(q.quoteNo||q.id)+' is waiting for conversion',copy:(q.customerName||'Customer')+' · '+money2(q.amount),action:'quote-to-order:'+q.id,cta:'Create order'});
    });
    (state.salesOrders||[]).forEach(o=>{
      if(['Confirmed','Ready'].includes(o.status)&&!o.invoiceId)items.push({priority:o.status==='Ready'?1:2,tone:o.status==='Ready'?'watch':'neutral',icon:'building',type:'Sales order',title:(o.orderNo||o.id)+' is ready to become revenue',copy:(o.customerName||'Customer')+' · '+money2(o.amount),action:'sales-order-invoice:'+o.id,cta:'Create invoice'});
    });
    (state.customerInvoices||[]).forEach(inv=>{
      const s=status(state,inv),bal=balance(state,inv);
      if(s==='Overdue'&&bal>.004)items.push({priority:0,tone:'urgent',icon:'alert',type:'Overdue invoice',title:(inv.invoiceNo||inv.id)+' needs collection follow-up',copy:(inv.customerName||'Customer')+' · '+money2(bal)+' outstanding',action:'invoice-view:'+inv.id,cta:'Open invoice'});
      if(s==='Paid'&&invoiceHasStockLines(state,inv)&&!inv.fulfilledAt)items.push({priority:1,tone:'watch',icon:'box',type:'Fulfilment',title:(inv.invoiceNo||inv.id)+' is paid but not fulfilled',copy:(inv.customerName||'Customer')+' · '+money2(inv.amount),action:'invoice-fulfill:'+inv.id,cta:'Fulfil now'});
    });
    items.sort((a,b)=>a.priority-b.priority);
    const shown=items.slice(0,6),urgent=items.filter(x=>x.tone==='urgent').length;
    return '<section class="surface sales-action-queue"><div class="sales-action-head"><div><span class="eyebrow">SALES ACTION QUEUE</span><h3>'+(items.length?items.length+' follow-up'+(items.length===1?'':'s'):'Nothing waiting')+'</h3><p>The next customer-facing actions, prioritised automatically from live records.</p></div><span class="sales-action-badge '+(urgent?'urgent':'clear')+'">'+(urgent?urgent+' urgent':'Up to date')+'</span></div>'+
      (shown.length?'<div class="sales-action-list">'+shown.map(x=>'<div class="sales-action-item '+x.tone+'"><span class="sales-action-icon">'+icon(x.icon,14)+'</span><div class="sales-action-copy"><small>'+esc(x.type)+'</small><b>'+esc(x.title)+'</b><p>'+esc(x.copy)+'</p></div><button data-action="'+x.action+'">'+esc(x.cta)+' '+icon('chevron',12)+'</button></div>').join('')+'</div>':'<div class="sales-action-empty">'+icon('check',16)+' No expiring quotes, stalled orders, overdue invoices or fulfilment tasks.</div>')+
      (items.length>shown.length?'<div class="sales-action-more">'+(items.length-shown.length)+' additional action'+(items.length-shown.length===1?'':'s')+' hidden to keep the workspace focused.</div>':'')+
    '</section>';
  }
  function render(state,h){
    const pageTitle=h.pageTitle,icon=h.icon,tab=state.salesTab||'invoices';
    const action=tab==='revenue'?'<button class="primary" data-action="open-revenue">'+icon('plus',14)+' Record income</button>':tab==='catalog'?'<button class="primary" data-action="open-catalog-item">'+icon('plus',14)+' Add item</button>':tab==='quotes'?'<button class="primary" data-action="open-quote">'+icon('plus',14)+' New quotation</button>':tab==='orders'?'<button class="secondary" data-action="sales-tab:quotes">'+icon('plus',14)+' From quotation</button>':tab==='invoices'?'<button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button>':tab==='recurring'?'<button class="primary" data-action="open-recurring-invoice">'+icon('calendar',14)+' New schedule</button>':'<button class="secondary" data-action="sales-export:collections">'+icon('download',14)+' Export collections</button>';
    const body=tab==='revenue'?window.DalasiRevenueIncome.panel(state,h):tab==='catalog'?window.DalasiCatalog.catalogPanel(state,h):tab==='quotes'?quotePanel(state,h):tab==='orders'?window.DalasiSalesOrders.panel(state,h):tab==='recurring'?window.DalasiRecurringInvoices.panel(state,h):tab==='collections'?collectionsPanel(state,h):invoicePanel(state,h);
    const guide=!(state.customerInvoices||[]).length&&!(state.salesQuotes||[]).length&&!(state.salesOrders||[]).length?'<div class="first-use-card"><span>'+icon('file',16)+'</span><div><b>Start with a customer quotation or invoice</b><p>Add products or services first if you want reusable line items. You can then create a quotation, convert it to a sales order and invoice the customer.</p></div><button class="primary" data-action="open-quote">Create quotation</button></div>':'';
    return tabs(state)+pageTitle('SALES & RECEIVABLES','Sales','Revenue, products, quotations, customer invoices, collections, receipts and delivery notes.',action)+salesPipeline(state,h)+salesConversionIntelligence(state,h)+salesActionQueue(state,h)+guide+body;
  }
  function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function rowsToCsv(headers,rows){return [headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n');}
  function exportCsv(kind,state,ctx){
    let csv='';
    if(kind==='revenue'){window.DalasiRevenueIncome.exportCsv(state,ctx);return;
    }else if(kind==='quotes'){
      csv=rowsToCsv(['Quotation No','Customer','Quotation Date','Valid Until','Project','Cost Centre','Lines','Subtotal','Discount','Amount','VAT Treatment','Status','Description','Reference','Invoice No'],(state.salesQuotes||[]).map(q=>[q.quoteNo||q.id,q.customerName,q.quoteDate,q.validUntil,q.project||'',q.costCentre||'',(q.lineItems||[]).length,q.subtotal??q.amount,q.discountTotal||0,q.amount,window.DalasiTax?.code?.(q.taxCode||'OUT')?.label||q.taxCode||'Out of scope',quoteStatus(q),q.description||'',q.reference||'',q.invoiceNo||'']));
    }else if(kind==='invoices'){
      csv=rowsToCsv(['Invoice No','Customer','Issue Date','Due Date','Project','Cost Centre','Lines','Subtotal','Discount','Gross Amount','Debit Notes','Credit Notes','Net Gross','Net Amount','VAT Amount','VAT Rate','VAT Treatment','Collected','Balance','Status','Description','Reference'],(state.customerInvoices||[]).map(inv=>{const tx=window.DalasiTax?.meta?.(state,inv,'sale')||{taxNet:inv.amount,vatAmount:0,vatRate:0,taxCode:'OUT'};const credit=window.DalasiReturns?.customerCredited?.(state,inv.id)||0,debit=window.DalasiDebits?.customerDebited?.(state,inv.id)||0;return [inv.invoiceNo||inv.id,inv.customerName,inv.issueDate,inv.dueDate,inv.project||'',inv.costCentre||'',(inv.lineItems||[]).length,inv.subtotal??inv.amount,inv.discountTotal||0,inv.amount,debit,credit,Math.max(0,(Number(inv.amount)||0)+debit-credit),tx.taxNet,tx.vatAmount,tx.vatRate,window.DalasiTax?.code?.(tx.taxCode)?.label||tx.taxCode,paid(state,inv),balance(state,inv),status(state,inv),inv.description||'',inv.reference||''];}));
    }else if(kind==='collections'){
      csv=rowsToCsv(['Receipt No','Customer','Invoice No','Date Received','Amount','Method','Reference','Recorded By'],(state.incomingPayments||[]).map(p=>{const inv=invoiceById(state,p.invoiceId);return [p.receiptNumber||p.id,inv?.customerName||p.customerName||'',inv?.invoiceNo||'',p.receivedDate,p.amount,p.method,p.reference||'',p.createdBy||''];}));
    }else return;
    ctx.downloadText('dalasipay-'+kind+'-'+todayIso()+'.csv',csv);ctx.toast((kind==='quotes'?'Quotation':kind==='invoices'?'Invoice':'Collections')+' report downloaded');
  }
  function downloadDeliveryNote(id,state,ctx){
    const inv=invoiceById(state,id);if(!inv){ctx.toast('Customer invoice not found');return;}
    if(status(state,inv)!=='Paid'){ctx.toast('Delivery note is available after the invoice is fully paid.');return;}
    if(invoiceHasStockLines(state,inv)&&!inv.fulfilledAt){ctx.toast('Fulfil the product invoice and issue stock before generating the delivery note.');return;}
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
    const dLines=inv.lineItems||[];
    if(dLines.length){
      text(40,530,7.5,'DESCRIPTION',true,muted);text(380,530,7.5,'QTY',true,muted);text(455,530,7.5,'UNIT',true,muted);stroke(40,520,555,520,'0.91 0.93 0.92',.5);
      dLines.slice(0,5).forEach((x,i)=>{const y=501-i*18;text(40,y,8.5,clip(x.description,54),false,ink);text(385,y,8.3,String(x.quantity),true,ink);text(455,y,8.3,clip(x.unit||'Unit',12),false,muted);});
      if(dLines.length>5)text(40,430,7.8,'+'+(dLines.length-5)+' more delivered line item'+(dLines.length-5===1?'':'s'),true,muted);
    }else{text(40,524,11,clip(inv.description||'Goods / services as invoiced',66),true);}
    label(40,438,'Customer reference');text(190,438,8.8,clip(inv.reference||'Not recorded',48),true);label(360,438,'Payment status');text(470,438,9.2,'PAID',true,green);
    rect(24,305,547,94,soft,line,.55);label(40,377,'Confirmation');text(40,352,9.2,'The items or services above correspond to the fully paid invoice shown on this note.',false,ink);text(40,330,8.5,'Use this document as delivery/fulfilment evidence together with the invoice and payment receipt.',false,muted);
    stroke(40,254,260,254,line,.7);text(40,235,8,'Delivered / prepared by',false,muted);stroke(335,254,555,254,line,.7);text(335,235,8,'Received / acknowledged by',false,muted);
    stroke(24,82,571,82,line,.55);text(24,63,7.3,'This delivery note is generated from a fully paid DalasiPay customer invoice.',true,'0.45 0.51 0.49');text(420,63,7.3,'Generated by DalasiPay',true,green);
    const customer=(String(inv.customerName||'Customer').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Customer');
    ctx.pdfDownload('Delivery_Note_'+customer+'_'+(inv.invoiceNo||inv.id)+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Delivery note downloaded');
  }
  window.DalasiSalesInvoices={render,metrics,status,balance,paid,invoiceHasStockLines,quoteStatus,quoteMetrics,quoteModal,createQuote,updateQuote,convertQuote,downloadQuote,exportCsv,downloadDeliveryNote,invoiceDetailModal};
})();