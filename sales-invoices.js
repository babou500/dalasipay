(function(){
  'use strict';

  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function dateLabel(v){if(!v)return '—';try{return new Date(v+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return v}}
  function invoiceById(state,id){return (state.customerInvoices||[]).find(x=>x.id===id)||null;}
  function paymentsFor(state,id){return (state.incomingPayments||[]).filter(x=>x.invoiceId===id);}
  function paid(state,inv){return paymentsFor(state,inv.id).reduce((a,x)=>a+(Number(x.amount)||0),0);}
  function balance(state,inv){return Math.max(0,(Number(inv.amount)||0)-paid(state,inv));}
  function status(state,inv){
    const p=paid(state,inv),b=balance(state,inv);
    if(b<=0.004)return 'Paid';
    if(p>0)return 'Part paid';
    if((inv.status||'Draft')==='Draft')return 'Draft';
    if(inv.dueDate&&inv.dueDate<todayIso())return 'Overdue';
    return inv.status||'Sent';
  }
  function statusClass(s){return s==='Paid'?'paid':s==='Sent'?'approved':s==='Overdue'?'neutral':s==='Part paid'?'neutral':'ready';}
  function metrics(state){
    const rows=state.customerInvoices||[],payments=state.incomingPayments||[],today=todayIso();
    let invoiced=0,collected=0,outstanding=0,overdue=0,draft=0,open=0;
    rows.forEach(inv=>{const s=status(state,inv),p=paid(state,inv),b=balance(state,inv);invoiced+=Number(inv.amount)||0;collected+=p;outstanding+=b;if(b>0&&inv.dueDate&&inv.dueDate<today)overdue+=b;if(s==='Draft')draft++;if(!['Draft','Paid'].includes(s))open++;});
    return {count:rows.length,invoiced,collected,outstanding,overdue,draft,open,collectionRate:invoiced?Math.round(collected/invoiced*100):0,payments:payments.length};
  }
  function tabs(state){
    const tab=state.salesTab||'invoices';
    return '<div class="sales-tabs"><button class="'+(tab==='invoices'?'active':'')+'" data-action="sales-tab:invoices">Invoices</button><button class="'+(tab==='collections'?'active':'')+'" data-action="sales-tab:collections">Collections & receipts</button></div>';
  }
  function invoiceAction(state,inv,icon){
    const s=status(state,inv);
    if(s==='Draft')return '<button class="secondary" data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' PDF</button><button class="primary" data-action="receivable-send:'+inv.id+'">Mark sent</button>';
    if(s==='Paid')return '<button class="secondary" data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' Invoice</button><button class="secondary" data-action="sales-doc:delivery:'+inv.id+'">'+icon('file',13)+' Delivery note</button>';
    return '<button class="secondary" data-action="receivable-doc:invoice:'+inv.id+'">'+icon('download',13)+' Invoice</button><button class="primary" data-action="record-incoming:'+inv.id+'">Record payment</button>';
  }
  function invoicePanel(state,h){
    const esc=h.esc,money2=h.money2,pill=h.pill,icon=h.icon,m=metrics(state),filter=state.salesFilter||'all';
    let rows=(state.customerInvoices||[]).slice().sort((a,b)=>String(b.issueDate||b.createdAt||'').localeCompare(String(a.issueDate||a.createdAt||'')));
    if(filter!=='all')rows=rows.filter(inv=>status(state,inv).toLowerCase().replace(' ','-')===filter);
    const table=rows.length?rows.map(inv=>{
      const s=status(state,inv),p=paid(state,inv),b=balance(state,inv);
      return '<tr class="'+(s==='Overdue'?'receivable-overdue':'')+'">'+
        '<td><div class="payment-payee"><b>'+esc(inv.customerName||'Customer')+'</b><small>'+esc(inv.invoiceNo||inv.id)+'</small></div></td>'+
        '<td>'+dateLabel(inv.issueDate)+'</td>'+
        '<td>'+dateLabel(inv.dueDate)+'</td>'+
        '<td class="payment-amount">'+money2(inv.amount)+'</td>'+
        '<td><div class="receivable-balance"><b>'+money2(b)+'</b><small>'+money2(p)+' collected</small></div></td>'+
        '<td>'+pill(s,statusClass(s))+'</td>'+
        '<td><div class="payment-status-actions">'+invoiceAction(state,inv,icon)+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No invoices match this view.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Total invoiced</span><b>'+money2(m.invoiced)+'</b><small>'+m.count+' invoice'+(m.count===1?'':'s')+'</small></div>'+
      '<div class="surface"><span>Collected</span><b>'+money2(m.collected)+'</b><small>'+m.collectionRate+'% collection rate</small></div>'+
      '<div class="surface"><span>Outstanding</span><b>'+money2(m.outstanding)+'</b><small>'+m.open+' open invoice'+(m.open===1?'':'s')+'</small></div>'+
      '<div class="surface '+(m.overdue?'cash-alert':'')+'"><span>Overdue</span><b>'+money2(m.overdue)+'</b><small>past due customer balances</small></div>'+
    '</div>'+
    '<div class="sales-toolbar"><div><b>Customer invoices</b><span>Create, send, collect and close sales invoices</span></div><div class="sales-filters">'+
      [['all','All'],['draft','Draft'],['sent','Sent'],['part-paid','Part paid'],['overdue','Overdue'],['paid','Paid']].map(x=>'<button class="'+(filter===x[0]?'active':'')+'" data-action="sales-filter:'+x[0]+'">'+x[1]+'</button>').join('')+
    '</div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Invoice register</h3><p>Sales invoices, due dates, collections and customer balances</p></div><div class="inline-buttons"><button class="secondary" data-action="sales-export:invoices">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button></div></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / INVOICE</th><th>ISSUED</th><th>DUE</th><th>TOTAL</th><th>BALANCE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function collectionsPanel(state,h){
    const esc=h.esc,money2=h.money2,icon=h.icon,m=metrics(state),rows=(state.incomingPayments||[]).slice().sort((a,b)=>String(b.receivedDate||b.createdAt||'').localeCompare(String(a.receivedDate||a.createdAt||'')));
    const table=rows.length?rows.map(p=>{
      const inv=invoiceById(state,p.invoiceId);
      return '<tr>'+
        '<td><div class="payment-payee"><b>'+esc(inv?.customerName||p.customerName||'Customer')+'</b><small>'+esc(p.receiptNumber||p.id)+'</small></div></td>'+
        '<td>'+esc(inv?.invoiceNo||'—')+'</td>'+
        '<td>'+dateLabel(p.receivedDate)+'</td>'+
        '<td class="payment-amount">'+money2(p.amount)+'</td>'+
        '<td>'+esc(p.method||'Other')+'</td>'+
        '<td>'+esc(p.reference||'—')+'</td>'+
        '<td><div class="payment-status-actions"><button class="secondary" data-action="receivable-doc:receipt:'+p.id+'">'+icon('download',13)+' Receipt PDF</button>'+(inv&&status(state,inv)==='Paid'?'<button class="secondary" data-action="sales-doc:delivery:'+inv.id+'">'+icon('file',13)+' Delivery note</button>':'')+'</div></td>'+
      '</tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No customer collections recorded yet.</div></td></tr>';
    return '<div class="sales-summary">'+
      '<div class="surface"><span>Collections recorded</span><b>'+money2(m.collected)+'</b><small>'+m.payments+' payment record'+(m.payments===1?'':'s')+'</small></div>'+
      '<div class="surface"><span>Invoices raised</span><b>'+money2(m.invoiced)+'</b><small>'+m.count+' invoices</small></div>'+
      '<div class="surface"><span>Still outstanding</span><b>'+money2(m.outstanding)+'</b><small>customer balances due</small></div>'+
      '<div class="surface"><span>Collection rate</span><b>'+m.collectionRate+'%</b><small>collected vs invoiced value</small></div>'+
    '</div>'+
    '<div class="payment-notice"><span>'+icon('bank',17)+'</span><div><b>Receipts tied directly to invoices</b><p>Each recorded customer payment creates a receipt number. Fully paid invoices can also produce a delivery note from the same record.</p></div></div>'+
    '<div class="surface employee-card"><div class="table-tools"><div><h3>Collections & receipts</h3><p>Incoming customer payments and their supporting documents</p></div><button class="secondary" data-action="sales-export:collections">'+icon('download',14)+' Export CSV</button></div>'+
      '<div class="table-scroll"><table><thead><tr><th>CUSTOMER / RECEIPT</th><th>INVOICE</th><th>DATE</th><th>AMOUNT</th><th>METHOD</th><th>REFERENCE</th><th>DOCUMENT</th></tr></thead><tbody>'+table+'</tbody></table></div></div>';
  }
  function render(state,h){
    const pageTitle=h.pageTitle,icon=h.icon,tab=state.salesTab||'invoices';
    const action=tab==='invoices'?'<button class="primary" data-action="open-receivable">'+icon('plus',14)+' New invoice</button>':'<button class="secondary" data-action="sales-export:collections">'+icon('download',14)+' Export collections</button>';
    return tabs(state)+pageTitle('SALES & RECEIVABLES','Invoices','Create customer invoices, track collections, issue receipts and produce delivery notes.',action)+(tab==='collections'?collectionsPanel(state,h):invoicePanel(state,h));
  }
  function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function rowsToCsv(headers,rows){return [headers.join(','),...rows.map(r=>r.map(csvEscape).join(','))].join('\n');}
  function exportCsv(kind,state,ctx){
    let csv='';
    if(kind==='invoices'){
      csv=rowsToCsv(['Invoice No','Customer','Issue Date','Due Date','Amount','Collected','Balance','Status','Description','Reference'],(state.customerInvoices||[]).map(inv=>[inv.invoiceNo||inv.id,inv.customerName,inv.issueDate,inv.dueDate,inv.amount,paid(state,inv),balance(state,inv),status(state,inv),inv.description||'',inv.reference||'']));
    }else if(kind==='collections'){
      csv=rowsToCsv(['Receipt No','Customer','Invoice No','Date Received','Amount','Method','Reference','Recorded By'],(state.incomingPayments||[]).map(p=>{const inv=invoiceById(state,p.invoiceId);return [p.receiptNumber||p.id,inv?.customerName||p.customerName||'',inv?.invoiceNo||'',p.receivedDate,p.amount,p.method,p.reference||'',p.createdBy||''];}));
    }else return;
    ctx.downloadText('dalasipay-'+kind+'-'+todayIso()+'.csv',csv);ctx.toast((kind==='invoices'?'Invoice':'Collections')+' report downloaded');
  }
  function downloadDeliveryNote(id,state,ctx){
    const inv=invoiceById(state,id);if(!inv){ctx.toast('Customer invoice not found');return;}
    if(status(state,inv)!=='Paid'){ctx.toast('Delivery note is available after the invoice is fully paid.');return;}
    const out=[],ink='0.06 0.13 0.11',muted='0.36 0.43 0.40',green='0.04 0.31 0.26',line='0.84 0.88 0.86',white='1 1 1',soft='0.97 0.98 0.975';
    const safe=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
    const clip=(v,max=52)=>{const s=String(v??'');return s.length>max?s.slice(0,max-3)+'...':s};
    const text=(x,y,size,value,bold=false,color=ink)=>out.push(color+' rg BT /'+(bold?'F2':'F1')+' '+size+' Tf '+x+' '+y+' Td ('+safe(value)+') Tj ET');
    const fill=(x,y,w,h,color)=>out.push(color+' rg '+x+' '+y+' '+w+' '+h+' re f');
    const stroke=(x1,y1,x2,y2,color=line,width=.7)=>out.push(color+' RG '+width+' w '+x1+' '+y1+' m '+x2+' '+y2+' l S');
    const rect=(x,y,w,h,fc=white,sc=line,width=.65)=>{fill(x,y,w,h,fc);out.push(sc+' RG '+width+' w '+x+' '+y+' '+w+' '+h+' re S')};
    const label=(x,y,v)=>text(x,y,7.2,String(v).toUpperCase(),true,'0.42 0.49 0.46');
    fill(0,0,595,842,white);out.push('0.88 0.91 0.90 RG 0.75 w 24 24 547 794 re S');
    fill(24,746,547,72,green);fill(24,746,5,72,'0.37 0.82 0.68');
    if(state.branding?.logoData){out.push('q 42 0 0 42 43 765 cm /Im1 Do Q')}else{fill(43,765,42,42,'0.88 0.97 0.94');text(57,780,14,clip(state.branding?.logoText||state.company.slice(0,1),3),true,green)}
    text(99,790,17,clip(state.company,29),true,white);text(99,771,8.2,'DALASIPAY SALES',true,'0.74 0.91 0.86');
    text(384,791,18,'DELIVERY NOTE',true,white);text(384,772,7.6,'PAID CUSTOMER ORDER',true,'0.74 0.91 0.86');
    rect(24,690,547,43,soft,line,.55);label(40,716,'Invoice no.');text(40,699,10,inv.invoiceNo||inv.id,true);label(236,716,'Issue date');text(236,699,9.5,dateLabel(inv.issueDate),true);label(410,716,'Delivery date');text(410,699,9.5,dateLabel(todayIso()),true);
    rect(24,594,547,77,'0.945 0.97 0.96',line,.55);label(40,651,'Deliver to');text(40,631,13,clip(inv.customerName,42),true);text(40,613,8.5,clip([inv.customerEmail,inv.customerPhone].filter(Boolean).join(' · ')||'Customer account',64),false,muted);
    rect(24,425,547,148,white,line,.55);label(40,552,'Goods / service delivered');
    text(40,524,11,clip(inv.description||'Goods / services as invoiced',66),true);stroke(40,505,555,505,'0.91 0.93 0.92',.5);
    label(40,486,'Customer reference');text(190,486,9.4,clip(inv.reference||'Not recorded',48),true);
    label(40,458,'Invoice value');text(190,458,10.5,ctx.money2(inv.amount),true,green);
    label(335,458,'Payment status');text(430,458,10,'PAID',true,green);
    rect(24,305,547,94,soft,line,.55);label(40,377,'Confirmation');text(40,352,9.2,'The items or services above correspond to the fully paid invoice shown on this note.',false,ink);text(40,330,8.5,'Use this document as delivery/fulfilment evidence together with the invoice and payment receipt.',false,muted);
    stroke(40,254,260,254,line,.7);text(40,235,8,'Delivered / prepared by',false,muted);stroke(335,254,555,254,line,.7);text(335,235,8,'Received / acknowledged by',false,muted);
    stroke(24,82,571,82,line,.55);text(24,63,7.3,'This delivery note is generated from a fully paid DalasiPay customer invoice.',true,'0.45 0.51 0.49');text(420,63,7.3,'Generated by DalasiPay',true,green);
    const customer=(String(inv.customerName||'Customer').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'Customer');
    ctx.pdfDownload('Delivery_Note_'+customer+'_'+(inv.invoiceNo||inv.id)+'.pdf',out.join('\n'),state.branding?.logoData||'');ctx.toast('Delivery note downloaded');
  }
  window.DalasiSalesInvoices={render,metrics,status,balance,paid,exportCsv,downloadDeliveryNote};
})();