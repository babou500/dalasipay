(function(){
  'use strict';

  const UNITS=['Unit','Hour','Day','Month','Package','Kg','Litre','Metre','Box','Lot','Service'];

  function esc(s){return String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));}
  function itemById(state,id){return (state.salesCatalog||[]).find(x=>x.id===id)||null;}
  function nextCode(state,type){
    const prefix=type==='Service'?'SVC':'PRD',rows=state.salesCatalog||[];
    let max=0;rows.forEach(x=>{const v=String(x.code||'');if(v.startsWith(prefix+'-')){const n=Number(v.slice(4));if(Number.isFinite(n)&&n>max)max=n;}});
    return prefix+'-'+String(max+1).padStart(4,'0');
  }
  function money(n){return (Number(n)||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function lineAmount(line){const q=Math.max(0,Number(line.quantity)||0),p=Math.max(0,Number(line.unitPrice)||0),d=Math.min(100,Math.max(0,Number(line.discount)||0));return Math.round((q*p*(1-d/100)+Number.EPSILON)*100)/100;}
  function stockOnHand(item){return item?.type==='Product'?Math.max(0,Number(item.stockOnHand)||0):null;}
  function inventoryMetrics(state){
    const products=(state.salesCatalog||[]).filter(x=>x.type==='Product'),active=products.filter(x=>(x.status||'Active')==='Active');
    const low=active.filter(x=>Number(x.stockOnHand||0)<=Number(x.reorderLevel||0));
    const value=active.reduce((a,x)=>a+(Number(x.stockOnHand||0)*Number(x.costPrice||0)),0);
    return {products:products.length,active:active.length,low:low.length,value};
  }
  function lineTotals(lines){
    const clean=(lines||[]).map(x=>({...x,quantity:Number(x.quantity)||0,unitPrice:Number(x.unitPrice)||0,discount:Number(x.discount)||0}));
    const subtotal=clean.reduce((a,x)=>a+(x.quantity*x.unitPrice),0);
    const discount=clean.reduce((a,x)=>a+(x.quantity*x.unitPrice-lineAmount(x)),0);
    const total=clean.reduce((a,x)=>a+lineAmount(x),0);
    return {subtotal:Math.round(subtotal*100)/100,discount:Math.round(discount*100)/100,total:Math.round(total*100)/100};
  }
  function lineRow(state,line={},index=0,mode='sales'){
    const active=(state.salesCatalog||[]).filter(x=>(x.status||'Active')==='Active');
    const opts=['<option value="">Custom item</option>'].concat(active.map(x=>'<option value="'+esc(x.id)+'" '+(line.catalogId===x.id?'selected':'')+'>'+esc(x.code||'')+' · '+esc(x.name)+'</option>')).join('');
    const unitOpts=UNITS.map(x=>'<option '+((line.unit||'Unit')===x?'selected':'')+'>'+x+'</option>').join('');
    return '<div class="sales-line" data-line-index="'+index+'">'+
      '<div class="line-product"><select name="lineCatalogId">'+opts+'</select></div>'+
      '<div class="line-desc"><input name="lineDescription" value="'+esc(line.description||'')+'" placeholder="Item / service" required></div>'+
      '<div><input name="lineQuantity" type="number" min="0.01" step="0.01" value="'+esc(line.quantity||1)+'" required></div>'+
      '<div><select name="lineUnit">'+unitOpts+'</select></div>'+
      '<div><input name="lineUnitPrice" type="number" min="0" step="0.01" value="'+esc(line.unitPrice??'')+'" placeholder="0.00" required></div>'+
      '<div><input name="lineDiscount" type="number" min="0" max="100" step="0.01" value="'+esc(line.discount||0)+'"></div>'+
      '<div class="line-total">D'+money(lineAmount(line))+'</div>'+
      '<button type="button" class="line-remove" data-line-remove aria-label="Remove line">×</button>'+
    '</div>';
  }
  function lineItemsForm(state,lines=[],mode='sales'){
    const initial=lines.length?lines:[{description:'',quantity:1,unit:'Unit',unitPrice:'',discount:0}];
    return '<div class="sales-line-builder" data-line-mode="'+esc(mode)+'">'+
      '<div class="sales-line-head"><span>PRODUCT / SERVICE</span><span>DESCRIPTION</span><span>QTY</span><span>UNIT</span><span>UNIT PRICE</span><span>DISC. %</span><span>LINE TOTAL</span><span></span></div>'+
      '<div class="sales-lines">'+initial.map((x,i)=>lineRow(state,x,i,mode)).join('')+'</div>'+
      '<div class="sales-line-foot"><button type="button" class="secondary tiny" data-line-add>+ Add line</button><div class="sales-line-summary"><span>Subtotal <b data-line-subtotal>D0.00</b></span><span>Discount <b data-line-discount>D0.00</b></span><strong>Total <b data-line-grand>D0.00</b></strong></div></div>'+
    '</div>';
  }
  function readLines(form){
    const rows=[...form.querySelectorAll('.sales-line')];
    return rows.map(row=>{
      const catalogId=row.querySelector('[name="lineCatalogId"]')?.value||'';
      const description=String(row.querySelector('[name="lineDescription"]')?.value||'').trim();
      const quantity=Number(row.querySelector('[name="lineQuantity"]')?.value||0);
      const unit=String(row.querySelector('[name="lineUnit"]')?.value||'Unit');
      const unitPrice=Number(row.querySelector('[name="lineUnitPrice"]')?.value||0);
      const discount=Math.min(100,Math.max(0,Number(row.querySelector('[name="lineDiscount"]')?.value||0)));
      return {catalogId:catalogId||null,description,quantity,unit,unitPrice,discount,amount:lineAmount({quantity,unitPrice,discount})};
    }).filter(x=>x.description&&x.quantity>0&&x.unitPrice>=0);
  }
  function bindLineItems(form,state,mode='sales'){
    if(!form||form.dataset.linesBound==='1')return;form.dataset.linesBound='1';
    const wrap=form.querySelector('.sales-lines');if(!wrap)return;mode=form.querySelector('.sales-line-builder')?.dataset.lineMode||mode||'sales';
    const update=()=>{
      const lines=readLines(form),t=lineTotals(lines);
      [...wrap.querySelectorAll('.sales-line')].forEach(row=>{
        const q=Number(row.querySelector('[name="lineQuantity"]')?.value||0),p=Number(row.querySelector('[name="lineUnitPrice"]')?.value||0),d=Number(row.querySelector('[name="lineDiscount"]')?.value||0);
        const total=row.querySelector('.line-total');if(total)total.textContent='D'+money(lineAmount({quantity:q,unitPrice:p,discount:d}));
      });
      const s=form.querySelector('[data-line-subtotal]'),di=form.querySelector('[data-line-discount]'),g=form.querySelector('[data-line-grand]');
      if(s)s.textContent='D'+money(t.subtotal);if(di)di.textContent='D'+money(t.discount);if(g)g.textContent='D'+money(t.total);
    };
    form.addEventListener('click',ev=>{
      const add=ev.target.closest('[data-line-add]');if(add){wrap.insertAdjacentHTML('beforeend',lineRow(state,{},wrap.querySelectorAll('.sales-line').length,mode));update();return;}
      const rem=ev.target.closest('[data-line-remove]');if(rem){const row=rem.closest('.sales-line');if(wrap.querySelectorAll('.sales-line').length>1)row.remove();else{row.querySelectorAll('input').forEach(x=>x.value=x.name==='lineQuantity'?'1':x.name==='lineDiscount'?'0':'');}update();}
    });
    form.addEventListener('change',ev=>{
      if(ev.target.name==='lineCatalogId'&&ev.target.value){
        const item=itemById(state,ev.target.value),row=ev.target.closest('.sales-line');if(item&&row){
          row.querySelector('[name="lineDescription"]').value=item.name;
          row.querySelector('[name="lineUnit"]').value=item.unit||'Unit';
          row.querySelector('[name="lineUnitPrice"]').value=Number(mode==='purchase'?(item.costPrice||0):(item.unitPrice||0)).toFixed(2);
        }
      }
      update();
    });
    form.addEventListener('input',ev=>{if(['lineDescription','lineQuantity','lineUnitPrice','lineDiscount'].includes(ev.target.name))update();});
    update();
  }
  function catalogPanel(state,h){
    const icon=h.icon,money2=h.money2,pill=h.pill,rows=(state.salesCatalog||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))),inv=inventoryMetrics(state);
    const active=rows.filter(x=>(x.status||'Active')==='Active').length,products=rows.filter(x=>x.type==='Product').length,services=rows.filter(x=>x.type==='Service').length;
    const table=rows.length?rows.map(x=>{
      const isProduct=x.type==='Product',stock=isProduct?stockOnHand(x):null,reorder=Number(x.reorderLevel)||0,low=isProduct&&stock<=reorder;
      return '<tr>'+
      '<td><div class="payment-payee"><b>'+esc(x.name)+'</b><small>'+esc(x.code||x.id)+'</small></div></td>'+
      '<td>'+esc(x.type||'Product')+'</td>'+
      '<td>'+esc(x.unit||'Unit')+'</td>'+
      '<td class="payment-amount">'+money2(x.unitPrice)+'</td>'+
      '<td>'+(isProduct?'<div class="receivable-balance"><b>'+stock.toLocaleString('en-GB')+' '+esc(x.unit||'Unit')+'</b><small>'+(low?'Low stock · reorder '+reorder:'Cost '+money2(x.costPrice||0))+'</small></div>':'<span class="bill-no-file">Non-stock service</span>')+'</td>'+
      '<td>'+pill(x.status||'Active',(x.status||'Active')==='Active'?'ready':'neutral')+'</td>'+
      '<td><div class="payment-status-actions">'+(isProduct?'<button class="secondary" data-action="stock-adjust:'+x.id+'">Adjust stock</button>':'')+'<button class="secondary" data-action="catalog-status:'+x.id+':'+((x.status||'Active')==='Active'?'Inactive':'Active')+'">'+((x.status||'Active')==='Active'?'Deactivate':'Activate')+'</button></div></td>'+
    '</tr>';}).join(''):'<tr><td colspan="7"><div class="empty-inline">No products or services yet. Add frequently sold items so quotations and invoices can reuse them.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Active items</span><b>'+active+'</b><small>'+rows.length+' total catalog items</small></div>'+
      '<div class="surface"><span>Stock value</span><b>'+money2(inv.value)+'</b><small>at recorded cost price</small></div>'+
      '<div class="surface '+(inv.low?'cash-alert':'')+'"><span>Low stock</span><b>'+inv.low+'</b><small>products at or below reorder level</small></div>'+
      '<div class="surface"><span>Services</span><b>'+services+'</b><small>non-stock sales items</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('file',17)+'</span><div><b>Products, services and stock in one catalog</b><p>Products carry stock, cost and reorder levels. Services remain non-stock. Use stock adjustments for receipts, corrections and opening balances.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Products & services</h3><p>Reusable sales pricing with product inventory control</p></div><button class="primary" data-action="open-catalog-item">'+icon('plus',14)+' Add item</button></div>'+
    '<div class="table-scroll"><table><thead><tr><th>ITEM</th><th>TYPE</th><th>UNIT</th><th>SELLING PRICE</th><th>STOCK / COST</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function catalogModal(state,h){
    const field=h.field,icon=h.icon;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-catalog-item"></div><form id="catalog-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">PRODUCT / SERVICE</div><h2>Add catalog item</h2><p>Save an item for quick reuse in quotations and invoices.</p></div><button type="button" class="close" data-action="close-catalog-item">×</button></div>'+
      '<div class="form-grid">'+
        field('Type','<select name="type"><option>Product</option><option>Service</option></select>')+
        field('Item name','<input name="name" placeholder="e.g. Monthly bookkeeping" required>')+
        field('Code / SKU','<input name="code" placeholder="Leave blank for automatic code">')+
        field('Unit','<select name="unit">'+UNITS.map(x=>'<option>'+x+'</option>').join('')+'</select>')+
        field('Default selling price (GMD)','<input name="unitPrice" type="number" min="0" step="0.01" placeholder="0.00" required>')+
        field('Cost price (GMD)','<input name="costPrice" type="number" min="0" step="0.01" placeholder="Products only">')+
        field('Opening stock','<input name="stockOnHand" type="number" min="0" step="0.01" placeholder="Products only">')+
        field('Reorder level','<input name="reorderLevel" type="number" min="0" step="0.01" placeholder="Products only">')+
      '</div>'+
      field('Description','<input name="description" placeholder="Optional sales description">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-catalog-item">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save item</button></div>'+
    '</form></div>';
  }
  function createItem(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add catalog items.');return;}
    const fd=new FormData(ev.target),type=String(fd.get('type')||'Product'),name=String(fd.get('name')||'').trim(),unitPrice=Number(fd.get('unitPrice')||0),costPrice=Math.max(0,Number(fd.get('costPrice')||0)),stockOnHand=Math.max(0,Number(fd.get('stockOnHand')||0)),reorderLevel=Math.max(0,Number(fd.get('reorderLevel')||0));if(!name||unitPrice<0){ctx.toast('Item name and a valid selling price are required.');return;}
    state.salesCatalog=state.salesCatalog||[];let code=String(fd.get('code')||'').trim()||nextCode(state,type);
    if(state.salesCatalog.some(x=>String(x.code||'').toLowerCase()===code.toLowerCase())){ctx.toast('That product/service code already exists.');return;}
    const id='CAT-'+Date.now().toString(36).toUpperCase();state.salesCatalog.push({id,type,name,code,unit:String(fd.get('unit')||'Unit'),unitPrice,costPrice:type==='Product'?costPrice:0,stockOnHand:type==='Product'?stockOnHand:0,reorderLevel:type==='Product'?reorderLevel:0,description:String(fd.get('description')||'').trim(),status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.inventoryMovements=state.inventoryMovements||[];if(type==='Product'&&stockOnHand>0)state.inventoryMovements.unshift({id:'MOV-'+Date.now().toString(36).toUpperCase(),catalogId:id,type:'Opening balance',quantity:stockOnHand,balanceAfter:stockOnHand,reference:code,note:'Opening stock',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.catalogOpen=false;ctx.audit('sales.catalog_created',{catalogId:id,code,type,name,unitPrice,costPrice,stockOnHand,reorderLevel});ctx.save();ctx.toast(name+' added to Products & Services');ctx.render();
  }
  function stockAdjustModal(state,h){
    const field=h.field,icon=h.icon,item=itemById(state,state.stockAdjustId);if(!item||item.type!=='Product')return '';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-stock-adjust"></div><form id="stock-adjust-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">INVENTORY ADJUSTMENT</div><h2>'+esc(item.name)+'</h2><p>Current stock: '+stockOnHand(item).toLocaleString('en-GB')+' '+esc(item.unit||'Unit')+'</p></div><button type="button" class="close" data-action="close-stock-adjust">×</button></div>'+
      '<input type="hidden" name="catalogId" value="'+esc(item.id)+'">'+
      '<div class="form-grid">'+
        field('Adjustment type','<select name="movementType"><option>Stock received</option><option>Stock correction increase</option><option>Stock correction decrease</option><option>Damaged / written off</option></select>')+
        field('Quantity','<input name="quantity" type="number" min="0.01" step="0.01" required>')+
        field('Reference','<input name="reference" placeholder="PO, supplier invoice or internal ref">')+
      '</div>'+
      field('Note','<input name="note" placeholder="Reason for this stock movement">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-stock-adjust">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Apply adjustment</button></div>'+
    '</form></div>';
  }
  function adjustStock(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to adjust stock.');return;}
    const fd=new FormData(ev.target),item=itemById(state,String(fd.get('catalogId')||''));if(!item||item.type!=='Product')return;
    const qty=Math.max(0,Number(fd.get('quantity')||0));if(qty<=0){ctx.toast('Enter a quantity greater than zero.');return;}
    const movementType=String(fd.get('movementType')||'Stock received'),decrease=['Stock correction decrease','Damaged / written off'].includes(movementType),before=stockOnHand(item);
    if(decrease&&qty>before){ctx.toast('Adjustment cannot reduce stock below zero.');return;}
    const after=Math.max(0,before+(decrease?-qty:qty));item.stockOnHand=after;item.updatedAt=new Date().toISOString();item.updatedBy=state.session?.name||'User';
    state.inventoryMovements=state.inventoryMovements||[];const id='MOV-'+Date.now().toString(36).toUpperCase();state.inventoryMovements.unshift({id,catalogId:item.id,type:movementType,quantity:decrease?-qty:qty,balanceBefore:before,balanceAfter:after,reference:String(fd.get('reference')||'').trim(),note:String(fd.get('note')||'').trim(),createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.stockAdjustId=null;ctx.audit('inventory.adjusted',{movementId:id,catalogId:item.id,type:movementType,quantity:decrease?-qty:qty,balanceAfter:after});ctx.save();ctx.toast(item.name+' stock updated to '+after+' '+(item.unit||'Unit'));ctx.render();
  }
  function fulfillInvoice(invoice,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to issue stock.');return false;}
    if(invoice.fulfilledAt){ctx.toast('This invoice has already been fulfilled.');return false;}
    const lines=(invoice.lineItems||[]).filter(x=>x.catalogId),byItem=new Map();
    lines.forEach(line=>{const item=itemById(state,line.catalogId);if(item?.type==='Product'){const current=byItem.get(item.id)||{item,qty:0};current.qty+=Math.max(0,Number(line.quantity)||0);byItem.set(item.id,current);}});
    const requirements=[...byItem.values()];
    for(const r of requirements){if(stockOnHand(r.item)<r.qty){ctx.toast('Not enough stock for '+r.item.name+'. Required: '+r.qty+', available: '+stockOnHand(r.item));return false;}}
    state.inventoryMovements=state.inventoryMovements||[];const now=new Date().toISOString();
    requirements.forEach((r,i)=>{const before=stockOnHand(r.item),after=before-r.qty,unitCost=Math.max(0,Number(r.item.costPrice)||0),costAmount=Math.round(r.qty*unitCost*100)/100;r.item.stockOnHand=after;r.item.updatedAt=now;state.inventoryMovements.unshift({id:'MOV-'+Date.now().toString(36).toUpperCase()+'-'+String(i+1),catalogId:r.item.id,type:'Sales issue',quantity:-r.qty,unitCost,costAmount,balanceBefore:before,balanceAfter:after,reference:invoice.invoiceNo||invoice.id,note:'Fulfilled customer invoice',createdAt:now,createdBy:state.session?.name||'User'});});
    invoice.fulfilledAt=now;invoice.fulfilledBy=state.session?.name||'User';ctx.audit('inventory.invoice_fulfilled',{invoiceId:invoice.id,invoiceNo:invoice.invoiceNo,productLines:requirements.length});ctx.save();ctx.toast((invoice.invoiceNo||'Invoice')+' fulfilled and stock issued');ctx.render();return true;
  }
  function updateItem(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update catalog items.');return;}
    const x=itemById(state,id);if(!x)return;x.status=status;x.updatedAt=new Date().toISOString();x.updatedBy=state.session?.name||'User';ctx.audit('sales.catalog_status_updated',{catalogId:id,status});ctx.save();ctx.toast(x.name+': '+status);ctx.render();
  }

  window.DalasiCatalog={UNITS:UNITS.slice(),itemById,lineAmount,lineTotals,lineItemsForm,readLines,bindLineItems,catalogPanel,catalogModal,stockAdjustModal,createItem,updateItem,adjustStock,fulfillInvoice,stockOnHand,inventoryMetrics};
})();