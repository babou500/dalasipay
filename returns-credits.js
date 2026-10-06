(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const periodOf=v=>String(v||'').slice(0,7);
  function customerCreditById(state,id){return (state.customerCreditNotes||[]).find(x=>x.id===id)||null;}
  function supplierCreditById(state,id){return (state.supplierCreditNotes||[]).find(x=>x.id===id)||null;}
  function invoiceById(state,id){return (state.customerInvoices||[]).find(x=>x.id===id)||null;}
  function billById(state,id){return (state.businessBills||[]).find(x=>x.id===id)||null;}
  function nextNo(prefix,rows,key){
    const year=new Date().getFullYear(),base=prefix+'-'+year+'-';
    const nums=(rows||[]).map(x=>String(x[key]||'')).filter(x=>x.startsWith(base)).map(x=>Number(x.slice(base.length))||0);
    return base+String((nums.length?Math.max(...nums):0)+1).padStart(5,'0');
  }
  function taxShare(state,doc,gross,side){
    const m=window.DalasiTax?.meta?.(state,doc,side)||{taxGross:Number(doc?.amount)||0,taxNet:Number(doc?.amount)||0,vatAmount:0,taxCode:'OUT',vatRate:0,vatRecoverable:false,taxableTurnover:false};
    const base=Math.max(0,Number(m.taxGross)||Number(doc?.amount)||0),amount=round(gross);
    if(base<=0)return {taxCode:m.taxCode||'OUT',vatRate:Number(m.vatRate)||0,taxGross:amount,taxNet:amount,vatAmount:0,vatRecoverable:false,taxableTurnover:!!m.taxableTurnover};
    const ratio=Math.min(1,amount/base),net=round((Number(m.taxNet)||0)*ratio),vat=round((Number(m.vatAmount)||0)*ratio);
    return {taxCode:m.taxCode||'OUT',vatRate:Number(m.vatRate)||0,taxGross:amount,taxNet:round(amount-vat),vatAmount:vat,vatRecoverable:!!m.vatRecoverable,taxableTurnover:!!m.taxableTurnover};
  }
  function customerCreditsFor(state,invoiceId){return (state.customerCreditNotes||[]).filter(x=>x.invoiceId===invoiceId&&x.status!=='Void');}
  function supplierCreditsFor(state,billId){return (state.supplierCreditNotes||[]).filter(x=>x.billId===billId&&x.status!=='Void');}
  function customerCredited(state,invoiceId){return round(customerCreditsFor(state,invoiceId).reduce((a,x)=>a+(Number(x.amount)||0),0));}
  function supplierCredited(state,billId){return round(supplierCreditsFor(state,billId).reduce((a,x)=>a+(Number(x.amount)||0),0));}
  function invoicePayments(state,invoiceId){return round((state.incomingPayments||[]).filter(x=>x.invoiceId===invoiceId).reduce((a,x)=>a+(Number(x.amount)||0),0));}
  function invoiceBalance(state,invoice){return round(Math.max(0,(Number(invoice?.amount)||0)-invoicePayments(state,invoice?.id)-customerCredited(state,invoice?.id)));}
  function billPayment(state,bill){return bill?.paymentId?(state.businessPayments||[]).find(x=>x.id===bill.paymentId):null;}
  function billBalance(state,bill){
    if(!bill)return 0;
    const p=billPayment(state,bill);if(bill.status==='Paid'||p?.status==='Paid')return 0;
    return round(Math.max(0,(Number(bill.amount)||0)-supplierCredited(state,bill.id)));
  }
  function customerRefunded(state,creditNoteId){return round((state.customerRefunds||[]).filter(x=>x.creditNoteId===creditNoteId).reduce((a,x)=>a+(Number(x.amount)||0),0));}
  function supplierRefunded(state,creditNoteId){return round((state.supplierRefunds||[]).filter(x=>x.creditNoteId===creditNoteId).reduce((a,x)=>a+(Number(x.amount)||0),0));}
  function customerRefundDue(state,credit){return round(Math.max(0,(Number(credit?.refundDue)||0)-customerRefunded(state,credit?.id)));}
  function supplierRefundDue(state,credit){return round(Math.max(0,(Number(credit?.refundReceivable)||0)-supplierRefunded(state,credit?.id)));}
  function customerRefundLiability(state){return round((state.customerCreditNotes||[]).reduce((a,x)=>a+customerRefundDue(state,x),0));}
  function supplierRefundReceivable(state){return round((state.supplierCreditNotes||[]).reduce((a,x)=>a+supplierRefundDue(state,x),0));}
  function invoiceRemainingCredit(state,inv){return round(Math.max(0,(Number(inv?.amount)||0)-customerCredited(state,inv?.id)));}
  function billRemainingCredit(state,bill){return round(Math.max(0,(Number(bill?.amount)||0)-supplierCredited(state,bill?.id)));}
  function validDate(date,state,ctx){
    if(!date){ctx.toast('Credit note date is required.');return false;}
    if(window.DalasiMonthClose?.isClosed?.(state,date)){ctx.toast('That accounting period is closed. Reopen it before posting a credit note.');return false;}
    if(window.DalasiTax?.returnRecord?.(state,periodOf(date))){ctx.toast('The VAT return for '+periodOf(date)+' is filed. Reopen the VAT return before posting a credit note in that period.');return false;}
    return true;
  }
  function issueCostForOriginal(state,inv,itemId){
    const refs=new Set([String(inv.id),String(inv.invoiceNo||'')]);
    const rows=(state.inventoryMovements||[]).filter(x=>x.type==='Sales issue'&&x.catalogId===itemId&&refs.has(String(x.reference||'')));
    const qty=rows.reduce((a,x)=>a+Math.abs(Number(x.quantity)||0),0),cost=rows.reduce((a,x)=>a+(Number(x.costAmount)||Math.abs(Number(x.quantity)||0)*(Number(x.unitCost)||0)),0);
    return {qty:round(qty),unitCost:qty?round(cost/qty):0};
  }
  function alreadyCustomerReturned(state,invoiceId,itemId){
    return round(customerCreditsFor(state,invoiceId).reduce((a,c)=>a+(c.returnItems||[]).filter(x=>x.catalogId===itemId).reduce((s,x)=>s+(Number(x.quantity)||0),0),0));
  }
  function customerReturnRows(state,inv){
    const map=new Map();
    (inv?.lineItems||[]).forEach(line=>{
      const item=line.catalogId?window.DalasiCatalog?.itemById?.(state,line.catalogId):null;
      if(!item||item.type!=='Product')return;
      const x=map.get(item.id)||{catalogId:item.id,code:item.code||item.id,name:item.name,unit:item.unit||'Unit',sold:0,gross:0};
      x.sold+=Number(line.quantity)||0;x.gross+=Number(line.amount)||0;map.set(item.id,x);
    });
    return [...map.values()].map(x=>({...x,sold:round(x.sold),gross:round(x.gross),grossUnit:x.sold?round(x.gross/x.sold):0,returned:alreadyCustomerReturned(state,inv.id,x.catalogId),available:round(Math.max(0,x.sold-alreadyCustomerReturned(state,inv.id,x.catalogId)))})).filter(x=>x.available>0);
  }
  function customerCreditModal(state,h){
    const {field,icon,money2}=h,eligible=(state.customerInvoices||[]).filter(x=>{
      const st=window.DalasiSalesInvoices?.status?.(state,x)||(x.status||'Draft');return st!=='Draft'&&invoiceRemainingCredit(state,x)>.004;
    });
    const selected=invoiceById(state,state.creditNoteInvoiceId)||eligible[0]||null;
    const options=eligible.map(x=>'<option value="'+esc(x.id)+'" '+(selected?.id===x.id?'selected':'')+'>'+esc(x.invoiceNo||x.id)+' · '+esc(x.customerName||'Customer')+' · '+money2(invoiceRemainingCredit(state,x))+' creditable</option>').join('');
    const returns=selected?.fulfilledAt?customerReturnRows(state,selected):[];
    const returnFields=returns.length?'<div class="return-stock-list"><h4>Optional stock returned by customer</h4>'+returns.map(x=>'<label><span><b>'+esc(x.name)+'</b><small>'+x.available+' '+esc(x.unit)+' available to return</small></span><input name="return:'+esc(x.catalogId)+'" type="number" min="0" max="'+x.available+'" step="0.01" value="0"></label>').join('')+'</div>':'';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-customer-credit"></div><form id="customer-credit-form" class="modal-box returns-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">CUSTOMER CREDIT NOTE</div><h2>Issue customer credit</h2><p>Reduce an issued invoice without editing the original document.</p></div><button type="button" class="close" data-action="close-customer-credit">×</button></div>'+
      (eligible.length?'<div class="form-grid">'+field('Invoice','<select id="credit-note-invoice-select" name="invoiceId">'+options+'</select>')+
        field('Credit date','<input name="date" type="date" value="'+todayIso()+'" required>')+
        field('Credit amount (GMD)','<input name="amount" type="number" min="0.01" max="'+Number(invoiceRemainingCredit(state,selected))+'" step="0.01" value="'+Number(invoiceRemainingCredit(state,selected)).toFixed(2)+'" required>')+
        field('Reason','<select name="reason"><option>Goods returned</option><option>Price adjustment</option><option>Service issue</option><option>Billing correction</option><option>Goodwill / commercial credit</option><option>Other</option></select>')+
      '</div>'+field('Reference / note','<input name="note" placeholder="Reason details or return authorization">')+returnFields+
      '<div class="modal-note">The credit reverses revenue and VAT in the credit-note period. If customer payments already exceed the reduced invoice value, the excess becomes Customer Refunds Payable until refunded.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-customer-credit">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Issue credit note</button></div>':
      '<div class="empty-inline">No issued invoice has an amount remaining that can be credited.</div><div class="modal-actions"><button type="button" class="secondary" data-action="close-customer-credit">Close</button></div>')+
      '</form></div>';
  }
  function createCustomerCredit(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to issue credit notes.');return;}
    const fd=new FormData(ev.target),inv=invoiceById(state,String(fd.get('invoiceId')||'')),date=String(fd.get('date')||''),amount=round(fd.get('amount'));
    if(!inv||amount<=0){ctx.toast('Choose an invoice and enter a valid credit amount.');return;}if(!validDate(date,state,ctx))return;
    const remaining=invoiceRemainingCredit(state,inv);if(amount>remaining+.004){ctx.toast('Credit amount cannot exceed the remaining creditable invoice value.');return;}
    const paid=invoicePayments(state,inv.id),prior=customerCredited(state,inv.id),outstandingBefore=Math.max(0,(Number(inv.amount)||0)-paid-prior),arReduction=round(Math.min(amount,outstandingBefore)),refundDue=round(amount-arReduction),tax=taxShare(state,inv,amount,'sale'),id='CCN-'+Date.now().toString(36).toUpperCase(),creditNo=nextNo('CN',state.customerCreditNotes||[],'creditNo'),returnItems=[];
    let returnedSalesGross=0;
    if(inv.fulfilledAt){
      const allowed=new Map(customerReturnRows(state,inv).map(x=>[x.catalogId,x]));
      for(const [key,val] of fd.entries()){
        if(!String(key).startsWith('return:'))continue;
        const catalogId=String(key).slice(7),qty=Math.max(0,Number(val)||0),row=allowed.get(catalogId);if(!qty)continue;
        if(!row||qty>row.available+.0001){ctx.toast('Returned quantity exceeds the remaining issued quantity for '+(row?.name||catalogId)+'.');return;}
        const product=window.DalasiCatalog?.itemById?.(state,catalogId),cost=issueCostForOriginal(state,inv,catalogId);if(!product){continue;}
        returnedSalesGross+=qty*(Number(row.grossUnit)||0);returnItems.push({catalogId,code:product.code||catalogId,name:product.name,quantity:round(qty),unitCost:cost.unitCost,costAmount:round(qty*cost.unitCost),salesGross:round(qty*(Number(row.grossUnit)||0))});
      }
    }
    if(returnedSalesGross>amount+.01){ctx.toast('Returned product value cannot exceed the customer credit amount. Increase the credit or reduce the returned quantities.');return;}
    const now=new Date().toISOString(),rec={id,creditNo,invoiceId:inv.id,invoiceNo:inv.invoiceNo||inv.id,customerId:inv.customerId||null,customerName:inv.customerName||'Customer',date,amount,...tax,arReduction,refundDue,reason:String(fd.get('reason')||'Other'),note:String(fd.get('note')||'').trim(),returnItems,status:'Issued',createdAt:now,createdBy:state.session?.name||'User'};
    state.customerCreditNotes=state.customerCreditNotes||[];state.customerCreditNotes.unshift(rec);
    state.inventoryMovements=state.inventoryMovements||[];
    returnItems.forEach((r,i)=>{
      const p=window.DalasiCatalog?.itemById?.(state,r.catalogId);if(!p)return;const before=Math.max(0,Number(p.stockOnHand)||0),after=round(before+r.quantity);
      if((window.DalasiInventory?.method?.(p)||'Weighted Average')!=='FIFO'&&after>0){const oldValue=before*Math.max(0,Number(p.costPrice)||0),newValue=r.quantity*r.unitCost;p.costPrice=round((oldValue+newValue)/after);}
      p.stockOnHand=after;p.updatedAt=now;p.updatedBy=state.session?.name||'User';
      state.inventoryMovements.unshift({id:'MOV-'+Date.now().toString(36).toUpperCase()+'-CR'+(i+1),catalogId:r.catalogId,type:'Sales return',quantity:r.quantity,unitCost:r.unitCost,costAmount:r.costAmount,balanceBefore:before,balanceAfter:after,movementDate:date,reference:creditNo,returnOfInvoiceId:inv.id,creditNoteId:id,note:'Customer return · '+(inv.invoiceNo||inv.id),createdAt:now,createdBy:state.session?.name||'User'});
    });
    state.creditNoteInvoiceId=null;ctx.audit('returns.customer_credit_issued',{creditNoteId:id,creditNo,invoiceId:inv.id,amount,arReduction,refundDue,returnedItems:returnItems.length});ctx.save();ctx.toast(creditNo+' issued');ctx.render();
  }
  function supplierReturnRows(state){
    return (state.salesCatalog||[]).filter(x=>x.type==='Product'&&(Number(x.stockOnHand)||0)>0&&(x.status||'Active')==='Active').map(x=>({catalogId:x.id,code:x.code||x.id,name:x.name,unit:x.unit||'Unit',available:Math.max(0,Number(x.stockOnHand)||0)}));
  }
  function supplierCreditModal(state,h){
    const {field,icon,money2}=h,eligible=(state.businessBills||[]).filter(b=>{
      if((b.status||'Draft')==='Draft'||billRemainingCredit(state,b)<=.004)return false;
      const p=billPayment(state,b);return !p||p.status==='Paid';
    });
    const selected=billById(state,state.supplierCreditBillId)||eligible[0]||null,options=eligible.map(b=>'<option value="'+esc(b.id)+'" '+(selected?.id===b.id?'selected':'')+'>'+esc(b.invoiceNo||b.id)+' · '+esc(b.supplier||'Supplier')+' · '+money2(billRemainingCredit(state,b))+' creditable</option>').join('');
    const products=supplierReturnRows(state);
    const productFields=products.length?'<div class="return-stock-list"><h4>Optional goods returned to supplier</h4>'+products.map(x=>'<label><span><b>'+esc(x.name)+'</b><small>'+x.available+' '+esc(x.unit)+' on hand</small></span><input name="supplierReturn:'+esc(x.catalogId)+'" type="number" min="0" max="'+x.available+'" step="0.01" value="0"></label>').join('')+'</div>':'';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-supplier-credit"></div><form id="supplier-credit-form" class="modal-box returns-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">SUPPLIER CREDIT NOTE</div><h2>Record supplier credit</h2><p>Reduce a supplier bill or create a supplier refund receivable after payment.</p></div><button type="button" class="close" data-action="close-supplier-credit">×</button></div>'+
      (eligible.length?'<div class="form-grid">'+field('Supplier bill','<select id="supplier-credit-bill-select" name="billId">'+options+'</select>')+
        field('Credit date','<input name="date" type="date" value="'+todayIso()+'" required>')+
        field('Credit amount (GMD)','<input name="amount" type="number" min="0.01" max="'+Number(billRemainingCredit(state,selected))+'" step="0.01" value="'+Number(billRemainingCredit(state,selected)).toFixed(2)+'" required>')+
        field('Supplier credit reference','<input name="supplierReference" placeholder="Supplier credit-note number">')+
      '</div>'+field('Reason / note','<input name="note" placeholder="Goods returned, pricing correction or supplier allowance">')+productFields+
      '<div class="modal-note">For an unpaid bill the credit reduces Accounts Payable. If the bill was already paid, the credit becomes Supplier Refund Receivable until cash is received.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-supplier-credit">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Record supplier credit</button></div>':
      '<div class="empty-inline">No approved or paid supplier bill is currently available for a credit note. Resolve any pending linked payment first.</div><div class="modal-actions"><button type="button" class="secondary" data-action="close-supplier-credit">Close</button></div>')+
      '</form></div>';
  }
  function createSupplierCredit(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to record supplier credits.');return;}
    const fd=new FormData(ev.target),bill=billById(state,String(fd.get('billId')||'')),date=String(fd.get('date')||''),amount=round(fd.get('amount'));if(!bill||amount<=0){ctx.toast('Choose a supplier bill and enter a valid credit amount.');return;}if(!validDate(date,state,ctx))return;
    const payment=billPayment(state,bill);if(payment&&payment.status!=='Paid'){ctx.toast('Resolve or remove the linked pending payment before recording a supplier credit.');return;}
    const remaining=billRemainingCredit(state,bill);if(amount>remaining+.004){ctx.toast('Supplier credit cannot exceed the remaining creditable bill value.');return;}
    const paid=bill.status==='Paid'||payment?.status==='Paid',apBefore=paid?0:remaining,apReduction=round(Math.min(amount,apBefore)),refundReceivable=round(amount-apReduction),tax=taxShare(state,bill,amount,'purchase'),id='SCN-'+Date.now().toString(36).toUpperCase(),creditNo=nextNo('SCN',state.supplierCreditNotes||[],'creditNo'),returnItems=[];
    const allowed=new Map(supplierReturnRows(state).map(x=>[x.catalogId,x]));
    for(const [key,val] of fd.entries()){
      if(!String(key).startsWith('supplierReturn:'))continue;
      const catalogId=String(key).slice(15),qty=Math.max(0,Number(val)||0),row=allowed.get(catalogId);if(!qty)continue;
      if(!row||qty>row.available+.0001){ctx.toast('Supplier return quantity exceeds stock on hand for '+(row?.name||catalogId)+'.');return;}
      const p=window.DalasiCatalog?.itemById?.(state,catalogId),cost=window.DalasiInventory?.issueCost?.(state,p,qty)||{unitCost:Number(p?.costPrice)||0,amount:qty*(Number(p?.costPrice)||0)};
      returnItems.push({catalogId,code:p?.code||catalogId,name:p?.name||catalogId,quantity:round(qty),unitCost:round(cost.unitCost),costAmount:round(cost.amount)});
    }
    const now=new Date().toISOString(),rec={id,creditNo,billId:bill.id,billNo:bill.invoiceNo||bill.id,beneficiaryId:bill.beneficiaryId||null,supplier:bill.supplier||'Supplier',date,amount,...tax,apReduction,refundReceivable,supplierReference:String(fd.get('supplierReference')||'').trim(),note:String(fd.get('note')||'').trim(),returnItems,status:'Issued',createdAt:now,createdBy:state.session?.name||'User'};
    state.supplierCreditNotes=state.supplierCreditNotes||[];state.supplierCreditNotes.unshift(rec);state.inventoryMovements=state.inventoryMovements||[];
    returnItems.forEach((r,i)=>{
      const p=window.DalasiCatalog?.itemById?.(state,r.catalogId);if(!p)return;const before=Math.max(0,Number(p.stockOnHand)||0),after=round(Math.max(0,before-r.quantity));p.stockOnHand=after;p.updatedAt=now;p.updatedBy=state.session?.name||'User';
      state.inventoryMovements.unshift({id:'MOV-'+Date.now().toString(36).toUpperCase()+'-SR'+(i+1),catalogId:r.catalogId,type:'Purchase return',quantity:-r.quantity,unitCost:r.unitCost,costAmount:r.costAmount,balanceBefore:before,balanceAfter:after,movementDate:date,reference:creditNo,supplierCreditNoteId:id,note:'Returned to supplier · '+(bill.invoiceNo||bill.id),createdAt:now,createdBy:state.session?.name||'User'});
    });
    state.supplierCreditBillId=null;ctx.audit('returns.supplier_credit_recorded',{creditNoteId:id,creditNo,billId:bill.id,amount,apReduction,refundReceivable,returnedItems:returnItems.length});ctx.save();ctx.toast(creditNo+' recorded');ctx.render();
  }
  function refundModal(state,h,type){
    const {field,icon,money2}=h,isCustomer=type==='customer',credit=isCustomer?customerCreditById(state,state.customerRefundCreditId):supplierCreditById(state,state.supplierRefundCreditId);if(!credit)return '';
    const due=isCustomer?customerRefundDue(state,credit):supplierRefundDue(state,credit),account=window.DalasiCashBank?.accountSelect?.(state,'accountId','','Cash / bank account')||'<select name="accountId"></select>';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-return-refund"></div><form id="'+(isCustomer?'customer-refund-form':'supplier-refund-form')+'" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">'+(isCustomer?'CUSTOMER REFUND':'SUPPLIER REFUND')+'</div><h2>'+(isCustomer?'Pay customer refund':'Record supplier refund')+'</h2><p>'+esc(credit.creditNo)+' · '+esc(isCustomer?credit.customerName:credit.supplier)+' · '+money2(due)+' outstanding</p></div><button type="button" class="close" data-action="close-return-refund">×</button></div>'+
      '<input type="hidden" name="creditNoteId" value="'+esc(credit.id)+'"><div class="form-grid">'+field('Date','<input name="date" type="date" value="'+todayIso()+'" required>')+field('Amount (GMD)','<input name="amount" type="number" min="0.01" max="'+due+'" step="0.01" value="'+due.toFixed(2)+'" required>')+field('Cash & Bank account',account)+field('Reference','<input name="reference" placeholder="Bank / transfer reference">')+'</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-return-refund">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' '+(isCustomer?'Record refund paid':'Record refund received')+'</button></div></form></div>';
  }
  function saveRefund(ev,state,ctx,type){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to record refunds.');return;}
    const fd=new FormData(ev.target),isCustomer=type==='customer',credit=isCustomer?customerCreditById(state,String(fd.get('creditNoteId')||'')):supplierCreditById(state,String(fd.get('creditNoteId')||'')),date=String(fd.get('date')||''),amount=round(fd.get('amount')),accountId=String(fd.get('accountId')||''),reference=String(fd.get('reference')||'').trim();if(!credit||amount<=0){ctx.toast('Enter a valid refund amount.');return;}
    const due=isCustomer?customerRefundDue(state,credit):supplierRefundDue(state,credit);if(amount>due+.004){ctx.toast('Refund amount cannot exceed the outstanding refundable balance.');return;}if(window.DalasiMonthClose?.isClosed?.(state,date)){ctx.toast('That accounting period is closed. Reopen it before recording the refund.');return;}
    const tx=window.DalasiCashBank?.post?.(state,{accountId,date,direction:isCustomer?'out':'in',amount,type:isCustomer?'Customer refund':'Supplier refund',counterparty:isCustomer?credit.customerName:credit.supplier,reference,description:(isCustomer?'Refund for ':'Supplier refund for ')+credit.creditNo,sourceType:isCustomer?'customer-refund':'supplier-refund',sourceId:credit.id,sourceKey:(isCustomer?'customer-refund:':'supplier-refund:')+credit.id+':'+Date.now(),createdBy:state.session?.name||'User'});
    if(!tx){ctx.toast('Choose a valid Cash & Bank account.');return;}
    const rec={id:(isCustomer?'CREF-':'SREF-')+Date.now().toString(36).toUpperCase(),creditNoteId:credit.id,creditNo:credit.creditNo,date,amount,accountId,reference,cashTransactionId:tx.id,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'};
    if(isCustomer){state.customerRefunds=state.customerRefunds||[];state.customerRefunds.unshift(rec);state.customerRefundCreditId=null;}else{state.supplierRefunds=state.supplierRefunds||[];state.supplierRefunds.unshift(rec);state.supplierRefundCreditId=null;}
    ctx.audit(isCustomer?'returns.customer_refund_paid':'returns.supplier_refund_received',{creditNoteId:credit.id,amount,date});ctx.save();ctx.toast(isCustomer?'Customer refund recorded':'Supplier refund received');ctx.render();
  }
  function summary(state){
    const customerCredits=round((state.customerCreditNotes||[]).reduce((a,x)=>a+(Number(x.amount)||0),0)),supplierCredits=round((state.supplierCreditNotes||[]).reduce((a,x)=>a+(Number(x.amount)||0),0));
    return {customerCredits,supplierCredits,customerRefundDue:customerRefundLiability(state),supplierRefundDue:supplierRefundReceivable(state),customerNotes:(state.customerCreditNotes||[]).length,supplierNotes:(state.supplierCreditNotes||[]).length};
  }
  function downloadCreditPdf(id,type,state,ctx){
    const customer=type!=='supplier',credit=customer?customerCreditById(state,id):supplierCreditById(state,id);if(!credit){ctx.toast('Credit note not found');return;}
    const source=customer?invoiceById(state,credit.invoiceId):billById(state,credit.billId),party=customer?(credit.customerName||source?.customerName||'Customer'):(credit.supplier||source?.supplier||'Supplier'),title=customer?'CREDIT NOTE':'SUPPLIER CREDIT NOTE',subtitle=customer?'CUSTOMER SALES CREDIT':'PURCHASE / SUPPLIER CREDIT',refundTotal=customer?(Number(credit.refundDue)||0):(Number(credit.refundReceivable)||0),refunded=customer?customerRefunded(state,credit.id):supplierRefunded(state,credit.id),refundOutstanding=customer?customerRefundDue(state,credit):supplierRefundDue(state,credit),returnItems=credit.returnItems||[];
    const out=[],ink='0.06 0.13 0.11',muted='0.36 0.43 0.40',green='0.04 0.31 0.26',mint='0.92 0.97 0.95',line='0.84 0.88 0.86',white='1 1 1',soft='0.97 0.98 0.975',red='0.60 0.12 0.10';
    const safeText=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const clip=(v,max=48)=>{const t=String(v??'');return t.length>max?t.slice(0,max-3)+'...':t};
    const text=(x,y,size,value,bold=false,color=ink)=>out.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+safeText(value)+') Tj ET');
    const fill=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
    const stroke=(x1,y1,x2,y2,color=line,width=.7)=>out.push(color+' RG '+width+' w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
    const rect=(x,y,w,h,fillColor=white,strokeColor=line,width=.65)=>{fill(x,y,w,h,fillColor);out.push(strokeColor+' RG '+width+' w '+x+' '+y+' '+w+' '+h+' re S')};
    const label=(x,y,value)=>text(x,y,7.2,String(value).toUpperCase(),true,'0.42 0.49 0.46');
    const money=v=>ctx.money2(Number(v)||0),taxSettings=window.DalasiTax?.settings?.(state)||{},sourceNo=customer?(credit.invoiceNo||source?.invoiceNo||source?.id):(credit.billNo||source?.invoiceNo||source?.id),sourceLabel=customer?'Original invoice':'Supplier bill',partyDetail=customer?([source?.customerEmail,source?.customerPhone].filter(Boolean).join(' · ')||'Customer account'):(credit.supplierReference?('Supplier credit ref '+credit.supplierReference):(source?.reference||'Supplier account'));
    fill(0,0,595,842,white);out.push('0.88 0.91 0.90 RG 0.75 w 24 24 547 794 re S');
    fill(24,746,547,72,green);fill(24,746,5,72,'0.37 0.82 0.68');
    if(state.branding?.logoData){out.push('q 42 0 0 42 43 765 cm /Im1 Do Q')}else{fill(43,765,42,42,'0.88 0.97 0.94');text(57,780,14,clip(state.branding?.logoText||state.company.slice(0,1),3),true,green)}
    text(99,790,17,clip(state.company,29),true,white);text(99,771,8.2,taxSettings.tin?'TIN '+clip(taxSettings.tin,26):'DALASIPAY CREDITS & RETURNS',true,'0.74 0.91 0.86');
    text(customer?405:350,791,customer?17:14.5,title,true,white);text(customer?405:350,772,7.4,subtitle,true,'0.74 0.91 0.86');
    rect(24,695,547,38,soft,line,.55);label(40,718,'Credit note no.');text(40,703,10,credit.creditNo||credit.id,true);stroke(218,701,218,726,line,.55);label(235,718,'Credit date');text(235,703,9.4,credit.date||'',true);stroke(391,701,391,726,line,.55);label(408,718,sourceLabel);text(408,703,9.4,clip(sourceNo||'—',22),true);
    rect(24,607,547,73,'0.945 0.97 0.96',line,.55);label(40,662,customer?'Customer':'Supplier');text(40,644,13,clip(party,42),true);text(40,628,8.4,clip(partyDetail,58),false,muted);label(385,662,'Gross credit');text(385,638,19,money(credit.amount),true,green);
    rect(24,454,547,138,white,line,.55);label(40,571,'Credit breakdown');
    const rows=customer?[
      ['Reason',credit.reason||'Customer credit'],
      ['Reference / note',credit.note||'Not recorded'],
      ['Net value reversed',money(credit.taxNet??credit.amount)],
      ['VAT reversed'+(credit.vatRate?(' · '+credit.vatRate+'%'):''),money(credit.vatAmount||0)],
      ['Receivable reduction',money(credit.arReduction||0)]
    ]:[
      ['Supplier credit reference',credit.supplierReference||'Not recorded'],
      ['Reference / note',credit.note||'Not recorded'],
      ['Net value reversed',money(credit.taxNet??credit.amount)],
      ['VAT reversed'+(credit.vatRate?(' · '+credit.vatRate+'%'):''),money(credit.vatAmount||0)],
      ['Payable reduction',money(credit.apReduction||0)]
    ];
    rows.forEach((r,i)=>{const y=546-i*23;text(40,y,8.6,r[0],false,muted);text(205,y,9.1,clip(r[1],47),true,ink);if(i<rows.length-1)stroke(40,y-8,555,y-8,'0.91 0.93 0.92',.45)});
    rect(24,338,547,100,mint,line,.55);label(40,417,'Settlement effect');text(40,394,8.6,customer?'Refund created':'Refund receivable',false,muted);text(175,394,10,money(refundTotal),true);text(310,394,8.6,customer?'Refunds paid':'Refunds received',false,muted);text(430,394,10,money(refunded),true,green);text(40,368,8.6,'Outstanding',false,muted);text(175,365,14,money(refundOutstanding),true,refundOutstanding>0?red:green);text(310,368,8.6,'VAT treatment',false,muted);text(430,368,9.2,clip((window.DalasiTax?.code?.(credit.taxCode)?.label||credit.taxCode||'Out of scope'),23),true);
    rect(24,226,547,96,soft,line,.55);label(40,302,'Returned inventory');
    if(returnItems.length){
      text(40,282,7.3,'ITEM',true,muted);text(300,282,7.3,'QTY',true,muted);text(374,282,7.3,'UNIT COST',true,muted);text(472,282,7.3,'COST VALUE',true,muted);stroke(40,274,555,274,'0.91 0.93 0.92',.45);
      returnItems.slice(0,3).forEach((r,i)=>{const y=256-i*19;text(40,y,8.3,clip(r.name||r.code||r.catalogId,40),false,ink);text(302,y,8.2,String(r.quantity),false,ink);text(374,y,8.2,money(r.unitCost),false,ink);text(472,y,8.2,money(r.costAmount),true,ink);});
      if(returnItems.length>3)text(40,207,7.4,'+'+(returnItems.length-3)+' more returned item'+(returnItems.length-3===1?'':'s'),true,muted);
    }else{text(40,273,9,'No inventory quantity was recorded on this credit note.',false,muted);}
    fill(24,139,547,65,green);text(42,179,8.2,customer?'TOTAL CUSTOMER CREDIT':'TOTAL SUPPLIER CREDIT',true,'0.74 0.91 0.86');text(42,154,21,money(credit.amount),true,white);text(360,166,8,clip(credit.status||'Issued',22),true,'0.84 0.95 0.91');
    stroke(24,82,571,82,line,.55);text(24,63,7.3,customer?'This credit note reduces the linked customer invoice and any related VAT according to the saved tax treatment.':'This record captures a supplier credit against the linked supplier bill and any related VAT reversal.',true,'0.45 0.51 0.49');text(24,48,6.9,returnItems.length?'Returned inventory is recorded separately using the saved inventory costing method.':'No stock return is attached to this credit note.',false,'0.53 0.58 0.56');text(421,63,7.3,'Generated by DalasiPay',true,green);
    const safe=String(party||'Party').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Party',filename=(customer?'Customer_Credit_Note_':'Supplier_Credit_Note_')+safe+'_'+(credit.creditNo||credit.id)+'.pdf';
    ctx.pdfDownload(filename,out.join('\n'),state.branding?.logoData||'');ctx.toast((customer?'Customer':'Supplier')+' credit note PDF downloaded');
  }

  function exportCsv(state,type,ctx){
    const customer=type!=='supplier',rows=customer?(state.customerCreditNotes||[]):(state.supplierCreditNotes||[]);
    const headers=customer?['Credit Note','Date','Customer','Invoice','Gross Credit','Net Credit','VAT Reversed','AR Reduction','Refund Due','Refunded','Refund Outstanding','Reason','Status']:['Credit Note','Date','Supplier','Bill','Supplier Ref','Gross Credit','Net Credit','VAT Reversed','AP Reduction','Refund Receivable','Refund Received','Refund Outstanding','Status'];
    const data=rows.map(x=>customer?[x.creditNo,x.date,x.customerName,x.invoiceNo,x.amount,x.taxNet,x.vatAmount,x.arReduction,x.refundDue,customerRefunded(state,x.id),customerRefundDue(state,x),x.reason,x.status]:[x.creditNo,x.date,x.supplier,x.billNo,x.supplierReference||'',x.amount,x.taxNet,x.vatAmount,x.apReduction,x.refundReceivable,supplierRefunded(state,x.id),supplierRefundDue(state,x),x.status]);
    const csv=[headers,...data].map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-'+(customer?'customer':'supplier')+'-credits-'+todayIso()+'.csv',csv);ctx.toast('Credit-note register downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,view=state.returnsView==='supplier'?'supplier':'customer',s=summary(state);
    const customerRows=(state.customerCreditNotes||[]).map(x=>{const due=customerRefundDue(state,x);return '<tr><td><b>'+esc(x.creditNo)+'</b><small>'+esc(x.invoiceNo)+'</small></td><td>'+esc(x.date)+'</td><td>'+esc(x.customerName)+'</td><td>'+money2(x.amount)+'</td><td>'+money2(x.vatAmount||0)+'</td><td>'+money2(x.arReduction||0)+'</td><td>'+money2(due)+'</td><td>'+pill(x.status||'Issued','approved')+'</td><td><div class="inline-buttons"><button class="secondary tiny" data-action="returns-pdf:customer:'+esc(x.id)+'">'+icon('download',12)+' PDF</button>'+(due>0?'<button class="primary tiny" data-action="customer-refund:'+esc(x.id)+'">Refund</button>':'<span class="payment-complete">Settled</span>')+'</div></td></tr>';}).join('')||'<tr><td colspan="9"><div class="empty-inline">No customer credit notes issued yet.</div></td></tr>';
    const supplierRows=(state.supplierCreditNotes||[]).map(x=>{const due=supplierRefundDue(state,x);return '<tr><td><b>'+esc(x.creditNo)+'</b><small>'+esc(x.billNo)+'</small></td><td>'+esc(x.date)+'</td><td>'+esc(x.supplier)+'</td><td>'+money2(x.amount)+'</td><td>'+money2(x.vatAmount||0)+'</td><td>'+money2(x.apReduction||0)+'</td><td>'+money2(due)+'</td><td>'+pill(x.status||'Issued','approved')+'</td><td><div class="inline-buttons"><button class="secondary tiny" data-action="returns-pdf:supplier:'+esc(x.id)+'">'+icon('download',12)+' PDF</button>'+(due>0?'<button class="primary tiny" data-action="supplier-refund:'+esc(x.id)+'">Receive refund</button>':'<span class="payment-complete">Settled</span>')+'</div></td></tr>';}).join('')||'<tr><td colspan="9"><div class="empty-inline">No supplier credit notes recorded yet.</div></td></tr>';
    return pageTitle('RETURNS & ADJUSTMENTS','Credits & Returns','Issue customer credit notes, record supplier credits, return inventory and settle resulting refunds without rewriting original documents.','<div class="inline-buttons"><button class="secondary" data-action="returns-export">'+icon('download',14)+' Export</button><button class="primary" data-action="'+(view==='customer'?'open-customer-credit':'open-supplier-credit')+'">'+icon('plus',14)+' '+(view==='customer'?'Customer credit':'Supplier credit')+'</button></div>')+
      '<div class="returns-tabs"><button class="'+(view==='customer'?'active':'')+'" data-action="returns-view:customer">Customer credits</button><button class="'+(view==='supplier'?'active':'')+'" data-action="returns-view:supplier">Supplier credits</button></div>'+
      '<div class="returns-kpis"><div class="surface"><span>Customer credits issued</span><b>'+money2(s.customerCredits)+'</b><small>'+s.customerNotes+' credit notes</small></div><div class="surface '+(s.customerRefundDue?'returns-alert':'')+'"><span>Customer refunds payable</span><b>'+money2(s.customerRefundDue)+'</b><small>cash still owed to customers</small></div><div class="surface"><span>Supplier credits recorded</span><b>'+money2(s.supplierCredits)+'</b><small>'+s.supplierNotes+' supplier credits</small></div><div class="surface '+(s.supplierRefundDue?'returns-alert':'')+'"><span>Supplier refunds receivable</span><b>'+money2(s.supplierRefundDue)+'</b><small>cash still due from suppliers</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('file',17)+'</span><div><b>Original documents remain immutable</b><p>Credits post separate reversals. Customer returns can restore inventory and reverse COGS; supplier returns reduce inventory separately from the supplier credit note.</p></div></div>'+
      '<section class="surface employee-card returns-register"><div class="table-tools"><div><h3>'+(view==='customer'?'Customer credit-note register':'Supplier credit-note register')+'</h3><p>'+(view==='customer'?'Revenue, VAT, receivable and refund effects':'Payable, VAT, supplier-refund and stock-return effects')+'</p></div></div><div class="table-scroll"><table><thead><tr><th>CREDIT / SOURCE</th><th>DATE</th><th>'+(view==='customer'?'CUSTOMER':'SUPPLIER')+'</th><th>GROSS CREDIT</th><th>VAT</th><th>'+(view==='customer'?'AR REDUCTION':'AP REDUCTION')+'</th><th>REFUND OUTSTANDING</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+(view==='customer'?customerRows:supplierRows)+'</tbody></table></div></section>';
  }

  window.DalasiReturns={customerCreditById,supplierCreditById,customerCreditsFor,supplierCreditsFor,customerCredited,supplierCredited,invoicePayments,invoiceBalance,billBalance,customerRefunded,supplierRefunded,customerRefundDue,supplierRefundDue,customerRefundLiability,supplierRefundReceivable,invoiceRemainingCredit,billRemainingCredit,taxShare,customerCreditModal,createCustomerCredit,supplierCreditModal,createSupplierCredit,refundModal,saveRefund,summary,downloadCreditPdf,exportCsv,render};
})();