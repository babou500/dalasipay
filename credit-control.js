(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const todayIso=()=>new Date().toISOString().slice(0,10);
  function daysBetween(a,b){
    if(!a||!b)return 0;const A=new Date(a+'T00:00:00Z'),B=new Date(b+'T00:00:00Z');return Math.max(0,Math.floor((B-A)/86400000));
  }
  function customerById(state,id){return (state.customers||[]).find(x=>x.id===id)||null;}
  function supplierById(state,id){return (state.paymentBeneficiaries||[]).find(x=>x.id===id)||null;}
  function received(state,invoiceId){return round((state.incomingPayments||[]).filter(x=>x.invoiceId===invoiceId).reduce((a,x)=>a+(Number(x.amount)||0),0));}
  function invoiceStatus(state,inv){return window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');}
  function invoiceBalance(state,inv){return window.DalasiReturns?.invoiceBalance?.(state,inv)??round(Math.max(0,(Number(inv.amount)||0)-received(state,inv.id)));}
  function bucket(daysPastDue){
    if(daysPastDue<=0)return 'Current';
    if(daysPastDue<=30)return '1-30';
    if(daysPastDue<=60)return '31-60';
    if(daysPastDue<=90)return '61-90';
    return '90+';
  }
  function receivableLines(state,asOf=todayIso()){
    return (state.customerInvoices||[]).filter(inv=>!['Draft','Paid'].includes(invoiceStatus(state,inv))).map(inv=>{
      const balance=invoiceBalance(state,inv);if(balance<=0)return null;
      const due=String(inv.dueDate||inv.issueDate||asOf),days=due<asOf?daysBetween(due,asOf):0;
      return {id:inv.id,invoiceNo:inv.invoiceNo||inv.id,customerId:inv.customerId||'',customer:inv.customerName||customerById(state,inv.customerId)?.name||'Customer',issueDate:inv.issueDate||'',dueDate:due,balance,daysPastDue:days,bucket:bucket(days),status:invoiceStatus(state,inv)};
    }).filter(Boolean);
  }
  function payableLines(state,asOf=todayIso()){
    return (state.businessBills||[]).filter(b=>!['Draft','Paid'].includes(b.status||'Draft')&&!b.paymentId).map(b=>{
      const amount=window.DalasiReturns?.billBalance?.(state,b)??round(b.amount),due=String(b.dueDate||b.invoiceDate||asOf),days=due<asOf?daysBetween(due,asOf):0;if(amount<=.004)return null;
      return {id:b.id,invoiceNo:b.invoiceNo||b.id,supplierId:b.beneficiaryId||'',supplier:b.supplier||supplierById(state,b.beneficiaryId)?.name||'Supplier',invoiceDate:b.invoiceDate||'',dueDate:due,balance:amount,daysPastDue:days,bucket:bucket(days),status:b.status||'Approved'};
    }).filter(Boolean);
  }
  function bucketTotals(lines){
    const out={Current:0,'1-30':0,'31-60':0,'61-90':0,'90+':0,total:0,overdue:0};
    lines.forEach(x=>{out[x.bucket]=round(out[x.bucket]+x.balance);out.total=round(out.total+x.balance);if(x.daysPastDue>0)out.overdue=round(out.overdue+x.balance);});return out;
  }
  function lastFollowUp(state,customerId){
    return (state.creditFollowUps||[]).filter(x=>x.customerId===customerId).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;
  }
  function customerExposure(state,customerId){
    const c=customerById(state,customerId),lines=receivableLines(state).filter(x=>x.customerId===customerId),tot=bucketTotals(lines),limit=Math.max(0,Number(c?.creditLimit)||0),utilization=limit?round(tot.total/limit*100):0,exceeded=limit?round(Math.max(0,tot.total-limit)):0,last=lastFollowUp(state,customerId);
    let risk='Low';
    if(tot['90+']>0||exceeded>0||(c?.creditStatus||'Open')==='Hold')risk='High';
    else if(tot['31-60']>0||tot['61-90']>0||(limit&&utilization>=80))risk='Medium';
    const oldest=Math.max(0,...lines.map(x=>x.daysPastDue));
    return {customer:c,lines,...tot,limit,utilization,exceeded,risk,oldest,lastFollowUp:last};
  }
  function customerRows(state){
    const ids=new Set((state.customers||[]).map(x=>x.id));receivableLines(state).forEach(x=>{if(x.customerId)ids.add(x.customerId)});
    return [...ids].map(id=>customerExposure(state,id)).filter(x=>x.customer||x.total).sort((a,b)=>{
      const rank={High:3,Medium:2,Low:1};return rank[b.risk]-rank[a.risk]||b.overdue-a.overdue||b.total-a.total;
    });
  }
  function supplierRows(state){
    const lines=payableLines(state),map=new Map();
    lines.forEach(x=>{const key=x.supplierId||'name:'+x.supplier;if(!map.has(key))map.set(key,{id:x.supplierId,name:x.supplier,lines:[]});map.get(key).lines.push(x);});
    return [...map.values()].map(x=>({...x,...bucketTotals(x.lines),oldest:Math.max(0,...x.lines.map(y=>y.daysPastDue))})).sort((a,b)=>b.overdue-a.overdue||b.total-a.total);
  }
  function summary(state){
    const ar=bucketTotals(receivableLines(state)),ap=bucketTotals(payableLines(state)),customers=customerRows(state);
    return {ar,ap,highRisk:customers.filter(x=>x.risk==='High').length,onHold:customers.filter(x=>(x.customer?.creditStatus||'Open')==='Hold').length,overLimit:customers.filter(x=>x.exceeded>0).length};
  }
  function followUpModal(state,h){
    const {field,icon,money2}=h,c=customerById(state,state.collectionCustomerId);if(!c)return '';
    const e=customerExposure(state,c.id);
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-credit-followup"></div><form id="credit-followup-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">CREDIT CONTROL</div><h2>Log collection follow-up</h2><p>'+esc(c.name)+' · outstanding '+money2(e.total)+' · overdue '+money2(e.overdue)+'</p></div><button type="button" class="close" data-action="close-credit-followup">×</button></div>'+
      '<input type="hidden" name="customerId" value="'+esc(c.id)+'"><div class="form-grid">'+
        field('Contact method','<select name="method"><option>Phone call</option><option>Email</option><option>WhatsApp</option><option>Promise to pay</option><option>Dispute</option><option>Meeting</option><option>Other</option></select>')+
        field('Outcome','<select name="outcome"><option>Contacted</option><option>Promise received</option><option>No response</option><option>Disputed</option><option>Escalated</option><option>Resolved</option></select>')+
        field('Promise / expected payment date','<input name="promiseDate" type="date">')+
        field('Next follow-up date','<input name="nextFollowUp" type="date" value="'+todayIso()+'">')+
      '</div>'+field('Collection note','<input name="note" placeholder="What was agreed or what should happen next?" required>')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-credit-followup">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' Save follow-up</button></div></form></div>';
  }
  function saveFollowUp(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update credit control.');return;}
    const fd=new FormData(ev.target),customerId=String(fd.get('customerId')||''),c=customerById(state,customerId),note=String(fd.get('note')||'').trim();if(!c||!note){ctx.toast('Customer and collection note are required.');return;}
    state.creditFollowUps=state.creditFollowUps||[];
    const rec={id:'CRF-'+Date.now().toString(36).toUpperCase(),customerId,customerName:c.name,method:String(fd.get('method')||'Phone call'),outcome:String(fd.get('outcome')||'Contacted'),promiseDate:String(fd.get('promiseDate')||''),nextFollowUp:String(fd.get('nextFollowUp')||''),note,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'};
    state.creditFollowUps.unshift(rec);state.collectionCustomerId=null;ctx.audit('credit.followup_logged',{customerId,method:rec.method,outcome:rec.outcome,nextFollowUp:rec.nextFollowUp});ctx.save();ctx.toast('Collection follow-up saved');ctx.render();
  }
  function limitModal(state,h){
    const {field,icon,money2}=h,c=customerById(state,state.creditLimitCustomerId);if(!c)return '';const e=customerExposure(state,c.id);
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-credit-limit"></div><form id="credit-limit-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">CUSTOMER CREDIT</div><h2>Credit settings</h2><p>'+esc(c.name)+' · current exposure '+money2(e.total)+'</p></div><button type="button" class="close" data-action="close-credit-limit">×</button></div>'+
      '<input type="hidden" name="customerId" value="'+esc(c.id)+'"><div class="form-grid">'+
        field('Credit limit (GMD)','<input name="creditLimit" type="number" min="0" step="0.01" value="'+Number(c.creditLimit||0)+'">')+
        field('Credit status','<select name="creditStatus"><option '+((c.creditStatus||'Open')==='Open'?'selected':'')+'>Open</option><option '+(c.creditStatus==='Hold'?'selected':'')+'>Hold</option></select>')+
      '</div>'+field('Credit note','<input name="creditNote" value="'+esc(c.creditNote||'')+'" placeholder="Internal reason, approval or limit note">')+
      '<div class="modal-note">A credit hold blocks new customer invoices. A credit limit is monitored and highlighted when exceeded, but does not automatically block invoicing.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-credit-limit">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' Save credit settings</button></div></form></div>';
  }
  function saveLimit(ev,state,ctx){
    ev.preventDefault();if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can change customer credit limits or holds.');return;}
    const fd=new FormData(ev.target),c=customerById(state,String(fd.get('customerId')||''));if(!c)return;
    c.creditLimit=Math.max(0,round(fd.get('creditLimit')));c.creditStatus=String(fd.get('creditStatus'))==='Hold'?'Hold':'Open';c.creditNote=String(fd.get('creditNote')||'').trim();c.updatedAt=new Date().toISOString();c.updatedBy=state.session?.name||'User';
    state.creditLimitCustomerId=null;ctx.audit('credit.settings_updated',{customerId:c.id,creditLimit:c.creditLimit,creditStatus:c.creditStatus});ctx.save();ctx.toast('Customer credit settings updated');ctx.render();
  }
  function setHold(id,status,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can place or release a credit hold.');return;}
    const c=customerById(state,id);if(!c)return;c.creditStatus=status==='Hold'?'Hold':'Open';c.updatedAt=new Date().toISOString();c.updatedBy=state.session?.name||'User';ctx.audit('credit.hold_updated',{customerId:id,status:c.creditStatus});ctx.save();ctx.toast(c.name+': credit '+c.creditStatus.toLowerCase());ctx.render();
  }
  function exportAging(state,type,ctx){
    const lines=type==='ap'?payableLines(state):receivableLines(state),title=type==='ap'?'Payables':'Receivables';
    const headers=type==='ap'?['Supplier','Invoice','Invoice Date','Due Date','Balance','Days Past Due','Age Bucket','Status']:['Customer','Invoice','Issue Date','Due Date','Balance','Days Past Due','Age Bucket','Status'];
    const data=lines.map(x=>type==='ap'?[x.supplier,x.invoiceNo,x.invoiceDate,x.dueDate,x.balance,x.daysPastDue,x.bucket,x.status]:[x.customer,x.invoiceNo,x.issueDate,x.dueDate,x.balance,x.daysPastDue,x.bucket,x.status]);
    const csv=[headers,...data].map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-'+type+'-aging-'+todayIso()+'.csv',csv);ctx.toast(title+' ageing report downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,view=state.creditControlView==='ap'?'ap':'ar',sum=summary(state),ar=customerRows(state),ap=supplierRows(state),bucketData=view==='ar'?sum.ar:sum.ap;
    const agingCards=['Current','1-30','31-60','61-90','90+'].map(k=>'<div class="surface"><span>'+esc(k==='Current'?'Current / not due':k+' days')+'</span><b>'+money2(bucketData[k])+'</b><small>'+(k==='Current'?'not yet overdue':'past due')+'</small></div>').join('');
    const customerTable=ar.length?ar.map(x=>{
      const c=x.customer||{},last=x.lastFollowUp,riskClass=x.risk==='High'?'credit-high':x.risk==='Medium'?'credit-medium':'credit-low';
      return '<tr><td><div class="payment-payee"><b>'+esc(c.name||'Customer')+'</b><small>'+esc(c.reference||c.id||'')+'</small></div></td><td>'+money2(x.total)+'</td><td>'+money2(x.overdue)+'</td><td>'+x.oldest+' days</td><td><div class="credit-limit-cell"><b>'+money2(x.limit)+'</b><small>'+(x.limit?(x.utilization.toFixed(0)+'% used'):'No limit')+(x.exceeded?' · '+money2(x.exceeded)+' over':'')+'</small></div></td><td><span class="credit-risk '+riskClass+'">'+x.risk+'</span></td><td>'+pill(c.creditStatus||'Open',c.creditStatus==='Hold'?'neutral':'ready')+'</td><td><div class="payment-payee"><b>'+(last?esc(last.outcome):'No follow-up')+'</b><small>'+(last?(esc(last.nextFollowUp||last.createdAt.slice(0,10))+' · '+esc(last.method)):'')+'</small></div></td><td><div class="inline-buttons"><button class="secondary tiny" data-action="credit-followup:'+esc(c.id)+'">Follow up</button><button class="secondary tiny" data-action="credit-limit:'+esc(c.id)+'">Credit</button>'+(c.creditStatus==='Hold'?'<button class="secondary tiny" data-action="credit-hold:'+esc(c.id)+':Open">Release</button>':'<button class="secondary tiny" data-action="credit-hold:'+esc(c.id)+':Hold">Hold</button>')+'</div></td></tr>';
    }).join(''):'<tr><td colspan="9"><div class="empty-inline">No customer balances to review.</div></td></tr>';
    const supplierTable=ap.length?ap.map(x=>'<tr><td><div class="payment-payee"><b>'+esc(x.name)+'</b><small>'+esc(x.id||'One-off supplier')+'</small></div></td><td>'+money2(x.total)+'</td><td>'+money2(x.overdue)+'</td><td>'+money2(x['1-30'])+'</td><td>'+money2(x['31-60'])+'</td><td>'+money2(x['61-90'])+'</td><td>'+money2(x['90+'])+'</td><td>'+x.oldest+' days</td></tr>').join(''):'<tr><td colspan="8"><div class="empty-inline">No supplier balances to review.</div></td></tr>';
    return pageTitle('WORKING CAPITAL','Credit Control','Age receivables and payables, monitor customer credit exposure and manage collection follow-ups.','<div class="inline-buttons"><button class="secondary" data-action="credit-export">'+icon('download',14)+' Export ageing</button></div>')+
      '<div class="credit-tabs"><button class="'+(view==='ar'?'active':'')+'" data-action="credit-view:ar">Receivables</button><button class="'+(view==='ap'?'active':'')+'" data-action="credit-view:ap">Payables</button></div>'+
      '<div class="credit-summary"><div class="surface"><span>'+(view==='ar'?'Receivables outstanding':'Payables outstanding')+'</span><b>'+money2(bucketData.total)+'</b><small>'+money2(bucketData.overdue)+' overdue</small></div><div class="surface '+(sum.highRisk?'credit-alert':'')+'"><span>High-risk customers</span><b>'+sum.highRisk+'</b><small>90+ days, over limit or on hold</small></div><div class="surface"><span>Credit holds</span><b>'+sum.onHold+'</b><small>new invoices blocked</small></div><div class="surface '+(sum.overLimit?'credit-alert':'')+'"><span>Over credit limit</span><b>'+sum.overLimit+'</b><small>customers above approved exposure</small></div></div>'+
      '<div class="credit-aging">'+agingCards+'</div>'+
      (view==='ar'?'<section class="surface employee-card credit-table"><div class="table-tools"><div><h3>Customer collection priorities</h3><p>Sorted by risk, overdue balance and total exposure</p></div></div><div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>OUTSTANDING</th><th>OVERDUE</th><th>OLDEST</th><th>CREDIT LIMIT</th><th>RISK</th><th>STATUS</th><th>LAST / NEXT FOLLOW-UP</th><th>ACTION</th></tr></thead><tbody>'+customerTable+'</tbody></table></div></section>':
      '<section class="surface employee-card credit-table"><div class="table-tools"><div><h3>Supplier payable ageing</h3><p>Open approved supplier invoices grouped by days past due</p></div></div><div class="table-scroll"><table><thead><tr><th>SUPPLIER</th><th>TOTAL</th><th>OVERDUE</th><th>1–30</th><th>31–60</th><th>61–90</th><th>90+</th><th>OLDEST</th></tr></thead><tbody>'+supplierTable+'</tbody></table></div></section>')+
      (view==='ar'?'<section class="surface employee-card credit-history"><div class="table-tools"><div><h3>Recent collection activity</h3><p>Latest 50 calls, messages, promises and disputes</p></div></div><div class="table-scroll"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>METHOD</th><th>OUTCOME</th><th>PROMISE DATE</th><th>NEXT FOLLOW-UP</th><th>NOTE</th></tr></thead><tbody>'+((state.creditFollowUps||[]).slice(0,50).map(x=>'<tr><td>'+esc(String(x.createdAt||'').slice(0,10))+'</td><td>'+esc(x.customerName)+'</td><td>'+esc(x.method)+'</td><td>'+esc(x.outcome)+'</td><td>'+esc(x.promiseDate||'—')+'</td><td>'+esc(x.nextFollowUp||'—')+'</td><td>'+esc(x.note)+'</td></tr>').join('')||'<tr><td colspan="7"><div class="empty-inline">No collection follow-ups logged yet.</div></td></tr>')+'</tbody></table></div></section>':'');
  }

  window.DalasiCreditControl={daysBetween,bucket,receivableLines,payableLines,bucketTotals,customerExposure,customerRows,supplierRows,summary,followUpModal,saveFollowUp,limitModal,saveLimit,setHold,exportAging,render};
})();