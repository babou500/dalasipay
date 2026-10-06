(function(){
  'use strict';

  const DEFAULTS={vatRegistered:false,tin:'',vatRegistrationNo:'',standardRate:15,compulsoryThreshold:2000000,voluntaryThreshold:1000000,filingDay:15,verifiedAt:'2026-10-06'};
  const CODES={
    STD:{code:'STD',label:'Standard-rated VAT',short:'Standard 15%',taxable:true,vat:true},
    ZERO:{code:'ZERO',label:'Zero-rated supply',short:'Zero-rated 0%',taxable:true,vat:false},
    TNR:{code:'TNR',label:'Taxable supply — not VAT registered',short:'Taxable · no VAT',taxable:true,vat:false},
    EXEMPT:{code:'EXEMPT',label:'Exempt supply',short:'Exempt',taxable:false,vat:false},
    OUT:{code:'OUT',label:'Out of scope / no VAT',short:'Out of scope',taxable:false,vat:false}
  };
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const periodOf=v=>String(v||'').slice(0,7);
  const settings=state=>Object.assign({},DEFAULTS,state.taxSettings||{});
  function code(code){return CODES[code]||CODES.OUT;}
  function defaultSalesCode(state){return settings(state).vatRegistered?'STD':'TNR';}
  function defaultPurchaseCode(state){return settings(state).vatRegistered?'STD':'OUT';}
  function rateFor(state,docOrCode){
    if(docOrCode&&typeof docOrCode==='object'&&Number.isFinite(Number(docOrCode.vatRate)))return Number(docOrCode.vatRate)||0;
    const c=typeof docOrCode==='string'?docOrCode:docOrCode?.taxCode;
    return c==='STD'?(Number(settings(state).standardRate)||0):0;
  }
  function splitGross(gross,rate){
    gross=round(gross);rate=Math.max(0,Number(rate)||0);
    if(!rate)return {gross,net:gross,vat:0};
    const vat=round(gross*rate/(100+rate));return {gross,net:round(gross-vat),vat};
  }
  function snapshot(state,gross,taxCode,side='sale'){
    const c=code(taxCode),cfg=settings(state),rate=c.code==='STD'?(Number(cfg.standardRate)||0):0,sp=splitGross(gross,rate);
    const registered=!!cfg.vatRegistered,chargeVat=c.code==='STD'&&registered,zero=c.code==='ZERO',taxable=c.taxable;
    if(side==='purchase'){
      const recoverable=chargeVat;
      return {taxCode:c.code,vatRate:chargeVat?rate:0,taxGross:round(gross),taxNet:recoverable?sp.net:round(gross),vatAmount:recoverable?sp.vat:0,vatRecoverable:recoverable,taxableTurnover:false};
    }
    if(c.code==='STD'&&registered)return {taxCode:c.code,vatRate:rate,taxGross:round(gross),taxNet:sp.net,vatAmount:sp.vat,vatRecoverable:false,taxableTurnover:true};
    return {taxCode:c.code,vatRate:0,taxGross:round(gross),taxNet:round(gross),vatAmount:0,vatRecoverable:false,taxableTurnover:taxable||zero};
  }
  function meta(state,doc,side='sale'){
    const gross=round(doc?.amount||doc?.taxGross||0),taxCode=doc?.taxCode||'OUT';
    if(doc&&Number.isFinite(Number(doc.taxNet))&&Number.isFinite(Number(doc.vatAmount))){
      return {taxCode,vatRate:Number(doc.vatRate)||0,taxGross:gross,taxNet:round(doc.taxNet),vatAmount:round(doc.vatAmount),vatRecoverable:!!doc.vatRecoverable,taxableTurnover:doc.taxableTurnover!==false&&code(taxCode).taxable};
    }
    return snapshot(state,gross,taxCode,side);
  }
  function salesOptions(state,selected=''){
    const cfg=settings(state),def=selected||defaultSalesCode(state);
    const rows=cfg.vatRegistered?['STD','ZERO','EXEMPT','OUT']:['TNR','ZERO','EXEMPT','OUT'];
    return '<select name="taxCode">'+rows.map(k=>'<option value="'+k+'" '+(def===k?'selected':'')+'>'+esc(CODES[k].label)+(k==='STD'?' · '+Number(cfg.standardRate||15)+'%':'')+'</option>').join('')+'</select>';
  }
  function purchaseOptions(state,selected=''){
    const cfg=settings(state),def=selected||defaultPurchaseCode(state),rows=cfg.vatRegistered?['STD','ZERO','EXEMPT','OUT']:['OUT','EXEMPT'];
    return '<select name="taxCode">'+rows.map(k=>'<option value="'+k+'" '+(def===k?'selected':'')+'>'+esc(CODES[k].label)+(k==='STD'?' · '+Number(cfg.standardRate||15)+'% recoverable':'')+'</option>').join('')+'</select>';
  }
  function dueDate(period,state){
    const m=String(period||'').match(/^(\d{4})-(\d{2})$/);if(!m)return '';
    const y=Number(m[1]),mo=Number(m[2]),d=Math.min(28,Math.max(1,Number(settings(state).filingDay)||15));
    return new Date(Date.UTC(y,mo,d)).toISOString().slice(0,10);
  }
  function periodList(state){
    const set=new Set((state.periods||[]).map(x=>x.id));
    const add=d=>{const p=periodOf(d);if(/^\d{4}-\d{2}$/.test(p))set.add(p);};
    (state.customerInvoices||[]).forEach(x=>add(x.issueDate||x.createdAt));
    (state.businessExpenses||[]).forEach(x=>add(x.expenseDate||x.createdAt));
    (state.businessBills||[]).forEach(x=>add(x.invoiceDate||x.createdAt));
    (state.taxAdjustments||[]).forEach(x=>add(x.date));
    (state.customerCreditNotes||[]).forEach(x=>add(x.date));
    (state.supplierCreditNotes||[]).forEach(x=>add(x.date));
    (state.vatReturns||[]).forEach(x=>set.add(x.period));
    if(/^\d{4}-\d{2}$/.test(String(state.currentPeriod||'')))set.add(state.currentPeriod);
    return [...set].sort().reverse();
  }
  function returnRecord(state,period){return (state.vatReturns||[]).find(x=>x.period===period&&x.status==='Filed')||null;}
  function paymentsForPeriod(state,period){return (state.vatPayments||[]).filter(x=>x.period===period);}
  function returnSummary(state,period){
    const start=period+'-01',end=period+'-31',inPeriod=d=>{const x=String(d||'').slice(0,10);return x>=start&&x<=end;};
    const issued=(state.customerInvoices||[]).filter(inv=>{
      const s=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft');return s!=='Draft'&&inPeriod(inv.issueDate||inv.createdAt);
    });
    let stdSalesGross=0,stdSalesNet=0,outputVat=0,zeroSales=0,exemptSales=0,taxableNoVat=0,outSales=0;
    const direct=(state.revenueEntries||[]).filter(x=>inPeriod(x.revenueDate||x.createdAt));
    [...issued,...direct].forEach(inv=>{const m=meta(state,inv,'sale');if(m.taxCode==='STD'){stdSalesGross+=m.taxGross;stdSalesNet+=m.taxNet;outputVat+=m.vatAmount}else if(m.taxCode==='ZERO')zeroSales+=m.taxGross;else if(m.taxCode==='TNR')taxableNoVat+=m.taxGross;else if(m.taxCode==='EXEMPT')exemptSales+=m.taxGross;else outSales+=m.taxGross;});
    const salesCredits=(state.customerCreditNotes||[]).filter(x=>x.status!=='Void'&&inPeriod(x.date||x.createdAt));
    salesCredits.forEach(c=>{const m=meta(state,c,'sale');if(m.taxCode==='STD'){stdSalesGross-=m.taxGross;stdSalesNet-=m.taxNet;outputVat-=m.vatAmount}else if(m.taxCode==='ZERO')zeroSales-=m.taxGross;else if(m.taxCode==='TNR')taxableNoVat-=m.taxGross;else if(m.taxCode==='EXEMPT')exemptSales-=m.taxGross;else outSales-=m.taxGross;});
    const expenses=(state.businessExpenses||[]).filter(x=>['Approved','Paid'].includes(x.status)&&inPeriod(x.expenseDate||x.createdAt));
    const bills=(state.businessBills||[]).filter(x=>(x.status||'Draft')!=='Draft'&&inPeriod(x.invoiceDate||x.createdAt));
    let inputVat=0,purchaseGross=0,purchaseNet=0;
    [...expenses,...bills].forEach(x=>{const m=meta(state,x,'purchase');purchaseGross+=m.taxGross;purchaseNet+=m.taxNet;if(m.vatRecoverable)inputVat+=m.vatAmount;});
    const purchaseCredits=(state.supplierCreditNotes||[]).filter(x=>x.status!=='Void'&&inPeriod(x.date||x.createdAt));purchaseCredits.forEach(c=>{const m=meta(state,c,'purchase');purchaseGross-=m.taxGross;purchaseNet-=m.taxNet;if(m.vatRecoverable)inputVat-=m.vatAmount;});
    let manualOutput=0,manualInput=0;
    (state.taxAdjustments||[]).filter(x=>inPeriod(x.date)).forEach(x=>{if(x.direction==='Output')manualOutput+=Number(x.vatAmount)||0;else manualInput+=Number(x.vatAmount)||0;});
    outputVat=round(outputVat);inputVat=round(inputVat);manualOutput=round(manualOutput);manualInput=round(manualInput);
    const totalOutput=round(outputVat+manualOutput),totalInput=round(inputVat+manualInput),netVat=round(totalOutput-totalInput);
    const payments=round(paymentsForPeriod(state,period).reduce((a,x)=>a+(Number(x.amount)||0),0));
    return {period,issued:issued.length,direct:direct.length,salesCredits:salesCredits.length,purchaseCredits:purchaseCredits.length,stdSalesGross:round(stdSalesGross),stdSalesNet:round(stdSalesNet),outputVat,zeroSales:round(zeroSales),exemptSales:round(exemptSales),taxableNoVat:round(taxableNoVat),outSales:round(outSales),purchaseGross:round(purchaseGross),purchaseNet:round(purchaseNet),inputVat,manualOutput,manualInput,totalOutput,totalInput,netVat,payments,outstanding:round(Math.max(0,netVat-payments)),credit:round(Math.max(0,-netVat)),dueDate:dueDate(period,state),filed:returnRecord(state,period)};
  }
  function yearTurnover(state,year){
    let taxable=0,total=0,classified=0;
    (state.customerInvoices||[]).forEach(inv=>{
      const s=window.DalasiSalesInvoices?.status?.(state,inv)||(inv.status||'Draft'),date=String(inv.issueDate||inv.createdAt||'');
      if(s==='Draft'||!date.startsWith(String(year)))return;
      total+=Number(inv.amount)||0;const m=meta(state,inv,'sale');if(['STD','ZERO','TNR'].includes(m.taxCode))taxable+=m.taxGross;if(inv.taxCode)classified++;
    });
    (state.revenueEntries||[]).forEach(x=>{const date=String(x.revenueDate||x.createdAt||'');if(!date.startsWith(String(year)))return;total+=Number(x.amount)||0;const m=meta(state,x,'sale');if(['STD','ZERO','TNR'].includes(m.taxCode))taxable+=m.taxGross;if(x.taxCode)classified++;});
    (state.customerCreditNotes||[]).filter(x=>x.status!=='Void').forEach(x=>{const date=String(x.date||x.createdAt||'');if(!date.startsWith(String(year)))return;const m=meta(state,x,'sale');total-=m.taxGross;if(['STD','ZERO','TNR'].includes(m.taxCode))taxable-=m.taxGross;});
    return {total:round(total),taxable:round(taxable),classified,count:(state.customerInvoices||[]).filter(inv=>String(inv.issueDate||inv.createdAt||'').startsWith(String(year))).length};
  }
  function modalSettings(state,h){
    const {field,icon}=h,cfg=settings(state);
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-tax-settings"></div><form id="tax-settings-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">GRA / VAT SETTINGS</div><h2>Tax settings</h2><p>Verified Gambia VAT defaults remain editable for future legal changes or entity-specific treatment.</p></div><button type="button" class="close" data-action="close-tax-settings">×</button></div>'+
      '<div class="form-grid">'+
        field('VAT registration status','<select name="vatRegistered"><option value="no" '+(!cfg.vatRegistered?'selected':'')+'>Not VAT registered</option><option value="yes" '+(cfg.vatRegistered?'selected':'')+'>VAT registered</option></select>')+
        field('TIN','<input name="tin" value="'+esc(cfg.tin||'')+'" placeholder="Taxpayer Identification Number">')+
        field('VAT registration number','<input name="vatRegistrationNo" value="'+esc(cfg.vatRegistrationNo||'')+'" placeholder="If separately issued">')+
        field('Standard VAT rate (%)','<input name="standardRate" type="number" min="0" max="100" step="0.01" value="'+Number(cfg.standardRate||15)+'">')+
        field('Compulsory registration threshold (GMD)','<input name="compulsoryThreshold" type="number" min="0" step="1" value="'+Number(cfg.compulsoryThreshold||2000000)+'">')+
        field('Voluntary registration threshold (GMD)','<input name="voluntaryThreshold" type="number" min="0" step="1" value="'+Number(cfg.voluntaryThreshold||1000000)+'">')+
        field('Monthly filing due day','<input name="filingDay" type="number" min="1" max="28" step="1" value="'+Number(cfg.filingDay||15)+'">')+
      '</div>'+
      '<div class="modal-note">DalasiPay defaults to the GRA-published 15% standard VAT rate, D2,000,000 compulsory registration threshold, D1,000,000 voluntary threshold and monthly filing due 15 days after month-end. Verify changes against current GRA guidance before editing.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-tax-settings">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' Save tax settings</button></div></form></div>';
  }
  function saveSettings(ev,state,ctx){
    ev.preventDefault();if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can change tax settings.');return;}
    const fd=new FormData(ev.target),rate=Math.max(0,Math.min(100,Number(fd.get('standardRate'))||0)),comp=Math.max(0,Number(fd.get('compulsoryThreshold'))||0),vol=Math.max(0,Number(fd.get('voluntaryThreshold'))||0),day=Math.min(28,Math.max(1,Number(fd.get('filingDay'))||15));
    state.taxSettings={vatRegistered:String(fd.get('vatRegistered'))==='yes',tin:String(fd.get('tin')||'').trim(),vatRegistrationNo:String(fd.get('vatRegistrationNo')||'').trim(),standardRate:rate,compulsoryThreshold:comp,voluntaryThreshold:vol,filingDay:day,verifiedAt:DEFAULTS.verifiedAt,updatedAt:new Date().toISOString(),updatedBy:state.session?.name||'User'};
    state.taxSettingsOpen=false;ctx.audit('tax.settings_updated',{vatRegistered:state.taxSettings.vatRegistered,standardRate:rate,compulsoryThreshold:comp,voluntaryThreshold:vol,filingDay:day});ctx.save();ctx.toast('Tax settings updated');ctx.render();
  }
  function adjustmentModal(state,h){
    const {field,icon}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-tax-adjustment"></div><form id="tax-adjustment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">VAT ADJUSTMENT</div><h2>Add VAT return adjustment</h2><p>Use for supported VAT items that are not represented by a DalasiPay sales invoice, expense or supplier bill.</p></div><button type="button" class="close" data-action="close-tax-adjustment">×</button></div>'+
      '<div class="form-grid">'+field('Direction','<select name="direction"><option>Input</option><option>Output</option></select>')+field('Date','<input name="date" type="date" value="'+todayIso()+'" required>')+field('Taxable base / reference amount','<input name="taxBase" type="number" min="0" step="0.01" value="0">')+field('VAT amount','<input name="vatAmount" type="number" min="0.01" step="0.01" required>')+field('Reference','<input name="reference" placeholder="Import entry, credit note or adjustment ref">')+field('Description','<input name="description" placeholder="Reason for the VAT adjustment">')+'</div>'+
      '<div class="modal-note">This adjustment affects the VAT return working paper only. It does not create a general-ledger journal. Use a normal accounting journal as well if the underlying transaction is not already recorded elsewhere.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-tax-adjustment">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Add adjustment</button></div></form></div>';
  }
  function saveAdjustment(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add VAT adjustments.');return;}
    const fd=new FormData(ev.target),date=String(fd.get('date')||''),amount=round(fd.get('vatAmount'));if(!date||amount<=0){ctx.toast('Adjustment date and VAT amount are required.');return;}if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('That accounting period is closed. Reopen it before adding a VAT adjustment.');return;}
    const rec={id:'VATADJ-'+Date.now().toString(36).toUpperCase(),direction:String(fd.get('direction'))==='Output'?'Output':'Input',date,taxBase:round(fd.get('taxBase')),vatAmount:amount,reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'};
    state.taxAdjustments=state.taxAdjustments||[];state.taxAdjustments.unshift(rec);state.taxAdjustmentOpen=false;ctx.audit('tax.vat_adjustment_added',{id:rec.id,direction:rec.direction,date,vatAmount:amount});ctx.save();ctx.toast('VAT adjustment added');ctx.render();
  }
  function fileReturn(period,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can mark a VAT return filed.');return;}
    if(!settings(state).vatRegistered){ctx.toast('Set the workspace as VAT registered before filing a VAT return.');return;}
    if(returnRecord(state,period)){ctx.toast('This VAT return is already marked filed.');return;}
    if(!window.DalasiMonthClose?.record?.(state,period)){ctx.toast('Close the accounting month before marking its VAT return filed.');return;}
    const s=returnSummary(state,period),now=new Date().toISOString(),rec={id:'VATR-'+Date.now().toString(36).toUpperCase(),period,status:'Filed',snapshot:{...s,filed:null},filedAt:now,filedBy:state.session?.name||'User',dueDate:s.dueDate};
    state.vatReturns=state.vatReturns||[];state.vatReturns.unshift(rec);ctx.audit('tax.vat_return_filed',{period,netVat:s.netVat,dueDate:s.dueDate});ctx.save();ctx.toast(period+' VAT return marked filed');ctx.render();
  }
  function reopenReturn(period,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can reopen a VAT return.');return;}
    const r=returnRecord(state,period);if(!r){ctx.toast('Filed VAT return not found.');return;}if(paymentsForPeriod(state,period).length){ctx.toast('Reverse or resolve recorded VAT payments before reopening this return.');return;}
    r.status='Reopened';r.reopenedAt=new Date().toISOString();r.reopenedBy=state.session?.name||'User';ctx.audit('tax.vat_return_reopened',{period,returnId:r.id});ctx.save();ctx.toast(period+' VAT return reopened');ctx.render();
  }
  function paymentModal(state,h){
    const {field,icon,money2}=h,period=state.taxPeriod||state.currentPeriod,s=returnSummary(state,period),account=(window.DalasiCashBank?.accountSelect?.(state,'accountId','','Account used to pay GRA')||'<select disabled><option>No cash account</option></select>');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-vat-payment"></div><form id="vat-payment-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">GRA PAYMENT</div><h2>Record VAT payment</h2><p>'+esc(period)+' · outstanding '+money2(s.outstanding)+'</p></div><button type="button" class="close" data-action="close-vat-payment">×</button></div>'+
      '<div class="form-grid">'+field('Payment date','<input name="date" type="date" value="'+todayIso()+'" required>')+field('Amount (GMD)','<input name="amount" type="number" min="0.01" max="'+Math.max(0,s.outstanding)+'" step="0.01" value="'+Math.max(0,s.outstanding)+'" required>')+field('Cash & Bank account',account)+field('Reference','<input name="reference" placeholder="GRA receipt / payment ID">')+'</div>'+
      '<div class="modal-note">Record a payment only after the VAT return is filed. DalasiPay posts the cash movement and clears the VAT output-payable control account by the amount paid.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-vat-payment">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Record VAT payment</button></div></form></div>';
  }
  function savePayment(ev,state,ctx){
    ev.preventDefault();if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can record VAT payments.');return;}
    const period=state.taxPeriod||state.currentPeriod,s=returnSummary(state,period);if(!returnRecord(state,period)){ctx.toast('Mark the VAT return filed before recording payment.');return;}
    const fd=new FormData(ev.target),date=String(fd.get('date')||''),amount=round(fd.get('amount')),accountId=String(fd.get('accountId')||''),reference=String(fd.get('reference')||'').trim();
    if(!date||amount<=0||amount>s.outstanding+.01){ctx.toast('Enter a valid VAT payment amount not exceeding the outstanding balance.');return;}if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('The payment date falls in a closed accounting period. Reopen it before recording payment.');return;}
    const tx=window.DalasiCashBank?.post?.(state,{accountId,date,direction:'out',amount,type:'VAT payment',counterparty:'Gambia Revenue Authority',reference,description:'VAT payment for '+period,sourceType:'vat-payment',sourceId:period,sourceKey:'vat-payment:'+period+':'+Date.now(),createdBy:state.session?.name||'User'});
    if(!tx){ctx.toast('Choose a valid Cash & Bank account.');return;}
    state.vatPayments=state.vatPayments||[];const rec={id:'VATPAY-'+Date.now().toString(36).toUpperCase(),period,date,amount,accountId,reference,cashTransactionId:tx.id,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'};state.vatPayments.unshift(rec);state.vatPaymentOpen=false;ctx.audit('tax.vat_payment_recorded',{period,paymentId:rec.id,amount,date});ctx.save();ctx.toast('VAT payment recorded');ctx.render();
  }
  function exportReturn(state,period,ctx){
    const s=returnRecord(state,period)?.snapshot||returnSummary(state,period),cfg=settings(state);
    const rows=[['DalasiPay VAT working paper',period],['TIN',cfg.tin||''],['VAT registration no.',cfg.vatRegistrationNo||''],['Due date',s.dueDate||dueDate(period,state)],['Filed status',returnRecord(state,period)?'Filed':'Draft working paper'],[],['Sales / Output VAT','Taxable value','VAT'],['Standard-rated sales',s.stdSalesNet,s.outputVat],['Zero-rated sales',s.zeroSales,0],['Taxable sales - not VAT registered',s.taxableNoVat,0],['Exempt sales',s.exemptSales,0],['Out of scope sales',s.outSales,0],['Manual output VAT adjustments','',s.manualOutput],['Total output VAT','',s.totalOutput],[],['Purchases / Input VAT','Value','VAT'],['Tagged purchases / expenses',s.purchaseNet,s.inputVat],['Manual input VAT adjustments','',s.manualInput],['Total input VAT','',s.totalInput],[],['Net VAT payable / (credit)','',s.netVat],['VAT payments recorded','',s.payments],['Outstanding VAT payable','',s.outstanding],['VAT credit position','',s.credit]];
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-vat-working-paper-'+period+'.csv',csv);ctx.toast('VAT working paper downloaded');
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,cfg=settings(state),periods=periodList(state),period=state.taxPeriod||state.currentPeriod||periods[0],s=returnSummary(state,period),year=String(period||todayIso()).slice(0,4),turnover=yearTurnover(state,year),pct=cfg.compulsoryThreshold?Math.min(100,Math.round(turnover.taxable/cfg.compulsoryThreshold*100)):0,history=(state.vatReturns||[]).slice().sort((a,b)=>String(b.period).localeCompare(String(a.period)));
    const options=periods.map(p=>'<option value="'+esc(p)+'" '+(p===period?'selected':'')+'>'+esc(p)+'</option>').join('');
    const historyRows=history.length?history.map(r=>'<tr><td><b>'+esc(r.period)+'</b></td><td>'+esc(r.dueDate||'')+'</td><td>'+money2(r.snapshot?.totalOutput||0)+'</td><td>'+money2(r.snapshot?.totalInput||0)+'</td><td><b>'+money2(r.snapshot?.netVat||0)+'</b></td><td>'+pill(r.status||'Filed',r.status==='Filed'?'ready':'neutral')+'</td><td>'+esc(r.filedBy||'')+'</td></tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No VAT returns have been marked filed yet.</div></td></tr>';
    const regText=cfg.vatRegistered?'VAT registered':'Not VAT registered';
    return pageTitle('TAX COMPLIANCE','Tax & GRA','VAT working papers, registration monitoring, filing history and GRA payment tracking.','<div class="inline-buttons"><button class="secondary" data-action="open-tax-settings">'+icon('settings',14)+' Settings</button><button class="secondary" data-action="tax-export">'+icon('download',14)+' Export VAT</button><button class="primary" data-action="open-tax-adjustment">'+icon('plus',14)+' VAT adjustment</button></div>')+
      '<div class="tax-kpis"><div class="surface"><span>VAT status</span><b>'+esc(regText)+'</b><small>'+Number(cfg.standardRate||15)+'% standard rate</small></div><div class="surface"><span>'+esc(year)+' taxable turnover</span><b>'+money2(turnover.taxable)+'</b><small>'+pct+'% of compulsory threshold</small></div><div class="surface"><span>Current VAT position</span><b>'+money2(Math.abs(s.netVat))+'</b><small>'+(s.netVat>0?'payable':s.netVat<0?'credit':'nil')+'</small></div><div class="surface '+(s.dueDate<todayIso()&&!s.filed?'cash-alert':'')+'"><span>Return due</span><b>'+esc(s.dueDate||'—')+'</b><small>'+(s.filed?'filed in DalasiPay':'15 days after month-end')+'</small></div></div>'+
      (!cfg.vatRegistered?'<div class="payment-notice"><span>'+icon('alert',17)+'</span><div><b>VAT registration monitor</b><p>GRA currently requires compulsory VAT registration at D2,000,000 taxable supplies in a tax year and allows voluntary registration from D1,000,000. DalasiPay counts only invoices tagged as taxable or zero-rated, so classification matters.</p></div></div>':'')+
      '<section class="surface tax-return-card"><div class="table-tools"><div><h3>VAT return working paper</h3><p>VAT-inclusive sales and purchase documents are split into net value and VAT using their saved tax treatment.</p></div><div class="inline-buttons"><select id="tax-period-select">'+options+'</select>'+(s.filed?'<button class="secondary" data-action="vat-return-reopen:'+esc(period)+'">Reopen return</button>':'<button class="primary" data-action="vat-return-file:'+esc(period)+'" '+(!cfg.vatRegistered?'disabled':'')+'>'+icon('check',14)+' Mark filed</button>')+(s.outstanding>0&&s.filed?'<button class="primary" data-action="open-vat-payment">'+icon('bank',14)+' Record payment</button>':'')+'</div></div>'+
      '<div class="tax-return-grid"><div><span>Standard-rated sales · net</span><b>'+money2(s.stdSalesNet)+'</b><small>gross '+money2(s.stdSalesGross)+'</small></div><div><span>Output VAT</span><b>'+money2(s.totalOutput)+'</b><small>documents + adjustments</small></div><div><span>Input VAT</span><b>'+money2(s.totalInput)+'</b><small>recoverable tagged purchases</small></div><div class="'+(s.netVat>0?'tax-payable':'')+'"><span>Net VAT</span><b>'+money2(s.netVat)+'</b><small>'+(s.netVat>0?'payable to GRA':s.netVat<0?'credit position':'nil return')+'</small></div></div>'+
      '<div class="tax-detail-grid"><div><h4>Sales classification</h4><p><span>Standard-rated gross</span><b>'+money2(s.stdSalesGross)+'</b></p><p><span>Zero-rated</span><b>'+money2(s.zeroSales)+'</b></p><p><span>Taxable · no VAT registration</span><b>'+money2(s.taxableNoVat)+'</b></p><p><span>Exempt</span><b>'+money2(s.exemptSales)+'</b></p><p><span>Out of scope</span><b>'+money2(s.outSales)+'</b></p></div><div><h4>Purchase / filing position</h4><p><span>Tagged purchase gross</span><b>'+money2(s.purchaseGross)+'</b></p><p><span>VAT payments recorded</span><b>'+money2(s.payments)+'</b></p><p><span>Outstanding payable</span><b>'+money2(s.outstanding)+'</b></p><p><span>VAT credit</span><b>'+money2(s.credit)+'</b></p><p><span>Return status</span><b>'+esc(s.filed?'Filed':'Working paper')+'</b></p></div></div>'+
      '<div class="tax-note"><b>GRA filing reminder:</b> VAT returns are monthly and currently due 15 days after month-end. This screen is a DalasiPay working paper, not the official GRA return form.</div></section>'+
      '<section class="surface tax-history"><div class="table-tools"><div><h3>VAT filing history</h3><p>Frozen snapshots created when a monthly return is marked filed</p></div></div><div class="table-scroll"><table><thead><tr><th>PERIOD</th><th>DUE DATE</th><th>OUTPUT VAT</th><th>INPUT VAT</th><th>NET VAT</th><th>STATUS</th><th>FILED BY</th></tr></thead><tbody>'+historyRows+'</tbody></table></div></section>';
  }

  window.DalasiTax={DEFAULTS,CODES,settings,code,defaultSalesCode,defaultPurchaseCode,rateFor,splitGross,snapshot,meta,salesOptions,purchaseOptions,dueDate,periodList,returnRecord,returnSummary,yearTurnover,render,modalSettings,saveSettings,adjustmentModal,saveAdjustment,fileReturn,reopenReturn,paymentModal,savePayment,exportReturn};
})();