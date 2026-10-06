(function(){
  'use strict';

  const EXPENSE_CATEGORIES=['Office & administration','Travel & transport','Utilities','Rent & facilities','Marketing & sales','Professional services','Repairs & maintenance','Supplies & inventory','Meals & hospitality','Staff welfare','Government & statutory','Other expense'];
  const METHODS=['Bank transfer','Mobile money','Cash','Cheque','Card','Other'];
  const PURCHASE_CATEGORIES=['Supplies & inventory','Equipment / assets','Professional services','Repairs & maintenance','Office & administration','Travel & logistics','Marketing & sales','Other purchase'];

  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function dateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function supplierById(state,id){return window.DalasiBusinessPayments?.beneficiaryById(state,id)||null;}
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
  function purchaseAction(x){
    if(x.status==='Draft')return '<button class="secondary" data-action="purchase-status:'+x.id+':Pending approval">Submit</button>';
    if(x.status==='Pending approval')return '<button class="secondary" data-action="purchase-status:'+x.id+':Approved">Approve</button>';
    if(x.status==='Approved')return '<button class="primary" data-action="purchase-status:'+x.id+':Ordered">Mark ordered</button>';
    if(x.status==='Ordered')return '<button class="primary" data-action="purchase-status:'+x.id+':Received">Mark received</button>';
    if(x.status==='Received')return '<button class="secondary" data-action="purchase-status:'+x.id+':Closed">Close PO</button>';
    return '<span class="payment-complete">'+(x.status||'Closed')+'</span>';
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
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Expense register</h3><p>Business costs, receipts, payment methods and approval status</p></div><button class="primary" data-action="open-expense">'+icon('plus',14)+' Add expense</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>MERCHANT / REF</th><th>CATEGORY</th><th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>RECEIPT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
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
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Purchase order register</h3><p>Requests, approvals, supplier commitments and receiving status</p></div><button class="primary" data-action="open-purchase">'+icon('plus',14)+' New purchase order</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>PO / DESCRIPTION</th><th>SUPPLIER</th><th>CATEGORY</th><th>AMOUNT</th><th>REQUIRED / REQUESTED</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function render(state,h){
    const icon=h.icon,pageTitle=h.pageTitle,tab=state.expenseTab||'expenses';
    const action=tab==='expenses'?'<button class="primary" data-action="open-expense">'+icon('plus',14)+' Add expense</button>':'<button class="primary" data-action="open-purchase">'+icon('plus',14)+' New purchase order</button>';
    return tabs(state)+pageTitle('SPEND MANAGEMENT','Expenses','Track business expenses, receipts, approvals and purchase orders before payment.',action)+(tab==='purchases'?purchasesPanel(state,h):expensesPanel(state,h));
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
      '</div>'+
      window.DalasiCatalog.lineItemsForm(state,[],'purchase')+
      field('Purchase description','<input name="description" placeholder="Optional summary of the purchase">')+
      field('Notes','<input name="notes" placeholder="Optional procurement note">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-purchase">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save purchase order</button></div>'+
    '</form></div>';
  }
  async function createExpense(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add expenses.');return;}
    const fd=new FormData(ev.target),supplierId=String(fd.get('supplierId')||''),s=supplierById(state,supplierId),merchant=String(fd.get('merchant')||'').trim()||s?.name||'',amount=Number(fd.get('amount')||0),expenseDate=String(fd.get('expenseDate')||'');
    if(!merchant||amount<=0||!expenseDate){ctx.toast('Merchant, amount and expense date are required.');return;}
    let receipt={name:'',data:''};try{receipt=await readAttachment(fd.get('receipt'));}catch(err){ctx.toast(err?.message||'Unable to attach receipt');return;}
    state.businessExpenses=state.businessExpenses||[];
    const id='EXP-'+Date.now().toString(36).toUpperCase(),expenseNo=nextNumber('EXP',state.businessExpenses,'expenseNo');
    state.businessExpenses.unshift({id,expenseNo,supplierId:supplierId||null,merchant,amount,expenseDate,category:String(fd.get('category')||'Other expense'),method:String(fd.get('method')||'Other'),reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),receiptName:receipt.name,receiptData:receipt.data,status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.expenseOpen=false;ctx.audit('expense.created',{expenseId:id,expenseNo,merchant,amount,category:String(fd.get('category')||'Other expense')});ctx.save();ctx.toast('Expense saved as draft');ctx.render();
  }
  function updateExpense(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update expenses.');return;}
    const x=expenseById(state,id);if(!x)return;x.status=status;x.updatedAt=new Date().toISOString();x.updatedBy=state.session?.name||'User';
    if(status==='Approved'){x.approvedAt=x.approvedAt||x.updatedAt;x.approvedBy=x.approvedBy||x.updatedBy}
    if(status==='Paid'){x.paidAt=x.paidAt||x.updatedAt;x.paidBy=x.paidBy||x.updatedBy}
    ctx.audit('expense.status_updated',{expenseId:id,status,amount:x.amount,merchant:x.merchant});ctx.save();ctx.toast((x.expenseNo||x.id)+': '+status);ctx.render();
  }
  function createPurchase(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create purchase orders.');return;}
    const fd=new FormData(ev.target),supplierId=String(fd.get('supplierId')||''),s=supplierById(state,supplierId),supplierName=String(fd.get('supplierName')||'').trim()||s?.name||'',requestDate=String(fd.get('requestDate')||''),lines=window.DalasiCatalog.readLines(ev.target),totals=window.DalasiCatalog.lineTotals(lines),description=String(fd.get('description')||'').trim()||lines.map(x=>x.description).slice(0,2).join(', ');
    if(!requestDate||!lines.length||totals.total<=0){ctx.toast('Request date and at least one priced purchase line are required.');return;}
    state.purchaseOrders=state.purchaseOrders||[];
    const id='PO-'+Date.now().toString(36).toUpperCase(),poNumber=nextNumber('PO',state.purchaseOrders,'poNumber');
    state.purchaseOrders.unshift({id,poNumber,supplierId:supplierId||null,supplierName,lineItems:lines,subtotal:totals.subtotal,discountTotal:totals.discount,amount:totals.total,category:String(fd.get('category')||'Other purchase'),requestDate,requiredDate:String(fd.get('requiredDate')||''),requestedBy:String(fd.get('requestedBy')||'').trim(),reference:String(fd.get('reference')||'').trim(),description,notes:String(fd.get('notes')||'').trim(),status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
    state.purchaseOpen=false;ctx.audit('purchase.created',{purchaseId:id,poNumber,supplierId:supplierId||null,supplierName,amount:totals.total,lineCount:lines.length});ctx.save();ctx.toast(poNumber+' saved as draft');ctx.render();
  }
  function receivePurchaseInventory(x,state,ctx){
    if(x.inventoryReceivedAt)return;
    const lines=x.lineItems||[],groups=new Map();
    lines.forEach(line=>{
      const item=line.catalogId?window.DalasiCatalog?.itemById(state,line.catalogId):null;
      if(item?.type!=='Product')return;
      const g=groups.get(item.id)||{item,qty:0,totalCost:0};
      const qty=Math.max(0,Number(line.quantity)||0),unitCost=Math.max(0,Number(line.unitPrice)||0);
      g.qty+=qty;g.totalCost+=qty*unitCost;groups.set(item.id,g);
    });
    if(!groups.size){x.inventoryReceivedAt=new Date().toISOString();return;}
    state.inventoryMovements=state.inventoryMovements||[];const now=new Date().toISOString();
    [...groups.values()].forEach((g,i)=>{
      const before=Math.max(0,Number(g.item.stockOnHand)||0),oldCost=Math.max(0,Number(g.item.costPrice)||0),after=before+g.qty;
      const incomingUnitCost=g.qty?g.totalCost/g.qty:oldCost;
      const weighted=after?((before*oldCost)+(g.qty*incomingUnitCost))/after:incomingUnitCost;
      g.item.stockOnHand=Math.round(after*100)/100;g.item.costPrice=Math.round(weighted*100)/100;g.item.updatedAt=now;g.item.updatedBy=state.session?.name||'User';
      state.inventoryMovements.unshift({id:'MOV-'+Date.now().toString(36).toUpperCase()+'-P'+String(i+1),catalogId:g.item.id,type:'Purchase receipt',quantity:g.qty,balanceBefore:before,balanceAfter:g.item.stockOnHand,unitCost:Math.round(incomingUnitCost*100)/100,reference:x.poNumber||x.id,note:'Received from purchase order',createdAt:now,createdBy:state.session?.name||'User'});
    });
    x.inventoryReceivedAt=now;x.inventoryReceivedBy=state.session?.name||'User';
    ctx.audit('inventory.purchase_received',{purchaseId:x.id,poNumber:x.poNumber,productCount:groups.size});
  }
  function updatePurchase(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update purchase orders.');return;}
    const x=purchaseById(state,id);if(!x)return;
    if(status==='Received'&&!x.inventoryReceivedAt)receivePurchaseInventory(x,state,ctx);
    x.status=status;x.updatedAt=new Date().toISOString();x.updatedBy=state.session?.name||'User';
    if(status==='Approved'){x.approvedAt=x.approvedAt||x.updatedAt;x.approvedBy=x.approvedBy||x.updatedBy}
    if(status==='Ordered')x.orderedAt=x.orderedAt||x.updatedAt;
    if(status==='Received')x.receivedAt=x.receivedAt||x.updatedAt;
    if(status==='Closed')x.closedAt=x.closedAt||x.updatedAt;
    ctx.audit('purchase.status_updated',{purchaseId:id,poNumber:x.poNumber,status,amount:x.amount,inventoryReceived:!!x.inventoryReceivedAt});ctx.save();ctx.toast((x.poNumber||x.id)+': '+status);ctx.render();
  }
  function expenseRows(state){return state.businessExpenses||[]}
  function purchaseRows(state){return state.purchaseOrders||[]}

  window.DalasiExpensesPurchases={render,tabs,expenseModal,purchaseModal,createExpense,updateExpense,createPurchase,receivePurchaseInventory,updatePurchase,expenseMetrics,purchaseMetrics,expenseRows,purchaseRows,expenseById,purchaseById};
})();