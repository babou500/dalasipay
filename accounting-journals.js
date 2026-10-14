(function(){
  'use strict';

  const TYPES=['Asset','Liability','Equity','Revenue','Expense'];
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function cashLedgerCode(state,a,index=0){
    const saved=String(a.ledgerCode||'').trim();if(/^1000-\d{2,4}$/.test(saved))return saved;
    const used=new Set((state.cashAccounts||[]).map(x=>String(x.ledgerCode||'')).filter(Boolean)),base=101;
    let n=base+index;while(used.has('1000-'+n))n++;return '1000-'+n;
  }
  function cashLedgerAccounts(state){
    return (state.cashAccounts||[]).map((a,i)=>({id:'CASHLEDGER-'+a.id,code:cashLedgerCode(state,a,i),name:a.name,type:'Asset',system:true,operational:true,cashAccountId:a.id,status:a.status||'Active',parentCode:'1000',parentName:'Cash & Bank'}));
  }
  function allAccounts(state,includeInactive=false){
    const system=(window.DalasiGeneralLedger?.CHART||[]).map(x=>({id:'SYS-'+String(x[0]),code:String(x[0]),name:x[1],type:x[2],system:true,status:'Active',parentCode:null,parentName:null}));
    const cash=cashLedgerAccounts(state);
    const custom=(state.customAccounts||[]).map(x=>({...x,system:false,parentCode:x.parentCode||null,parentName:x.parentName||null}));
    const seen=new Set(),rows=[...system,...cash,...custom].filter(a=>{const k=String(a.name||'').trim().toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});
    return rows.filter(x=>includeInactive||(x.status||'Active')==='Active').sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  }
  function parentAccount(state,code){return allAccounts(state,true).find(x=>String(x.code)===String(code||''))||null;}
  function accountDepth(state,a){
    let depth=0,p=a,seen=new Set();
    while(p?.parentCode&&!seen.has(p.parentCode)&&depth<5){seen.add(p.parentCode);p=parentAccount(state,p.parentCode);if(p)depth++;}
    return depth;
  }
  function orderedAccounts(state,includeInactive=false){
    const rows=allAccounts(state,includeInactive),byParent=new Map();
    rows.forEach(a=>{const key=a.parentCode||'';if(!byParent.has(key))byParent.set(key,[]);byParent.get(key).push(a);});
    [...byParent.values()].forEach(list=>list.sort((a,b)=>String(a.code).localeCompare(String(b.code))));
    const out=[],seen=new Set(),walk=(key,depth=0)=>{(byParent.get(key)||[]).forEach(a=>{if(seen.has(a.code))return;seen.add(a.code);out.push({...a,depth});walk(a.code,depth+1);});};
    walk('');rows.forEach(a=>{if(!seen.has(a.code))out.push({...a,depth:accountDepth(state,a)});});
    return out;
  }
  function accountByName(state,name){return allAccounts(state,true).find(x=>x.name===name)||null;}
  function accountOptions(state,selected=''){
    return '<option value="">Choose account</option>'+orderedAccounts(state).map(a=>'<option value="'+esc(a.name)+'" '+(a.name===selected?'selected':'')+'>'+esc((a.depth?'↳ '.repeat(Math.min(a.depth,2)):'')+a.code+' · '+a.name)+'</option>').join('');
  }
  function purchasePostingAccounts(state){
    const excluded=new Set(['Cash & Bank','Undeposited Funds','Accounts Receivable','VAT Input Recoverable','Supplier Refund Receivable','Accumulated Depreciation','Accounts Payable','Accrued Expenses','Accrued Interest Payable','Customer Refunds Payable','Payroll Payable','VAT Output Payable','Payroll / Statutory Payable','Loans & Borrowings','Other Liabilities','Inventory Receipt Clearing','Owner / Share Capital','Opening Retained Earnings','Opening Balance Equity','Opening / Mapping Suspense']);
    return orderedAccounts(state).filter(a=>['Asset','Expense'].includes(a.type)&&!excluded.has(a.name));
  }
  function purchasePostingOptions(state,selected='Operating Expenses'){
    const rows=purchasePostingAccounts(state);
    return '<option value="">Choose expense / asset account</option>'+rows.map(a=>'<option value="'+esc(a.name)+'" '+(a.name===selected?'selected':'')+'>'+esc((a.depth?'↳ '.repeat(Math.min(a.depth,2)):'')+a.code+' · '+a.name)+'</option>').join('');
  }
  function nextAccountCode(state,parentCode='',type='Expense'){
    const parent=parentCode?parentAccount(state,parentCode):null;
    const prefixes={Asset:1000,Liability:2000,Equity:3000,Revenue:4000,Expense:6000};
    const source=parent?Number(String(parent.code).split('-')[0]):(prefixes[type]||6000);
    const used=new Set(allAccounts(state,true).map(x=>String(x.code)));
    let candidate=source+(parent?1:10);
    while(candidate<=999999&&used.has(String(candidate)))candidate++;
    return candidate<=999999?String(candidate):'';
  }
  function createAccountRecord(state,details,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can add ledger accounts.');return null;}
    const parentCode=String(details.parentCode||'').trim(),parent=parentCode?parentAccount(state,parentCode):null;
    if(parentCode&&(!parent||(parent.status||'Active')!=='Active')){ctx.toast('Choose an active parent account.');return null;}
    const type=parent?.type||String(details.type||'Asset'),code=String(details.code||'').trim()||nextAccountCode(state,parentCode,type),name=String(details.name||'').trim();
    if(!/^\d{3,6}$/.test(code)||!name||!TYPES.includes(type)){ctx.toast('Enter a numeric account code (3 to 6 digits), name and valid type.');return null;}
    const accounts=allAccounts(state,true);
    if(accounts.some(x=>x.code===code)){ctx.toast('Account code '+code+' already exists. Choose another code.');return null;}
    if(accounts.some(x=>x.name.toLowerCase()===name.toLowerCase())){ctx.toast('The account name already exists.');return null;}
    const id='ACC-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6);
    const account={id,code,name,type,parentCode:parent?.code||null,parentName:parent?.name||null,status:'Active',createdAt:new Date().toISOString(),createdBy:state.session?.name||'User'};
    state.customAccounts=state.customAccounts||[];state.customAccounts.push(account);
    ctx.audit('accounting.account_created',{accountId:id,code,name,type,parentCode:account.parentCode,parentName:account.parentName});
    ctx.save();ctx.toast(code+' · '+name+(parent?' added under '+parent.name:' added'));
    return account;
  }
  function bindAccountForm(form,state){
    if(!form||form.dataset.autoCodeBound==='1')return;
    form.dataset.autoCodeBound='1';
    const parentSelect=form.querySelector('[name="parentCode"]'),typeSelect=form.querySelector('[name="type"]'),codeInput=form.querySelector('[name="code"]');
    if(!parentSelect||!typeSelect||!codeInput)return;
    let lastSuggested=codeInput.value;
    const update=()=>{
      const parent=parentAccount(state,parentSelect.value);
      typeSelect.disabled=!!parent;if(parent)typeSelect.value=parent.type;
      const suggestion=nextAccountCode(state,parentSelect.value,parent?.type||typeSelect.value);
      if(!codeInput.value.trim()||codeInput.value===lastSuggested)codeInput.value=suggestion;
      lastSuggested=suggestion;
    };
    parentSelect.addEventListener('change',update);
    typeSelect.addEventListener('change',update);
    update();
  }

  function lineRow(state,line={},i=0){
    return '<div class="journal-line" data-journal-line>'+
      '<select name="journalAccount" required>'+accountOptions(state,line.account||'')+'<option value="__add_account__">+ Add new account…</option></select>'+
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
  function bindJournalForm(form,state,ctx){
    if(!form||form.dataset.bound==='1')return;form.dataset.bound='1';
    const wrap=form.querySelector('.journal-lines');if(!wrap)return;
    const panel=form.querySelector('[data-journal-quick-account]'),parentSelect=panel?.querySelector('[data-quick-parent]'),typeSelect=panel?.querySelector('[data-quick-type]'),codeInput=panel?.querySelector('[data-quick-code]');
    let targetSelect=null,lastSuggested='';
    const update=()=>{
      const t=journalTotals(readLines(form));
      const d=form.querySelector('[data-journal-debit-total]'),c=form.querySelector('[data-journal-credit-total]'),diff=form.querySelector('[data-journal-difference]');
      if(d)d.textContent=t.debit.toFixed(2);if(c)c.textContent=t.credit.toFixed(2);if(diff){diff.textContent=Math.abs(t.difference).toFixed(2);diff.closest('.journal-diff')?.classList.toggle('ok',t.balanced);}
      const btn=form.querySelector('button[type="submit"]');if(btn)btn.disabled=!t.balanced;
    };
    const hidePanel=()=>{
      if(panel)panel.hidden=true;
      if(targetSelect?.value==='__add_account__')targetSelect.value='';
      targetSelect=null;update();
    };
    const updateQuickCode=()=>{
      if(!panel)return;
      const p=parentAccount(state,parentSelect.value);typeSelect.disabled=!!p;
      if(p)typeSelect.value=p.type;
      const suggestion=nextAccountCode(state,parentSelect.value,p?.type||typeSelect.value);
      if(!codeInput.value.trim()||codeInput.value===lastSuggested)codeInput.value=suggestion;
      lastSuggested=suggestion;
    };
    parentSelect?.addEventListener('change',updateQuickCode);
    typeSelect?.addEventListener('change',updateQuickCode);
    form.addEventListener('click',ev=>{
      if(ev.target.closest('[data-journal-add]')){wrap.insertAdjacentHTML('beforeend',lineRow(state,{},wrap.children.length));update();return;}
      const rem=ev.target.closest('[data-journal-remove]');if(rem){if(wrap.children.length<=2)return;const row=rem.closest('[data-journal-line]');if(row?.contains(targetSelect))hidePanel();row?.remove();update();return;}
      if(ev.target.closest('[data-quick-account-cancel]')){hidePanel();return;}
      if(!ev.target.closest('[data-quick-account-save]'))return;
      if(!panel||!ctx)return;
      const name=panel.querySelector('[data-quick-name]')?.value||'';
      const a=createAccountRecord(state,{code:codeInput.value,name,parentCode:parentSelect.value,type:typeSelect.value},ctx);
      if(!a)return;
      [...form.querySelectorAll('[name="journalAccount"]')].forEach(select=>{
        const old=select===targetSelect?a.name:select.value;
        select.innerHTML=accountOptions(state,old)+'<option value="__add_account__">+ Add new account…</option>';
        select.value=old;
      });
      hidePanel();
    });
    form.addEventListener('change',ev=>{
      if(ev.target.matches('[name="journalAccount"]')&&ev.target.value==='__add_account__'){
        targetSelect=ev.target;
        if(panel){panel.hidden=false;lastSuggested='';codeInput.value='';updateQuickCode();panel.querySelector('[data-quick-name]')?.focus();}
      }
      update();
    });
    form.addEventListener('input',update);update();
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
    const protectedControls=new Set(['Cash & Bank','Undeposited Funds','Accounts Receivable','Accounts Payable','Inventory','Property & Equipment, Cost','Accumulated Depreciation','VAT Input Recoverable','VAT Output Payable','Supplier Refund Receivable','Customer Refunds Payable','Loans & Borrowings','Accrued Interest Payable']);
    for(const x of lines){
      if(x.debit>0&&x.credit>0){ctx.toast('Each journal line must contain either a debit or a credit, not both.');return;}
      const a=accountByName(state,x.account);if(!a||(a.status||'Active')!=='Active'){ctx.toast('Choose active accounts for every journal line.');return;}
      if(protectedControls.has(a.name)){ctx.toast(a.name+' is a protected control account. Use its operational module instead of a manual journal.');return;}
      x.accountCode=a.code;x.accountType=a.type;
    }
    const id='JRN-'+Date.now().toString(36).toUpperCase(),journalNo=nextNo(state),now=new Date().toISOString();
    state.manualJournals=state.manualJournals||[];state.manualJournals.unshift({id,journalNo,date,reference,memo,lines,debit:t.debit,credit:t.credit,status:'Draft',createdAt:now,createdBy:state.session?.name||'User',updatedAt:now});
    state.journalOpen=false;state.journalDetailId=id;state.accountingTab='journals';state.page='accounting';ctx.audit('accounting.journal_created',{journalId:id,journalNo,date,debit:t.debit,credit:t.credit});ctx.save();ctx.toast(journalNo+' saved as draft · post it to affect the ledger');ctx.render();
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
    if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to reverse journals.');return false;}
    const j=(state.manualJournals||[]).find(x=>x.id===id);if(!j||j.status!=='Posted'||j.reversalJournalId)return false;
    const date=todayIso();if(window.DalasiMonthClose?.isClosed(state,date)){ctx.toast('The current accounting period is closed. Reopen it before posting a reversal.');return false;}
    if(!ctx.approvedRequest){
      const reason=String(window.prompt('Reason for reversing '+(j.journalNo||j.id)+'? The original journal will remain unchanged.')||'').trim();if(!reason)return false;if(reason.length<5){window.alert('Please enter a clear reversal reason of at least 5 characters.');return false;}
      return !!window.DalasiReversalApprovals?.request?.(state,{sourceType:'manual-journal',sourceId:j.id,sourceRef:j.journalNo||j.id,transactionType:'Manual journal',amount:j.debit||0,reason},ctx);
    }
    const reason=String(ctx.approvedRequest.reason||''),now=new Date().toISOString(),actor=ctx.approvedRequest.approvedBy||state.session?.name||'User',rid='JRN-'+Date.now().toString(36).toUpperCase(),journalNo=nextNo(state),lines=(j.lines||[]).map(x=>({...x,debit:Number(x.credit)||0,credit:Number(x.debit)||0,memo:'Reversal: '+(x.memo||j.memo||j.journalNo)}));
    const rev={id:rid,journalNo,date,reference:'REV-'+j.journalNo,memo:'Reversal of '+j.journalNo+' · '+reason,lines,debit:j.credit,credit:j.debit,status:'Posted',reversalOf:j.id,reversalReason:reason,reversalRequestId:ctx.approvedRequest.id,createdAt:now,createdBy:actor,postedAt:now,postedBy:actor,updatedAt:now};
    state.manualJournals.unshift(rev);j.reversalJournalId=rid;j.reversalJournalNo=journalNo;j.reversedAt=now;j.reversedBy=actor;j.reversalReason=reason;j.reversalRequestId=ctx.approvedRequest.id;
    ctx.audit('accounting.journal_reversed',{journalId:j.id,requestId:j.reversalRequestId,journalNo:j.journalNo,reversalJournalId:rid,reversalJournalNo:journalNo,reason});ctx.save();return true;
  }
  function createAccount(ev,state,ctx){
    ev.preventDefault();
    const fd=new FormData(ev.target);
    const created=createAccountRecord(state,{code:fd.get('code'),name:fd.get('name'),type:fd.get('type'),parentCode:fd.get('parentCode')},ctx);
    if(!created)return;
    state.accountOpen=false;state.accountParentCode='';ctx.render();
  }
  function toggleAccount(id,state,ctx){
    if(!ctx.can('workspace.manage')){ctx.toast('Only the workspace owner can change ledger accounts.');return;}
    const a=(state.customAccounts||[]).find(x=>x.id===id);if(!a)return;
    a.status=(a.status||'Active')==='Active'?'Inactive':'Active';a.updatedAt=new Date().toISOString();a.updatedBy=state.session?.name||'User';
    ctx.audit('accounting.account_status_updated',{accountId:id,status:a.status});ctx.save();ctx.toast(a.name+': '+a.status);ctx.render();
  }
  function journalDetailModal(state,h){
    const j=(state.manualJournals||[]).find(x=>x.id===state.journalDetailId);if(!j)return '';
    const {icon,money2,pill}=h,rows=j.lines||[],lines=rows.map(x=>'<tr><td><div class="record-account"><b>'+esc(x.accountCode||'')+'</b><span>'+esc(x.account||'Unmapped account')+'</span></div></td><td>'+esc(x.memo||'—')+'</td><td class="record-number">'+money2(x.debit||0)+'</td><td class="record-number">'+money2(x.credit||0)+'</td></tr>').join('');
    const status=j.status||'Draft',posted=status==='Posted',reversed=status==='Reversed'||!!j.reversalJournalId,createdAt=j.createdAt?String(j.createdAt).slice(0,16).replace('T',' '):'—';
    return '<div class="record-drawer-wrap"><div class="modal-scrim" style="backdrop-filter:none;background:rgba(6,16,13,.15)" data-action="close-journal-detail"></div><aside class="record-drawer accounting-record-drawer">'+
      '<div class="record-drawer-head"><div><div class="eyebrow">MANUAL JOURNAL</div><h2>'+esc(j.journalNo||j.id)+'</h2><p>'+esc(j.reference||'No reference')+'</p></div><button type="button" class="close" data-action="close-journal-detail">×</button></div>'+
      '<div class="record-hero"><div><span>Total journal value</span><b>'+money2(j.debit||0)+'</b><small>'+rows.length+' line'+(rows.length===1?'':'s')+' · balanced entry</small></div>'+(pill?pill(status,posted?'ready':reversed?'reversed':'warning'):'<span class="pill '+(posted?'ready':'warning')+'">'+esc(status)+'</span>')+'</div>'+
      '<div class="record-facts"><div><span>Journal date</span><b>'+esc(j.date||'—')+'</b></div><div><span>Reference</span><b>'+esc(j.reference||'—')+'</b></div><div><span>Created by</span><b>'+esc(j.createdBy||'—')+'</b></div><div><span>Created</span><b>'+esc(createdAt)+'</b></div><div><span>Total debit</span><b>'+money2(j.debit||0)+'</b></div><div><span>Total credit</span><b>'+money2(j.credit||0)+'</b></div></div>'+
      '<section class="record-section"><div class="record-section-head"><div><b>Journal lines</b><p>Accounts and debit/credit postings</p></div><span>'+rows.length+' line'+(rows.length===1?'':'s')+'</span></div><div class="table-scroll"><table class="record-table"><thead><tr><th>ACCOUNT</th><th>MEMO</th><th>DEBIT</th><th>CREDIT</th></tr></thead><tbody>'+lines+'<tr class="record-total-row"><td colspan="2"><b>TOTAL</b></td><td class="record-number"><b>'+money2(j.debit||0)+'</b></td><td class="record-number"><b>'+money2(j.credit||0)+'</b></td></tr></tbody></table></div></section>'+
      '<section class="record-section record-control-note"><span>'+icon(posted?'check':'alert',17)+'</span><div><b>'+(posted?'Posted accounting record':'Draft accounting record')+'</b><p>'+(posted?'This journal is locked and included in the General Ledger and financial statements. Corrections must use a controlled reversal.':'This draft does not affect the General Ledger or financial statements until it is posted.')+'</p></div></section>'+
      '<div class="record-drawer-actions"><button type="button" class="secondary" data-action="close-journal-detail">Close</button>'+(status==='Draft'?'<button type="button" class="primary" data-action="journal-post:'+esc(j.id)+'">'+icon('check',14)+' Post journal</button>':'')+'</div>'+
    '</aside></div>';
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
      '<section data-journal-quick-account hidden class="payment-modal-note" style="margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)">'+
      '<strong>Create an account for this journal</strong><p style="margin:4px 0 10px">The new account will be selected in the journal. Your entered amounts will be retained.</p>'+
      '<div class="form-grid"><label>Parent (optional)<select data-quick-parent><option value="">Top-level account</option>'+orderedAccounts(state).map(a=>'<option value="'+esc(a.code)+'">'+esc(a.code+' · '+a.name)+'</option>').join('')+'</select></label>'+
      '<label>Account type<select data-quick-type>'+TYPES.map(t=>'<option '+(t==='Expense'?'selected':'')+'>'+t+'</option>').join('')+'</select></label>'+
      '<label>Account code<input data-quick-code inputmode="numeric" placeholder="Suggested code"></label>'+
      '<label>Account name<input data-quick-name placeholder="e.g. Transport expense"></label></div>'+
      '<div class="inline-buttons" style="margin-top:10px"><button type="button" class="primary" data-quick-account-save>Save account</button><button type="button" class="secondary" data-quick-account-cancel>Cancel</button></div></section>'+
      '<div class="journal-totals"><span>Debits <b>D <em data-journal-debit-total>0.00</em></b></span><span>Credits <b>D <em data-journal-credit-total>0.00</em></b></span><span class="journal-diff">Difference <b>D <em data-journal-difference>0.00</em></b></span></div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-journal">Cancel</button><button class="primary" type="submit" disabled>'+icon('save',14)+' Save draft journal</button></div>'+
    '</form></div>';
  }
  function accountModal(state,h){
    const {field,icon}=h,parents=orderedAccounts(state).filter(a=>(a.status||'Active')==='Active'),selectedParent=String(state.accountParentCode||'');
    const parentOptions='<option value="">No parent · top-level account</option>'+parents.map(a=>'<option value="'+esc(a.code)+'" '+(String(a.code)===selectedParent?'selected':'')+'>'+esc((a.depth?'↳ '.repeat(Math.min(a.depth,2)):'')+a.code+' · '+a.name+' · '+a.type)+'</option>').join('');
    const selectedParentAccount=selectedParent?parentAccount(state,selectedParent):null;
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-account"></div><form id="ledger-account-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">CHART OF ACCOUNTS</div><h2>Add account or sub-account</h2><p>Create a top-level ledger account or place a sub-account beneath an existing account.</p></div><button type="button" class="close" data-action="close-account">×</button></div>'+
      field('Parent account','<select id="ledger-parent-account" name="parentCode">'+parentOptions+'</select>')+
      '<div class="account-parent-note">If a parent is selected, the new sub-account automatically inherits the parent account type.</div>'+
      '<div class="form-grid">'+field('Account code','<input name="code" inputmode="numeric" value="'+esc(nextAccountCode(state,selectedParent,selectedParentAccount?.type||'Expense'))+'" placeholder="e.g. 6010" required>')+field('Account type','<select id="ledger-account-type" name="type" '+(selectedParentAccount?'disabled':'')+'>'+TYPES.map(x=>'<option '+(selectedParentAccount?.type===x?'selected':'')+'>'+x+'</option>').join('')+'</select>')+'</div>'+
      field('Account name','<input name="name" placeholder="e.g. Office Rent" required>')+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-account">Cancel</button><button class="primary" type="submit">'+icon('plus',14)+' Add account</button></div>'+
    '</form></div>';
  }
  function render(state,h){
    const {pageTitle,icon,money2,pill}=h,tab=state.accountingTab||'journals',journals=(state.manualJournals||[]),accounts=allAccounts(state,true);
    const tabs='<div class="accounting-tabs"><button class="'+(tab==='journals'?'active':'')+'" data-action="accounting-tab:journals">Journal entries</button><button class="'+(tab==='accounts'?'active':'')+'" data-action="accounting-tab:accounts">Chart of accounts</button><button class="'+(tab==='controls'?'active':'')+'" data-action="accounting-tab:controls">Control reconciliation</button></div>';
    if(tab==='controls'){
      const body=window.DalasiControlReconciliation?.render
        ? window.DalasiControlReconciliation.render(state,h)
        : '<div class="surface employee-card"><div class="empty-inline">Control reconciliation is loading. Refresh once if this message remains visible.</div></div>';
      return pageTitle('ACCOUNTING','Accounting','Reconcile operational subledgers to their General Ledger control accounts.')+tabs+body;
    }
    if(tab==='accounts'){
      const rows=orderedAccounts(state,true).map(a=>'<tr class="'+(a.depth?'account-sub-row':'account-parent-row')+'"><td><b>'+esc(a.code)+'</b></td><td><div class="payment-payee account-tree-name" style="--account-depth:'+Math.min(a.depth||0,4)+'"><b>'+(a.depth?'<span class="account-tree-branch">↳</span>':'')+esc(a.name)+'</b><small>'+(a.parentName?'Sub-account of '+esc(a.parentName):(a.system?'System account · parent eligible':'Custom top-level account'))+'</small></div></td><td>'+esc(a.type)+'</td><td>'+pill(a.status||'Active',(a.status||'Active')==='Active'?'ready':'neutral')+'</td><td><div class="inline-buttons"><button class="secondary tiny" data-action="open-subaccount:'+esc(a.code)+'">+ Sub-account</button>'+(a.system?'<span class="bill-no-file">Protected</span>':'<button class="secondary tiny" data-action="account-toggle:'+esc(a.id)+'">'+((a.status||'Active')==='Active'?'Deactivate':'Activate')+'</button>')+'</div></td></tr>').join('');
      return pageTitle('ACCOUNTING','Accounting','Manage manual journals and the chart of accounts.','<button class="secondary" data-action="open-opening-migration">'+icon('reports',14)+' Opening balances</button><button class="primary" data-action="open-account">'+icon('plus',14)+' Add account / sub-account</button>')+tabs+
        '<div class="surface employee-card"><div class="table-tools"><div><h3>Chart of accounts</h3><p>Accounts can be organised into parent accounts and sub-accounts. System accounts are protected; custom accounts can be posted to in manual journals.</p></div><div class="register-tools"><label class="register-search">'+icon('search',13)+'<input data-table-search="accounts-register" placeholder="Search accounts"></label></div></div><div class="table-scroll"><table data-register-table="accounts-register"><thead><tr><th>CODE</th><th>ACCOUNT</th><th>TYPE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
    }
    const totalPosted=journals.filter(x=>x.status==='Posted').length,totalDraft=journals.filter(x=>x.status==='Draft').length,reversed=journals.filter(x=>x.reversalJournalId).length;
    const rows=journals.length?journals.map(j=>{
      const stateLabel=j.reversalOf?'Reversal':j.reversalJournalId?'Reversed':j.status,cls=j.status==='Posted'?'ready':'neutral';
      const action='<div class="inline-buttons"><button class="secondary" data-action="journal-view:'+j.id+'">View</button>'+(j.status==='Draft'?'<button class="primary" data-action="journal-post:'+j.id+'">Post</button>':(!j.reversalOf&&!j.reversalJournalId?'<button class="secondary" data-action="journal-reverse:'+j.id+'">Request reversal</button>':''))+'</div>';
      return '<tr><td><div class="payment-payee"><b>'+esc(j.journalNo||j.id)+'</b><small>'+esc(j.reference||'Manual journal')+(j.reversalReason?' · Reversal: '+esc(j.reversalReason):'')+'</small></div></td><td>'+esc(j.date||'')+'</td><td>'+esc(j.memo||'—')+'</td><td>'+money2(j.debit||0)+'</td><td>'+money2(j.credit||0)+'</td><td>'+pill(stateLabel,cls)+'</td><td>'+action+'</td></tr>';
    }).join(''):'<tr><td colspan="7"><div class="empty-inline">No manual journal entries yet.</div></td></tr>';
    const guide=!journals.length?'<div class="first-use-card"><span>'+icon('reports',16)+'</span><div><b>Use journals only for accounting adjustments</b><p>Sales, purchases, payments and payroll should come from their source modules. Create a manual journal for accruals, corrections, depreciation and other controlled adjustments.</p></div><button class="primary" data-action="open-journal">New journal</button></div>':'';
    return pageTitle('ACCOUNTING','Accounting','Post balanced accounting adjustments without altering source documents.','<button class="secondary" data-action="open-opening-migration">'+icon('reports',14)+' Opening balances</button><button class="primary" data-action="open-journal">'+icon('plus',14)+' New journal</button>')+tabs+guide+
      '<div class="accounting-summary"><div class="surface"><span>Posted journals</span><b>'+totalPosted+'</b><small>included in the General Ledger</small></div><div class="surface"><span>Draft journals</span><b>'+totalDraft+'</b><small>not yet in the books</small></div><div class="surface"><span>Reversed</span><b>'+reversed+'</b><small>original entries preserved</small></div><div class="surface"><span>Custom accounts</span><b>'+accounts.filter(x=>!x.system).length+'</b><small>plus '+accounts.filter(x=>x.system).length+' protected system accounts</small></div></div>'+
      '<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Posted journals are immutable</b><p>Once posted, a journal cannot be edited or deleted. Use a reversal entry for corrections. Closed accounting periods remain protected.</p></div></div>'+
      '<div class="surface employee-card"><div class="table-tools"><div><h3>Manual journal register</h3><p>Adjustments, accruals, depreciation, suspense clearing and accounting corrections</p></div><div class="register-tools"><label class="register-search">'+icon('search',13)+'<input data-table-search="journal-register" placeholder="Search journals"></label></div></div><div class="table-scroll"><table data-register-table="journal-register"><thead><tr><th>JOURNAL</th><th>DATE</th><th>MEMO</th><th>DEBIT</th><th>CREDIT</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>';
  }

  window.DalasiAccounting={nextAccountCode,createAccountRecord,bindAccountForm,TYPES,cashLedgerAccounts,allAccounts,orderedAccounts,parentAccount,accountByName,accountOptions,purchasePostingAccounts,purchasePostingOptions,journalTotals,readLines,bindJournalForm,createJournal,postJournal,reverseJournal,createAccount,toggleAccount,journalModal,journalDetailModal,accountModal,render};
})();