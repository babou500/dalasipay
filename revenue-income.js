(function(){
  'use strict';

  const CATEGORIES=['Cash sale','Service income','Commission income','Rental income','Interest income','Other business income'];
  const METHODS=['Bank transfer','Mobile money','Cash','Cheque','Card','Other'];

  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function dateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function invoiceRows(state){
    return (state.customerInvoices||[]).filter(inv=>{
      const s=window.DalasiSalesInvoices?.status?window.DalasiSalesInvoices.status(state,inv):(inv.status||'Draft');
      return s!=='Draft';
    });
  }
  function metrics(state){
    const invoices=invoiceRows(state);
    const invoiceRevenue=invoices.reduce((a,x)=>a+(Number(window.DalasiTax?.meta?.(state,x,'sale')?.taxNet??x.amount)||0),0);
    const direct=(state.revenueEntries||[]).reduce((a,x)=>a+(Number(window.DalasiTax?.meta?.(state,x,'sale')?.taxNet??x.amount)||0),0);
    const collections=(state.incomingPayments||[]).reduce((a,x)=>a+(Number(x.amount)||0),0);
    return {invoiceRevenue,direct,total:invoiceRevenue+direct,cashReceived:collections+direct,invoiceCount:invoices.length,directCount:(state.revenueEntries||[]).length};
  }
  function ledgerRows(state){
    const rows=[];
    invoiceRows(state).forEach(inv=>{
      const s=window.DalasiSalesInvoices?.status?window.DalasiSalesInvoices.status(state,inv):(inv.status||'Sent'),tax=window.DalasiTax?.meta?.(state,inv,'sale')||{taxNet:Number(inv.amount)||0,taxGross:Number(inv.amount)||0,vatAmount:0,taxCode:'OUT'};
      rows.push({id:inv.id,date:inv.issueDate,source:'Invoice',reference:inv.invoiceNo||inv.id,party:inv.customerName||'Customer',category:'Sales revenue',description:inv.description||'Customer invoice',method:'Accounts receivable',amount:Number(tax.taxNet)||0,gross:Number(tax.taxGross)||0,vat:Number(tax.vatAmount)||0,taxCode:tax.taxCode,project:inv.project||'',costCentre:inv.costCentre||'',status:s});
    });
    (state.revenueEntries||[]).forEach(x=>{const tax=window.DalasiTax?.meta?.(state,x,'sale')||{taxNet:Number(x.amount)||0,taxGross:Number(x.amount)||0,vatAmount:0,taxCode:'OUT'};rows.push({id:x.id,date:x.revenueDate,source:'Direct income',reference:x.reference||x.revenueNo||x.id,party:x.payer||'Direct income',category:x.category||'Other business income',description:x.description||'',method:x.method||'Other',amount:Number(tax.taxNet)||0,gross:Number(tax.taxGross)||0,vat:Number(tax.vatAmount)||0,taxCode:tax.taxCode,project:x.project||'',costCentre:x.costCentre||'',status:'Recorded'});});
    return rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));
  }
  function nextNumber(state){
    const year=new Date().getFullYear(),base='REV-'+year+'-',rows=state.revenueEntries||[];let max=0;
    rows.forEach(x=>{const v=String(x.revenueNo||'');if(v.startsWith(base)){const n=Number(v.slice(base.length));if(Number.isFinite(n)&&n>max)max=n;}});
    return base+String(max+1).padStart(5,'0');
  }
  function panel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,m=metrics(state),rows=ledgerRows(state);
    const table=rows.length?rows.map(x=>'<tr>'+
      '<td><div class="payment-payee"><b>'+esc(x.party)+'</b><small>'+esc(x.reference)+'</small></div></td>'+
      '<td>'+dateLabel(x.date)+'</td>'+
      '<td>'+esc(x.category)+'</td>'+
      '<td>'+esc(x.source)+'</td>'+
      '<td>'+esc(x.method)+'</td>'+
      '<td class="payment-amount"><b>'+money2(x.amount)+'</b><small class="cash-sub">'+(x.vat?('VAT '+money2(x.vat)+' · gross '+money2(x.gross)):window.DalasiTax?.code?.(x.taxCode)?.short||'No VAT')+'</small></td>'+
      '<td>'+pill(x.status,x.status==='Paid'||x.status==='Recorded'?'paid':x.status==='Sent'?'approved':'neutral')+'</td>'+
    '</tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No recognized revenue yet. Issued invoices will appear here automatically, and direct income can be recorded manually.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Invoice revenue</span><b>'+money2(m.invoiceRevenue)+'</b><small>'+m.invoiceCount+' issued invoice'+(m.invoiceCount===1?'':'s')+'</small></div>'+
      '<div class="surface"><span>Direct income</span><b>'+money2(m.direct)+'</b><small>'+m.directCount+' non-invoice record'+(m.directCount===1?'':'s')+'</small></div>'+
      '<div class="surface"><span>Total revenue</span><b>'+money2(m.total)+'</b><small>invoice revenue + direct income</small></div>'+
      '<div class="surface"><span>Cash received</span><b>'+money2(m.cashReceived)+'</b><small>invoice collections + direct income</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('bank',17)+'</span><div><b>Revenue without double counting</b><p>Issued invoices become sales revenue automatically. Record income here only when it was earned outside the invoice workflow, such as a cash sale, commission, interest or other business income.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Revenue register</h3><p>Recognized invoice sales and direct non-invoice income in one ledger</p></div><div class="inline-buttons"><button class="secondary" data-action="sales-export:revenue">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-revenue">'+icon('plus',14)+' Record income</button></div></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / SOURCE</th><th>DATE</th><th>CATEGORY</th><th>ORIGIN</th><th>METHOD</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function modal(state,h){
    const field=h.field,icon=h.icon,esc=h.esc,customers=(state.customers||[]).filter(x=>(x.status||'Active')==='Active');
    const customerOptions=['<option value="">No saved customer</option>'].concat(customers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>')).join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-revenue"></div><form id="revenue-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">DIRECT INCOME</div><h2>Record revenue / income</h2><p>Use this only for income that was not already raised through a DalasiPay invoice.</p></div><button type="button" class="close" data-action="close-revenue">×</button></div>'+
      '<div class="form-grid">'+
        field('Saved customer','<select name="customerId">'+customerOptions+'</select>')+
        field('Payer / source','<input name="payer" placeholder="Customer or income source">')+
        field('Revenue date','<input name="revenueDate" type="date" value="'+todayIso()+'" required>')+
        field('Category','<select name="category">'+CATEGORIES.map(x=>'<option>'+x+'</option>').join('')+'</select>')+
        field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required>')+
        field('Received through','<select name="method">'+METHODS.map(x=>'<option>'+x+'</option>').join('')+'</select>')+
        field('VAT treatment',window.DalasiTax?.salesOptions?.(state)||'<select name="taxCode"><option value="OUT">Out of scope / no VAT</option></select>')+
        field('Project',window.DalasiDimensions?.projectSelect?.(state,'project')||'<select name="project"><option value="">Unassigned</option></select>')+
        field('Cost centre',window.DalasiDimensions?.costCentreSelect?.(state,'costCentre')||'<select name="costCentre"><option value="">Unassigned</option></select>')+
        field('Deposit to account',window.DalasiCashBank.accountSelect(state,'accountId','','Select cash / bank account'))+
        field('Reference','<input name="reference" placeholder="Receipt, deposit or transaction reference">')+
      '</div>'+
      field('Description','<input name="description" placeholder="What was this income for?">')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-revenue">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Record income</button></div>'+
    '</form></div>';
  }
  function create(ev,state,ctx){
    ev.preventDefault();
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to record income.');return;}
    const fd=new FormData(ev.target),customerId=String(fd.get('customerId')||''),customer=(state.customers||[]).find(x=>x.id===customerId),payer=String(fd.get('payer')||'').trim()||customer?.name||'',amount=Number(fd.get('amount')||0),revenueDate=String(fd.get('revenueDate')||'');
    if(!payer||amount<=0||!revenueDate){ctx.toast('Payer/source, amount and revenue date are required.');return;}
    if(window.DalasiMonthClose?.isClosed(state,revenueDate)){ctx.toast('That accounting period is closed. Reopen it before recording this income.');return;}
    state.revenueEntries=state.revenueEntries||[];const id='REV-'+Date.now().toString(36).toUpperCase(),revenueNo=nextNumber(state);
    const accountId=String(fd.get('accountId')||'')||null,reference=String(fd.get('reference')||'').trim(),description=String(fd.get('description')||'').trim(),tax=window.DalasiTax?.snapshot?.(state,amount,String(fd.get('taxCode')||window.DalasiTax?.defaultSalesCode?.(state)||'OUT'),'sale')||{taxCode:'OUT',vatRate:0,taxGross:amount,taxNet:amount,vatAmount:0,vatRecoverable:false,taxableTurnover:false};
    state.revenueEntries.unshift({id,revenueNo,customerId:customerId||null,payer,revenueDate,category:String(fd.get('category')||'Other business income'),amount,...tax,...(window.DalasiDimensions?.tag?.(fd)||{}),method:String(fd.get('method')||'Other'),accountId,reference,description,createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    if(accountId)window.DalasiCashBank?.post(state,{accountId,date:revenueDate,direction:'in',amount,type:'Direct income',counterparty:payer,reference:reference||revenueNo,description:description||String(fd.get('category')||'Other business income'),sourceType:'revenue',sourceId:id,sourceKey:'revenue:'+id+':in',createdBy:state.session?.name||'User'});
    state.revenueOpen=false;ctx.audit('revenue.recorded',{revenueId:id,revenueNo,payer,amount,category:String(fd.get('category')||'Other business income')});ctx.save();ctx.toast('Income '+revenueNo+' recorded');ctx.render();
  }
  function exportCsv(state,ctx){
    const rows=ledgerRows(state),csv=[['Date','Origin','Reference','Customer / Source','Category','Description','Method','Project','Cost Centre','Net Revenue','VAT','Gross Amount','VAT Treatment','Status'],...rows.map(x=>[x.date,x.source,x.reference,x.party,x.category,x.description,x.method,x.project||'',x.costCentre||'',x.amount,x.vat||0,x.gross??x.amount,window.DalasiTax?.code?.(x.taxCode)?.label||x.taxCode||'Out of scope',x.status])].map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n');
    ctx.downloadText('dalasipay-revenue-register-'+todayIso()+'.csv',csv);ctx.toast('Revenue register downloaded');
  }

  window.DalasiRevenueIncome={panel,modal,create,metrics,ledgerRows,exportCsv};
})();