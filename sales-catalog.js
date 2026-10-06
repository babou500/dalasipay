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
  function lineTotals(lines){
    const clean=(lines||[]).map(x=>({...x,quantity:Number(x.quantity)||0,unitPrice:Number(x.unitPrice)||0,discount:Number(x.discount)||0}));
    const subtotal=clean.reduce((a,x)=>a+(x.quantity*x.unitPrice),0);
    const discount=clean.reduce((a,x)=>a+(x.quantity*x.unitPrice-lineAmount(x)),0);
    const total=clean.reduce((a,x)=>a+lineAmount(x),0);
    return {subtotal:Math.round(subtotal*100)/100,discount:Math.round(discount*100)/100,total:Math.round(total*100)/100};
  }
  function lineRow(state,line={},index=0){
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
  function lineItemsForm(state,lines=[]){
    const initial=lines.length?lines:[{description:'',quantity:1,unit:'Unit',unitPrice:'',discount:0}];
    return '<div class="sales-line-builder">'+
      '<div class="sales-line-head"><span>PRODUCT / SERVICE</span><span>DESCRIPTION</span><span>QTY</span><span>UNIT</span><span>UNIT PRICE</span><span>DISC. %</span><span>LINE TOTAL</span><span></span></div>'+
      '<div class="sales-lines">'+initial.map((x,i)=>lineRow(state,x,i)).join('')+'</div>'+
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
  function bindLineItems(form,state){
    if(!form||form.dataset.linesBound==='1')return;form.dataset.linesBound='1';
    const wrap=form.querySelector('.sales-lines');if(!wrap)return;
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
      const add=ev.target.closest('[data-line-add]');if(add){wrap.insertAdjacentHTML('beforeend',lineRow(state,{},wrap.querySelectorAll('.sales-line').length));update();return;}
      const rem=ev.target.closest('[data-line-remove]');if(rem){const row=rem.closest('.sales-line');if(wrap.querySelectorAll('.sales-line').length>1)row.remove();else{row.querySelectorAll('input').forEach(x=>x.value=x.name==='lineQuantity'?'1':x.name==='lineDiscount'?'0':'');}update();}
    });
    form.addEventListener('change',ev=>{
      if(ev.target.name==='lineCatalogId'&&ev.target.value){
        const item=itemById(state,ev.target.value),row=ev.target.closest('.sales-line');if(item&&row){
          row.querySelector('[name="lineDescription"]').value=item.name;
          row.querySelector('[name="lineUnit"]').value=item.unit||'Unit';
          row.querySelector('[name="lineUnitPrice"]').value=Number(item.unitPrice||0).toFixed(2);
        }
      }
      update();
    });
    form.addEventListener('input',ev=>{if(['lineDescription','lineQuantity','lineUnitPrice','lineDiscount'].includes(ev.target.name))update();});
    update();
  }
  function catalogPanel(state,h){
    const icon=h.icon,money2=h.money2,pill=h.pill,rows=(state.salesCatalog||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
    const active=rows.filter(x=>(x.status||'Active')==='Active').length,products=rows.filter(x=>x.type==='Product').length,services=rows.filter(x=>x.type==='Service').length;
    const table=rows.length?rows.map(x=>'<tr>'+
      '<td><div class="payment-payee"><b>'+esc(x.name)+'</b><small>'+esc(x.code||x.id)+'</small></div></td>'+
      '<td>'+esc(x.type||'Product')+'</td>'+
      '<td>'+esc(x.unit||'Unit')+'</td>'+
      '<td class="payment-amount">'+money2(x.unitPrice)+'</td>'+
      '<td>'+esc(x.description||'—')+'</td>'+
      '<td>'+pill(x.status||'Active',(x.status||'Active')==='Active'?'ready':'neutral')+'</td>'+
      '<td><button class="secondary" data-action="catalog-status:'+x.id+':'+((x.status||'Active')==='Active'?'Inactive':'Active')+'">'+((x.status||'Active')==='Active'?'Deactivate':'Activate')+'</button></td>'+
    '</tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No products or services yet. Add frequently sold items so quotations and invoices can reuse them.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Active items</span><b>'+active+'</b><small>'+rows.length+' total catalog items</small></div>'+
      '<div class="surface"><span>Products</span><b>'+products+'</b><small>physical or countable items</small></div>'+
      '<div class="surface"><span>Services</span><b>'+services+'</b><small>fees, labour and service items</small></div>'+
      '<div class="surface"><span>Quick reuse</span><b>'+active+'</b><small>available in quote and invoice lines</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('file',17)+'</span><div><b>Reusable sales catalog</b><p>Save common products and services once with a default unit and price, then select them while building quotations or invoices.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Products & services</h3><p>Sales catalog with reusable pricing and units</p></div><button class="primary" data-action="open-catalog-item">'+icon('plus',14)+' Add item</button></div>'+
    '<div class="table-scroll"><table><thead><tr><th>ITEM</th><th>TYPE</th><th>UNIT</th><th>DEFAULT PRICE</th><th>DESCRIPTION</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
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
        field('Default unit price (GMD)','<input name="unitPrice" type="number" min="0" step="0.01" placeholder="0.00" required>')+
      '</div>'+
      field('Description','<input name="description" placeholder="Optional sales description">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-catalog-item">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Save item</button></div>'+
    '</form></div>';
  }
  function createItem(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add catalog items.');return;}
    const fd=new FormData(ev.target),type=String(fd.get('type')||'Product'),name=String(fd.get('name')||'').trim(),unitPrice=Number(fd.get('unitPrice')||0);if(!name||unitPrice<0){ctx.toast('Item name and a valid unit price are required.');return;}
    state.salesCatalog=state.salesCatalog||[];let code=String(fd.get('code')||'').trim()||nextCode(state,type);
    if(state.salesCatalog.some(x=>String(x.code||'').toLowerCase()===code.toLowerCase())){ctx.toast('That product/service code already exists.');return;}
    const id='CAT-'+Date.now().toString(36).toUpperCase();state.salesCatalog.push({id,type,name,code,unit:String(fd.get('unit')||'Unit'),unitPrice,description:String(fd.get('description')||'').trim(),status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.catalogOpen=false;ctx.audit('sales.catalog_created',{catalogId:id,code,type,name,unitPrice});ctx.save();ctx.toast(name+' added to Products & Services');ctx.render();
  }
  function updateItem(id,status,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update catalog items.');return;}
    const x=itemById(state,id);if(!x)return;x.status=status;x.updatedAt=new Date().toISOString();x.updatedBy=state.session?.name||'User';ctx.audit('sales.catalog_status_updated',{catalogId:id,status});ctx.save();ctx.toast(x.name+': '+status);ctx.render();
  }

  window.DalasiCatalog={UNITS:UNITS.slice(),itemById,lineAmount,lineTotals,lineItemsForm,readLines,bindLineItems,catalogPanel,catalogModal,createItem,updateItem};
})();