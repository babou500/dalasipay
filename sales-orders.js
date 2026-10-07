(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const today=()=>new Date().toISOString().slice(0,10);
const addDays=(d,n)=>{const x=new Date((d||today())+'T12:00:00');x.setDate(x.getDate()+(Number(n)||0));return x.toISOString().slice(0,10)};
const dateLabel=v=>{if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}catch{return v}};
function deliveryMeta(o){
 const d=o.requestedDeliveryDate;if(!d||['Invoiced','Cancelled'].includes(o.status||''))return {label:d?dateLabel(d):'Not set',tone:'neutral',note:o.status==='Invoiced'?'Order invoiced':o.status==='Cancelled'?'Order cancelled':'Delivery date not set'};
 const now=today(),days=Math.ceil((new Date(d+'T12:00:00')-new Date(now+'T12:00:00'))/86400000);
 if(days<0)return {label:dateLabel(d),tone:'late',note:Math.abs(days)+' day'+(Math.abs(days)===1?'':'s')+' overdue'};
 if(days===0)return {label:dateLabel(d),tone:'today',note:'Due today'};
 if(days<=3)return {label:dateLabel(d),tone:'soon',note:'Due in '+days+' day'+(days===1?'':'s')};
 return {label:dateLabel(d),tone:'neutral',note:'Due in '+days+' days'};
}
function journey(o){
 const s=o.status||'Draft',rank=s==='Draft'?0:s==='Confirmed'?1:s==='Ready'?2:s==='Invoiced'?3:-1;
 const steps=[['Order','Draft'],['Confirmed','Confirmed'],['Ready','Ready'],['Invoice','Invoiced']];
 return '<div class="order-journey" aria-label="Sales order progress">'+steps.map((x,i)=>'<span class="'+(rank>i?'done':rank===i?'current':'')+'"><i></i>'+x[0]+'</span>').join('')+'</div>';
}
function customer(state,id){return (state.customers||[]).find(x=>x.id===id)||null}
function byId(state,id){return (state.salesOrders||[]).find(x=>x.id===id)||null}
function quoteById(state,id){return (state.salesQuotes||[]).find(x=>x.id===id)||null}
function nextNumber(state){const y=new Date().getFullYear(),prefix='SO-'+y+'-';let max=0;(state.salesOrders||[]).forEach(x=>{const v=String(x.orderNo||'');if(v.startsWith(prefix)){const n=Number(v.slice(prefix.length));if(n>max)max=n}});return prefix+String(max+1).padStart(5,'0')}
function metrics(state){const rows=state.salesOrders||[],sum=xs=>xs.reduce((a,x)=>a+(Number(x.amount)||0),0),open=rows.filter(x=>!['Invoiced','Cancelled'].includes(x.status||'Draft'));return{count:rows.length,open:open.length,openValue:sum(open),confirmed:rows.filter(x=>x.status==='Confirmed').length,ready:rows.filter(x=>x.status==='Ready').length,invoiced:rows.filter(x=>x.status==='Invoiced').length}}
function createFromQuote(id,state,ctx){
 if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create sales orders.');return}
 const q=quoteById(state,id);if(!q)return;if(q.status!=='Accepted'){ctx.toast('Accept the quotation before creating a sales order.');return}
 if(q.salesOrderId||(state.salesOrders||[]).some(x=>x.quoteId===q.id)){ctx.toast('A sales order already exists for this quotation.');return}
 const saved=q.customerId?customer(state,q.customerId):null;if(saved?.creditStatus==='Hold'){ctx.toast(saved.name+' is on credit hold. Release the hold before creating an order.');return}
 state.salesOrders=state.salesOrders||[];const oid='SO-'+Date.now().toString(36).toUpperCase(),orderNo=nextNumber(state),now=new Date().toISOString();
 const rec={id:oid,orderNo,quoteId:q.id,quoteNo:q.quoteNo||'',customerId:q.customerId||null,customerName:q.customerName,customerEmail:q.customerEmail||saved?.email||'',customerPhone:q.customerPhone||saved?.phone||'',lineItems:(q.lineItems||[]).map(x=>({...x})),subtotal:Number(q.subtotal??q.amount)||0,discountTotal:Number(q.discountTotal)||0,amount:Number(q.amount)||0,taxCode:q.taxCode||'OUT',project:q.project||'',costCentre:q.costCentre||'',orderDate:today(),requestedDeliveryDate:addDays(today(),7),termDays:Number(q.termDays)||30,reference:q.reference||q.quoteNo||'',description:q.description||'',notes:q.notes||'',status:'Draft',createdAt:now,createdBy:state.session?.name||'User',updatedAt:now};
 state.salesOrders.unshift(rec);q.salesOrderId=oid;q.salesOrderNo=orderNo;q.updatedAt=now;ctx.audit('sales_order.created_from_quote',{salesOrderId:oid,orderNo,quoteId:q.id,quoteNo:q.quoteNo,amount:rec.amount});ctx.save();ctx.toast(orderNo+' created from '+(q.quoteNo||'quotation'));state.salesTab='orders';ctx.render();
}
function update(id,status,state,ctx){
 if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update sales orders.');return}
 const o=byId(state,id);if(!o||o.status==='Invoiced')return;
 if(status==='Confirmed'){const c=o.customerId?customer(state,o.customerId):null;if(c?.creditStatus==='Hold'){ctx.toast(c.name+' is on credit hold.');return}o.confirmedAt=o.confirmedAt||new Date().toISOString()}
 if(status==='Ready')o.readyAt=o.readyAt||new Date().toISOString();
 if(status==='Cancelled')o.cancelledAt=new Date().toISOString();
 o.status=status;o.updatedAt=new Date().toISOString();o.updatedBy=state.session?.name||'User';ctx.audit('sales_order.status_updated',{salesOrderId:id,orderNo:o.orderNo,status});ctx.save();ctx.toast(o.orderNo+': '+status);ctx.render();
}
function convertToInvoice(id,state,ctx){
 if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to invoice sales orders.');return}
 const o=byId(state,id);if(!o)return;if(o.invoiceId||(state.customerInvoices||[]).some(x=>x.salesOrderId===o.id)){ctx.toast('This sales order has already been invoiced.');return}
 if(!['Confirmed','Ready'].includes(o.status)){ctx.toast('Confirm the sales order before invoicing it.');return}
 const saved=o.customerId?customer(state,o.customerId):null;if(saved?.creditStatus==='Hold'){ctx.toast(saved.name+' is on credit hold.');return}
 const issueDate=today();if(window.DalasiMonthClose?.isClosed(state,issueDate)){ctx.toast('The current accounting period is closed.');return}
 state.customerInvoices=state.customerInvoices||[];let max=0,prefix='INV-'+new Date().getFullYear()+'-';state.customerInvoices.forEach(x=>{const v=String(x.invoiceNo||'');if(v.startsWith(prefix)){const n=Number(v.slice(prefix.length));if(n>max)max=n}});const invoiceNo=prefix+String(max+1).padStart(5,'0'),invoiceId='AR-'+Date.now().toString(36).toUpperCase(),lines=(o.lineItems||[]).map(x=>({...x})),tot=window.DalasiCatalog?.lineTotals?.(lines)||{subtotal:o.amount,discount:0,total:o.amount},tax=window.DalasiTax?.snapshot?.(state,tot.total,o.taxCode||window.DalasiTax?.defaultSalesCode?.(state)||'OUT','sale')||{taxCode:'OUT',vatRate:0,taxGross:tot.total,taxNet:tot.total,vatAmount:0};
 state.customerInvoices.unshift({id:invoiceId,invoiceNo,salesOrderId:o.id,salesOrderNo:o.orderNo,quoteId:o.quoteId||null,quoteNo:o.quoteNo||'',customerId:o.customerId||null,customerName:o.customerName,customerEmail:o.customerEmail||'',customerPhone:o.customerPhone||'',lineItems:lines,subtotal:tot.subtotal,discountTotal:tot.discount,amount:tot.total,...tax,project:o.project||'',costCentre:o.costCentre||'',issueDate,dueDate:addDays(issueDate,o.termDays||0),reference:o.reference||o.orderNo,description:o.description||'Sales order '+o.orderNo,status:'Draft',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User',updatedAt:new Date().toISOString()});
 o.status='Invoiced';o.invoiceId=invoiceId;o.invoiceNo=invoiceNo;o.invoicedAt=new Date().toISOString();o.updatedAt=o.invoicedAt;ctx.audit('sales_order.invoiced',{salesOrderId:o.id,orderNo:o.orderNo,invoiceId,invoiceNo,amount:tot.total});ctx.save();ctx.toast(o.orderNo+' converted to '+invoiceNo);state.salesTab='invoices';ctx.render();
}
function action(o,icon){
 const pdf='<button class="secondary tiny" data-action="sales-order-pdf:'+o.id+'">'+icon('download',12)+' PDF</button>';
 const invoice=o.invoiceId?'<button class="secondary tiny" data-action="invoice-view:'+o.invoiceId+'">View invoice</button>':'';
 if(o.status==='Draft')return '<div class="order-next"><small>NEXT STEP</small><b>Confirm order</b></div>'+pdf+'<button class="primary tiny" data-action="sales-order-status:'+o.id+':Confirmed">Confirm</button>';
 if(o.status==='Confirmed')return '<div class="order-next"><small>NEXT STEP</small><b>Prepare / invoice</b></div>'+pdf+'<button class="secondary tiny" data-action="sales-order-status:'+o.id+':Ready">Mark ready</button><button class="primary tiny" data-action="sales-order-invoice:'+o.id+'">Create invoice</button>';
 if(o.status==='Ready')return '<div class="order-next"><small>NEXT STEP</small><b>Raise invoice</b></div>'+pdf+'<button class="primary tiny" data-action="sales-order-invoice:'+o.id+'">Create invoice</button>';
 if(o.status==='Invoiced')return '<div class="order-next complete"><small>COMPLETED</small><b>'+esc(o.invoiceNo||'Invoice created')+'</b></div>'+pdf+invoice;
 return '<div class="order-next muted"><small>STATUS</small><b>'+esc(o.status||'Cancelled')+'</b></div>'+pdf;
}
function panel(state,h){
 const m=metrics(state),rows=(state.salesOrders||[]).slice().sort((a,b)=>String(b.orderDate||b.createdAt||'').localeCompare(String(a.orderDate||a.createdAt||'')));
 const table=rows.length?rows.map(o=>{const d=deliveryMeta(o),source=o.quoteNo?'<button class="order-source-link" data-action="sales-tab:quotes">'+esc(o.quoteNo)+'</button>':'Direct order';return '<tr>'+
 '<td data-label="Customer / order"><div class="payment-payee"><b>'+esc(o.customerName||'Customer')+'</b><small>'+esc(o.orderNo||o.id)+'</small></div><div class="order-source">Source: '+source+(o.invoiceNo?' · '+esc(o.invoiceNo):'')+'</div></td>'+
 '<td data-label="Progress">'+journey(o)+'</td>'+
 '<td data-label="Delivery"><div class="order-delivery '+d.tone+'"><b>'+esc(d.label)+'</b><small>'+esc(d.note)+'</small></div></td>'+
 '<td data-label="Value" class="payment-amount"><b>'+h.money2(o.amount)+'</b><small>'+((o.lineItems||[]).length)+' item'+((o.lineItems||[]).length===1?'':'s')+'</small></td>'+
 '<td data-label="Status">'+h.pill(o.status||'Draft',o.status==='Invoiced'?'paid':o.status==='Confirmed'||o.status==='Ready'?'approved':'ready')+'</td>'+
 '<td data-label="Action"><div class="payment-status-actions order-actions">'+action(o,h.icon)+'</div></td></tr>'}).join(''):'<tr><td colspan="6"><div class="order-empty"><span>'+h.icon('file',22)+'</span><div><b>No sales orders yet</b><p>Accept a quotation and convert it into a sales order. The order will then guide you through confirmation, preparation and invoicing.</p><button class="secondary tiny" data-action="sales-tab:quotes">Open quotations</button></div></div></td></tr>';
 return '<div class="sales-summary"><div class="surface"><span>Open orders</span><b>'+m.open+'</b><small>'+m.count+' total</small></div><div class="surface"><span>Open order value</span><b>'+h.money2(m.openValue)+'</b><small>not yet invoiced</small></div><div class="surface"><span>Confirmed / ready</span><b>'+(m.confirmed+m.ready)+'</b><small>'+m.ready+' ready to invoice</small></div><div class="surface"><span>Invoiced</span><b>'+m.invoiced+'</b><small>completed commercial flow</small></div></div>'+
 '<div class="order-flow-banner"><div><span>'+h.icon('file',17)+'</span><div><b>Quotation → Order → Invoice</b><p>Each order now shows where it is in the sales journey, what document it came from, delivery timing and the next action required.</p></div></div><div class="order-flow-legend"><span><i class="done"></i>Done</span><span><i class="current"></i>Current</span><span><i></i>Next</span></div></div>'+
 '<div class="surface employee-card sales-order-register"><div class="table-tools"><div><h3>Sales order register</h3><p>Track order progress, delivery commitments and invoice conversion in one place</p></div><div class="order-register-note"><b>'+m.open+'</b><span>open</span></div></div><div class="table-scroll"><table><thead><tr><th>CUSTOMER / ORDER</th><th>PROGRESS</th><th>DELIVERY</th><th>VALUE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
}
function pdf(id,state,ctx){
 const o=byId(state,id);if(!o){ctx.toast('Sales order not found.');return}const out=[],green='0.04 0.31 0.26',white='1 1 1',muted='0.38 0.44 0.41',line='0.84 0.88 0.86',safe=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'),text=(x,y,z,v,b=false,col='0.08 0.13 0.11')=>out.push(col+' rg BT /'+(b?'F2':'F1')+' '+z+' Tf '+x+' '+y+' Td ('+safe(v)+') Tj ET'),fill=(x,y,w,h,col)=>out.push(col+' rg '+x+' '+y+' '+w+' '+h+' re f'),stroke=(a,b,c,d,col=line,w=.6)=>out.push(col+' RG '+w+' w '+a+' '+b+' m '+c+' '+d+' l S'),clip=(v,m=45)=>String(v??'').length>m?String(v).slice(0,m-3)+'...':String(v??'');
 fill(0,0,595,842,white);fill(24,746,547,72,green);text(42,790,18,clip(state.company,30),true,white);text(42,769,8,'SALES ORDER',true,'0.75 0.91 0.86');text(410,790,15,o.orderNo||o.id,true,white);text(410,770,8,o.status||'Draft',true,'0.75 0.91 0.86');text(40,704,7,'CUSTOMER',true,muted);text(40,682,12,clip(o.customerName,40),true);text(360,704,7,'ORDER DATE',true,muted);text(360,682,9,o.orderDate||'—',true);text(460,704,7,'DELIVERY',true,muted);text(460,682,9,o.requestedDeliveryDate||'—',true);
 let y=625;text(40,y,7,'DESCRIPTION',true,muted);text(330,y,7,'QTY',true,muted);text(390,y,7,'UNIT PRICE',true,muted);text(490,y,7,'AMOUNT',true,muted);stroke(40,y-9,555,y-9);y-=31;(o.lineItems||[]).slice(0,12).forEach((l,i)=>{text(40,y,8,clip(l.description||'Item',43),i===0);text(330,y,8,String(Number(l.quantity)||0));text(390,y,8,ctx.money2(l.unitPrice));text(490,y,8,ctx.money2((Number(l.quantity)||0)*(Number(l.unitPrice)||0)),true);stroke(40,y-9,555,y-9,'0.93 0.95 0.94',.35);y-=25});fill(360,146,195,74,green);text(378,197,7,'ORDER TOTAL',true,'0.75 0.91 0.86');text(378,168,18,ctx.money2(o.amount),true,white);text(40,196,7,'REFERENCE',true,muted);text(40,177,9,clip(o.reference||o.quoteNo||'—',35),true);text(24,72,7.2,'This sales order records the customer order and is not a tax invoice or payment receipt.',false,muted);text(430,50,7.2,'Generated by DalasiPay',true,green);
 ctx.pdfDownload('Sales_Order_'+String(o.orderNo||o.id).replace(/[^A-Za-z0-9_-]+/g,'_')+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Sales order PDF downloaded');
}
window.DalasiSalesOrders={panel,createFromQuote,update,convertToInvoice,pdf,metrics,byId};
})();