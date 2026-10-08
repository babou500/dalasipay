(function(){
  'use strict';

  const EXPENSE_CATEGORIES=['Office & administration','Travel & transport','Utilities','Rent & facilities','Marketing & sales','Professional services','Repairs & maintenance','Supplies & inventory','Meals & hospitality','Staff welfare','Government & statutory','Other expense'];
  const METHODS=['Bank transfer','Mobile money','Cash','Cheque','Card','Other'];
  const PURCHASE_CATEGORIES=['Supplies & inventory','Equipment / assets','Professional services','Repairs & maintenance','Office & administration','Travel & logistics','Marketing & sales','Other purchase'];

  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function dateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function supplierById(state,id){return window.DalasiBusinessPayments?.beneficiaryById(state,id)||null;}
  function normRef(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');}
  function normParty(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');}
  function sameMoney(a,b){return Math.abs((Number(a)||0)-(Number(b)||0))<=.004;}

  function statusClass(s){return s==='Paid'||s==='Closed'||s==='Received'?'paid':s==='Approved'||s==='Ordered'?'approved':s==='Pending approval'?'neutral':'ready';}
  function nextNumber(prefix,rows,key){
    const year=new Date().getFullYear(),n=(rows||[]).filter(x=>String(x[key]||'').startsWith(prefix+'-'+year+'-')).length+1;
    return prefix+'-'+year+'-'+String(n).padStart(5,'0');
  }
  function readAttachment(file){
    return new Promise((resolve,reject)=>{
      if(!file){resolve({name:'',data:''});return}
      if(file.size>1500000){reject(new Error('Attachment must be smaller than 1.5 MB.'));return}
      if(!/^(application\/pdf|image\/(png|jpeg|webp))$/i.test(file.type||'')){reject(new Error('Use a PDF, PNG, JPG or WebP file.'));return}
      const r=new FileReader();r.onerror=()=>reject(new Error('Unable to read the attachment.'));r.onload=()=>resolve({name:file.name||'attachment',data:String(r.result||'')});r.readAsDataURL(file);
    });
  }
  function expenseById(state,id){return (state.businessExpenses||[]).find(x=>x.id===id)||null;}
  function purchaseById(state,id){return (state.purchaseOrders||[]).find(x=>x.id===id)||null;}
  function expenseMetrics(state){
    const rows=state.businessExpenses||[],sum=xs=>xs.reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {count:rows.length,total:sum(rows),pending:sum(rows.filter(x=>x.status==='Pending approval')),approved:sum(rows.filter(x=>x.status==='Approved')),paid:sum(rows.filter(x=>x.status==='Paid')),receipts:rows.filter(x=>x.receiptData).length};
  }
  function purchaseMetrics(state){
    const rows=state.purchaseOrders||[],open=rows.filter(x=>!['Closed','Cancelled'].includes(x.status||'Draft')),sum=xs=>xs.reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {count:rows.length,open:open.length,openValue:sum(open),approval:sum(rows.filter(x=>x.status==='Pending approval')),ordered:sum(rows.filter(x=>x.status==='Ordered')),received:sum(rows.filter(x=>x.status==='Received'))};
  }
  function tabs(state){
    const tab=state.expenseTab||'expenses';
    return '<div class="expense-tabs"><button class="'+(tab==='expenses'?'active':'')+'" data-action="expense-tab:expenses">Expenses</button><button class="'+(tab==='purchases'?'active':'')+'" data-action="expense-tab:purchases">Purchase orders</button></div>';
  }
  function expenseAction(x){
    if(x.status==='Draft')return '<button class="secondary" data-action="expense-status:'+x.id+':Pending approval">Submit</button>';
    if(x.status==='Pending approval')return '<button class="secondary" data-action="expense-status:'+x.id+':Approved">Approve</button>';
    if(x.status==='Approved')return '<button class="primary" data-action="expense-status:'+x.id+':Paid">Mark paid</button>';
    return '<span class="payment-complete">Paid</span>';
  }
  function actionMenu(primary,items,label='More'){
    return '<div class="row-action-shell">'+(primary||'')+(items&&items.length?'<details class="row-actions-menu"><summary>'+label+'</summary><div class="row-actions-popover">'+items.join('')+'</div></details>':'')+'</div>';
  }
  function purchaseAction(x){
    const pdf='<button data-action="purchase-pdf:'+x.id+'">Download PO PDF</button>',view='<button data-action="purchase-view:'+x.id+'">View details</button>',send='<button data-action="purchase-send:'+x.id+'">Send to supplier</button>',grn='<button data-action="purchase-grn:'+x.id+'">Goods received note</button>';
    if(x.status==='Draft')return actionMenu('<button class="secondary tiny" data-action="purchase-view:'+x.id+'">View</button>',[pdf,'<button data-action="purchase-status:'+x.id+':Pending approval">Submit for approval</button>']);
    if(x.status==='Pending approval')return actionMenu('<button class="primary tiny" data-action="purchase-status:'+x.id+':Approved">Approve</button>',[view,pdf]);
    if(x.status==='Approved')return actionMenu('<button class="primary tiny" data-action="purchase-status:'+x.id+':Ordered">Mark ordered</button>',[view,pdf,send]);
    if(x.status==='Ordered')return actionMenu('<button class="primary tiny" data-action="purchase-status:'+x.id+':Received">Receive</button>',[view,pdf,send]);
    if(x.status==='Received'){
      const primary=x.linkedBillId?'<span class="payment-complete">Bill created</span>':'<button class="primary tiny" data-action="purchase-to-bill:'+x.id+'">Create bill</button>';
      return actionMenu(primary,[view,pdf,grn,'<button data-action="purchase-status:'+x.id+':Closed">Close purchase order</button>']);
    }
    return actionMenu(x.linkedBillId?'<span class="payment-complete">Closed</span>':'<span class="payment-complete">'+(x.status||'Closed')+'</span>',[view,pdf].concat(x.receivedAt?[grn]:[]));
  }
  function expensesPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,m=expenseMetrics(state);
    const rows=(state.businessExpenses||[]).slice().sort((a,b)=>String(b.expenseDate||b.createdAt||'').localeCompare(String(a.expenseDate||a.createdAt||'')));
    const table=rows.length?rows.map(x=>{
      const s=supplierById(state,x.supplierId);
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(x.merchant||s?.name||'Expense')+'</b><small>'+esc(x.expenseNo||x.id)+'</small></div></td>'+
        '<td>'+esc(x.category||'Other expense')+'</td>'+
        '<td>'+dateLabel(x.expenseDate)+'</td>'+
        '<td class="payment-amount">'+money2(x.amount)+'</td>'+
        '<td>'+esc(x.method||'Other')+'</td>'+
        '<td>'+(x.receiptData?'<a class="text-btn" href="'+esc(x.receiptData)+'" download="'+esc(x.receiptName||'receipt')+'">'+icon('download',13)+' Receipt</a>':'<span class="bill-no-file">No receipt</span>')+'</td>'+
        '<td>'+pill(x.status||'Draft',statusClass(x.status||'Draft'))+'</td>'+
        '<td><div class="payment-status-actions">'+expenseAction(x)+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="8"><div class="empty-inline">No expenses recorded yet. Add the first business expense and attach a receipt if available.</div></td></tr>';
    return '<div class="expense-summary">'+
      '<div class="surface"><span>Total recorded</span><b>'+money2(m.total)+'</b><small>'+m.count+' expense records</small></div>'+
      '<div class="surface"><span>Pending approval</span><b>'+money2(m.pending)+'</b><small>waiting for review</small></div>'+
      '<div class="surface"><span>Approved</span><b>'+money2(m.approved)+'</b><small>approved but not marked paid</small></div>'+
      '<div class="surface"><span>Paid expenses</span><b>'+money2(m.paid)+'</b><small>'+m.receipts+' receipt'+(m.receipts===1?'':'s')+' attached</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('file',17)+'</span><div><b>Everyday business spending, properly documented</b><p>Record cash, card, bank and mobile-money expenses, attach receipts, classify costs and keep approval status visible.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Expense register</h3><p>Business costs, receipts, payment methods and approval status</p></div><div class="register-tools"><label class="register-search">'+icon('search',13)+'<input data-table-search="expense-register" placeholder="Search expenses"></label><button class="primary" data-action="open-expense">'+icon('plus',14)+' Add expense</button></div></div>'+
      '<div class="table-scroll"><table data-register-table="expense-register"><thead><tr><th>MERCHANT / REF</th><th>CATEGORY</th><th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>RECEIPT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function purchaseDetailModal(state,h){
    const x=purchaseById(state,state.purchaseDetailId);if(!x)return '';
    const s=supplierById(state,x.supplierId),esc=h.esc,money2=h.money2,icon=h.icon,pill=h.pill,lines=x.lineItems||[];
    const lineRows=lines.length?lines.map(l=>'<div class="record-line"><div><b>'+esc(l.description||'Item')+'</b><small>'+esc(l.unit||'Unit')+' · '+Number(l.quantity||0).toLocaleString('en-GB')+'</small></div><span>'+money2(l.unitPrice||0)+'</span><strong>'+money2(l.amount??((Number(l.quantity)||0)*(Number(l.unitPrice)||0)))+'</strong></div>').join(''):'<div class="empty-inline">No line items on this purchase order.</div>';
    const timeline=[
      {label:'Purchase order created',at:x.createdAt,by:x.createdBy},
      x.approvedAt?{label:'Approved',at:x.approvedAt,by:x.approvedBy}:null,
      x.orderedAt?{label:'Marked ordered',at:x.orderedAt,by:x.updatedBy}:null,
      x.receivedAt?{label:'Goods / services received',at:x.receivedAt,by:x.inventoryReceivedBy||x.updatedBy}:null,
      x.linkedBillId?{label:'Supplier bill created · '+(x.linkedInvoiceNo||x.linkedBillId),at:x.updatedAt,by:x.updatedBy}:null,
      x.closedAt?{label:'Purchase order closed',at:x.closedAt,by:x.updatedBy}:null
    ].filter(Boolean).sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
    return '<div class="record-drawer-wrap"><div class="modal-scrim" data-action="close-purchase-detail"></div><aside class="record-drawer"><div class="record-drawer-head"><div><div class="eyebrow">PURCHASE ORDER</div><h2>'+esc(x.poNumber||x.id)+'</h2><p>'+esc(s?.name||x.supplierName||'Supplier not assigned')+'</p></div><button class="close" data-action="close-purchase-detail">×</button></div>'+
      '<div class="record-hero"><div><span>Order value</span><b>'+money2(x.amount)+'</b><small>'+lines.length+' line item'+(lines.length===1?'':'s')+'</small></div>'+pill(x.status||'Draft',statusClass(x.status||'Draft'))+'</div>'+
      '<div class="record-facts"><div><span>Request date</span><b>'+dateLabel(x.requestDate)+'</b></div><div><span>Required by</span><b>'+dateLabel(x.requiredDate)+'</b></div><div><span>Requested by</span><b>'+esc(x.requestedBy||'—')+'</b></div><div><span>Category</span><b>'+esc(x.category||'Other purchase')+'</b></div><div><span>Project</span><b>'+esc(x.project||'Unassigned')+'</b></div><div><span>Cost centre</span><b>'+esc(x.costCentre||'Unassigned')+'</b></div></div>'+
      '<section class="record-section"><div class="record-section-head"><b>Purchase lines</b><span>'+lines.length+' item'+(lines.length===1?'':'s')+'</span></div><div class="record-lines">'+lineRows+'</div></section>'+
      '<section class="record-section"><div class="record-section-head"><b>Activity</b><span>'+timeline.length+' event'+(timeline.length===1?'':'s')+'</span></div><div class="record-timeline">'+timeline.map(t=>'<div><i></i><span><b>'+esc(t.label)+'</b><small>'+esc(t.at?String(t.at).slice(0,10):'')+(t.by?' · '+esc(t.by):'')+'</small></span></div>').join('')+'</div></section>'+
      '<div class="record-drawer-actions"><button class="secondary" data-action="purchase-pdf:'+x.id+'">'+icon('download',13)+' PO PDF</button>'+(x.receivedAt?'<button class="secondary" data-action="purchase-grn:'+x.id+'">GRN</button>':'')+(x.status==='Received'&&!x.linkedBillId?'<button class="primary" data-action="purchase-to-bill:'+x.id+'">Create bill</button>':'')+'</div>'+
    '</aside></div>';
  }
  function purchasesPanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,m=purchaseMetrics(state),rows=(state.purchaseOrders||[]).slice().sort((a,b)=>String(b.requestDate||b.createdAt||'').localeCompare(String(a.requestDate||a.createdAt||'')));
    const table=rows.length?rows.map(x=>{
      const s=supplierById(state,x.supplierId);
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(x.poNumber||x.id)+'</b><small>'+esc(x.description||'Purchase order')+((x.lineItems||[]).length?' · '+(x.lineItems||[]).length+' line item'+((x.lineItems||[]).length===1?'':'s'):'')+'</small></div></td>'+
        '<td>'+esc(s?.name||x.supplierName||'Supplier not assigned')+'</td>'+
        '<td>'+esc(x.category||'Other purchase')+'</td>'+
        '<td class="payment-amount">'+money2(x.amount)+'</td>'+
        '<td><div class="bill-date"><b>'+dateLabel(x.requiredDate)+'</b><small>Requested '+dateLabel(x.requestDate)+'</small></div></td>'+
        '<td>'+pill(x.status||'Draft',statusClass(x.status||'Draft'))+'</td>'+
        '<td><div class="payment-status-actions">'+purchaseAction(x)+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No purchase orders yet. Create a PO to track requested purchases before supplier billing and payment.</div></td></tr>';
    return '<div class="expense-summary">'+
      '<div class="surface"><span>Open purchase orders</span><b>'+m.open+'</b><small>'+m.count+' total POs</small></div>'+
      '<div class="surface"><span>Open commitment</span><b>'+money2(m.openValue)+'</b><small>estimated value of open POs</small></div>'+
      '<div class="surface"><span>Awaiting approval</span><b>'+money2(m.approval)+'</b><small>purchase requests pending</small></div>'+
      '<div class="surface"><span>Ordered</span><b>'+money2(m.ordered)+'</b><small>approved orders with suppliers</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('building',17)+'</span><div><b>Control purchases before they become bills</b><p>Create a purchase request, approve it, mark it ordered and confirm receipt. Supplier invoices can then be recorded in Bills & invoices.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Purchase order register</h3><p>Requests, approvals, supplier commitments and receiving status</p></div><div class="register-tools"><label class="register-search">'+icon('search',13)+'<input data-table-search="purchase-register" placeholder="Search purchase orders"></label><button class="primary" data-action="open-purchase">'+icon('plus',14)+' New purchase order</button></div></div>'+
      '<div class="table-scroll"><table data-register-table="purchase-register"><thead><tr><th>PO / DESCRIPTION</th><th>SUPPLIER</th><th>CATEGORY</th><th>AMOUNT</th><th>REQUIRED / REQUESTED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function render(state,h){
    const icon=h.icon,pageTitle=h.pageTitle,tab=state.expenseTab||'expenses';
    const action=tab==='expenses'?'<button class="primary" data-action="open-expense">'+icon('plus',14)+' Add expense</button>':'<button class="primary" data-action="open-purchase">'+icon('plus',14)+' New purchase order</button>';
    const guide=!(state.businessExpenses||[]).length&&!(state.purchaseOrders||[]).length?'<div class="first-use-card"><span>'+icon('building',16)+'</span><div><b>Record spending in the right place</b><p>Use Expenses for costs already incurred. Use Purchase Orders when you want approval and supplier control before the bill arrives.</p></div><button class="primary" data-action="open-purchase">Create purchase order</button></div>':'';
    return tabs(state)+pageTitle('SPEND MANAGEMENT','Expenses','Track business expenses, receipts, approvals and purchase orders before payment.',action)+guide+(tab==='purchases'?purchasesPanel(state,h):expensesPanel(state,h));
  }
  function expenseModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,suppliers=(state.paymentBeneficiaries||[]).filter(x=>(x.status||'Active')==='Active');
    const supplierOptions=['<option value="">No saved supplier / merchant</option>'].concat(suppliers.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' · '+esc(s.kind||'Supplier')+'</option>')).join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-expense"></div><form id="expense-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">BUSINESS EXPENSE</div><h2>Record expense</h2><p>Capture the cost, payment method and supporting receipt.</p></div><button type="button" class="close" data-action="close-expense">×</button></div>'+
      '<div class="form-grid">'+
        field('Saved supplier','<select name="supplierId">'+supplierOptions+'</select>')+
        field('Merchant / payee','<input name="merchant" placeholder="e.g. Stationery shop">')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>')+
        field('Expense date','<input name="expenseDate" type="date" value="'+todayIso()+'" required>')+
        field('Category','<select name="category">'+EXPENSE_CATEGORIES.map(x=>'<option>'+x+'</option>').join('')+'</select>')+
        field('Payment method','<select name="method">'+METHODS.map(x=>'<option>'+x+'</option>').join('')+'</select>')+
        field('VAT treatment',window.DalasiTax?.purchaseOptions?.(state)||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+
        field('VAT pricing',window.DalasiTax?.pricingOptions?.('inclusive')||'<select name="taxPricingMode"><option value="inclusive">VAT inclusive</option><option value="exclusive">VAT exclusive</option></select>')+
        field('Project',window.DalasiDimensions?.projectSelect?.(state,'project')||'<select name="project"><option value="">Unassigned</option></select>')+
        field('Cost centre',window.DalasiDimensions?.costCentreSelect?.(state,'costCentre')||'<select name="costCentre"><option value="">Unassigned</option></select>')+
        field('Pay from account',window.DalasiCashBank.accountSelect(state,'accountId','','Select cash / bank account'))+
        field('Reference','<input name="reference" placeholder="Receipt, transfer or internal reference">')+
        field('Receipt / evidence','<input name="receipt" type="file" accept="application/pdf,image/png,image/jpeg,image/webp">')+
      '</div>'+
      field('Description / business purpose','<input name="description" placeholder="What was this expense for?">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-expense">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save expense</button></div>'+
    '</form></div>';
  }
  function purchaseModal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,suppliers=(state.paymentBeneficiaries||[]).filter(x=>(x.status||'Active')==='Active');
    const supplierOptions=['<option value="">Supplier not yet selected</option>'].concat(suppliers.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+' · '+esc(s.kind||'Supplier')+'</option>')).join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-purchase"></div><form id="purchase-form" class="modal-box sales-document-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">PURCHASE ORDER</div><h2>Create purchase order</h2><p>Build an itemized purchase order. Product lines can be received directly into stock.</p></div><button type="button" class="close" data-action="close-purchase">×</button></div>'+
      '<div class="form-grid">'+
        field('Saved supplier','<select name="supplierId">'+supplierOptions+'</select>')+
        field('Supplier name if not saved','<input name="supplierName" placeholder="Optional supplier name">')+
        field('Category','<select name="category">'+PURCHASE_CATEGORIES.map(x=>'<option>'+x+'</option>').join('')+'</select>')+
        field('Request date','<input name="requestDate" type="date" value="'+todayIso()+'" required>')+
        field('Required by','<input name="requiredDate" type="date">')+
        field('Requested by','<input name="requestedBy" placeholder="Name or department">')+
        field('Internal reference','<input name="reference" placeholder="Project, department or request ref">')+
        field('VAT treatment',window.DalasiTax?.purchaseOptions?.(state)||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+
        field('VAT pricing',window.DalasiTax?.pricingOptions?.('inclusive')||'<select name="taxPricingMode"><option value="inclusive">VAT inclusive</option><option value="exclusive">VAT exclusive</option></select>')+
        field('Expense / asset account','<select name="postingAccount" required>'+(window.DalasiAccounting?.purchasePostingOptions?.(state,'Operating Expenses')||'<option value="Operating Expenses">6000 · Operating Expenses</option>')+'</select>')+
        field('Project',window.DalasiDimensions?.projectSelect?.(state,'project')||'<select name="project"><option value="">Unassigned</option></select>')+
        field('Cost centre',window.DalasiDimensions?.costCentreSelect?.(state,'costCentre')||'<select name="costCentre"><option value="">Unassigned</option></select>')+
      '</div>'+
      window.DalasiCatalog.lineItemsForm(state,state.purchasePrefillLines||[],'purchase')+
      field('Purchase description','<input name="description" placeholder="Optional summary of the purchase">')+
      field('Notes','<input name="notes" placeholder="Optional procurement note">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-purchase">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save purchase order</button></div>'+
    '</form></div>';
  }
  async function createExpense(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add expenses.');return;}
    const fd=new FormData(ev.target),selectedSupplierId=String(fd.get('supplierId')||''),typedMerchant=String(fd.get('merchant')||'').trim(),s=window.DalasiBusinessPayments?.resolveBeneficiaryForTransaction?.(state,{beneficiaryId:selectedSupplierId,name:typedMerchant})||supplierById(state,selectedSupplierId),supplierId=s?.id||selectedSupplierId,merchant=s?.name||typedMerchant||'',amount=Number(fd.get('amount')||0),expenseDate=String(fd.get('expenseDate')||'');
    if(!merchant||amount<=0||!expenseDate){ctx.toast('Merchant, amount and expense date are required.');return;}
    const expenseReference=String(fd.get('reference')||'').trim(),expenseReferenceKey=normRef(expenseReference);
    if(expenseReferenceKey&&(state.businessExpenses||[]).some(x=>normRef(x.reference)===expenseReferenceKey&&sameMoney(x.amount,amount)&&((supplierId&&x.supplierId===supplierId)||normParty(x.merchant)===normParty(merchant)))){ctx.toast('A matching expense with this reference is already recorded.');return;}
    if(window.DalasiMonthClose?.isClosed(state,expenseDate)){ctx.toast('That accounting period is closed. Reopen it before recording this expense.');return;}
    let receipt={name:'',data:''};try{receipt=await readAttachment(fd.get('receipt'));}catch(err){ctx.toast(err?.message||'Unable to attach receipt');return;}
    state.businessExpenses=state.businessExpenses||[];
    const id='EXP-'+Date.now().toString(36).toUpperCase(),expenseNo=nextNumber('EXP',state.businessExpenses,'expenseNo'),taxPricingMode=String(fd.get('taxPricingMode')||'inclusive'),tax=window.DalasiTax?.snapshot?.(state,amount,String(fd.get('taxCode')||window.DalasiTax?.defaultPurchaseCode?.(state)||'OUT'),'purchase',taxPricingMode)||{taxCode:'OUT',vatRate:0,taxGross:amount,taxNet:amount,vatAmount:0,vatRecoverable:false,taxableTurnover:false};
    state.businessExpenses.unshift({id,expenseNo,supplierId:supplierId||null,merchant,amount:Number(tax.taxGross)||amount,...tax,...(window.DalasiDimensions?.tag?.(fd)||{}),expenseDate,category:String(fd.get('category')||'Other expense'),method:String(fd.get('method')||'Other'),accountId:String(fd.get('accountId')||'')||null,reference:expenseReference,description:String(fd.get('description')||'').trim(),receiptName:receipt.name,receiptData:receipt.data,status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.expenseOpen=false;ctx.audit('expense.created',{expenseId:id,expenseNo,merchant,amount,category:String(fd.get('category')||'Other expense')});ctx.save();ctx.toast('Expense saved as draft');ctx.render();
  }
  function updateExpense(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update expenses.');return;}
    const x=expenseById(state,id);if(!x)return;
    const current=x.status||'Draft',allowed=current==='Draft'&&status==='Pending approval'||current==='Pending approval'&&status==='Approved'||current==='Approved'&&status==='Paid';
    if(current==='Paid'){ctx.toast('Paid expenses are locked. Use a reversal or correcting entry instead of changing the original expense.');return;}
    if(!allowed){ctx.toast('This expense status change is not allowed. Follow Draft → Pending approval → Approved → Paid.');return;}
    if(status==='Paid'&&(!x.accountId||!window.DalasiCashBank?.accountById?.(state,x.accountId))){ctx.toast('Choose a Cash, Bank or Mobile Money account before marking this expense paid.');return;}
    if(window.DalasiMonthClose?.isClosed(state,x.expenseDate||x.createdAt)){ctx.toast('This expense belongs to a closed accounting period. Reopen the period before changing it.');return;}x.status=status;x.updatedAt=new Date().toISOString();x.updatedBy=state.session?.name||'User';
    if(status==='Approved'){x.approvedAt=x.approvedAt||x.updatedAt;x.approvedBy=x.approvedBy||x.updatedBy}
    if(status==='Paid'){x.paidAt=x.paidAt||x.updatedAt;x.paidBy=x.paidBy||x.updatedBy;if(x.accountId)window.DalasiCashBank?.post(state,{accountId:x.accountId,date:(x.paidAt||x.expenseDate||new Date().toISOString()).slice(0,10),direction:'out',amount:x.amount,type:'Business expense',counterparty:x.merchant,reference:x.reference||x.expenseNo||'',description:x.description||x.category,sourceType:'expense',sourceId:x.id,sourceKey:'expense:'+x.id+':out',createdBy:state.session?.name||'User'});}
    ctx.audit('expense.status_updated',{expenseId:id,status,amount:x.amount,merchant:x.merchant});ctx.save();ctx.toast((x.expenseNo||x.id)+': '+status);ctx.render();
  }
  function createPurchase(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create purchase orders.');return;}
    const fd=new FormData(ev.target),selectedSupplierId=String(fd.get('supplierId')||''),typedSupplier=String(fd.get('supplierName')||'').trim(),s=window.DalasiBusinessPayments?.resolveBeneficiaryForTransaction?.(state,{beneficiaryId:selectedSupplierId,name:typedSupplier})||supplierById(state,selectedSupplierId),supplierId=s?.id||selectedSupplierId,supplierName=s?.name||typedSupplier||'',requestDate=String(fd.get('requestDate')||''),lines=window.DalasiCatalog.readLines(ev.target),totals=window.DalasiCatalog.lineTotals(lines),description=String(fd.get('description')||'').trim()||lines.map(x=>x.description).slice(0,2).join(', ');
    if(!requestDate||!lines.length||totals.total<=0){ctx.toast('Request date and at least one priced purchase line are required.');return;}
    state.purchaseOrders=state.purchaseOrders||[];
    const id='PO-'+Date.now().toString(36).toUpperCase(),poNumber=nextNumber('PO',state.purchaseOrders,'poNumber');
    state.purchaseOrders.unshift({...((window.DalasiDimensions?.tag?.(fd))||{}),id,poNumber,supplierId:supplierId||null,supplierName,lineItems:lines,subtotal:totals.subtotal,discountTotal:totals.discount,amount:totals.total,category:String(fd.get('category')||'Other purchase'),postingAccount:String(fd.get('postingAccount')||'Operating Expenses'),taxCode:String(fd.get('taxCode')||window.DalasiTax?.defaultPurchaseCode?.(state)||'OUT'),taxPricingMode:String(fd.get('taxPricingMode')||'inclusive'),requestDate,requiredDate:String(fd.get('requiredDate')||''),requestedBy:String(fd.get('requestedBy')||'').trim(),reference:String(fd.get('reference')||'').trim(),description,notes:String(fd.get('notes')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.purchaseOpen=false;state.purchasePrefillLines=[];ctx.audit('purchase.created',{purchaseId:id,poNumber,supplierId:supplierId||null,supplierName,amount:totals.total,lineCount:lines.length});ctx.save();ctx.toast(poNumber+' saved as draft');ctx.render();
  }
  function receivePurchaseInventory(x,state,ctx){
    if(x.inventoryReceivedAt)return;
    const lines=x.lineItems||[],groups=new Map();
    lines.forEach(line=>{
      const item=line.catalogId?window.DalasiCatalog?.itemById(state,line.catalogId):null;
      if(item?.type!=='Product')return;
      const g=groups.get(item.id)||{item,qty:0,totalCost:0};
      const qty=Math.max(0,Number(line.quantity)||0),rawLine=Math.max(0,qty*(Number(line.unitPrice)||0));
      const tax=window.DalasiTax?.snapshot?.(state,rawLine,x.taxCode||'OUT','purchase',x.taxPricingMode||'inclusive')||{taxNet:rawLine,vatRecoverable:false};
      const accountingCost=tax.vatRecoverable?Number(tax.taxNet)||0:rawLine;
      g.qty+=qty;g.totalCost+=accountingCost;groups.set(item.id,g);
    });
    if(!groups.size){x.inventoryReceivedAt=new Date().toISOString();return;}
    state.inventoryMovements=state.inventoryMovements||[];const now=new Date().toISOString();
    [...groups.values()].forEach((g,i)=>{
      const before=Math.max(0,Number(g.item.stockOnHand)||0),oldCost=Math.max(0,Number(g.item.costPrice)||0),after=before+g.qty;
      const incomingUnitCost=g.qty?g.totalCost/g.qty:oldCost,costAmount=Math.round(g.qty*incomingUnitCost*100)/100;
      if((window.DalasiInventory?.method?.(g.item)||'Weighted Average')!=='FIFO'){
        const weighted=after?((before*oldCost)+(g.qty*incomingUnitCost))/after:incomingUnitCost;g.item.costPrice=Math.round(weighted*100)/100;
      }
      g.item.stockOnHand=Math.round(after*100)/100;g.item.updatedAt=now;g.item.updatedBy=state.session?.name||'User';
      state.inventoryMovements.unshift({id:'MOV-'+Date.now().toString(36).toUpperCase()+'-P'+String(i+1),catalogId:g.item.id,type:'Purchase receipt',quantity:g.qty,balanceBefore:before,balanceAfter:g.item.stockOnHand,unitCost:Math.round(incomingUnitCost*100)/100,costAmount,movementDate:now.slice(0,10),reference:x.poNumber||x.id,note:'Received from purchase order',createdAt:now,createdBy:state.session?.name||'User'});
    });
    x.inventoryReceivedAt=now;x.inventoryReceivedBy=state.session?.name||'User';
    ctx.audit('inventory.purchase_received',{purchaseId:x.id,poNumber:x.poNumber,productCount:groups.size});
  }
  function updatePurchase(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update purchase orders.');return;}
    const x=purchaseById(state,id);if(!x)return;
    const current=x.status||'Draft',allowed=current==='Draft'&&status==='Pending approval'||current==='Pending approval'&&status==='Approved'||current==='Approved'&&status==='Ordered'||current==='Ordered'&&status==='Received'||current==='Received'&&status==='Closed';
    if(['Closed','Cancelled'].includes(current)){ctx.toast('Closed purchase orders are locked. Create a new purchase order or adjustment instead.');return;}
    if(!allowed){ctx.toast('This purchase order status change is not allowed. Follow the normal approval and receiving sequence.');return;}
    if(status==='Received'&&window.DalasiMonthClose?.isClosed(state,new Date().toISOString().slice(0,10))){ctx.toast('The current accounting period is closed. Reopen it before receiving inventory.');return;}
    if(status==='Received'&&!x.inventoryReceivedAt)receivePurchaseInventory(x,state,ctx);
    x.status=status;x.updatedAt=new Date().toISOString();x.updatedBy=state.session?.name||'User';
    if(status==='Approved'){x.approvedAt=x.approvedAt||x.updatedAt;x.approvedBy=x.approvedBy||x.updatedBy}
    if(status==='Ordered')x.orderedAt=x.orderedAt||x.updatedAt;
    if(status==='Received')x.receivedAt=x.receivedAt||x.updatedAt;
    if(status==='Closed')x.closedAt=x.closedAt||x.updatedAt;
    ctx.audit('purchase.status_updated',{purchaseId:id,poNumber:x.poNumber,status,amount:x.amount,inventoryReceived:!!x.inventoryReceivedAt});ctx.save();ctx.toast((x.poNumber||x.id)+': '+status);ctx.render();
  }

  function purchasePdf(id,state,ctx){
    const x=purchaseById(state,id);if(!x){ctx.toast('Purchase order not found.');return;}
    const s=supplierById(state,x.supplierId),supplierName=s?.name||x.supplierName||'Supplier',lines=x.lineItems||[],out=[];
    const safe=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const text=(x,y,z,v,b=false,col='0.08 0.13 0.11')=>out.push(col+' rg BT /'+(b?'F2':'F1')+' '+z+' Tf '+x+' '+y+' Td ('+safe(v)+') Tj ET');
    const fill=(x,y,w,h,col)=>out.push(col+' rg '+x+' '+y+' '+w+' '+h+' re f'),stroke=(a,b,c,d,col='0.84 0.88 0.86',w=.6)=>out.push(col+' RG '+w+' w '+a+' '+b+' m '+c+' '+d+' l S');
    const green='0.04 0.31 0.26',white='1 1 1',muted='0.38 0.44 0.41',soft='0.96 0.98 0.97',money=v=>ctx.money2(Number(v)||0),clip=(v,m=40)=>String(v??'').length>m?String(v).slice(0,m-3)+'...':String(v??'');
    fill(0,0,595,842,white);fill(24,746,547,72,green);text(42,790,18,clip(state.company,30),true,white);text(42,769,8,'PURCHASE ORDER',true,'0.75 0.91 0.86');text(410,790,16,x.poNumber||x.id,true,white);text(410,770,8,x.status||'Draft',true,'0.75 0.91 0.86');
    fill(24,664,547,62,soft);text(40,706,7,'SUPPLIER',true,muted);text(40,684,12,clip(supplierName,38),true);text(360,706,7,'REQUEST DATE',true,muted);text(360,684,9,x.requestDate||'—',true);text(462,706,7,'REQUIRED BY',true,muted);text(462,684,9,x.requiredDate||'—',true);
    text(40,640,7,'DESCRIPTION',true,muted);text(40,621,10,clip(x.description||'Purchase order',75),true);
    let y=586;text(40,y,7,'ITEM / DESCRIPTION',true,muted);text(330,y,7,'QTY',true,muted);text(390,y,7,'UNIT PRICE',true,muted);text(490,y,7,'AMOUNT',true,muted);stroke(40,y-9,555,y-9);
    y-=29;lines.slice(0,12).forEach((l,i)=>{text(40,y,8,clip(l.description||'Item',43),i===0);text(330,y,8,String(Number(l.quantity)||0));text(390,y,8,money(l.unitPrice));text(490,y,8,money((Number(l.quantity)||0)*(Number(l.unitPrice)||0)),true);stroke(40,y-9,555,y-9,'0.93 0.95 0.94',.35);y-=25;});
    if(lines.length>12)text(40,y,7,'+'+(lines.length-12)+' additional line items',true,muted);
    fill(360,146,195,74,green);text(378,197,7,'TOTAL PURCHASE ORDER',true,'0.75 0.91 0.86');text(378,168,18,money(x.amount),true,white);
    text(40,197,7,'REQUESTED BY',true,muted);text(40,179,9,clip(x.requestedBy||x.createdBy||'—',34),true);text(40,151,7,'REFERENCE',true,muted);text(40,133,9,clip(x.reference||'—',34));
    text(24,72,7.2,'This purchase order records an approved purchasing commitment and is not a supplier invoice.',false,muted);text(430,50,7.2,'Generated by DalasiPay',true,green);
    ctx.pdfDownload('Purchase_Order_'+String(x.poNumber||x.id).replace(/[^A-Za-z0-9_-]+/g,'_')+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Purchase order PDF downloaded');
  }
  function purchaseGrn(id,state,ctx){
    const x=purchaseById(state,id);if(!x||!x.receivedAt){ctx.toast('This purchase order has not been received yet.');return}
    const s=supplierById(state,x.supplierId),supplierName=s?.name||x.supplierName||'Supplier',lines=x.lineItems||[],out=[];
    const safe=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const text=(x,y,z,v,b=false,col='0.08 0.13 0.11')=>out.push(col+' rg BT /'+(b?'F2':'F1')+' '+z+' Tf '+x+' '+y+' Td ('+safe(v)+') Tj ET');
    const fill=(x,y,w,h,col)=>out.push(col+' rg '+x+' '+y+' '+w+' '+h+' re f'),stroke=(a,b,c,d,col='0.84 0.88 0.86',w=.6)=>out.push(col+' RG '+w+' w '+a+' '+b+' m '+c+' '+d+' l S');
    const green='0.04 0.31 0.26',white='1 1 1',muted='0.38 0.44 0.41',soft='0.96 0.98 0.97',clip=(v,m=45)=>String(v??'').length>m?String(v).slice(0,m-3)+'...':String(v??'');
    fill(0,0,595,842,white);fill(24,746,547,72,green);text(42,790,18,state.company,true,white);text(42,769,8,'GOODS RECEIVED NOTE',true,'0.75 0.91 0.86');text(410,790,15,'GRN',true,white);text(410,770,8,x.poNumber||x.id,true,'0.75 0.91 0.86');
    fill(24,664,547,62,soft);text(40,706,7,'SUPPLIER',true,muted);text(40,684,12,clip(supplierName,38),true);text(360,706,7,'RECEIVED DATE',true,muted);text(360,684,9,String(x.receivedAt).slice(0,10),true);text(462,706,7,'PO NUMBER',true,muted);text(462,684,9,x.poNumber||x.id,true);
    let y=625;text(40,y,7,'ITEM / DESCRIPTION',true,muted);text(410,y,7,'QUANTITY RECEIVED',true,muted);stroke(40,y-9,555,y-9);y-=31;
    lines.slice(0,15).forEach((l,i)=>{text(40,y,8,clip(l.description||'Item',52),i===0);text(430,y,8,String(Number(l.quantity)||0),true);stroke(40,y-9,555,y-9,'0.93 0.95 0.94',.35);y-=25;});
    text(40,154,7,'RECEIVED BY',true,muted);text(40,136,9,clip(x.inventoryReceivedBy||x.updatedBy||'Workspace user',35),true);text(300,154,7,'RECEIPT STATUS',true,muted);text(300,136,9,'Received in full',true);
    text(24,72,7.2,'This document confirms receipt against the referenced purchase order. Inventory-linked product lines have been posted to stock.',false,muted);text(430,50,7.2,'Generated by DalasiPay',true,green);
    ctx.pdfDownload('Goods_Received_Note_'+String(x.poNumber||x.id).replace(/[^A-Za-z0-9_-]+/g,'_')+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Goods Received Note downloaded');
  }
  function sendPurchase(id,state,ctx){
    const x=purchaseById(state,id);if(!x)return;const s=supplierById(state,x.supplierId),email=s?.email||'',phone=s?.phone||'',name=s?.name||x.supplierName||'Supplier',subject='Purchase order '+(x.poNumber||x.id),body='Dear '+name+',\n\nPlease find our purchase order '+(x.poNumber||x.id)+' for '+ctx.money2(x.amount)+'.\nRequired by: '+(x.requiredDate||'Please confirm availability')+'.\n\nPlease confirm receipt and expected delivery date.\n\nRegards,\n'+(state.company||'DalasiPay Workspace');
    if(email){window.location.href='mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);ctx.audit('purchase.email_opened',{purchaseId:x.id,poNumber:x.poNumber});ctx.save();return}
    if(phone){const p=String(phone).replace(/[^0-9]/g,'');window.open('https://wa.me/'+p+'?text='+encodeURIComponent(body),'_blank','noopener');ctx.audit('purchase.whatsapp_opened',{purchaseId:x.id,poNumber:x.poNumber});ctx.save();return}
    ctx.toast('Add an email or phone number to the saved supplier before sending the PO.');
  }
  function purchaseBillModal(state,h){
    const x=purchaseById(state,state.purchaseBillId);if(!x)return '';const s=supplierById(state,x.supplierId),field=h.field,icon=h.icon;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-purchase-bill"></div><form id="purchase-bill-form" class="modal-box"><div class="modal-head"><div><div class="eyebrow">PO TO SUPPLIER BILL</div><h2>Record supplier invoice</h2><p>'+esc(x.poNumber||x.id)+' · '+esc(s?.name||x.supplierName||'Supplier')+' · '+h.money2(x.amount)+'</p></div><button type="button" class="close" data-action="close-purchase-bill">×</button></div><input type="hidden" name="purchaseId" value="'+esc(x.id)+'"><div class="form-grid">'+field('Supplier invoice number','<input name="invoiceNo" required placeholder="e.g. INV-1042">')+field('Invoice date','<input name="invoiceDate" type="date" value="'+todayIso()+'" required>')+field('Due date','<input name="dueDate" type="date" required>')+field('VAT treatment',window.DalasiTax?.purchaseOptions?.(state,x.taxCode||window.DalasiTax?.defaultPurchaseCode?.(state)||'OUT')||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+field('VAT pricing',window.DalasiTax?.pricingOptions?.(x.taxPricingMode||'inclusive')||'<select name="taxPricingMode"><option value="inclusive">VAT inclusive</option><option value="exclusive">VAT exclusive</option></select>')+field('Expense / asset account','<select name="postingAccount" required>'+(window.DalasiAccounting?.purchasePostingOptions?.(state,x.postingAccount||'Operating Expenses')||'<option value="Operating Expenses">6000 · Operating Expenses</option>')+'</select>')+'</div>'+field('Description','<input name="description" value="'+esc(x.description||'Purchase order '+(x.poNumber||''))+'">')+'<div class="modal-note">This creates one supplier bill linked to the purchase order. DalasiPay prevents a second bill from being created from the same PO.</div><div class="modal-actions"><button type="button" class="secondary" data-action="close-purchase-bill">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Create supplier bill</button></div></form></div>';
  }
  function createBillFromPurchase(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required.');return}
    const fd=new FormData(ev.target),x=purchaseById(state,String(fd.get('purchaseId')||''));if(!x)return;if(x.linkedBillId||(state.businessBills||[]).some(b=>b.purchaseOrderId===x.id)){ctx.toast('A supplier bill is already linked to this purchase order.');return}
    if(x.status!=='Received'&&x.status!=='Closed'){ctx.toast('Receive the purchase order before creating the supplier bill.');return}
    const invoiceNo=String(fd.get('invoiceNo')||'').trim(),invoiceDate=String(fd.get('invoiceDate')||''),dueDate=String(fd.get('dueDate')||'');if(!invoiceNo||!invoiceDate||!dueDate){ctx.toast('Invoice number, invoice date and due date are required.');return}
    if(window.DalasiMonthClose?.isClosed(state,invoiceDate)){ctx.toast('That accounting period is closed.');return}
    const s=supplierById(state,x.supplierId),supplierName=s?.name||x.supplierName||'Supplier';
    if((state.businessBills||[]).some(b=>normRef(b.invoiceNo)===normRef(invoiceNo)&&((x.supplierId&&b.beneficiaryId===x.supplierId)||normParty(b.supplier)===normParty(supplierName)))){ctx.toast('That supplier invoice is already recorded.');return}
    const taxPricingMode=String(fd.get('taxPricingMode')||'inclusive'),tax=window.DalasiTax?.snapshot?.(state,x.amount,String(fd.get('taxCode')||window.DalasiTax?.defaultPurchaseCode?.(state)||'OUT'),'purchase',taxPricingMode)||{taxCode:'OUT',vatRate:0,taxGross:x.amount,taxNet:x.amount,vatAmount:0,vatRecoverable:false,taxableTurnover:false},id='BILL-'+Date.now().toString(36).toUpperCase();
    state.businessBills=state.businessBills||[];state.businessBills.unshift({id,purchaseOrderId:x.id,beneficiaryId:x.supplierId||null,supplier:supplierName,invoiceNo,subtotal:Number(x.subtotal)||((Number(x.amount)||0)+(Number(x.discountTotal)||0)),discountTotal:Number(x.discountTotal)||0,amount:Number(tax.taxGross)||Number(x.amount)||0,...tax,postingAccount:String(fd.get('postingAccount')||x.postingAccount||'Operating Expenses'),project:x.project||'',costCentre:x.costCentre||'',invoiceDate,dueDate,category:x.category||'Other expense',description:String(fd.get('description')||'').trim(),attachmentName:'',attachmentData:'',status:'Draft',paymentId:null,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    x.linkedBillId=id;x.linkedInvoiceNo=invoiceNo;x.updatedAt=new Date().toISOString();state.purchaseBillId=null;ctx.audit('purchase.converted_to_bill',{purchaseId:x.id,poNumber:x.poNumber,billId:id,invoiceNo,amount:x.amount});ctx.save();ctx.toast('Supplier bill '+invoiceNo+' created from '+(x.poNumber||x.id));ctx.render();
  }
  function expenseRows(state){return state.businessExpenses||[]}
  function purchaseRows(state){return state.purchaseOrders||[]}

  window.DalasiExpensesPurchases={render,tabs,expenseModal,purchaseModal,createExpense,updateExpense,createPurchase,receivePurchaseInventory,updatePurchase,expenseMetrics,purchaseMetrics,expenseRows,purchaseRows,expenseById,purchaseById,purchasePdf,purchaseGrn,sendPurchase,purchaseBillModal,purchaseDetailModal,createBillFromPurchase};
})();