(function(){
  'use strict';
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function dateLabel(v){if(!v)return '—';try{return new Date(v).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return String(v).slice(0,10)}}
  function rows(state){
    const out=[];
    (state.businessPayments||[]).filter(x=>x.reversedAt).forEach(x=>out.push({
      key:'payment:'+x.id,type:'Business payment',sourceType:'business-payment',sourceId:x.id,
      originalRef:x.receiptNumber||x.voucherNumber||x.id,reversalRef:x.reversalCashTransactionId||'Cashbook reversal',
      party:x.payee||'Payee',amount:Number(x.amount)||0,originalDate:x.paidAt||x.createdAt,reversedAt:x.reversedAt,
      reversedBy:x.reversedBy||'User',reason:x.reversalReason||'',canCopy:true
    }));
    (state.incomingPayments||[]).filter(x=>x.reversedAt).forEach(x=>out.push({
      key:'receipt:'+x.id,type:'Customer receipt',sourceType:'customer-collection',sourceId:x.id,
      originalRef:x.receiptNumber||x.id,reversalRef:x.reversalCashTransactionId||'Cashbook reversal',
      party:x.customerName||'Customer',amount:Number(x.amount)||0,originalDate:x.receivedDate||x.createdAt,reversedAt:x.reversedAt,
      reversedBy:x.reversedBy||'User',reason:x.reversalReason||'',canCopy:true
    }));
    (state.businessExpenses||[]).filter(x=>x.reversedAt).forEach(x=>out.push({
      key:'expense:'+x.id,type:'Expense',sourceType:'expense',sourceId:x.id,
      originalRef:x.expenseNo||x.id,reversalRef:x.reversalCashTransactionId||'Cashbook reversal',
      party:x.merchant||'Merchant',amount:Number(x.amount)||0,originalDate:x.expenseDate||x.createdAt,reversedAt:x.reversedAt,
      reversedBy:x.reversedBy||'User',reason:x.reversalReason||'',canCopy:true
    }));
    (state.manualJournals||[]).filter(x=>x.reversalJournalId&&!x.reversalOf).forEach(x=>out.push({
      key:'journal:'+x.id,type:'Manual journal',sourceType:'manual-journal',sourceId:x.id,
      originalRef:x.journalNo||x.id,reversalRef:x.reversalJournalNo||x.reversalJournalId,
      reversalSourceId:x.reversalJournalId,party:x.memo||'Accounting adjustment',amount:Number(x.debit)||0,
      originalDate:x.date||x.postedAt||x.createdAt,reversedAt:x.reversedAt,reversedBy:x.reversedBy||'User',
      reason:x.reversalReason||'',canCopy:true
    }));
    return out.sort((a,b)=>String(b.reversedAt||'').localeCompare(String(a.reversedAt||'')));
  }
  function render(state,h){
    const r=rows(state),money2=h.money2,icon=h.icon,pill=h.pill,pageTitle=h.pageTitle;
    const total=r.reduce((a,x)=>a+Math.abs(Number(x.amount)||0),0),month=new Date().toISOString().slice(0,7),
      thisMonth=r.filter(x=>String(x.reversedAt||'').slice(0,7)===month).length;
    const body=r.length?r.map(x=>'<tr>'+
      '<td><div class="payment-payee"><b>'+esc(x.originalRef)+'</b><small>'+esc(x.type)+' · '+esc(x.party)+'</small></div></td>'+
      '<td>'+dateLabel(x.originalDate)+'</td><td class="payment-amount">'+money2(x.amount)+'</td>'+
      '<td><div class="payment-payee"><b>'+esc(x.reversalRef)+'</b><small>'+dateLabel(x.reversedAt)+'</small></div></td>'+
      '<td><div class="payment-payee"><b>'+esc(x.reversedBy)+'</b><small>'+esc(x.reason||'No reason recorded')+'</small></div></td>'+
      '<td>'+pill('Reversed','neutral')+'</td>'+
      '<td><div class="inline-buttons"><button class="secondary tiny" data-action="correction-original:'+esc(x.key)+'">View original</button>'+
      '<button class="secondary tiny" data-action="correction-reversal:'+esc(x.key)+'">View reversal</button>'+
      (x.canCopy?'<button class="primary tiny" data-action="correction-copy:'+esc(x.key)+'">Create corrected copy</button>':'')+
      '</div></td></tr>').join(''):'<tr><td colspan="7"><div class="empty-inline">No transaction reversals recorded yet.</div></td></tr>';
    return pageTitle('ACCOUNTING CONTROL','Reversals & Corrections','Review reversed transactions, reasons, users, accounting dates and replacement records in one audit-safe register.',
      '<button class="secondary" data-action="correction-export">'+icon('download',14)+' Export register</button>')+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Original records are never deleted</b><p>A reversal preserves the original posting and records the opposite entry separately. Corrected copies begin as new draft records so they can follow the normal approval process.</p></div></div>'+
      '<div class="payment-overview"><div class="surface"><span>Total reversals</span><b>'+r.length+'</b><small>all supported transaction types</small></div>'+
      '<div class="surface"><span>This month</span><b>'+thisMonth+'</b><small>reversals posted this month</small></div>'+
      '<div class="surface"><span>Reversed value</span><b>'+money2(total)+'</b><small>gross absolute value</small></div>'+
      '<div class="surface"><span>Control status</span><b>Audit-safe</b><small>original + reversal retained</small></div></div>'+
      '<div class="surface employee-card"><div class="table-tools"><div><h3>Reversal & corrections register</h3><p>Original transaction, reversal reference, reason, user and corrected-copy workflow</p></div><label class="register-search">'+icon('search',13)+'<input data-table-search="corrections-register" placeholder="Search reversals"></label></div>'+
      '<div class="table-scroll"><table data-register-table="corrections-register"><thead><tr><th>ORIGINAL</th><th>ORIGINAL DATE</th><th>AMOUNT</th><th>REVERSAL</th><th>REVERSED BY / REASON</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function findRow(state,key){return rows(state).find(x=>x.key===key)||null;}
  function openOriginal(key,state,ctx){const x=findRow(state,key);if(!x)return;ctx.openSourceRecord(x.sourceType,x.sourceId);}
  function openReversal(key,state,ctx){
    const x=findRow(state,key);if(!x)return;
    if(x.type==='Manual journal'&&x.reversalSourceId){ctx.openSourceRecord('manual-journal',x.reversalSourceId);return;}
    state.page='cashbank';state.cashBankTab='accounts';ctx.toast('Cash & Bank opened. The linked reversal reference is '+x.reversalRef+'.');ctx.render();
  }
  function correctedCopy(key,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create corrected copies.');return;}
    const x=findRow(state,key);if(!x)return;const now=new Date().toISOString(),today=now.slice(0,10),actor=state.session?.name||'User';
    if(x.type==='Business payment'){
      const src=(state.businessPayments||[]).find(y=>y.id===x.sourceId);if(!src)return;
      const id='BP-'+Date.now().toString(36).toUpperCase();
      state.businessPayments.unshift({...src,id,status:'Draft',dueDate:today,createdAt:now,createdBy:actor,updatedAt:now,updatedBy:actor,correctedFromId:src.id,correctedFromRef:src.receiptNumber||src.voucherNumber||src.id,reference:(src.reference?src.reference+' · ':'')+'Correction of '+(src.receiptNumber||src.id),voucherNumber:null,receiptNumber:null,paidAt:null,approvedAt:null,approvedBy:null,reversedAt:null,reversedBy:null,reversalReason:null,reversalCashTransactionId:null});
      src.correctedById=id;src.correctedAt=now;ctx.audit('payment.corrected_copy_created',{sourcePaymentId:src.id,newPaymentId:id});state.page='payments';state.paymentTab='payments';
    }else if(x.type==='Customer receipt'){
      const src=(state.incomingPayments||[]).find(y=>y.id===x.sourceId);if(!src)return;
      const inv=(state.customerInvoices||[]).find(y=>y.id===src.invoiceId);if(!inv){ctx.toast('The linked invoice is unavailable.');return;}
      state.page='payments';state.paymentTab='receivables';state.incomingPaymentInvoiceId=inv.id;state.incomingPaymentOpen=true;state.paymentSelectedAccountId=src.accountId||null;
      inv.correctionSourceReceiptId=src.id;ctx.audit('receivable.corrected_copy_started',{sourceReceiptId:src.id,invoiceId:inv.id});ctx.toast('New receipt form opened from the reversed receipt. Enter the corrected amount/reference and save.');
    }else if(x.type==='Expense'){
      const src=(state.businessExpenses||[]).find(y=>y.id===x.sourceId);if(!src)return;
      const id='EXP-'+Date.now().toString(36).toUpperCase();
      state.businessExpenses.unshift({...src,id,expenseNo:null,status:'Draft',expenseDate:today,createdAt:now,createdBy:actor,updatedAt:now,updatedBy:actor,correctedFromId:src.id,correctedFromRef:src.expenseNo||src.id,reference:(src.reference?src.reference+' · ':'')+'Correction of '+(src.expenseNo||src.id),paidAt:null,paidBy:null,approvedAt:null,approvedBy:null,reversedAt:null,reversedBy:null,reversalReason:null,reversalCashTransactionId:null});
      src.correctedById=id;src.correctedAt=now;ctx.audit('expense.corrected_copy_created',{sourceExpenseId:src.id,newExpenseId:id});state.page='expenses';state.expenseTab='expenses';
    }else if(x.type==='Manual journal'){
      const src=(state.manualJournals||[]).find(y=>y.id===x.sourceId);if(!src)return;
      const id='JRN-'+Date.now().toString(36).toUpperCase(),copy={...src,id,journalNo:null,date:today,status:'Draft',reference:'CORR-'+(src.journalNo||src.id),memo:'Correction of '+(src.journalNo||src.id)+' · '+(src.memo||''),createdAt:now,createdBy:actor,updatedAt:now,correctedFromId:src.id,reversalJournalId:null,reversalJournalNo:null,reversedAt:null,reversedBy:null,reversalReason:null,reversalOf:null};
      state.manualJournals.unshift(copy);src.correctedById=id;src.correctedAt=now;ctx.audit('accounting.journal_corrected_copy_created',{sourceJournalId:src.id,newJournalId:id});state.page='accounting';state.accountingTab='journals';
    }
    ctx.save();ctx.toast(x.type+' corrected copy created as draft');ctx.render();
  }
  function exportCsv(state,ctx){
    const data=[['Type','Original Ref','Original Date','Party / Detail','Amount','Reversal Ref','Reversal Date','Reversed By','Reason'],...rows(state).map(x=>[x.type,x.originalRef,String(x.originalDate||'').slice(0,10),x.party,x.amount,x.reversalRef,String(x.reversedAt||'').slice(0,10),x.reversedBy,x.reason])];
    const csv=data.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');
    ctx.downloadText('dalasipay-reversals-corrections.csv',csv);ctx.toast('Reversal & corrections register downloaded');
  }
  window.DalasiCorrectionsRegister={rows,render,openOriginal,openReversal,correctedCopy,exportCsv};
})();