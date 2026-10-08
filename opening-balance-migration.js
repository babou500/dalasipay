(function(){
  'use strict';
  const round=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function nextJournalNo(state){
    const y=new Date().getFullYear(),prefix='JRN-'+y+'-';let max=0;
    (state.manualJournals||[]).forEach(x=>{const n=String(x.journalNo||'');if(n.startsWith(prefix))max=Math.max(max,Number(n.slice(prefix.length))||0);});
    return prefix+String(max+1).padStart(5,'0');
  }
  function accounts(state){return (window.DalasiAccounting?.allAccounts?.(state,true)||[]).filter(x=>(x.status||'Active')==='Active');}
  function accountByName(state,name){return accounts(state).find(x=>x.name===name)||null;}
  function line(account,debit=0,credit=0,memo='',sourceType='',sourceId=''){
    return {id:'OBL-'+Math.random().toString(36).slice(2,9),account,debit:round(debit),credit:round(credit),memo,sourceType,sourceId};
  }
  function buildDraft(state){
    const rows=[],setup=state.balanceSheetSetup||{},cash=(state.cashAccounts||[]),assets=(state.fixedAssets||[]).filter(a=>a.source==='Opening balance'),loans=(state.businessLoans||[]).filter(l=>l.source==='Opening balance');
    cash.forEach(a=>{const amt=round(a.openingBalance||0);if(amt)rows.push(line(a.name,amt>0?amt:0,amt<0?Math.abs(amt):0,a.reference||'Cash & Bank opening balance','cash-account',a.id));});
    assets.forEach(a=>{const cost=round(a.cost||0),dep=round(a.openingAccumDep||0);if(cost)rows.push(line('Property & Equipment, Cost',cost,0,a.name||a.assetNo,'fixed-asset',a.id));if(dep)rows.push(line('Accumulated Depreciation',0,dep,a.name||a.assetNo,'fixed-asset-dep',a.id));});
    loans.forEach(l=>{const amt=round(l.principal||0);if(amt)rows.push(line('Loans & Borrowings',0,amt,l.lender||l.reference||'Opening loan','loan',l.id));});
    if(!cash.length){const cb=round(setup.cashBank||0),pc=round(setup.pettyCash||0);if(cb)rows.push(line('Cash & Bank',cb>0?cb:0,cb<0?Math.abs(cb):0,'Legacy opening bank balance'));if(pc)rows.push(line('Cash & Bank',pc>0?pc:0,pc<0?Math.abs(pc):0,'Legacy opening petty cash')); }
    if(!assets.length&&round(setup.fixedAssetsNet||0))rows.push(line('Property & Equipment, Net',round(setup.fixedAssetsNet),0,'Legacy opening fixed assets'));
    if(!loans.length&&round(setup.loansBorrowings||0))rows.push(line('Loans & Borrowings',0,round(setup.loansBorrowings),'Legacy opening loans'));
    if(round(setup.otherCurrentAssets||0))rows.push(line('Other Current Assets',round(setup.otherCurrentAssets),0,'Legacy opening other current assets'));
    if(round(setup.otherLiabilities||0))rows.push(line('Other Liabilities',0,round(setup.otherLiabilities),'Legacy opening other liabilities'));
    if(round(setup.ownerCapital||0))rows.push(line('Owner / Share Capital',0,round(setup.ownerCapital),'Legacy opening capital'));
    if(round(setup.openingRetainedEarnings||0))rows.push(line('Opening Retained Earnings',0,round(setup.openingRetainedEarnings),'Legacy opening retained earnings'));
    if(!rows.length){rows.push(line('',0,0,'Opening balance'));rows.push(line('',0,0,'Opening balance'));}
    state.openingMigrationDraft={date:new Date().toISOString().slice(0,10),reference:'OPENING-TB',note:'Opening trial balance migration',lines:rows};
    return state.openingMigrationDraft;
  }
  function totals(lines){const debit=round((lines||[]).reduce((a,x)=>a+(Number(x.debit)||0),0)),credit=round((lines||[]).reduce((a,x)=>a+(Number(x.credit)||0),0));return {debit,credit,difference:round(debit-credit),balanced:Math.abs(round(debit-credit))<0.01&&debit>0};}
  function optionHtml(state,selected=''){return '<option value="">Choose account</option>'+accounts(state).map(a=>'<option value="'+esc(a.name)+'" '+(a.name===selected?'selected':'')+'>'+esc(a.code+' · '+a.name+(a.parentName?' · under '+a.parentName:''))+'</option>').join('');}
  function modal(state,h){
    const {field,icon,money2}=h,d=state.openingMigrationDraft||buildDraft(state),t=totals(d.lines),existing=(state.manualJournals||[]).find(j=>j.openingMigration);
    const rows=(d.lines||[]).map((x,i)=>'<div class="journal-line opening-migration-line" data-ob-line="'+i+'"><select name="obAccount">'+optionHtml(state,x.account)+'</select><input name="obMemo" value="'+esc(x.memo||'')+'" placeholder="Description"><input name="obDebit" type="number" min="0" step="0.01" value="'+(x.debit||'')+'" placeholder="Debit"><input name="obCredit" type="number" min="0" step="0.01" value="'+(x.credit||'')+'" placeholder="Credit"><button type="button" class="secondary tiny" data-action="opening-migration-remove:'+i+'">×</button></div>').join('');
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-opening-migration"></div><form id="opening-migration-form" class="modal-box wide">'+
      '<div class="modal-head"><div><div class="eyebrow">ACCOUNTING MIGRATION</div><h2>Opening Balance Migration</h2><p>Build one complete opening trial balance and post it only when total debits equal total credits.</p></div><button type="button" class="close" data-action="close-opening-migration">×</button></div>'+
      (existing?'<div class="payment-notice"><span>'+icon('shield',17)+'</span><div><b>Opening migration already posted</b><p>'+esc(existing.journalNo||existing.id)+' was posted on '+esc(existing.date||'')+'. Reverse that journal before importing another opening trial balance.</p></div></div>':'')+
      '<div class="form-grid">'+field('Opening date','<input name="obDate" type="date" value="'+esc(d.date||'')+'" required>')+field('Reference','<input name="obReference" value="'+esc(d.reference||'OPENING-TB')+'" required>')+'</div>'+
      '<div class="payment-notice"><span>'+icon('reports',17)+'</span><div><b>Existing operational openings have been loaded</b><p>Bank opening balances, opening fixed assets and opening loans are included automatically. Add the remaining equity, liabilities, receivables, payables or other balances needed to complete the opening trial balance.</p></div></div>'+
      '<div class="journal-lines-head"><span>ACCOUNT</span><span>DESCRIPTION</span><span>DEBIT</span><span>CREDIT</span><span></span></div><div id="opening-migration-lines">'+rows+'</div>'+
      '<div class="inline-buttons" style="padding:12px 20px"><button type="button" class="secondary" data-action="opening-migration-add">'+icon('plus',14)+' Add line</button></div>'+
      '<div class="journal-total-bar '+(t.balanced?'balanced':'unbalanced')+'"><span>Total debit <b id="ob-total-debit">'+money2(t.debit)+'</b></span><span>Total credit <b id="ob-total-credit">'+money2(t.credit)+'</b></span><span>Difference <b id="ob-difference">'+money2(Math.abs(t.difference))+'</b></span><strong id="ob-balance-status">'+(t.balanced?'BALANCED':'NOT BALANCED')+'</strong></div>'+
      '<div class="modal-note"><b>Important:</b> DalasiPay will not create a suspense plug for this migration. The import is blocked until the opening trial balance balances exactly.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-opening-migration">Cancel</button><button type="submit" class="primary" '+(existing?'disabled':'')+'>'+icon('check',14)+' Validate & post opening balance</button></div></form></div>';
  }
  function readForm(form,state){
    const rows=[...form.querySelectorAll('[data-ob-line]')].map((el,i)=>{
      const prior=state.openingMigrationDraft?.lines?.[i]||{};
      return {...prior,account:String(el.querySelector('[name="obAccount"]')?.value||''),memo:String(el.querySelector('[name="obMemo"]')?.value||'').trim(),debit:round(el.querySelector('[name="obDebit"]')?.value),credit:round(el.querySelector('[name="obCredit"]')?.value)};
    });
    state.openingMigrationDraft={date:String(form.elements.obDate?.value||''),reference:String(form.elements.obReference?.value||'').trim(),note:'Opening trial balance migration',lines:rows};return state.openingMigrationDraft;
  }
  function syncFromDom(state){const f=document.getElementById('opening-migration-form');if(f)readForm(f,state);}
  function addLine(state,ctx){syncFromDom(state);state.openingMigrationDraft=state.openingMigrationDraft||buildDraft(state);state.openingMigrationDraft.lines.push(line('',0,0,''));ctx.render();}
  function removeLine(index,state,ctx){syncFromDom(state);if((state.openingMigrationDraft?.lines||[]).length<=2){ctx.toast('Keep at least two opening-balance lines.');return;}state.openingMigrationDraft.lines.splice(Number(index),1);ctx.render();}
  function submit(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to post opening balances.');return;}
    if((state.manualJournals||[]).some(j=>j.openingMigration)){ctx.toast('An opening migration has already been posted. Reverse it before importing another.');return;}
    const d=readForm(ev.target,state),t=totals(d.lines);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date)){ctx.toast('Choose a valid opening date.');return;}
    if(window.DalasiMonthClose?.isClosed(state,d.date)){ctx.toast('The opening date is in a closed accounting period. Reopen it first.');return;}
    if(d.lines.length<2||!t.balanced){ctx.toast('Opening trial balance must contain at least two lines and total debits must equal total credits.');return;}
    for(const x of d.lines){
      if(!x.account){ctx.toast('Choose an account for every opening-balance line.');return;}
      if(x.debit>0&&x.credit>0){ctx.toast('Each opening line must be debit or credit, not both.');return;}
      if(x.debit<=0&&x.credit<=0){ctx.toast('Every opening line must contain a debit or credit amount.');return;}
      const a=accountByName(state,x.account);if(!a){ctx.toast('One opening account is no longer available.');return;}x.accountCode=a.code;x.accountType=a.type;
    }
    const now=new Date().toISOString(),id='JRN-'+Date.now().toString(36).toUpperCase(),journalNo=nextJournalNo(state),actor=state.session?.name||'User';
    const journal={id,journalNo,date:d.date,reference:d.reference||'OPENING-TB',memo:'Opening trial balance migration',lines:d.lines.map(x=>({account:x.account,accountCode:x.accountCode,accountType:x.accountType,debit:x.debit,credit:x.credit,memo:x.memo||'Opening balance'})),debit:t.debit,credit:t.credit,status:'Posted',openingMigration:true,createdAt:now,createdBy:actor,postedAt:now,postedBy:actor,updatedAt:now};
    state.manualJournals=state.manualJournals||[];state.manualJournals.unshift(journal);
    (state.cashAccounts||[]).forEach(a=>{if(d.lines.some(x=>x.sourceType==='cash-account'&&x.sourceId===a.id))a.openingMigrationJournalId=id;});
    (state.fixedAssets||[]).forEach(a=>{if(d.lines.some(x=>x.sourceId===a.id&&(x.sourceType==='fixed-asset'||x.sourceType==='fixed-asset-dep')))a.openingMigrationJournalId=id;});
    (state.businessLoans||[]).forEach(l=>{if(d.lines.some(x=>x.sourceType==='loan'&&x.sourceId===l.id))l.openingMigrationJournalId=id;});
    state.balanceSheetSetup={cashBank:0,pettyCash:0,otherCurrentAssets:0,fixedAssetsNet:0,loansBorrowings:0,otherLiabilities:0,ownerCapital:0,openingRetainedEarnings:0,note:'Migrated through '+journalNo,updatedAt:now,updatedBy:actor};
    state.openingMigrationOpen=false;state.openingMigrationDraft=null;state.accountingTab='journals';state.journalDetailId=id;
    ctx.audit('accounting.opening_migration_posted',{journalId:id,journalNo,date:d.date,debit:t.debit,credit:t.credit,lineCount:d.lines.length});ctx.save();ctx.toast(journalNo+' opening trial balance posted');ctx.render();
  }
  window.DalasiOpeningMigration={buildDraft,totals,modal,addLine,removeLine,submit,readForm};
})();