(function(){
'use strict';
const round=n=>Math.round((Number(n)||0)*100)/100;
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const today=()=>new Date().toISOString().slice(0,10),yearStart=()=>today().slice(0,4)+'-01-01';
const customer=(s,id)=>(s.customers||[]).find(x=>x.id===id)||null,supplier=(s,id)=>(s.paymentBeneficiaries||[]).find(x=>x.id===id)||null;
const inRange=(d,a,b)=>String(d||'')>=a&&String(d||'')<=b;
function customerName(s,id){return customer(s,id)?.name||(s.customerInvoices||[]).find(x=>x.customerId===id)?.customerName||'Customer'}
function supplierName(s,id){return supplier(s,id)?.name||(s.businessBills||[]).find(x=>x.beneficiaryId===id)?.supplier||'Supplier'}
function customerInvoicesForParty(s,id){
  const c=customer(s,id);if(!c)return [];
  return (s.customerInvoices||[]).filter(x=>{
    if(x.customerId===id)return true;
    if(x.customerId)return false;
    const m=window.DalasiBusinessPayments?.resolveCustomerForInvoice?.(s,{customerName:x.customerName,customerEmail:x.customerEmail});
    return m?.id===id;
  });
}
function customerIds(s){const set=new Set((s.customers||[]).map(x=>x.id));(s.customerInvoices||[]).forEach(x=>{if(x.customerId)set.add(x.customerId);else{const m=window.DalasiBusinessPayments?.resolveCustomerForInvoice?.(s,{customerName:x.customerName,customerEmail:x.customerEmail});if(m?.id)set.add(m.id)}});return [...set]}
function supplierIds(s){const set=new Set((s.paymentBeneficiaries||[]).map(x=>x.id));(s.businessBills||[]).forEach(x=>{if(x.beneficiaryId)set.add(x.beneficiaryId)});return [...set]}
function customerRows(s,id,from='0000-01-01',to='9999-12-31'){
  const rows=[];
  customerInvoicesForParty(s,id).filter(x=>(window.DalasiSalesInvoices?.status?.(s,x)||x.status)!=='Draft'&&inRange(x.issueDate||x.createdAt,from,to)).forEach(x=>rows.push({date:x.issueDate||String(x.createdAt||'').slice(0,10),kind:'Invoice',reference:x.invoiceNo||x.id,description:x.description||'Customer invoice',debit:round(x.amount),credit:0,sourceId:x.id}));
  (s.customerDebitNotes||[]).filter(x=>x.customerId===id&&x.status!=='Void'&&inRange(x.date,from,to)).forEach(x=>rows.push({date:x.date,kind:'Debit note',reference:x.debitNo||x.id,description:x.reason||x.note||'Additional customer charge',debit:round(x.amount),credit:0,sourceId:x.id}));
  (s.customerCreditNotes||[]).filter(x=>x.customerId===id&&x.status!=='Void'&&inRange(x.date,from,to)).forEach(x=>rows.push({date:x.date,kind:'Credit note',reference:x.creditNo||x.id,description:x.reason||x.note||'Customer credit',debit:0,credit:round(x.amount),sourceId:x.id}));
  const invIds=new Set(customerInvoicesForParty(s,id).map(x=>x.id));
  (s.incomingPayments||[]).filter(x=>invIds.has(x.invoiceId)&&inRange(x.receivedDate||x.createdAt,from,to)).forEach(x=>rows.push({date:x.receivedDate||String(x.createdAt||'').slice(0,10),kind:'Payment',reference:x.receiptNumber||x.reference||x.id,description:'Customer payment received',debit:0,credit:round(x.amount),sourceId:x.id}));
  const creditIds=new Set((s.customerCreditNotes||[]).filter(x=>x.customerId===id).map(x=>x.id));
  (s.customerRefunds||[]).filter(x=>creditIds.has(x.creditNoteId)&&inRange(x.date,from,to)).forEach(x=>rows.push({date:x.date,kind:'Refund paid',reference:x.reference||x.id,description:'Customer refund paid',debit:round(x.amount),credit:0,sourceId:x.id}));
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||String(a.reference).localeCompare(String(b.reference)));
}
function supplierRows(s,id,from='0000-01-01',to='9999-12-31'){
  const rows=[];
  (s.businessBills||[]).filter(x=>x.beneficiaryId===id&&(x.status||'Draft')!=='Draft'&&inRange(x.invoiceDate||x.createdAt,from,to)).forEach(x=>rows.push({date:x.invoiceDate||String(x.createdAt||'').slice(0,10),kind:'Supplier bill',reference:x.invoiceNo||x.id,description:x.description||'Supplier bill',debit:round(x.amount),credit:0,sourceId:x.id}));
  (s.supplierDebitNotes||[]).filter(x=>x.beneficiaryId===id&&x.status!=='Void'&&inRange(x.date,from,to)).forEach(x=>rows.push({date:x.date,kind:'Debit note',reference:x.debitNo||x.id,description:x.note||'Additional supplier charge',debit:round(x.amount),credit:0,sourceId:x.id}));
  (s.supplierCreditNotes||[]).filter(x=>x.beneficiaryId===id&&x.status!=='Void'&&inRange(x.date,from,to)).forEach(x=>rows.push({date:x.date,kind:'Credit note',reference:x.creditNo||x.supplierReference||x.id,description:x.note||'Supplier credit',debit:0,credit:round(x.amount),sourceId:x.id}));
  const billIds=new Set((s.businessBills||[]).filter(x=>x.beneficiaryId===id).map(x=>x.id));
  (s.businessPayments||[]).filter(x=>billIds.has(x.billId)&&x.status==='Paid'&&inRange(String(x.paidAt||x.updatedAt||x.createdAt||'').slice(0,10),from,to)).forEach(x=>rows.push({date:String(x.paidAt||x.updatedAt||x.createdAt||'').slice(0,10),kind:'Payment',reference:x.receiptNumber||x.reference||x.id,description:'Supplier payment',debit:0,credit:round(x.amount),sourceId:x.id}));
  const creditIds=new Set((s.supplierCreditNotes||[]).filter(x=>x.beneficiaryId===id).map(x=>x.id));
  (s.supplierRefunds||[]).filter(x=>creditIds.has(x.creditNoteId)&&inRange(x.date,from,to)).forEach(x=>rows.push({date:x.date,kind:'Refund received',reference:x.reference||x.id,description:'Supplier refund received',debit:round(x.amount),credit:0,sourceId:x.id}));
  return rows.sort((a,b)=>a.date.localeCompare(b.date)||String(a.reference).localeCompare(String(b.reference)));
}
function openingBalance(s,type,id,from){
  const rows=type==='supplier'?supplierRows(s,id,'0000-01-01',from):customerRows(s,id,'0000-01-01',from);
  return round(rows.filter(x=>x.date<from).reduce((a,x)=>a+x.debit-x.credit,0));
}
function statement(s,type,id,from,to){
  const rows=(type==='supplier'?supplierRows(s,id,from,to):customerRows(s,id,from,to)),opening=openingBalance(s,type,id,from);let running=opening;
  const detailed=rows.map(x=>({...x,balance:(running=round(running+x.debit-x.credit))}));
  const debits=round(rows.reduce((a,x)=>a+x.debit,0)),credits=round(rows.reduce((a,x)=>a+x.credit,0));
  return {type,id,name:type==='supplier'?supplierName(s,id):customerName(s,id),from,to,opening,debits,credits,closing:round(opening+debits-credits),rows:detailed};
}
function partyOptions(s,type,selected){
  const ids=type==='supplier'?supplierIds(s):customerIds(s);
  return ids.map(id=>'<option value="'+esc(id)+'" '+(id===selected?'selected':'')+'>'+esc(type==='supplier'?supplierName(s,id):customerName(s,id))+'</option>').join('');
}
function exportCsv(s,type,id,from,to,ctx){
  const st=statement(s,type,id,from,to),head=['Date','Type','Reference','Description','Charge / Increase','Payment / Credit','Running Balance'],data=[[from,'Opening balance','','',st.opening>0?st.opening:'',st.opening<0?Math.abs(st.opening):'',st.opening],...st.rows.map(x=>[x.date,x.kind,x.reference,x.description,x.debit||'',x.credit||'',x.balance])];
  const csv=[['Statement',st.name],['Period',from+' to '+to],['Opening Balance',st.opening],['Charges / Increases',st.debits],['Payments / Credits',st.credits],['Closing Balance',st.closing],[],head,...data].map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');
  ctx.downloadText('dalasipay-'+type+'-statement-'+String(st.name).replace(/[^A-Za-z0-9_-]+/g,'_')+'-'+to+'.csv',csv);ctx.toast('Statement CSV downloaded');
}
function pdf(s,type,id,from,to,ctx){
  const st=statement(s,type,id,from,to);if(!id){ctx.toast('Choose an account first.');return}
  const out=[],ink='0.06 0.13 0.11',muted='0.36 0.43 0.40',green='0.04 0.31 0.26',mint='0.92 0.97 0.95',line='0.84 0.88 0.86',white='1 1 1',soft='0.97 0.98 0.975';
  const safe=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/[\u2013\u2014\u2212]/g,'-').replace(/[^\x20-\x7E]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const clip=(v,m=45)=>String(v??'').length>m?String(v).slice(0,m-3)+'...':String(v??'');
  const text=(x,y,z,v,b=false,c=ink)=>out.push(c+' rg BT /'+(b?'F2':'F1')+' '+z+' Tf '+x+' '+y+' Td ('+safe(v)+') Tj ET'),fill=(x,y,w,h,c)=>out.push(c+' rg '+x+' '+y+' '+w+' '+h+' re f'),stroke=(a,b,c,d,col=line,w=.7)=>out.push(col+' RG '+w+' w '+a+' '+b+' m '+c+' '+d+' l S'),rect=(x,y,w,h,f=white,sc=line)=>{fill(x,y,w,h,f);out.push(sc+' RG .65 w '+x+' '+y+' '+w+' '+h+' re S')},label=(x,y,v)=>text(x,y,7.2,String(v).toUpperCase(),true,'0.42 0.49 0.46'),money=v=>ctx.money2(Number(v)||0),ts=window.DalasiTax?.settings?.(s)||{};
  fill(0,0,595,842,white);out.push('0.88 0.91 0.90 RG .75 w 24 24 547 794 re S');fill(24,746,547,72,green);fill(24,746,5,72,'0.37 0.82 0.68');
  if(s.branding?.logoData)out.push('q 42 0 0 42 43 765 cm /Im1 Do Q');else{fill(43,765,42,42,'0.88 0.97 0.94');text(57,780,14,clip(s.branding?.logoText||s.company.slice(0,1),3),true,green)}
  text(99,790,17,clip(s.company,29),true,white);text(99,771,8.2,ts.tin?'TIN '+clip(ts.tin,26):'DALASIPAY ACCOUNT STATEMENT',true,'0.74 0.91 0.86');text(385,790,17,type==='supplier'?'SUPPLIER':'CUSTOMER',true,white);text(385,771,8.2,'ACCOUNT STATEMENT',true,'0.74 0.91 0.86');
  rect(24,681,547,50,soft);label(40,714,type==='supplier'?'Supplier':'Customer');text(40,695,12.5,clip(st.name,42),true);label(382,714,'Statement period');text(382,695,9.2,from+' to '+to,true);
  rect(24,604,547,60,mint);label(40,645,'Opening balance');text(40,622,13,money(st.opening),true);label(205,645,'Charges / increases');text(205,622,13,money(st.debits),true);label(386,645,'Payments / credits');text(386,622,13,money(st.credits),true);
  label(40,584,'Transaction history');text(40,565,7.2,'DATE',true,muted);text(98,565,7.2,'TYPE',true,muted);text(176,565,7.2,'REFERENCE',true,muted);text(285,565,7.2,'CHARGE',true,muted);text(370,565,7.2,'CREDIT',true,muted);text(465,565,7.2,'BALANCE',true,muted);stroke(40,555,555,555,'0.91 0.93 0.92',.45);
  st.rows.slice(0,15).forEach((r,i)=>{const y=537-i*25;text(40,y,7.6,r.date);text(98,y,7.6,clip(r.kind,12));text(176,y,7.6,clip(r.reference,16));text(285,y,7.7,r.debit?money(r.debit):'—');text(370,y,7.7,r.credit?money(r.credit):'—');text(465,y,7.8,money(r.balance),true);if(i<14)stroke(40,y-8,555,y-8,'0.94 0.95 0.95',.35)});
  if(st.rows.length>15)text(40,153,7.4,'+'+(st.rows.length-15)+' additional transaction'+(st.rows.length-15===1?'':'s')+' included in the CSV export.',true,muted);
  fill(24,96,547,44,green);text(42,124,8.2,'CLOSING BALANCE',true,'0.74 0.91 0.86');text(405,112,18,money(st.closing),true,white);
  text(24,64,7.2,'Positive balance = amount outstanding. Negative balance = account credit / refund position.',false,muted);text(421,48,7.3,'Generated by DalasiPay',true,green);
  const fn=(type==='supplier'?'Supplier_Statement_':'Customer_Statement_')+(String(st.name).replace(/[^A-Za-z0-9_-]+/g,'_')||'Account')+'_'+to+'.pdf';ctx.pdfDownload(fn,out.join('\n'),s.branding?.logoData||'');ctx.toast('Statement PDF downloaded');
}

function monthKey(date){return String(date||today()).slice(0,7)}
function monthBounds(period){
  const p=/^\d{4}-\d{2}$/.test(period||'')?period:monthKey(today()),[y,m]=p.split('-').map(Number);
  const from=p+'-01',to=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  return {period:p,from,to};
}
function customerContact(s,id){const c=customer(s,id)||{};return {email:c.email||'',phone:c.phone||'',name:c.name||customerName(s,id)}}
function snapshotFor(s,id,period){
  const b=monthBounds(period),st=statement(s,'customer',id,b.from,b.to),contact=customerContact(s,id);
  return {customerId:id,customerName:st.name,email:contact.email,phone:contact.phone,from:b.from,to:b.to,opening:st.opening,debits:st.debits,credits:st.credits,closing:st.closing,transactionCount:st.rows.length};
}
function monthEndRun(s,period,ctx){
  if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to prepare month-end customer statements.');return}
  const b=monthBounds(period),key='STM-'+b.period;
  s.statementRuns=s.statementRuns||[];
  if(s.statementRuns.some(x=>x.key===key)){ctx.toast('Customer statements for '+b.period+' have already been prepared.');return}
  const snapshots=customerIds(s).map(id=>snapshotFor(s,id,b.period)).filter(x=>x.transactionCount||Math.abs(x.opening)>.004||Math.abs(x.closing)>.004);
  const run={id:'STR-'+Date.now().toString(36).toUpperCase(),key,period:b.period,from:b.from,to:b.to,status:'Prepared',customers:snapshots,statementCount:snapshots.length,totalClosing:round(snapshots.reduce((a,x)=>a+x.closing,0)),preparedAt:new Date().toISOString(),preparedBy:s.session?.name||'User'};
  s.statementRuns.unshift(run);ctx.audit('statement.month_end_prepared',{runId:run.id,period:run.period,statementCount:run.statementCount,totalClosing:run.totalClosing});ctx.save();ctx.toast(run.statementCount+' customer statement'+(run.statementCount===1?'':'s')+' prepared for '+run.period);ctx.render();
}
function statementRunById(s,id){return (s.statementRuns||[]).find(x=>x.id===id)||null}
function markRunSent(s,runId,customerId,channel,ctx){
  const run=statementRunById(s,runId);if(!run)return;const row=(run.customers||[]).find(x=>x.customerId===customerId);if(!row)return;
  row.deliveryStatus='Sent';row.deliveryChannel=channel||'Manual';row.sentAt=new Date().toISOString();row.sentBy=s.session?.name||'User';
  if((run.customers||[]).every(x=>x.deliveryStatus==='Sent')){run.status='Sent';run.sentAt=new Date().toISOString()}
  ctx.audit('statement.delivery_marked',{runId,customerId,channel:row.deliveryChannel});ctx.save();ctx.toast('Statement marked as sent');ctx.render();
}
function statementRunModal(s,h){
  const run=statementRunById(s,s.statementRunOpen);if(!run)return '';
  const rows=(run.customers||[]).map(x=>'<tr><td><div class="payment-payee"><b>'+esc(x.customerName)+'</b><small>'+esc(x.email||x.phone||'No contact saved')+'</small></div></td><td>'+h.money2(x.opening)+'</td><td>'+h.money2(x.debits)+'</td><td>'+h.money2(x.credits)+'</td><td><b>'+h.money2(x.closing)+'</b></td><td>'+h.pill(x.deliveryStatus||'Prepared',(x.deliveryStatus||'Prepared')==='Sent'?'paid':'approved')+'</td><td><div class="inline-buttons"><button class="secondary tiny" data-action="statement-run-pdf:'+run.id+':'+x.customerId+'">PDF</button>'+(x.email?'<button class="secondary tiny" data-action="statement-run-email:'+run.id+':'+x.customerId+'">Email</button>':'')+(x.phone?'<button class="secondary tiny" data-action="statement-run-whatsapp:'+run.id+':'+x.customerId+'">WhatsApp</button>':'')+(x.deliveryStatus!=='Sent'?'<button class="text-btn" data-action="statement-run-sent:'+run.id+':'+x.customerId+'">Mark sent</button>':'')+'</div></td></tr>').join('');
  return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-statement-run"></div><div class="modal-box xwide"><div class="modal-head"><div><div class="eyebrow">MONTH-END STATEMENT RUN</div><h2>'+esc(run.period)+'</h2><p>'+run.statementCount+' customer statement'+(run.statementCount===1?'':'s')+' · closing balances '+h.money2(run.totalClosing)+'</p></div><button class="close" data-action="close-statement-run">×</button></div><div class="table-scroll"><table class="statement-run-table"><thead><tr><th>CUSTOMER</th><th>OPENING</th><th>CHARGES</th><th>CREDITS</th><th>CLOSING</th><th>DELIVERY</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="modal-actions"><button class="secondary" data-action="close-statement-run">Close</button></div></div></div>';
}
function runPanel(s,h){
  const current=monthKey(today()),runs=s.statementRuns||[];
  const rows=runs.length?runs.map(r=>'<tr><td><b>'+esc(r.period)+'</b><small class="table-sub">'+esc(r.from)+' to '+esc(r.to)+'</small></td><td>'+r.statementCount+'</td><td>'+h.money2(r.totalClosing)+'</td><td>'+h.pill(r.status||'Prepared',(r.status||'Prepared')==='Sent'?'paid':'approved')+'</td><td>'+esc(String(r.preparedAt||'').slice(0,10))+'</td><td><button class="secondary tiny" data-action="statement-run-open:'+r.id+'">Open run</button></td></tr>').join(''):'<tr><td colspan="6"><div class="empty-inline">No month-end statement runs prepared yet.</div></td></tr>';
  return '<section class="surface statement-automation"><div class="statement-auto-head"><div><div class="eyebrow">MONTH-END CUSTOMER STATEMENTS</div><h3>Statement runs</h3><p>Freeze a monthly customer-statement snapshot for review, PDF generation and delivery tracking.</p></div><div class="inline-buttons"><input id="statement-run-period" type="month" value="'+esc(current)+'"><button class="primary" data-action="statement-run-month-end">Prepare month-end</button></div></div><div class="statement-auto-note"><b>Accounting-safe:</b> statement runs are reporting snapshots only. They do not create invoices, payments, credits or journal entries.</div><div class="table-scroll"><table class="statement-run-table"><thead><tr><th>PERIOD</th><th>STATEMENTS</th><th>TOTAL CLOSING</th><th>STATUS</th><th>PREPARED</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>';
}
function runPdf(s,runId,customerId,ctx){const run=statementRunById(s,runId);if(!run)return;pdf(s,'customer',customerId,run.from,run.to,ctx)}
function runEmail(s,runId,customerId,ctx){
  const run=statementRunById(s,runId),row=run?.customers?.find(x=>x.customerId===customerId);if(!row||!row.email){ctx.toast('No customer email is saved.');return}
  const subject=encodeURIComponent('Account statement · '+run.period),body=encodeURIComponent('Dear '+row.customerName+',\n\nPlease find your account statement for '+run.period+'.\nClosing balance: D'+Number(row.closing||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})+'\n\nRegards,\n'+(s.company||'DalasiPay Workspace'));
  window.location.href='mailto:'+encodeURIComponent(row.email)+'?subject='+subject+'&body='+body;
}
function runWhatsApp(s,runId,customerId,ctx){
  const run=statementRunById(s,runId),row=run?.customers?.find(x=>x.customerId===customerId);if(!row||!row.phone){ctx.toast('No customer phone number is saved.');return}
  const phone=String(row.phone).replace(/[^0-9]/g,'');if(!phone){ctx.toast('Customer phone number is invalid.');return}
  const msg='Dear '+row.customerName+', your '+run.period+' account statement is ready. Closing balance: D'+Number(row.closing||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})+'. Please contact '+(s.company||'us')+' if you need any clarification.';
  window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank','noopener');
}
function render(s,h){
  const {pageTitle,icon,money2}=h,type=s.statementView==='supplier'?'supplier':'customer',ids=type==='supplier'?supplierIds(s):customerIds(s);
  let id=s.statementPartyId;if(!ids.includes(id))id=ids[0]||null;
  const from=s.statementFrom||yearStart(),to=s.statementTo||today(),st=id?statement(s,type,id,from,to):null;
  const rows=st&&st.rows.length?st.rows.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+esc(x.kind)+'</td><td><b>'+esc(x.reference)+'</b><small>'+esc(x.description||'')+'</small></td><td>'+ (x.debit?money2(x.debit):'—')+'</td><td>'+ (x.credit?money2(x.credit):'—')+'</td><td><b>'+money2(x.balance)+'</b></td></tr>').join(''):'<tr><td colspan="6"><div class="empty-inline">No transactions in this statement period.</div></td></tr>';
  return pageTitle('ACCOUNT STATEMENTS','Statements','Customer and supplier account statements with invoices, bills, debit notes, credit notes, payments and refunds.','<div class="inline-buttons"><button class="secondary" data-action="statement-export">'+icon('download',14)+' CSV</button><button class="primary" data-action="statement-pdf">'+icon('file',14)+' Statement PDF</button></div>')+runPanel(s,h)+
  '<div class="statement-tabs"><button class="'+(type==='customer'?'active':'')+'" data-action="statement-view:customer">Customer statements</button><button class="'+(type==='supplier'?'active':'')+'" data-action="statement-view:supplier">Supplier statements</button></div>'+
  '<div class="statement-toolbar surface"><div><span>'+(type==='customer'?'Customer':'Supplier')+'</span><select id="statement-party">'+partyOptions(s,type,id)+'</select></div><div><span>From</span><input id="statement-from" type="date" value="'+esc(from)+'"></div><div><span>To</span><input id="statement-to" type="date" value="'+esc(to)+'"></div></div>'+
  (st?'<div class="statement-kpis"><div class="surface"><span>Opening balance</span><b>'+money2(st.opening)+'</b><small>'+esc(from)+'</small></div><div class="surface"><span>Charges / increases</span><b>'+money2(st.debits)+'</b><small>'+st.rows.filter(x=>x.debit).length+' entries</small></div><div class="surface"><span>Payments / credits</span><b>'+money2(st.credits)+'</b><small>'+st.rows.filter(x=>x.credit).length+' entries</small></div><div class="surface '+(st.closing<0?'statement-credit':'')+'"><span>Closing balance</span><b>'+money2(st.closing)+'</b><small>'+(st.closing<0?'account credit / refund position':'amount outstanding')+'</small></div></div>'+
  '<section class="surface employee-card statement-register"><div class="table-tools"><div><h3>'+esc(st.name)+'</h3><p>'+esc(from)+' to '+esc(to)+' · running account balance</p></div></div><div class="table-scroll"><table><thead><tr><th>DATE</th><th>TYPE</th><th>REFERENCE</th><th>CHARGE / INCREASE</th><th>PAYMENT / CREDIT</th><th>BALANCE</th></tr></thead><tbody>'+rows+'</tbody></table></div></section>':'<div class="surface empty-inline">Add a '+(type==='customer'?'customer':'supplier')+' account to generate statements.</div>');
}
window.DalasiStatements={customerRows,supplierRows,openingBalance,statement,exportCsv,pdf,render,monthEndRun,statementRunModal,runPdf,runEmail,runWhatsApp,markRunSent};
})();