(function(){
  'use strict';

  const TYPES=['Bank','Mobile Money','Cash'];
  function todayIso(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function accounts(state,activeOnly=false){const rows=state.cashAccounts||[];return activeOnly?rows.filter(x=>(x.status||'Active')==='Active'):rows;}
  function accountById(state,id){return accounts(state).find(x=>x.id===id)||null;}
  function transactionsFor(state,id){return (state.cashTransactions||[]).filter(x=>x.accountId===id);}
  function balance(state,id){
    const a=accountById(state,id);if(!a)return 0;
    return Math.round(((Number(a.openingBalance)||0)+transactionsFor(state,id).reduce((s,x)=>s+(Number(x.amount)||0),0))*100)/100;
  }
  function totals(state){
    const rows=accounts(state,true),by={Bank:0,'Mobile Money':0,Cash:0};
    rows.forEach(a=>{by[a.type||'Bank']=(by[a.type||'Bank']||0)+balance(state,a.id)});
    const total=Object.values(by).reduce((a,x)=>a+x,0);
    return {accounts:rows.length,total:Math.round(total*100)/100,bank:Math.round((by.Bank||0)*100)/100,mobile:Math.round((by['Mobile Money']||0)*100)/100,cash:Math.round((by.Cash||0)*100)/100};
  }
  function accountSelect(state,name='accountId',selected='',label='Select account'){
    const rows=accounts(state,true);
    if(!rows.length)return '<select name="'+esc(name)+'" disabled><option>No Cash & Bank account yet</option></select><input type="hidden" name="'+esc(name)+'" value="">';
    return '<select name="'+esc(name)+'" required><option value="">'+esc(label)+'</option>'+rows.map(a=>'<option value="'+esc(a.id)+'" '+(a.id===selected?'selected':'')+'>'+esc(a.name)+' · '+esc(a.type)+' · D'+balance(state,a.id).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})+'</option>').join('')+'</select>';
  }
  function post(state,input={}){
    const accountId=String(input.accountId||'');if(!accountId||!accountById(state,accountId))return null;
    state.cashTransactions=state.cashTransactions||[];
    const sourceKey=input.sourceKey||((input.sourceType&&input.sourceId)?input.sourceType+':'+input.sourceId+':'+(input.direction||'in'):'');
    if(sourceKey){const existing=state.cashTransactions.find(x=>x.sourceKey===sourceKey);if(existing)return existing;}
    const raw=Math.abs(Number(input.amount)||0);if(raw<=0)return null;
    const direction=input.direction==='out'?'out':'in',signed=direction==='out'?-raw:raw;
    const tx={id:'CBT-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,5).toUpperCase(),accountId,date:String(input.date||todayIso()),direction,amount:Math.round(signed*100)/100,type:String(input.type||'Manual'),counterparty:String(input.counterparty||''),reference:String(input.reference||''),description:String(input.description||''),cashFlowClass:String(input.cashFlowClass||''),cashFlowDetail:String(input.cashFlowDetail||''),sourceType:String(input.sourceType||''),sourceId:String(input.sourceId||''),sourceKey,createdAt:new Date().toISOString(),createdBy:String(input.createdBy||'User')};
    state.cashTransactions.unshift(tx);return tx;
  }
  function reverseSource(state,sourceKey,createdBy='User'){
    const original=(state.cashTransactions||[]).find(x=>x.sourceKey===sourceKey);if(!original)return null;
    const reversalKey='reverse:'+sourceKey;if((state.cashTransactions||[]).some(x=>x.sourceKey===reversalKey))return null;
    return post(state,{accountId:original.accountId,date:todayIso(),direction:original.amount>0?'out':'in',amount:Math.abs(original.amount),type:'Reversal',counterparty:original.counterparty,reference:original.reference,description:'Reversal of '+(original.description||original.type),sourceKey:reversalKey,sourceType:'reversal',sourceId:original.id,createdBy});
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,t=totals(state),rows=accounts(state),tx=(state.cashTransactions||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,100),tab=state.cashBankTab||'accounts';
    const tabs='<div class="cashbank-tabs"><button class="'+(tab==='accounts'?'active':'')+'" data-action="cash-bank-tab:accounts">Accounts & register</button><button class="'+(tab==='reconciliation'?'active':'')+'" data-action="cash-bank-tab:reconciliation">Reconciliation</button></div>';
    if(tab==='reconciliation')return pageTitle('CASH MANAGEMENT','Cash & Bank','Reconcile bank and mobile-money statements to DalasiPay cashbook transactions.','<div class="inline-buttons"><button class="secondary" data-action="bank-recon-register-export">'+icon('download',14)+' Reconciliation register</button></div>')+tabs+window.DalasiBankReconciliation.panel(state,h);
    const accountRows=rows.length?rows.map(a=>'<tr><td><div class="payment-payee"><b>'+esc(a.name)+'</b><small>'+esc(a.reference||a.type||'Account')+'</small></div></td><td>'+esc(a.type||'Bank')+'</td><td>'+money2(a.openingBalance||0)+'</td><td class="payment-amount">'+money2(balance(state,a.id))+'</td><td>'+pill(a.status||'Active',(a.status||'Active')==='Active'?'ready':'neutral')+'</td></tr>').join(''):'<tr><td colspan="5"><div class="empty-inline">No cash or bank accounts yet. Add the business bank, mobile-money or cash accounts to start maintaining balances.</div></td></tr>';
    const txRows=tx.length?tx.map(x=>{const a=accountById(state,x.accountId);return '<tr><td>'+new Date((x.date||todayIso())+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'</td><td><b>'+esc(a?.name||'Account')+'</b><small class="cash-sub">'+esc(x.type||'Transaction')+'</small></td><td>'+esc(x.counterparty||x.description||'—')+'</td><td>'+esc(x.reference||'—')+'</td><td class="'+(Number(x.amount)>=0?'cash-in-amount':'cash-out-amount')+'">'+(Number(x.amount)>=0?'+':'')+money2(x.amount)+'</td><td>'+money2(balanceAtTransaction(state,x))+'</td><td>'+(x.reconciliationId?pill('Reconciled','ready'):pill('Open','neutral'))+'</td></tr>'}).join(''):'<tr><td colspan="7"><div class="empty-inline">No cash transactions recorded yet.</div></td></tr>';
    return pageTitle('CASH MANAGEMENT','Cash & Bank','Maintain bank, mobile-money and cash balances from real business money movements.','<div class="inline-buttons"><button class="secondary" data-action="open-cash-transfer">'+icon('arrow',14)+' Transfer</button><button class="secondary" data-action="open-cash-transaction">'+icon('plus',14)+' Transaction</button><button class="primary" data-action="open-cash-account">'+icon('bank',14)+' Add account</button></div>')+
      tabs+
      '<div class="cashbank-kpis"><div class="surface"><span>Total cash & bank</span><b>'+money2(t.total)+'</b><small>'+t.accounts+' active account'+(t.accounts===1?'':'s')+'</small></div><div class="surface"><span>Bank</span><b>'+money2(t.bank)+'</b><small>bank accounts</small></div><div class="surface"><span>Mobile Money</span><b>'+money2(t.mobile)+'</b><small>wallet balances</small></div><div class="surface"><span>Cash</span><b>'+money2(t.cash)+'</b><small>petty cash / till</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Balances move only from recorded transactions</b><p>Customer collections and direct income can credit an account. Paid business payments and expenses can debit an account. Transfers create equal and opposite entries and do not change total cash.</p></div></div>'+
      '<section class="surface employee-card"><div class="table-tools"><div><h3>Accounts</h3><p>Opening balances plus posted transactions</p></div></div><div class="table-scroll"><table><thead><tr><th>ACCOUNT</th><th>TYPE</th><th>OPENING</th><th>CURRENT BALANCE</th><th>STATUS</th></tr></thead><tbody>'+accountRows+'</tbody></table></div></section>'+
      '<section class="surface employee-card cash-register"><div class="table-tools"><div><h3>Cash & bank register</h3><p>Latest 100 money movements</p></div><button class="secondary" data-action="cash-export">'+icon('download',14)+' CSV</button></div><div class="table-scroll"><table><thead><tr><th>DATE</th><th>ACCOUNT</th><th>COUNTERPARTY / DETAIL</th><th>REFERENCE</th><th>MOVEMENT</th><th>BALANCE</th><th>RECON</th></tr></thead><tbody>'+txRows+'</tbody></table></div></section>';
  }
  function balanceAtTransaction(state,tx){
    const a=accountById(state,tx.accountId);if(!a)return 0;
    const rows=(state.cashTransactions||[]).filter(x=>x.accountId===tx.accountId).slice().sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))||String(x.createdAt||'').localeCompare(String(y.createdAt||'')));
    let b=Number(a.openingBalance)||0;for(const x of rows){b+=Number(x.amount)||0;if(x.id===tx.id)break;}return Math.round(b*100)/100;
  }
  function accountModal(state,h){
    const {field,icon}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-cash-account"></div><form id="cash-account-form" class="modal-box"><div class="modal-head"><div><div class="eyebrow">CASH & BANK</div><h2>Add account</h2><p>Add a real business bank, mobile-money or cash account.</p></div><button type="button" class="close" data-action="close-cash-account">×</button></div><div class="form-grid">'+
      field('Account name','<input name="name" placeholder="e.g. GTBank Operating Account" required>')+
      field('Account type','<select name="type">'+TYPES.map(x=>'<option>'+x+'</option>').join('')+'</select>')+
      field('Opening balance (GMD)','<input name="openingBalance" type="number" step="0.01" value="0">')+
      field('Opening balance date','<input name="openingDate" type="date" value="'+todayIso()+'" required>')+
      field('Reference / last digits','<input name="reference" placeholder="Optional internal reference">')+
      '</div><div class="modal-note">Use the actual opening balance as of the date you begin maintaining this account in DalasiPay. Future movements will update it automatically.</div><div class="modal-actions"><button type="button" class="secondary" data-action="close-cash-account">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' Add account</button></div></form></div>';
  }
  function transactionModal(state,h){
    const {field,icon}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-cash-transaction"></div><form id="cash-transaction-form" class="modal-box"><div class="modal-head"><div><div class="eyebrow">CASHBOOK ENTRY</div><h2>Record transaction</h2><p>Use for a cash movement not already recorded through Sales, Payments or Expenses.</p></div><button type="button" class="close" data-action="close-cash-transaction">×</button></div><div class="form-grid">'+
      field('Account',accountSelect(state,'accountId','','Select account'))+
      field('Direction','<select name="direction"><option value="in">Money in</option><option value="out">Money out</option></select>')+
      field('Date','<input name="date" type="date" value="'+todayIso()+'" required>')+
      field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" required>')+
      field('Counterparty / source','<input name="counterparty" placeholder="Who paid or received?">')+
      field('Cash-flow class','<select name="cashFlowClass"><option>Operating</option><option>Investing</option><option>Financing</option></select>')+
      field('Cash-flow detail','<input name="cashFlowDetail" placeholder="e.g. Owner capital, equipment, tax">')+
      field('Reference','<input name="reference" placeholder="Bank, receipt or internal reference">')+
      '</div>'+field('Description','<input name="description" placeholder="Reason for the movement">')+'<div class="modal-actions"><button type="button" class="secondary" data-action="close-cash-transaction">Cancel</button><button class="primary" type="submit">'+icon('save',14)+' Record transaction</button></div></form></div>';
  }
  function transferModal(state,h){
    const {field,icon}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-cash-transfer"></div><form id="cash-transfer-form" class="modal-box"><div class="modal-head"><div><div class="eyebrow">INTERNAL TRANSFER</div><h2>Transfer between accounts</h2><p>Move money between the business accounts without changing total cash.</p></div><button type="button" class="close" data-action="close-cash-transfer">×</button></div><div class="form-grid">'+
      field('From account',accountSelect(state,'fromAccountId','','Select source account'))+
      field('To account',accountSelect(state,'toAccountId','','Select destination account'))+
      field('Date','<input name="date" type="date" value="'+todayIso()+'" required>')+
      field('Amount (GMD)','<input name="amount" type="number" min="0.01" step="0.01" required>')+
      field('Reference','<input name="reference" placeholder="Transfer reference">')+
      '</div>'+field('Description','<input name="description" placeholder="Optional note">')+'<div class="modal-actions"><button type="button" class="secondary" data-action="close-cash-transfer">Cancel</button><button class="primary" type="submit">'+icon('arrow',14)+' Transfer</button></div></form></div>';
  }
  function createAccount(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to add accounts.');return;}
    const fd=new FormData(ev.target),name=String(fd.get('name')||'').trim();if(!name){ctx.toast('Enter an account name.');return;}
    state.cashAccounts=state.cashAccounts||[];const id='CBA-'+Date.now().toString(36).toUpperCase();
    state.cashAccounts.push({id,name,type:String(fd.get('type')||'Bank'),openingBalance:Math.round((Number(fd.get('openingBalance'))||0)*100)/100,openingDate:String(fd.get('openingDate')||todayIso()),reference:String(fd.get('reference')||'').trim(),status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.cashAccountOpen=false;ctx.audit('cash.account_created',{accountId:id,name,type:String(fd.get('type')||'Bank')});ctx.save();ctx.toast(name+' added to Cash & Bank');ctx.render();
  }
  function createTransaction(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to record cash transactions.');return;}
    const fd=new FormData(ev.target),date=String(fd.get('date')||todayIso());if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('That accounting period is closed. Reopen it before recording this cash transaction.');return;}const tx=post(state,{accountId:String(fd.get('accountId')||''),direction:String(fd.get('direction')||'in'),date,amount:Number(fd.get('amount')||0),type:'Manual cashbook',counterparty:String(fd.get('counterparty')||'').trim(),reference:String(fd.get('reference')||'').trim(),description:String(fd.get('description')||'').trim(),cashFlowClass:String(fd.get('cashFlowClass')||'Operating'),cashFlowDetail:String(fd.get('cashFlowDetail')||'').trim(),createdBy:state.session?.name||'User'});
    if(!tx){ctx.toast('Choose an account and enter a valid amount.');return;}state.cashTransactionOpen=false;ctx.audit('cash.transaction_recorded',{transactionId:tx.id,accountId:tx.accountId,amount:tx.amount});ctx.save();ctx.toast('Cash transaction recorded');ctx.render();
  }
  function createTransfer(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to transfer funds.');return;}
    const fd=new FormData(ev.target),from=String(fd.get('fromAccountId')||''),to=String(fd.get('toAccountId')||''),amount=Math.abs(Number(fd.get('amount'))||0),date=String(fd.get('date')||todayIso()),reference=String(fd.get('reference')||'').trim(),description=String(fd.get('description')||'').trim();
    if(!from||!to||from===to||amount<=0){ctx.toast('Choose two different accounts and enter a valid amount.');return;}
    if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('That accounting period is closed. Reopen it before recording this transfer.');return;}
    const transferId='TRF-'+Date.now().toString(36).toUpperCase();
    const a=post(state,{accountId:from,direction:'out',date,amount,type:'Internal transfer',counterparty:accountById(state,to)?.name||'',reference,description,sourceKey:'transfer:'+transferId+':out',sourceType:'transfer',sourceId:transferId,createdBy:state.session?.name||'User'});
    const b=post(state,{accountId:to,direction:'in',date,amount,type:'Internal transfer',counterparty:accountById(state,from)?.name||'',reference,description,sourceKey:'transfer:'+transferId+':in',sourceType:'transfer',sourceId:transferId,createdBy:state.session?.name||'User'});
    if(!a||!b){ctx.toast('Unable to record transfer.');return;}state.cashTransferOpen=false;ctx.audit('cash.transfer_recorded',{transferId,from,to,amount});ctx.save();ctx.toast('Transfer recorded');ctx.render();
  }
  function exportCsv(state,ctx){
    const rows=(state.cashTransactions||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const csv=[['Date','Account','Type','Counterparty','Reference','Description','Cash Flow Class','Cash Flow Detail','Money In','Money Out','Source','Reconciliation ID','Statement Date'],...rows.map(x=>{const a=accountById(state,x.accountId);return [x.date,a?.name||'',x.type,x.counterparty,x.reference,x.description,window.DalasiCashFlow?.classify?.(state,x)||x.cashFlowClass||'Operating',window.DalasiCashFlow?.detailClass?.(state,x)||x.cashFlowDetail||'',Number(x.amount)>=0?Math.abs(Number(x.amount)):0,Number(x.amount)<0?Math.abs(Number(x.amount)):0,x.sourceType||'Manual',x.reconciliationId||'',x.statementDate||'']})].map(r=>r.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(',')).join('\n');
    ctx.downloadText('dalasipay-cash-bank-'+todayIso()+'.csv',csv);ctx.toast('Cash & Bank register downloaded');
  }
  window.DalasiCashBank={TYPES,accounts,accountById,balance,totals,accountSelect,post,reverseSource,render,accountModal,transactionModal,transferModal,createAccount,createTransaction,createTransfer,exportCsv};
})();