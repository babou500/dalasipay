(function(){
  'use strict';

  const round=n=>Math.round((Number(n)||0)*100)/100;
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function accountById(state,id){return window.DalasiCashBank?.accountById?.(state,id)||null;}
  function eligibleAccounts(state){return (state.cashAccounts||[]).filter(x=>(x.status||'Active')==='Active'&&['Bank','Mobile Money'].includes(x.type||'Bank'));}
  function priorReconciliation(state,accountId,statementDate='9999-12-31'){
    return (state.bankReconciliations||[]).filter(x=>x.accountId===accountId&&x.statementDate<statementDate).slice().sort((a,b)=>String(b.statementDate).localeCompare(String(a.statementDate))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0]||null;
  }
  function candidates(state,draft){
    if(!draft?.accountId||!draft?.statementDate)return [];
    return (state.cashTransactions||[]).filter(x=>x.accountId===draft.accountId&&!x.reconciliationId&&String(x.date||'')<=draft.statementDate).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  }
  function model(state){
    const d=state.bankReconDraft;if(!d)return null;
    const account=accountById(state,d.accountId),previous=priorReconciliation(state,d.accountId,d.statementDate);
    const openingCleared=round(previous?previous.statementBalance:(Number(account?.openingBalance)||0));
    const rows=candidates(state,d),selected=new Set(d.selected||[]),clearedRows=rows.filter(x=>selected.has(x.id));
    const clearedMovement=round(clearedRows.reduce((a,x)=>a+(Number(x.amount)||0),0));
    const clearedBalance=round(openingCleared+clearedMovement);
    const statementBalance=round(d.statementBalance);
    const difference=round(statementBalance-clearedBalance);
    const allToDate=(state.cashTransactions||[]).filter(x=>x.accountId===d.accountId&&String(x.date||'')<=d.statementDate);
    const bookBalance=round((Number(account?.openingBalance)||0)+allToDate.reduce((a,x)=>a+(Number(x.amount)||0),0));
    const outstandingNet=round(bookBalance-clearedBalance);
    return {draft:d,account,previous,openingCleared,rows,selected,clearedRows,clearedMovement,clearedBalance,statementBalance,difference,bookBalance,outstandingNet,canFinalize:Math.abs(difference)<0.01};
  }
  function history(state){
    return (state.bankReconciliations||[]).slice().sort((a,b)=>String(b.statementDate||'').localeCompare(String(a.statementDate||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  }
  function panel(state,h){
    const {money2,icon,pill}=h,m=model(state),hist=history(state),accounts=eligibleAccounts(state);
    if(m){
      const rows=m.rows.length?m.rows.map(x=>{
        const checked=m.selected.has(x.id),account=m.account;
        return '<tr class="'+(checked?'recon-cleared-row':'')+'">'+
          '<td><input type="checkbox" data-recon-tx value="'+esc(x.id)+'" '+(checked?'checked':'')+'></td>'+
          '<td>'+esc(x.date||'')+'</td>'+
          '<td><div class="payment-payee"><b>'+esc(x.counterparty||x.type||'Transaction')+'</b><small>'+esc(x.description||x.type||'')+'</small></div></td>'+
          '<td>'+esc(x.reference||'—')+'</td>'+
          '<td class="'+(Number(x.amount)>=0?'cash-in-amount':'cash-out-amount')+'">'+(Number(x.amount)>=0?'+':'')+money2(x.amount)+'</td>'+
          '<td>'+esc(account?.name||'')+'</td>'+
        '</tr>';
      }).join(''):'<tr><td colspan="6"><div class="empty-inline">No unreconciled transactions exist up to this statement date.</div></td></tr>';
      return '<section class="surface bank-recon-card">'+
        '<div class="table-tools"><div><h3>Bank Reconciliation</h3><p>'+esc(m.account?.name||'Account')+' · statement ending '+esc(m.draft.statementDate)+'</p></div><div class="inline-buttons"><button class="secondary" data-action="bank-recon-cancel">Cancel</button><button class="primary" data-action="bank-recon-finalize" '+(m.canFinalize?'':'disabled')+'>'+icon('check',14)+' Finalize reconciliation</button></div></div>'+
        '<div class="recon-kpis">'+
          '<div><span>Statement balance</span><b data-recon-statement>'+money2(m.statementBalance)+'</b><small>bank/mobile statement</small></div>'+
          '<div><span>Cleared book balance</span><b data-recon-cleared>'+money2(m.clearedBalance)+'</b><small>opening cleared + selected items</small></div>'+
          '<div class="'+(!m.canFinalize?'recon-warning':'')+'"><span>Difference</span><b data-recon-difference>'+money2(Math.abs(m.difference))+'</b><small data-recon-difference-label>'+(m.canFinalize?'reconciled':'must reach zero')+'</small></div>'+
          '<div><span>Outstanding net</span><b data-recon-outstanding>'+money2(m.outstandingNet)+'</b><small>book items not on statement</small></div>'+
        '</div>'+
        '<div class="recon-summary-line"><span>Previous cleared balance <b>'+money2(m.openingCleared)+'</b></span><span>Book balance at statement date <b>'+money2(m.bookBalance)+'</b></span><span>Selected <b data-recon-count>'+m.clearedRows.length+'</b> of '+m.rows.length+'</span></div>'+
        '<form id="bank-reconciliation-form"><div class="table-scroll"><table><thead><tr><th>CLEAR</th><th>DATE</th><th>DETAIL</th><th>REFERENCE</th><th>AMOUNT</th><th>ACCOUNT</th></tr></thead><tbody>'+rows+'</tbody></table></div></form>'+
        '<div class="recon-note '+(!m.canFinalize?'recon-warning-note':'')+'"><b>'+(m.canFinalize?'Ready to finalize.':'Difference remains.')+'</b> Tick only transactions that appear on the statement. Record missing bank fees, interest or direct bank entries in Cash & Bank first, then return to reconciliation.</div>'+
      '</section>';
    }
    const histRows=hist.length?hist.map(r=>{const a=accountById(state,r.accountId);return '<tr><td>'+esc(r.statementDate)+'</td><td><div class="payment-payee"><b>'+esc(a?.name||r.accountName||'Account')+'</b><small>'+esc(a?.type||r.accountType||'')+'</small></div></td><td>'+money2(r.statementBalance)+'</td><td>'+money2(r.bookBalance)+'</td><td>'+money2(r.outstandingNet)+'</td><td>'+r.clearedCount+'</td><td>'+pill('Reconciled','ready')+'</td><td><button class="secondary" data-action="bank-recon-export:'+esc(r.id)+'">'+icon('download',13)+' CSV</button></td></tr>'}).join(''):'<tr><td colspan="8"><div class="empty-inline">No finalized bank reconciliations yet.</div></td></tr>';
    return '<section class="surface bank-recon-card">'+
      '<div class="table-tools"><div><h3>Bank Reconciliation</h3><p>Compare DalasiPay cashbook transactions with actual bank or mobile-money statements.</p></div><button class="primary" data-action="open-bank-reconciliation" '+(accounts.length?'':'disabled')+'>'+icon('check',14)+' Start reconciliation</button></div>'+
      (accounts.length?'':'<div class="recon-note recon-warning-note"><b>No eligible account.</b> Add an active Bank or Mobile Money account before starting reconciliation.</div>')+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Reconciliation does not change the books</b><p>It marks which existing cashbook transactions appear on the statement. Missing fees, interest or corrections should be recorded as Cash & Bank transactions first, preserving a clean audit trail.</p></div></div>'+
      '<div class="table-scroll"><table><thead><tr><th>STATEMENT DATE</th><th>ACCOUNT</th><th>STATEMENT BALANCE</th><th>BOOK BALANCE</th><th>OUTSTANDING NET</th><th>CLEARED</th><th>STATUS</th><th>EXPORT</th></tr></thead><tbody>'+histRows+'</tbody></table></div>'+
    '</section>';
  }
  function startModal(state,h){
    const {field,icon}=h,rows=eligibleAccounts(state),opts=rows.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+' · '+esc(a.type)+'</option>').join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-bank-reconciliation"></div><form id="bank-reconciliation-start-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">BANK RECONCILIATION</div><h2>Start reconciliation</h2><p>Use the closing balance and date exactly as shown on the statement.</p></div><button type="button" class="close" data-action="close-bank-reconciliation">×</button></div>'+
      '<div class="form-grid">'+
        field('Account','<select name="accountId" required><option value="">Select bank / mobile account</option>'+opts+'</select>')+
        field('Statement ending date','<input name="statementDate" type="date" value="'+todayIso()+'" required>')+
        field('Statement ending balance (GMD)','<input name="statementBalance" type="number" step="0.01" required>')+
      '</div>'+
      '<div class="modal-note">DalasiPay will show all unreconciled transactions dated on or before the statement date. Tick only the transactions that appear on the statement.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-bank-reconciliation">Cancel</button><button class="primary" type="submit">'+icon('check',14)+' Begin reconciliation</button></div>'+
    '</form></div>';
  }
  function start(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to reconcile accounts.');return;}
    const fd=new FormData(ev.target),accountId=String(fd.get('accountId')||''),statementDate=String(fd.get('statementDate')||''),statementBalance=Number(fd.get('statementBalance'));
    const account=accountById(state,accountId);if(!account||!statementDate||!Number.isFinite(statementBalance)){ctx.toast('Choose an account, statement date and valid ending balance.');return;}
    const last=history(state).find(x=>x.accountId===accountId);
    if(last&&statementDate<=last.statementDate){ctx.toast('Statement date must be after the last finalized reconciliation on '+last.statementDate+'.');return;}
    state.bankReconDraft={accountId,statementDate,statementBalance:round(statementBalance),selected:[]};state.bankReconOpen=false;state.cashBankTab='reconciliation';ctx.render();
  }
  function bind(state,h){
    const form=document.getElementById('bank-reconciliation-form');if(!form)return;
    form.addEventListener('change',ev=>{
      const box=ev.target.closest('[data-recon-tx]');if(!box||!state.bankReconDraft)return;
      const set=new Set(state.bankReconDraft.selected||[]);box.checked?set.add(box.value):set.delete(box.value);state.bankReconDraft.selected=[...set];
      const m=model(state);if(!m)return;
      const money2=h.money2;
      const setText=(sel,val)=>{const el=document.querySelector(sel);if(el)el.textContent=val;};
      setText('[data-recon-cleared]',money2(m.clearedBalance));setText('[data-recon-difference]',money2(Math.abs(m.difference)));setText('[data-recon-difference-label]',m.canFinalize?'reconciled':'must reach zero');setText('[data-recon-outstanding]',money2(m.outstandingNet));setText('[data-recon-count]',String(m.clearedRows.length));
      const btn=document.querySelector('[data-action="bank-recon-finalize"]');if(btn)btn.disabled=!m.canFinalize;
      box.closest('tr')?.classList.toggle('recon-cleared-row',box.checked);
      const diffCard=document.querySelector('[data-recon-difference]')?.closest('div');if(diffCard)diffCard.classList.toggle('recon-warning',!m.canFinalize);
    });
  }
  function finalize(state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to finalize reconciliation.');return;}
    const m=model(state);if(!m||!m.canFinalize){ctx.toast('Reconciliation difference must be zero before finalizing.');return;}
    const id='REC-'+Date.now().toString(36).toUpperCase(),now=new Date().toISOString(),user=state.session?.name||'User';
    m.clearedRows.forEach(x=>{x.reconciliationId=id;x.reconciledAt=now;x.reconciledBy=user;x.statementDate=m.draft.statementDate;});
    const rec={id,accountId:m.draft.accountId,accountName:m.account?.name||'',accountType:m.account?.type||'',statementDate:m.draft.statementDate,statementBalance:m.statementBalance,previousStatementBalance:m.openingCleared,clearedMovement:m.clearedMovement,clearedCount:m.clearedRows.length,clearedTransactionIds:m.clearedRows.map(x=>x.id),bookBalance:m.bookBalance,outstandingNet:m.outstandingNet,difference:m.difference,createdAt:now,createdBy:user};
    state.bankReconciliations=state.bankReconciliations||[];state.bankReconciliations.unshift(rec);state.bankReconDraft=null;
    ctx.audit('bank.reconciliation_finalized',{reconciliationId:id,accountId:rec.accountId,statementDate:rec.statementDate,statementBalance:rec.statementBalance,clearedCount:rec.clearedCount,outstandingNet:rec.outstandingNet});ctx.save();ctx.toast('Bank reconciliation finalized');ctx.render();
  }
  function exportOne(id,state,ctx){
    const rec=(state.bankReconciliations||[]).find(x=>x.id===id);if(!rec){ctx.toast('Reconciliation record not found');return;}
    const ids=new Set(rec.clearedTransactionIds||[]),rows=(state.cashTransactions||[]).filter(x=>ids.has(x.id));
    const data=[['Reconciliation ID',rec.id],['Account',rec.accountName],['Statement date',rec.statementDate],['Statement balance',rec.statementBalance],['Book balance',rec.bookBalance],['Outstanding net',rec.outstandingNet],[],['Date','Type','Counterparty','Reference','Description','Amount'],...rows.map(x=>[x.date,x.type,x.counterparty,x.reference,x.description,x.amount])];
    const csv=data.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');ctx.downloadText('dalasipay-bank-reconciliation-'+rec.statementDate+'.csv',csv);ctx.toast('Bank reconciliation downloaded');
  }
  function exportRegister(state,ctx){
    const rows=history(state),data=[['Statement Date','Account','Statement Balance','Book Balance','Outstanding Net','Cleared Transactions','Prepared By','Prepared At'],...rows.map(x=>[x.statementDate,x.accountName,x.statementBalance,x.bookBalance,x.outstandingNet,x.clearedCount,x.createdBy,x.createdAt])];
    const csv=data.map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');ctx.downloadText('dalasipay-bank-reconciliation-register-'+todayIso()+'.csv',csv);ctx.toast('Bank reconciliation register downloaded');
  }

  window.DalasiBankReconciliation={eligibleAccounts,priorReconciliation,candidates,model,history,panel,startModal,start,bind,finalize,exportOne,exportRegister};
})();