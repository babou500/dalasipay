(function(){
  'use strict';

  const money=n=>Math.round((Number(n)||0)*100)/100;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function trial(state){return window.DalasiGeneralLedger?.trialBalance?.(state)||{accounts:[],debit:0,credit:0,difference:0,balanced:true};}
  function statement(state){
    const t=trial(state),assets=[],liabilities=[],equityAccounts=[],revenue=[],expenses=[];
    for(const a of t.accounts||[]){
      const bal=money(a.balance);
      if(a.type==='Asset')assets.push({...a,amount:bal});
      else if(a.type==='Liability')liabilities.push({...a,amount:money(-bal)});
      else if(a.type==='Equity')equityAccounts.push({...a,amount:money(-bal)});
      else if(a.type==='Revenue')revenue.push({...a,amount:money(-bal)});
      else if(a.type==='Expense')expenses.push({...a,amount:bal});
    }
    const totalAssets=money(assets.reduce((s,x)=>s+x.amount,0));
    const totalLiabilities=money(liabilities.reduce((s,x)=>s+x.amount,0));
    const directEquity=money(equityAccounts.reduce((s,x)=>s+x.amount,0));
    const totalRevenue=money(revenue.reduce((s,x)=>s+x.amount,0));
    const totalExpenses=money(expenses.reduce((s,x)=>s+x.amount,0));
    const currentEarnings=money(totalRevenue-totalExpenses);
    const equity=money(directEquity+currentEarnings);
    const liabilitiesEquity=money(totalLiabilities+equity);
    const suspense=equityAccounts.find(x=>x.name==='Opening / Mapping Suspense')?.amount||0;
    const openingBalanceEquity=equityAccounts.find(x=>x.name==='Opening Balance Equity')?.amount||0;
    return {
      trialBalance:t,assets,liabilities,equityAccounts,revenue,expenses,totalAssets,totalLiabilities,directEquity,currentEarnings,equity,liabilitiesEquity,
      difference:money(totalAssets-liabilitiesEquity),balanced:Math.abs(totalAssets-liabilitiesEquity)<0.01,
      suspense:money(suspense),openingBalanceEquity:money(openingBalanceEquity),
      setup:Object.assign({cashBank:0,pettyCash:0,otherCurrentAssets:0,fixedAssetsNet:0,loansBorrowings:0,otherLiabilities:0,ownerCapital:0,openingRetainedEarnings:0,note:'',updatedAt:''},state.balanceSheetSetup||{})
    };
  }
  function row(a,money2){return '<tr><td><span class="bs-account-code">'+esc(a.code||'')+'</span> '+esc(a.name)+'</td><td>'+money2(a.amount)+'</td></tr>';}
  function panel(state,h){
    const {money2,icon}=h,s=statement(state),assetRows=s.assets.length?s.assets.map(a=>row(a,money2)).join(''):'<tr><td>No asset balances</td><td>'+money2(0)+'</td></tr>',
      liabilityRows=s.liabilities.length?s.liabilities.map(a=>row(a,money2)).join(''):'<tr><td>No liability balances</td><td>'+money2(0)+'</td></tr>',
      eqRows=s.equityAccounts.length?s.equityAccounts.map(a=>row(a,money2)).join(''):'<tr><td>No direct equity balances</td><td>'+money2(0)+'</td></tr>';
    return '<section class="surface balance-sheet-card">'+
      '<div class="table-tools"><div><h3>Balance Sheet</h3><p>Ledger-derived statement. Every amount comes from balanced double-entry postings in the General Ledger.</p></div><div class="inline-buttons"><button class="secondary" data-action="business-report-export:balance-sheet">'+icon('download',14)+' CSV</button><button class="primary" data-action="open-balance-sheet-setup">'+icon('plus',14)+' Opening setup</button></div></div>'+
      '<div class="bs-kpis"><div><span>Total assets</span><b>'+money2(s.totalAssets)+'</b><small>ledger asset balances</small></div><div><span>Total liabilities</span><b>'+money2(s.totalLiabilities)+'</b><small>ledger liability balances</small></div><div><span>Total equity</span><b>'+money2(s.equity)+'</b><small>direct equity + current earnings</small></div><div class="'+(!s.balanced?'bs-warning':'')+'"><span>Balance check</span><b>'+money2(Math.abs(s.difference))+'</b><small>'+(s.balanced?'balanced':'trial balance requires review')+'</small></div></div>'+
      '<div class="bs-columns"><div><h4>ASSETS</h4><table><tbody>'+assetRows+'<tr class="bs-total"><td>TOTAL ASSETS</td><td>'+money2(s.totalAssets)+'</td></tr></tbody></table></div>'+
      '<div><h4>LIABILITIES & EQUITY</h4><table><tbody>'+liabilityRows+'<tr class="bs-total"><td>TOTAL LIABILITIES</td><td>'+money2(s.totalLiabilities)+'</td></tr>'+eqRows+
      '<tr><td>Current-year earnings</td><td>'+money2(s.currentEarnings)+'</td></tr><tr class="bs-total"><td>TOTAL EQUITY</td><td>'+money2(s.equity)+'</td></tr><tr class="bs-total"><td>LIABILITIES + EQUITY</td><td>'+money2(s.liabilitiesEquity)+'</td></tr></tbody></table></div></div>'+
      (s.openingBalanceEquity?'<div class="bs-note"><b>Opening Balance Equity:</b> '+money2(s.openingBalanceEquity)+' is the automatic contra for opening bank and opening fixed-asset balances. This is the missing second side that was previously not displayed on the Balance Sheet.</div>':'')+
      (s.suspense?'<div class="bs-note bs-warning-note"><b>Opening / Mapping Suspense:</b> '+money2(s.suspense)+' remains to be mapped to the correct opening capital, retained earnings, asset or liability account.</div>':'')+
      (!s.trialBalance.balanced?'<div class="bs-note bs-warning-note"><b>Trial Balance is out of balance by '+money2(Math.abs(s.trialBalance.difference))+'.</b> DalasiPay has detected a posting problem that requires review.</div>':'<div class="bs-note"><b>Double-entry check passed.</b> Total debits equal total credits in the General Ledger.</div>')+
      '</section>';
  }
  function modal(state,h){
    const field=h.field,icon=h.icon,x=statement(state).setup,canEdit=h.can('workspace.manage')||h.can('payroll.manage'),dis=canEdit?'':'disabled';
    return '<div class="center-modal payment-modal"><div class="modal-scrim" data-action="close-balance-sheet-setup"></div><form id="balance-sheet-form" class="modal-box">'+
      '<div class="modal-head"><div><div class="eyebrow">OPENING FINANCIAL POSITION</div><h2>Opening balance setup</h2><p>Use this only for opening balances not already entered through Cash & Bank, Fixed Assets or Loans.</p></div><button type="button" class="close" data-action="close-balance-sheet-setup">×</button></div>'+
      '<div class="form-grid">'+
      field('Cash at bank fallback (GMD)','<input name="cashBank" type="number" step="0.01" value="'+Number(x.cashBank||0)+'" '+dis+'>')+
      field('Petty cash fallback (GMD)','<input name="pettyCash" type="number" step="0.01" value="'+Number(x.pettyCash||0)+'" '+dis+'>')+
      field('Other current assets (GMD)','<input name="otherCurrentAssets" type="number" step="0.01" value="'+Number(x.otherCurrentAssets||0)+'" '+dis+'>')+
      field('Property / equipment, net fallback (GMD)','<input name="fixedAssetsNet" type="number" step="0.01" value="'+Number(x.fixedAssetsNet||0)+'" '+dis+'>')+
      field('Loans / borrowings fallback (GMD)','<input name="loansBorrowings" type="number" step="0.01" value="'+Number(x.loansBorrowings||0)+'" '+dis+'>')+
      field('Other current liabilities (GMD)','<input name="otherLiabilities" type="number" step="0.01" value="'+Number(x.otherLiabilities||0)+'" '+dis+'>')+
      field('Owner / share capital (GMD)','<input name="ownerCapital" type="number" step="0.01" value="'+Number(x.ownerCapital||0)+'" '+dis+'>')+
      field('Opening retained earnings (GMD)','<input name="openingRetainedEarnings" type="number" step="0.01" value="'+Number(x.openingRetainedEarnings||0)+'" '+dis+'>')+
      '</div>'+field('Note / source','<input name="note" value="'+esc(x.note||'')+'" placeholder="e.g. opening trial balance at migration date" '+dis+'>')+
      '<div class="modal-note">Opening bank accounts and opening fixed assets should normally be entered in their own modules. DalasiPay automatically creates the balancing Opening Balance Equity entry for those records.</div>'+
      '<div class="modal-actions"><button type="button" class="secondary" data-action="close-balance-sheet-setup">Cancel</button>'+(canEdit?'<button class="primary" type="submit">'+icon('save',14)+' Save opening setup</button>':'')+'</div></form></div>';
  }
  function saveSetup(ev,state,ctx){
    ev.preventDefault();if(!(ctx.can('workspace.manage')||ctx.can('payroll.manage'))){ctx.toast('Owner or Payroll Admin access is required to update opening balances.');return;}
    const fd=new FormData(ev.target),old=state.balanceSheetSetup||{},num=(name,fallback=0)=>fd.has(name)?money(fd.get(name)):money(fallback);
    state.balanceSheetSetup={cashBank:num('cashBank',old.cashBank),pettyCash:num('pettyCash',old.pettyCash),otherCurrentAssets:num('otherCurrentAssets',old.otherCurrentAssets),fixedAssetsNet:num('fixedAssetsNet',old.fixedAssetsNet),loansBorrowings:num('loansBorrowings',old.loansBorrowings),otherLiabilities:num('otherLiabilities',old.otherLiabilities),ownerCapital:num('ownerCapital',old.ownerCapital),openingRetainedEarnings:num('openingRetainedEarnings',old.openingRetainedEarnings),note:String(fd.get('note')||old.note||'').trim(),updatedAt:new Date().toISOString(),updatedBy:state.session?.name||'User'};
    state.balanceSheetOpen=false;ctx.audit('balance_sheet.setup_updated',{...state.balanceSheetSetup});ctx.save();ctx.toast('Opening balance setup updated');ctx.render();
  }
  function exportCsv(state,ctx){
    const s=statement(state),rows=[['Balance Sheet Account','Type','Amount']];
    s.assets.forEach(a=>rows.push([a.code+' · '+a.name,'Asset',a.amount]));rows.push(['TOTAL ASSETS','',s.totalAssets]);
    s.liabilities.forEach(a=>rows.push([a.code+' · '+a.name,'Liability',a.amount]));rows.push(['TOTAL LIABILITIES','',s.totalLiabilities]);
    s.equityAccounts.forEach(a=>rows.push([a.code+' · '+a.name,'Equity',a.amount]));rows.push(['Current-year earnings','Equity',s.currentEarnings],['TOTAL EQUITY','',s.equity],['LIABILITIES + EQUITY','',s.liabilitiesEquity],['Balance difference','',s.difference]);
    const csv=rows.map(r=>r.map(v=>{const q=String(v??'');return /[",\n]/.test(q)?'"'+q.replace(/"/g,'""')+'"':q}).join(',')).join('\n');ctx.downloadText('dalasipay-balance-sheet-'+new Date().toISOString().slice(0,10)+'.csv',csv);ctx.toast('Balance Sheet downloaded');
  }
  window.DalasiBalanceSheet={statement,panel,modal,saveSetup,exportCsv};
})();