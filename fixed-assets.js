(function(){
  'use strict';

  const CATEGORIES=['Land & Buildings','Motor Vehicles','Plant & Machinery','Furniture & Fittings','Computers & IT','Office Equipment','Other Fixed Assets'];
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const periodOf=d=>String(d||'').slice(0,7);
  function periodEnd(period){const m=String(period||'').match(/^(\d{4})-(\d{2})$/);if(!m)return '';const y=Number(m[1]),mo=Number(m[2]);return period+'-'+String(new Date(y,mo,0).getDate()).padStart(2,'0');}
  function periodIndex(p){const m=String(p||'').match(/^(\d{4})-(\d{2})$/);return m?Number(m[1])*12+Number(m[2])-1:-1;}
  function nextNo(state){
    const y=new Date().getFullYear(),prefix='FA-'+y+'-';let max=0;
    (state.fixedAssets||[]).forEach(x=>{const n=String(x.assetNo||'');if(n.startsWith(prefix)){const v=Number(n.slice(prefix.length));if(v>max)max=v;}});
    return prefix+String(max+1).padStart(4,'0');
  }
  function depreciationRows(state,assetId=''){return (state.fixedAssetDepreciation||[]).filter(x=>!assetId||x.assetId===assetId);}
  function postedDepreciation(state,assetId){return round(depreciationRows(state,assetId).reduce((a,x)=>a+(Number(x.amount)||0),0));}
  function accumulated(state,asset){return round((Number(asset.openingAccumDep)||0)+postedDepreciation(state,asset.id));}
  function netBookValue(state,asset){return round(Math.max(0,(Number(asset.cost)||0)-accumulated(state,asset)));}
  function monthlyDepreciation(asset){
    const cost=Math.max(0,Number(asset.cost)||0),residual=Math.max(0,Number(asset.residualValue)||0),months=Math.max(1,Number(asset.usefulLifeMonths)||0);
    return round(Math.max(0,cost-residual)/months);
  }
  function hasDepRecord(state,assetId,period){return depreciationRows(state,assetId).some(x=>x.period===period&&x.status==='Posted');}
  function dateEligible(asset,period){
    const p=periodIndex(period),start=periodIndex(asset.depreciationStartPeriod||periodOf(asset.inServiceDate||asset.acquisitionDate));
    if(p<0||start<0||p<start)return false;
    if(asset.disposalDate&&p>periodIndex(periodOf(asset.disposalDate)))return false;
    return true;
  }
  function depreciationAmount(state,asset,period){
    if(!asset||hasDepRecord(state,asset.id,period)||!dateEligible(asset,period))return 0;
    const cost=Math.max(0,Number(asset.cost)||0),residual=Math.max(0,Number(asset.residualValue)||0),remaining=round(cost-residual-accumulated(state,asset));
    if(remaining<=0)return 0;
    return round(Math.min(monthlyDepreciation(asset),remaining));
  }
  function periodStatus(state,period){
    const eligible=(state.fixedAssets||[]).filter(a=>dateEligible(a,period)&&round((Number(a.cost)||0)-(Number(a.residualValue)||0)-accumulated(state,a))>0);
    const missing=eligible.filter(a=>!hasDepRecord(state,a.id,period));
    return {period,eligible:eligible.length,posted:eligible.length-missing.length,missing:missing.length,missingAssets:missing};
  }
  function summary(state){
    const all=state.fixedAssets||[],active=all.filter(a=>(a.status||'Active')==='Active');
    const cost=round(active.reduce((a,x)=>a+(Number(x.cost)||0),0)),accum=round(active.reduce((a,x)=>a+accumulated(state,x),0)),net=round(active.reduce((a,x)=>a+netBookValue(state,x),0));
    return {count:all.length,active:active.length,disposed:all.filter(a=>a.status==='Disposed').length,cost,accumulated:accum,netBookValue:net,monthly:round(active.reduce((a,x)=>a+monthlyDepreciation(x),0))};
  }
  function periods(state){
    const set=new Set((state.periods||[]).map(x=>x.id));
    const add=v=>{const p=periodOf(v);if(/^\d{4}-\d{2}$/.test(p))set.add(p);};
    (state.fixedAssets||[]).forEach(x=>{add(x.acquisitionDate);add(x.depreciationStartPeriod);add(x.disposalDate);});
    (state.fixedAssetDepreciation||[]).forEach(x=>set.add(x.period));
    if(/^\d{4}-\d{2}$/.test(String(state.currentPeriod||'')))set.add(state.currentPeriod);
    return [...set].sort().reverse();
  }
  function postDepreciation(asset,period,state,user){
    const amount=depreciationAmount(state,asset,period);if(amount<=0)return null;
    const rec={id:'FAD-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase(),assetId:asset.id,assetNo:asset.assetNo,assetName:asset.name,period,date:periodEnd(period),amount,status:'Posted',postedAt:new Date().toISOString(),postedBy:user};
    state.fixedAssetDepreciation=state.fixedAssetDepreciation||[];state.fixedAssetDepreciation.unshift(rec);return rec;
  }
  function runDepreciation(period,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to post depreciation.');return;}
    if(window.DalasiMonthClose?.isClosed(state,period)){ctx.toast('That accounting period is closed. Reopen it before posting depreciation.');return;}
    const user=state.session?.name||'User',before=(state.fixedAssetDepreciation||[]).length;
    (state.fixedAssets||[]).forEach(a=>postDepreciation(a,period,state,user));
    const count=(state.fixedAssetDepreciation||[]).length-before;
    if(!count){ctx.toast('No depreciation is due for '+period+'.');return;}
    ctx.audit('fixed_assets.depreciation_posted',{period,assets:count});ctx.save();ctx.toast(count+' asset'+(count===1?'':'s')+' depreciated for '+period);ctx.render();
  }
  function createAsset(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add fixed assets.');return;}
    const fd=new FormData(ev.target),name=String(fd.get('name')||'').trim(),category=String(fd.get('category')||'Other Fixed Assets'),acquisitionDate=String(fd.get('acquisitionDate')||''),inServiceDate=String(fd.get('inServiceDate')||acquisitionDate),cost=round(fd.get('cost')),residualValue=round(fd.get('residualValue')),lifeYears=Math.max(.08,Number(fd.get('usefulLifeYears'))||0),source=String(fd.get('source')||'Opening balance'),accountId=String(fd.get('accountId')||''),openingAccumDep=source==='Opening balance'?round(fd.get('openingAccumDep')):0,depreciationStartPeriod=String(fd.get('depreciationStartPeriod')||periodOf(inServiceDate||acquisitionDate)),reference=String(fd.get('reference')||'').trim();
    if(!name||!CATEGORIES.includes(category)||!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)||cost<=0||residualValue<0||residualValue>=cost||lifeYears<=0||!/^\d{4}-\d{2}$/.test(depreciationStartPeriod)){ctx.toast('Complete the asset details. Residual value must be below cost.');return;}\n    if(periodIndex(depreciationStartPeriod)<periodIndex(periodOf(inServiceDate||acquisitionDate))){ctx.toast('Depreciation cannot start before the asset is placed in service.');return;}
    if(openingAccumDep<0||openingAccumDep>cost-residualValue){ctx.toast('Opening accumulated depreciation cannot exceed the depreciable amount.');return;}
    if(window.DalasiMonthClose?.isClosed(state,acquisitionDate)){ctx.toast('That accounting period is closed. Reopen it before registering this asset.');return;}
    if(source==='Cash purchase'&&!window.DalasiCashBank?.accountById?.(state,accountId)){ctx.toast('Choose the Cash & Bank account used to buy this asset.');return;}
    const id='FA-'+Date.now().toString(36).toUpperCase(),assetNo=nextNo(state),now=new Date().toISOString(),asset={id,assetNo,name,category,acquisitionDate,inServiceDate,cost,residualValue,usefulLifeMonths:Math.max(1,Math.round(lifeYears*12)),source,accountId:source==='Cash purchase'?accountId:'',openingAccumDep,depreciationStartPeriod,reference,status:'Active',createdAt:now,createdBy:state.session?.name||'User'};
    if(source==='Cash purchase'){
      const tx=window.DalasiCashBank?.post?.(state,{accountId,date:acquisitionDate,direction:'out',amount:cost,type:'Fixed asset purchase',counterparty:name,reference:reference||assetNo,description:category,sourceType:'fixed_asset',sourceId:id,sourceKey:'fixed_asset:'+id+':purchase',createdBy:state.session?.name||'User'});
      if(!tx){ctx.toast('Unable to post the asset purchase to Cash & Bank.');return;}
      asset.cashTransactionId=tx.id;
    }
    state.fixedAssets=state.fixedAssets||[];state.fixedAssets.unshift(asset);state.assetOpen=false;
    ctx.audit('fixed_assets.asset_created',{assetId:id,assetNo,name,cost,source});ctx.save();ctx.toast(assetNo+' added to the fixed asset register');ctx.render();
  }
  function disposeAsset(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to dispose fixed assets.');return;}
    const id=state.assetDisposeId,asset=(state.fixedAssets||[]).find(x=>x.id===id);if(!asset||asset.status==='Disposed')return;
    const fd=new FormData(ev.target),date=String(fd.get('disposalDate')||todayIso()),proceeds=Math.max(0,round(fd.get('proceeds'))),accountId=String(fd.get('accountId')||''),reference=String(fd.get('reference')||'').trim(),period=periodOf(date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<asset.acquisitionDate){ctx.toast('Enter a valid disposal date after the acquisition date.');return;}
    if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('That accounting period is closed. Reopen it before disposing this asset.');return;}
    if(proceeds>0&&!window.DalasiCashBank?.accountById?.(state,accountId)){ctx.toast('Choose the Cash & Bank account receiving the disposal proceeds.');return;}
    const user=state.session?.name||'User';postDepreciation(asset,period,state,user);
    const accum=accumulated(state,asset),nbv=round(Math.max(0,asset.cost-accum)),gainLoss=round(proceeds-nbv);
    let cashTx=null;if(proceeds>0){cashTx=window.DalasiCashBank?.post?.(state,{accountId,date,direction:'in',amount:proceeds,type:'Fixed asset disposal',counterparty:asset.name,reference:reference||asset.assetNo,description:'Disposal proceeds',sourceType:'fixed_asset',sourceId:asset.id,sourceKey:'fixed_asset:'+asset.id+':disposal',createdBy:user});if(!cashTx){ctx.toast('Unable to post disposal proceeds to Cash & Bank.');return;}}
    asset.status='Disposed';asset.disposalDate=date;asset.disposalProceeds=proceeds;asset.disposalAccountId=proceeds>0?accountId:'';asset.disposalReference=reference;asset.disposalAccumDep=accum;asset.disposalNBV=nbv;asset.disposalGainLoss=gainLoss;asset.disposedAt=new Date().toISOString();asset.disposedBy=user;asset.disposalCashTransactionId=cashTx?.id||'';
    state.assetDisposeId=null;ctx.audit('fixed_assets.asset_disposed',{assetId:asset.id,assetNo:asset.assetNo,date,proceeds,nbv,gainLoss});ctx.save();ctx.toast(asset.assetNo+' disposed');ctx.render();
  }
  function modal(state,h){
    const {field,icon}=h,period=state.assetPeriod||state.currentPeriod||periodOf(todayIso()),cashSelect=(window.DalasiCashBank?.accountSelect?.(state,'accountId','','Cash / bank account used for purchase')||'<select name="accountId" disabled><option>No cash account</option></select>').replace(' required>','>');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-asset"></div><form id="fixed-asset-form" class="modal-box asset-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">FIXED ASSET REGISTER</div><h2>Add fixed asset</h2><p>Register the asset cost and straight-line depreciation policy.</p></div><button type="button" class="close" data-action="close-asset">×</button></div>'+
      '<div class="form-grid">'+field('Asset name','<input name="name" placeholder="e.g. Toyota Hilux" required>')+field('Category','<select name="category">'+CATEGORIES.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select>')+
      field('Acquisition date','<input name="acquisitionDate" type="date" value="'+todayIso()+'" required>')+field('In-service date','<input name="inServiceDate" type="date" value="'+todayIso()+'" required>')+
      field('Cost (GMD)','<input name="cost" type="number" min="0.01" step="0.01" required>')+field('Residual value (GMD)','<input name="residualValue" type="number" min="0" step="0.01" value="0">')+
      field('Useful life (years)','<input name="usefulLifeYears" type="number" min="0.08" step="0.01" value="5" required>')+field('Depreciation starts','<input name="depreciationStartPeriod" type="month" value="'+esc(period)+'" required>')+
      field('Recognition source','<select name="source"><option>Opening balance</option><option>Cash purchase</option></select>')+field('Opening accumulated depreciation','<input name="openingAccumDep" type="number" min="0" step="0.01" value="0">')+
      field('Cash & Bank account',cashSelect)+field('Reference','<input name="reference" placeholder="Invoice, receipt or opening reference">')+'</div>'+
      '<div class="modal-note"><b>Opening balance</b> records an asset brought into DalasiPay without moving cash. <b>Cash purchase</b> also posts the purchase to the selected Cash & Bank account. Straight-line depreciation is posted month by month.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-asset">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' Add asset</button></div></form></div>';
  }
  function disposeModal(state,h){
    const {field,icon}=h,asset=(state.fixedAssets||[]).find(x=>x.id===state.assetDisposeId);if(!asset)return '';
    const cashSelect=(window.DalasiCashBank?.accountSelect?.(state,'accountId','','Account receiving disposal proceeds')||'<select name="accountId" disabled><option>No cash account</option></select>').replace(' required>','>');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-asset-dispose"></div><form id="fixed-asset-dispose-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">ASSET DISPOSAL</div><h2>Dispose '+esc(asset.assetNo)+'</h2><p>'+esc(asset.name)+' · current net book value '+h.money2(netBookValue(state,asset))+'</p></div><button type="button" class="close" data-action="close-asset-dispose">×</button></div>'+
      '<div class="form-grid">'+field('Disposal date','<input name="disposalDate" type="date" value="'+todayIso()+'" required>')+field('Proceeds (GMD)','<input name="proceeds" type="number" min="0" step="0.01" value="0">')+field('Cash & Bank account',cashSelect)+field('Reference','<input name="reference" placeholder="Sale receipt or disposal reference">')+'</div>'+
      '<div class="modal-note">DalasiPay posts any pending straight-line depreciation for the disposal month, removes the asset cost and accumulated depreciation, and records the resulting gain or loss. An account is required only when proceeds are received.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-asset-dispose">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Confirm disposal</button></div></form></div>';
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,s=summary(state),periodsList=periods(state),period=state.assetPeriod||state.currentPeriod||periodsList[0],ps=periodStatus(state,period),assets=state.fixedAssets||[],dep=(state.fixedAssetDepreciation||[]).slice().sort((a,b)=>String(b.period).localeCompare(String(a.period))||String(b.postedAt).localeCompare(String(a.postedAt))).slice(0,80);
    const opts=periodsList.map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(p)+'</option>').join('');
    const rows=assets.length?assets.map(a=>{const acc=accumulated(state,a),nbv=a.status==='Disposed'?0:netBookValue(state,a),action=a.status==='Disposed'?'<span class="bill-no-file">Disposed '+esc(a.disposalDate||'')+'</span>':'<button class="secondary" data-action="asset-dispose:'+esc(a.id)+'">Dispose</button>';return '<tr><td><div class="payment-payee"><b>'+esc(a.assetNo)+'</b><small>'+esc(a.category)+'</small></div></td><td><b>'+esc(a.name)+'</b><small class="cash-sub">'+esc(a.reference||a.source||'')+'</small></td><td>'+esc(a.acquisitionDate)+'</td><td>'+money2(a.cost)+'</td><td>'+money2(acc)+'</td><td><b>'+money2(nbv)+'</b></td><td>'+pill(a.status||'Active',a.status==='Disposed'?'neutral':'ready')+'</td><td>'+action+'</td></tr>';}).join(''):'<tr><td colspan="8"><div class="empty-inline">No fixed assets registered yet.</div></td></tr>';
    const depRows=dep.length?dep.map(x=>{const a=assets.find(y=>y.id===x.assetId);return '<tr><td>'+esc(x.period)+'</td><td><b>'+esc(x.assetNo||a?.assetNo||'')+'</b></td><td>'+esc(x.assetName||a?.name||'')+'</td><td>'+money2(x.amount)+'</td><td>'+esc(x.postedBy||'User')+'</td><td>'+esc(String(x.postedAt||'').replace('T',' ').slice(0,16))+'</td></tr>';}).join(''):'<tr><td colspan="6"><div class="empty-inline">No depreciation has been posted yet.</div></td></tr>';
    return pageTitle('ASSET MANAGEMENT','Fixed Assets','Maintain the fixed asset register, monthly straight-line depreciation and disposals.','<div class="inline-buttons"><button class="secondary" data-action="asset-export">'+icon('download',14)+' Export</button><button class="primary" data-action="open-asset">'+icon('plus',14)+' Add asset</button></div>')+
      '<div class="asset-kpis"><div class="surface"><span>Active assets</span><b>'+s.active+'</b><small>'+s.disposed+' disposed</small></div><div class="surface"><span>Asset cost</span><b>'+money2(s.cost)+'</b><small>active registered assets</small></div><div class="surface"><span>Accumulated depreciation</span><b>'+money2(s.accumulated)+'</b><small>opening + posted depreciation</small></div><div class="surface"><span>Net book value</span><b>'+money2(s.netBookValue)+'</b><small>feeds the Balance Sheet</small></div></div>'+
      '<section class="surface asset-run-card"><div class="table-tools"><div><h3>Monthly depreciation</h3><p>Straight-line depreciation is posted only when you run the selected period.</p></div><div class="inline-buttons"><select id="asset-period-select">'+opts+'</select><button class="primary" data-action="asset-run-depreciation" '+(ps.missing?'':'disabled')+'>'+icon('check',14)+' Run depreciation</button></div></div><div class="asset-run-status"><div><span>Eligible assets</span><b>'+ps.eligible+'</b></div><div><span>Posted</span><b>'+ps.posted+'</b></div><div class="'+(ps.missing?'asset-attention':'')+'"><span>Still due</span><b>'+ps.missing+'</b></div><div><span>Monthly schedule</span><b>'+money2(s.monthly)+'</b></div></div></section>'+
      '<section class="surface employee-card asset-register"><div class="table-tools"><div><h3>Fixed asset register</h3><p>Cost, accumulated depreciation, carrying value and asset status</p></div></div><div class="table-scroll"><table><thead><tr><th>ASSET NO</th><th>ASSET</th><th>ACQUIRED</th><th>COST</th><th>ACCUM. DEP.</th><th>NET BOOK VALUE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>'+
      '<section class="surface employee-card asset-history"><div class="table-tools"><div><h3>Depreciation history</h3><p>Latest 80 posted monthly depreciation records</p></div></div><div class="table-scroll"><table><thead><tr><th>PERIOD</th><th>ASSET NO</th><th>ASSET</th><th>DEPRECIATION</th><th>POSTED BY</th><th>POSTED AT</th></tr></thead><tbody>'+depRows+'</tbody></table></div></section>';
  }
  function exportCsv(state,ctx){
    const rows=[['Asset No','Asset','Category','Acquisition Date','In Service Date','Cost','Residual Value','Useful Life Months','Depreciation Start','Opening Accumulated Depreciation','Posted Depreciation','Net Book Value','Source','Status','Disposal Date','Disposal Proceeds','Gain/Loss'],...(state.fixedAssets||[]).map(a=>[a.assetNo,a.name,a.category,a.acquisitionDate,a.inServiceDate,a.cost,a.residualValue,a.usefulLifeMonths,a.depreciationStartPeriod,a.openingAccumDep||0,postedDepreciation(state,a.id),a.status==='Disposed'?0:netBookValue(state,a),a.source,a.status,a.disposalDate||'',a.disposalProceeds||0,a.disposalGainLoss||0])];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-fixed-assets-'+todayIso()+'.csv',csv);ctx.toast('Fixed asset register downloaded');
  }

  window.DalasiFixedAssets={CATEGORIES,summary,periods,periodStatus,postedDepreciation,accumulated,netBookValue,monthlyDepreciation,depreciationAmount,runDepreciation,createAsset,disposeAsset,modal,disposeModal,render,exportCsv};
})();