(function(){
  'use strict';

  const TYPES=['Asset','Liability','Equity','Revenue','Expense'];
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function allAccounts(state,includeInactive=false){
    const system=(window.DalasiGeneralLedger?.CHART||[]).map(x=>({code:String(x[0]),name:x[1],type:x[2],system:true,status:'Active'}));
    const custom=(state.customAccounts||[]).map(x=>({...x,system:false}));
    return [...system,...custom].filter(x=>includeInactive||(x.status||'Active')==='Active').sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  }
  function accountByName(state,name){return allAccounts(state,true).find(x=>x.name===name)||null;}
  function accountOptions(state,selected=''){
    return '<option value="">Choose account</option>'+allAccounts(state).map(a=>'<option value="'+esc(a.name)+'" '+(a.name===selected?'selected':'')+'>'+esc(a.code+' · '+a.name)+'</option>').join('');
  }
  function lineRow(state,line={},i=0){
    return '<div class="journal-line" data-journal-line>'+
      '<select name="journalAccount" required>'+accountOptions(state,line.account||'')+'</select>'+
      '<input name="journalMemo" value="'+esc(line.memo||'')+'" placeholder="Line memo">'+
      '<input name="journalDebit" type="number" min="0" step="0.01" value="'+(line.debit||'')+'" placeholder="0.00">'+
      '<input name="journalCredit" type="number" min="0" step="0.01" value="'+(line.credit||'')+'" placeholder="0.00">'+
      '<button type="button" class="journal-remove" data-journal-remove title="Remove line">×</button>'+
    '</div>';
  }
  function journalTotals(lines){
    const debit=round((lines||[]).reduce((a,x)=>a+(Number(x.debit)||0),0)),credit=round((lines||[]).reduce((a,x)=>a+(Number(x.credit)||0),0));
    return {debit,credit,difference:round(debit-credit),balanced:debit>0&&Math.abs(debit-credit)<0.01};
  }
  function readLines(form){
    return [...form.querySelectorAll('[data-journal-line]')].map(row=>{
      const account=String(row.querySelector('[name="journalAccount"]')?.value||''),
        debit=Math.max(0,Number(row.querySelector('[name="journalDebit"]')?.value)||0),
        credit=Math.max(0,Number(row.querySelector('[name="journalCredit"]')?.value)||0),
        memo=String(row.querySelector('[name="journalMemo"]')?.value||'').trim();
      return {account,debit,credit,memo};
    }).filter(x=>x.account&&(x.debit>0||x.credit>0));
  }
  function bindJournalForm(form,state){
    if(!form||form.dataset.bound==='1')return;form.dataset.bound='1';
    const wrap=form.querySelector('.journal-lines');if(!wrap)return;
    const update=()=>{
      const t=journalTotals(readLines(form));
      const d=form.querySelector('[data-journal-debit-total]'),c=form.querySelector('[data-journal-credit-total]'),diff=form.querySelector('[data-journal-difference]');
      if(d)d.textContent=t.debit.toFixed(2);if(c)c.textContent=t.credit.toFixed(2);if(diff){diff.textContent=Math.abs(t.difference).toFixed(2);diff.closest('.journal-diff')?.classList.toggle('ok',t.balanced);}
      const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=!t.balanced;
    };
    form.addEventListener('click',ev=>{
      if(ev.target.closest('[data-journal-add]')){wrap.insertAdjacentHTML('beforeend',lineRow(state,{},wrap.children.length));update();return;}
      const rem=ev.target.closest('[data-journal-remove]');if(rem){if(wrap.children.length<=2)return;rem.closest('[data-journal-line]')?.remove();update();}
    });
    form.addEventListener('input',update);form.addEventListener('change',update);update();
  }
  function nextNo(state){
    const y=new Date().getFullYear(),prefix='JRN-'+y+'-';let max=0;
    (state.manualJournals||[]).forEach(x=>{const n=String(x.journalNo||'');if(n.startsWith(prefix)){const v=Number(n.slice(prefix.length));if(v>max)max=v;}});
    return prefix+String(max+1).padStart(5,'0');
  }
  function createJournal(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to create journals.');return;}
    const form=ev.target,fd=new FormData(form),date=String(fd.get('journalDate')||''),reference=String(fd.get('reference')||'').trim(),memo=String(fd.get('memo')||'').trim(),lines=readLines(form),t=journalTotals(lines);
    if(!date||lines.length<2||!t.balanced){ctx.toast('Journal must have a date, at least two lines, and equal debits and credits.');return;}
    if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('That accounting period is closed. Reopen it before creating this journal.');return;}
    for(const x of lines){
      if(x.debit>0&&x.credit>0){ctx.toast('Each journal line must contain either a debit or a credit, not both.');return;}
      const a=accountByName(state,x.account);if(!a||(a.status||'Active')!=='Active'){ctx.toast('Choose active accounts for every journal line.');return;}
      x.accountCode=a.code;x.accountType=a.type;
    }
    const id='JRN-'+Date.now().toString(36).toUpperCase(),journalNo=nextNo(state),now=new Date().toISOString();
    state.manualJournals=state.manualJournals||[];state.manualJournals.unshift({id,journalNo,date,reference,memo,lines,debit:t.debit,credit:t.credit,status:'Draft',createdAt:now,createdBy:state.session?.name||'User',updatedAt:now});
    state.journalOpen=false;ctx.audit('accounting.journal_created',{journalId:id,journalNo,date,debit:t.debit,credit:t.credit});ctx.save();ctx.toast(journalNo+' saved as draft');ctx.render();
  }
  function postJournal(id,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to post journals.');return;}
    const j=(state.manualJournals||[]).find(x=>x.id===id);if(!j||j.status!=='Draft')return;
    if(window.DalasiMonthClose?.isClosed(state,j.date)){ctx.toast('That accounting period is closed. Reopen it before posting this journal.');return;}
    const t=journalTotals(j.lines);if(!t.balanced){ctx.toast('Journal is not balanced and cannot be posted.');return;}
    j.status='Posted';j.postedAt=new Date().toISOString();j.postedBy=state.session?.name||'User';j.updatedAt=j.postedAt;
    ctx.audit('accounting.journal_posted',{journalId:id,journalNo:j.journalNo,date:j.date,debit:t.debit,credit:t.credit});ctx.save();ctx.toast(j.journalNo+' posted');ctx.render();
  }
  function reverseJournal(id,state,ctx){
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to reverse journals.');return;}
    const j=(state.manualJournals||[]).find(x=>x.id===id);if(!j||j.status!=='Posted'||j.reversalJournalId)return;
    const date=todayIso();if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('The current accounting period is closed. Reopen it before posting a reversal.');return;}
    const now=new Date().toISOString(),rid='JRN-'+Date.now().toString(36).toUpperCase(),journalNo=nextNo(state),lines=(j.lines||[]).map(x=>({...x,debit:Number(x.credit)||0,credit:Number(x.debit)||0,memo:'Reversal: '+(x.memo||j.memo||j.journalNo)}));
    const rev={id:rid,journalNo,date,reference:'REV-'+j.journalNo,memo:'Reversal of '+j.journalNo+(j.memo?' · '+j.memo:''),lines,debit:j.credit,credit:j.debit,status:'Posted',reversalOf:j.id,createdAt:now,createdBy:state.session?.name||'User',postedAt:now,postedBy:state.session?.name||'User',updatedAt:now};
    state.manualJournals.unshift(rev);j.reversalJournalId=rid;j.reversalJournalNo=journalNo;j.reversedAt=now;j.reversedBy=state.session?.name||'User';
    ctx.audit('accounting.journal_reversed',{journalId:j.id,journalNo:j.journalNo,reversalJournalId:rid,reversalJournalNo:journalNo});ctx.save();ctx.toast(j.journalNo+' reversed by '+journalNo);ctx.render();
  }
  function createAccount(ev,state,ctx){
    ev.preventDefault();if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can add ledger accounts.');return;}
    const fd=new FormData(ev.target),code=String(fd.get('code')||'').trim(),name=String(fd.get('name')||'').trim(),type=String(fd.get('type')||'Asset');
    if(!/^\d{3,6}$/.test(code)||!name||!TYPES.includes(type)){ctx.toast('Enter a numeric account code, account name and valid account type.');return;}
    const all=allAccounts(state,true);if(all.some(x=>x.code===code)){ctx.toast('That account code already exists.');return;}if(all.some(x=>x.name.toLowerCase()===name.toLowerCase())){ctx.toast('That account name already exists.');return;}
    const id='ACC-'+Date.now().toString(36).toUpperCase();state.customAccounts=state.customAccounts||[];state.customAccounts.push({id,code,name,type,status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'});
    state.accountOpen=false;ctx.audit('accounting.account_created',{accountId:id,code,name,type});ctx.save();ctx.toast(code+' · '+name+' added');ctx.render();
  }
  function toggleAccount(id,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can change ledger accounts.');return;}
    const a=(state.customAccounts||[]).find(x=>x.id===id);if(!a)return;
    a.status=(a.status||'Active')==='Active'?'Inactive':'Active';a.updatedAt=new Date().toISOString();a.updatedBy=state.session?.name||'User';
    ctx.audit('accounting.account_status_updated',{accountId:id,status:a.status});ctx.save();ctx.toast(a.name+': '+a.status);ctx.render();
  }
  function journalModal(state,h){
    const {field,icon}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-journal"></div><form id="manual-journal-form" class="modal-box journal-modal">'+
      '<div class="modal-head"><div><div class="eyebrow">ACCOUNTING JOURNAL</div><h2>New journal entry</h2><p>Debits must equal credits before the journal can be saved.</p></div><button type="button" class="close" data-action="close-journal">×</button></div>'+
      '<div class="form-grid">'+field('Journal date','<input name="journalDate" type="date" value="'+todayIso()+'" required>')+field('Reference','<input name="reference" placeholder="Adjustment, accrual or source reference">')+'</div>'+
      field('Journal memo','<input name="memo" placeholder="Purpose of this journal">')+
      '<div class="journal-head"><span>ACCOUNT</span><span>LINE MEMO</span><span>DEBIT</span><span>CREDIT</span><span></span></div>'+
      '<div class="journal-lines">'+lineRow(state,{},0)+lineRow(state,{},1)+'</div>'+
      '<button type="button" class="secondary journal-add" data-journal-add>'+icon('plus',13)+' Add line</button>'+
      '<div class="journal-totals"><span>Debits <b>D <em data-journal-debit-total>0.00</em></b></span><span>Credits <b>D <em data-journal-credit-total>0.00</em></b></span><span class="journal-diff">Difference <b>D <em data-journal-difference>0.00</em></b></span></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-journal">Cancel</button><button class="primary" type="submit" disabled>'+icon('save',14)+' Save draft journal</button></div>'+
    '</form></div>';
  }
  function accountModal(state,h){
    const {field,icon}=h;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-account"></div><form id="ledger-account-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">CHART OF ACCOUNTS</div><h2>Add account</h2><p>Create a custom account for journal adjustments and reporting.</p></div><button type="button" class="close" data-action="close-account">×</button></div>'+
      '<div class="form-grid">'+field('Account code','<input name="code" inputmode="numeric" placeholder="e.g. 6200" required>')+field('Account type','<select name="type">'+TYPES.map(x=>'<option>'+x+'</option>').join('')+'</select>')+'</div>'+
      field('Account name','<input name="name" placeholder="e.g. Depreciation Expense" required>')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-account">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Add account</button></div>'+
    '</form></div>';
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,tab=state.accountingTab||'journals',journals=(state.manualJournals||[]),accounts=allAccounts(state,true);
    const tabs='<div class="accounting-tabs"><button class="'+(tab==='journals'?'active':'')+'" data-action="accounting-tab:journals">Journal entries</button><button class="'+(tab==='accounts'?'active':'')+'" data-action="accounting-tab:accounts">Chart of accounts</button></div>';
    if(tab==='accounts'){
      const rows=accounts.map(a=>'<tr><td><b>'+esc(a.code)+'</b></td><td><div class="payment-payee"><b>'+esc(a.name)+'</b><small>'+(a.system?'System account':'Custom account')+'</small></div></td><td>'+esc(a.type)+'</td><td>'+pill(a.status||'Active',(a.status||'Active')==='Active'?'ready':'neutral')+'</td><td>'+(a.system?'<span class="bill-no-file">Protected</span>':'<button class="secondary" data-action="account-toggle:'+esc(a.id)+'">'+((a.status||'Active')==='Active'?'Deactivate':'Activate')+'</button>')+'</td></tr>').join('');
      return pageTitle('ACCOUNTING','Accounting','Manage manual journals and the chart of accounts.','<button class="primary" data-action="open-account">'+icon('plus',14)+' Add account</button>')+tabs+
        '<div class="surface employee-card"><div class="table-tools"><div><h3>Chart of accounts</h3><p>System accounts are protected. Custom accounts can be used in manual journals.</p></div></div><div class="table-scroll"><table><thead><tr><th>CODE</th><th>ACCOUNT</th><th>TYPE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    }
    const totalPosted=journals.filter(x=>x.status==='Posted').length,totalDraft=journals.filter(x=>x.status==='Draft').length,reversed=journals.filter(x=>x.reversalJournalId).length;
    const rows=journals.length?journals.map(j=>{
      const stateLabel=j.reversalOf?'Reversal':j.reversalJournalId?'Reversed':j.status,cls=j.status==='Posted'?'ready':'neutral';
      const action=j.status==='Draft'?'<button class="primary" data-action="journal-post:'+j.id+'">Post</button>':(!j.reversalOf&&!j.reversalJournalId?'<button class="secondary" data-action="journal-reverse:'+j.id+'">Reverse</button>':'');
      return '<tr><td><div class="payment-payee"><b>'+esc(j.journalNo||j.id)+'</b><small>'+esc(j.reference||'Manual journal')+'</small></div></td><td>'+esc(j.date||'')+'</td><td>'+esc(j.memo||'—')+'</td><td>'+money2(j.debit||0)+'</td><td>'+money2(j.credit||0)+'</td><td>'+pill(stateLabel,cls)+'</td><td>'+action+'</td></tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No manual journal entries yet.</div></td></tr>';
    return pageTitle('ACCOUNTING','Accounting','Post balanced accounting adjustments without altering source documents.','<button class="primary" data-action="open-journal">'+icon('plus',14)+' New journal</button>')+tabs+
      '<div class="accounting-summary"><div class="surface"><span>Posted journals</span><b>'+totalPosted+'</b><small>included in the General Ledger</small></div><div class="surface"><span>Draft journals</span><b>'+totalDraft+'</b><small>not yet in the books</small></div><div class="surface"><span>Reversed</span><b>'+reversed+'</b><small>original entries preserved</small></div><div class="surface"><span>Custom accounts</span><b>'+accounts.filter(x=>!x.system).length+'</b><small>plus '+accounts.filter(x=>x.system).length+' protected system accounts</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Posted journals are immutable</b><p>Once posted, a journal cannot be edited or deleted. Use a reversal entry for corrections. Closed accounting periods remain protected.</p></div></div>'+
      '<div class="surface employee-card"><div class="table-tools"><div><h3>Manual journal register</h3><p>Adjustments, accruals, depreciation, suspense clearing and accounting corrections</p></div></div><div class="table-scroll"><table><thead><tr><th>JOURNAL</th><th>DATE</th><th>MEMO</th><th>DEBIT</th><th>CREDIT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  }

  window.DalasiAccounting={TYPES,allAccounts,accountByName,journalTotals,readLines,bindJournalForm,createJournal,postJournal,reverseJournal,createAccount,toggleAccount,journalModal,accountModal,render};
})();