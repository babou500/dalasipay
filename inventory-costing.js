(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const periodOf=v=>String(v||'').slice(0,7);
  const dateOf=v=>String(v||'').slice(0,10);
  function item(state,id){return (state.salesCatalog||[]).find(x=>x.id===id)||null;}
  function method(product){return String(product?.costingMethod||'Weighted Average');}
  function movements(state,id){
    return (state.inventoryMovements||[]).filter(x=>x.catalogId===id).slice().sort((a,b)=>String(a.revenueDate||a.movementDate||a.createdAt||'').localeCompare(String(b.revenueDate||b.movementDate||b.createdAt||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  }
  function unitCostOf(mv,product){
    const u=Number(mv?.unitCost);if(Number.isFinite(u)&&u>=0)return u;
    const q=Math.abs(Number(mv?.quantity)||0),a=Number(mv?.costAmount);if(q&&Number.isFinite(a)&&a>=0)return a/q;
    return Math.max(0,Number(product?.costPrice)||0);
  }
  function fifoLayers(state,product,excludeMovementId=''){
    const layers=[];
    movements(state,product.id).forEach(mv=>{
      if(mv.id===excludeMovementId)return;
      let qty=Number(mv.quantity)||0;
      if(qty>0){
        const cost=unitCostOf(mv,product);layers.push({qty:round(qty),unitCost:round(cost),date:dateOf(mv.movementDate||mv.createdAt),movementId:mv.id,type:mv.type});
      }else if(qty<0){
        let need=Math.abs(qty);
        while(need>0.000001&&layers.length){
          const layer=layers[0],take=Math.min(need,layer.qty);layer.qty=round(layer.qty-take);need=round(need-take);if(layer.qty<=0.000001)layers.shift();
        }
      }
    });
    return layers.filter(x=>x.qty>0.000001);
  }
  function fifoIssueCost(state,product,qty){
    let need=Math.max(0,Number(qty)||0),cost=0;
    const layers=fifoLayers(state,product).map(x=>({...x}));
    for(const layer of layers){
      if(need<=0.000001)break;
      const take=Math.min(need,layer.qty);cost+=take*layer.unitCost;need-=take;
    }
    if(need>0.000001)cost+=need*Math.max(0,Number(product.costPrice)||0);
    return {amount:round(cost),unitCost:qty?round(cost/qty):0};
  }
  function issueCost(state,product,qty){
    qty=Math.max(0,Number(qty)||0);
    if(method(product)==='FIFO')return fifoIssueCost(state,product,qty);
    const unit=Math.max(0,Number(product?.costPrice)||0);return {amount:round(qty*unit),unitCost:round(unit)};
  }
  function valuation(state,product){
    if(product?.type!=='Product')return {quantity:0,value:0,unitCost:0,layers:[]};
    const quantity=Math.max(0,Number(product.stockOnHand)||0);
    if(method(product)==='FIFO'){
      const layers=fifoLayers(state,product),value=round(layers.reduce((a,x)=>a+x.qty*x.unitCost,0));
      return {quantity,value,unitCost:quantity?round(value/quantity):0,layers};
    }
    const unitCost=Math.max(0,Number(product.costPrice)||0);return {quantity,value:round(quantity*unitCost),unitCost:round(unitCost),layers:[]};
  }
  function summary(state){
    const products=(state.salesCatalog||[]).filter(x=>x.type==='Product'),active=products.filter(x=>(x.status||'Active')==='Active');
    const vals=active.map(x=>({product:x,...valuation(state,x)})),value=round(vals.reduce((a,x)=>a+x.value,0)),units=round(vals.reduce((a,x)=>a+x.quantity,0)),low=active.filter(x=>(Number(x.stockOnHand)||0)<=(Number(x.reorderLevel)||0)).length;
    const writeOff=round((state.inventoryMovements||[]).filter(x=>['Damaged / written off','Stock correction decrease'].includes(x.type)).reduce((a,x)=>a+(Number(x.costAmount)||Math.abs(Number(x.quantity)||0)*(Number(x.unitCost)||0)),0));
    return {products:products.length,active:active.length,value,units,low,writeOff};
  }
  function ageing(state,product){
    const layers=method(product)==='FIFO'?fifoLayers(state,product):[];
    const today=new Date(),buckets={'0-30':0,'31-60':0,'61-90':0,'91-180':0,'181+':0};
    if(layers.length){
      layers.forEach(l=>{const d=l.date?new Date(l.date+'T00:00:00Z'):today,days=Math.max(0,Math.floor((today-d)/86400000)),v=l.qty*l.unitCost;const k=days<=30?'0-30':days<=60?'31-60':days<=90?'61-90':days<=180?'91-180':'181+';buckets[k]+=v;});
    }else{
      const inbound=movements(state,product.id).filter(x=>(Number(x.quantity)||0)>0).slice(-1)[0],d=inbound?new Date(dateOf(inbound.movementDate||inbound.createdAt)+'T00:00:00Z'):today,days=Math.max(0,Math.floor((today-d)/86400000)),v=valuation(state,product).value,k=days<=30?'0-30':days<=60?'31-60':days<=90?'61-90':days<=180?'91-180':'181+';buckets[k]+=v;
    }
    Object.keys(buckets).forEach(k=>buckets[k]=round(buckets[k]));return buckets;
  }
  function productMargins(state,period){
    const invs=(state.customerInvoices||[]).filter(inv=>{const st=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');return st!=='Draft'&&periodOf(inv.issueDate||inv.createdAt)===period;});
    const map=new Map();
    invs.forEach(inv=>(inv.lineItems||[]).forEach(line=>{const p=item(state,line.catalogId);if(!p||p.type!=='Product')return;const x=map.get(p.id)||{id:p.id,code:p.code,name:p.name,qty:0,revenue:0,cogs:0};x.qty+=Number(line.quantity)||0;x.revenue+=Number(line.amount)||0;map.set(p.id,x);}));
    (state.inventoryMovements||[]).filter(mv=>mv.type==='Sales issue'&&periodOf(mv.revenueDate||mv.createdAt)===period).forEach(mv=>{const x=map.get(mv.catalogId);if(x)x.cogs+=Number(mv.costAmount)||Math.abs(Number(mv.quantity)||0)*(Number(mv.unitCost)||0);});
    return [...map.values()].map(x=>({...x,qty:round(x.qty),revenue:round(x.revenue),cogs:round(x.cogs),grossProfit:round(x.revenue-x.cogs),margin:x.revenue?round((x.revenue-x.cogs)/x.revenue*100):0})).sort((a,b)=>b.revenue-a.revenue);
  }
  function reconciliation(state){
    const rows=(state.salesCatalog||[]).filter(x=>x.type==='Product').map(p=>{
      const movementQty=round(movements(state,p.id).reduce((a,x)=>a+(Number(x.quantity)||0),0)),catalogQty=round(p.stockOnHand||0),difference=round(catalogQty-movementQty),val=valuation(state,p);
      return {id:p.id,code:p.code,name:p.name,catalogQty,movementQty,difference,value:val.value,unitCost:val.unitCost,ok:Math.abs(difference)<0.001};
    });
    return {rows,exceptions:rows.filter(x=>!x.ok).length,totalValue:round(rows.reduce((a,x)=>a+x.value,0))};
  }
  function periodStatus(state,period){
    const rec=reconciliation(state),sales=(state.customerInvoices||[]).filter(inv=>{const st=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');return st!=='Draft'&&periodOf(inv.issueDate||inv.createdAt)===period&&window.DalasiSalesInvoices?.invoiceHasStockLines?.(state,inv);});
    const unfulfilled=sales.filter(x=>!x.fulfilledAt);
    return {exceptions:rec.exceptions,unfulfilled:unfulfilled.length,ready:rec.exceptions===0&&unfulfilled.length===0};
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));(state.inventoryMovements||[]).forEach(x=>{const p=periodOf(x.revenueDate||x.movementDate||x.createdAt);if(p)set.add(p)});(state.customerInvoices||[]).forEach(x=>{const p=periodOf(x.issueDate);if(p)set.add(p)});if(state.currentPeriod)set.add(state.currentPeriod);return [...set].sort().reverse();
  }
  function exportValuation(state,ctx){
    const rows=[['Code','Product','Method','Stock On Hand','Valuation Unit Cost','Stock Value','Reorder Level','Status']];
    (state.salesCatalog||[]).filter(x=>x.type==='Product').forEach(p=>{const v=valuation(state,p);rows.push([p.code||p.id,p.name,method(p),v.quantity,v.unitCost,v.value,p.reorderLevel||0,p.status||'Active']);});
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-inventory-valuation-'+new Date().toISOString().slice(0,10)+'.csv',csv);ctx.toast('Inventory valuation downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2}=h,period=state.inventoryPeriod||state.currentPeriod||periods(state)[0],sum=summary(state),rec=reconciliation(state),margins=productMargins(state,period),opts=periods(state).map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(p)+'</option>').join('');
    const products=(state.salesCatalog||[]).filter(x=>x.type==='Product').slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    const valRows=products.length?products.map(p=>{const v=valuation(state,p),age=ageing(state,p),old=round(age['91-180']+age['181+']);return '<tr><td><div class="payment-payee"><b>'+esc(p.name)+'</b><small>'+esc(p.code||p.id)+'</small></div></td><td>'+esc(method(p))+'</td><td>'+v.quantity.toLocaleString('en-GB')+' '+esc(p.unit||'Unit')+'</td><td>'+money2(v.unitCost)+'</td><td><b>'+money2(v.value)+'</b></td><td>'+money2(old)+'</td><td class="'+((Number(p.stockOnHand)||0)<=(Number(p.reorderLevel)||0)?'inventory-warn':'')+'">'+Number(p.reorderLevel||0).toLocaleString('en-GB')+'</td></tr>';}).join(''):'<tr><td colspan="7"><div class="empty-inline">No products are available for valuation.</div></td></tr>';
    const marginRows=margins.length?margins.map(x=>'<tr><td><b>'+esc(x.name)+'</b><small>'+esc(x.code||x.id)+'</small></td><td>'+x.qty.toLocaleString('en-GB')+'</td><td>'+money2(x.revenue)+'</td><td>'+money2(x.cogs)+'</td><td>'+money2(x.grossProfit)+'</td><td class="'+(x.margin<0?'inventory-bad':'inventory-good')+'">'+x.margin.toFixed(1)+'%</td></tr>').join(''):'<tr><td colspan="6"><div class="empty-inline">No product sales for '+esc(period)+'.</div></td></tr>';
    const recRows=rec.rows.filter(x=>!x.ok).length?rec.rows.filter(x=>!x.ok).map(x=>'<tr><td>'+esc(x.code||x.id)+'</td><td>'+esc(x.name)+'</td><td>'+x.catalogQty+'</td><td>'+x.movementQty+'</td><td class="inventory-bad">'+x.difference+'</td></tr>').join(''):'<tr><td colspan="5"><div class="empty-inline">Catalog quantities reconcile to inventory movement history.</div></td></tr>';
    return pageTitle('INVENTORY ACCOUNTING','Inventory','Stock valuation, costing methods, ageing, gross margin and movement reconciliation.','<div class="inline-buttons"><button class="secondary" data-action="inventory-export">'+icon('download',14)+' Valuation CSV</button><button class="primary" data-page="invoices">'+icon('plus',14)+' Products & Services</button></div>')+
      '<div class="inventory-kpis"><div class="surface"><span>Inventory value</span><b>'+money2(sum.value)+'</b><small>movement-aware valuation</small></div><div class="surface"><span>Products</span><b>'+sum.products+'</b><small>'+sum.active+' active</small></div><div class="surface '+(sum.low?'inventory-alert':'')+'"><span>Low stock</span><b>'+sum.low+'</b><small>at or below reorder level</small></div><div class="surface '+(rec.exceptions?'inventory-alert':'')+'"><span>Reconciliation exceptions</span><b>'+rec.exceptions+'</b><small>catalog vs movement quantity</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('reports',17)+'</span><div><b>Historical costs stay historical</b><p>New receipts store their own unit cost and cost amount. Weighted-average products update average cost after receipts; FIFO products consume the oldest remaining cost layers when stock is issued.</p></div></div>'+
      '<section class="surface employee-card inventory-valuation"><div class="table-tools"><div><h3>Stock valuation</h3><p>Current quantity and cost value by product</p></div></div><div class="table-scroll"><table><thead><tr><th>PRODUCT</th><th>COSTING</th><th>ON HAND</th><th>VALUATION COST</th><th>STOCK VALUE</th><th>AGED 91+ DAYS</th><th>REORDER</th></tr></thead><tbody>'+valRows+'</tbody></table></div></section>'+
      '<section class="surface employee-card inventory-margin"><div class="table-tools"><div><h3>Product gross margin</h3><p>Recognized product revenue versus recorded sales-issue COGS</p></div><select id="inventory-period-select">'+opts+'</select></div><div class="table-scroll"><table><thead><tr><th>PRODUCT</th><th>QTY SOLD</th><th>REVENUE</th><th>COGS</th><th>GROSS PROFIT</th><th>MARGIN</th></tr></thead><tbody>'+marginRows+'</tbody></table></div></section>'+
      '<section class="surface employee-card inventory-recon"><div class="table-tools"><div><h3>Stock reconciliation</h3><p>Catalog quantity must equal cumulative movement quantity</p></div></div><div class="table-scroll"><table><thead><tr><th>CODE</th><th>PRODUCT</th><th>CATALOG QTY</th><th>MOVEMENT QTY</th><th>DIFFERENCE</th></tr></thead><tbody>'+recRows+'</tbody></table></div></section>';
  }

  window.DalasiInventory={method,movements,unitCostOf,fifoLayers,fifoIssueCost,issueCost,valuation,summary,ageing,productMargins,reconciliation,periodStatus,periods,exportValuation,render};
})();