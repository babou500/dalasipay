const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup(){
  const w={DalasiMonthClose:{isClosed:()=>false}};
  const context=vm.createContext({window:w,console});
  for(const file of ['general-ledger.js','accounting-journals.js','opening-balance-migration.js','balance-sheet.js']){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  const state={
    cashAccounts:[{id:'cash-1',name:'Access Bank',ledgerCode:'1000-101',openingBalance:1000,openingDate:'2026-01-01'}],
    fixedAssets:[],businessLoans:[],manualJournals:[],customAccounts:[],
    balanceSheetSetup:{ownerCapital:1000},session:{name:'Opening Test Owner'}
  };
  const events={toast:[],audit:[],saves:0,renders:0};
  const ctx={
    can:cap=>cap==='workspace.manage',audit:(...args)=>events.audit.push(args),
    save:()=>events.saves++,render:()=>events.renders++,
    toast:msg=>events.toast.push(msg)
  };
  function form(){
    return {
      elements:{obDate:{value:'2026-01-01'},obReference:{value:'OPENING-TB'}},
      querySelectorAll(selector){
        assert.equal(selector,'[data-ob-line]');
        return (state.openingMigrationDraft?.lines||[]).map(line=>({
          querySelector(name){
            const fields={'[name="obAccount"]':line.account,'[name="obMemo"]':line.memo,'[name="obDebit"]':line.debit,'[name="obCredit"]':line.credit};
            assert.ok(Object.hasOwn(fields,name),'expected opening line field '+name);
            return {value:fields[name]};
          }
        }));
      }
    };
  }
  function submit(){
    w.DalasiOpeningMigration.submit({preventDefault(){},target:form()},state,ctx);
  }
  return {w,state,ctx,events,submit};
}

test('opening migration creates a balanced journal once and preserves bank account linkage',()=>{
  const t=setup();
  const draft=t.w.DalasiOpeningMigration.buildDraft(t.state);
  assert.equal(draft.lines.length,2);
  assert.equal(t.w.DalasiOpeningMigration.totals(draft.lines).balanced,true);
  t.submit();
  assert.equal(t.state.manualJournals.length,1);
  const first=t.state.manualJournals[0];
  assert.equal(first.openingMigration,true);
  assert.equal(first.status,'Posted');
  assert.equal(t.state.cashAccounts[0].openingMigrationJournalId,first.id);
  const trial=t.w.DalasiGeneralLedger.trialBalance(t.state);
  assert.equal(trial.balanced,true);
  assert.equal(trial.accounts.find(a=>a.name==='Access Bank').balance,1000);
  assert.equal(t.w.DalasiBalanceSheet.statement(t.state).difference,0);
  assert.equal(t.events.saves,1);
});

test('posting a second migration without a posted reversal is blocked even if reversal ID is forged or pending',()=>{
  const t=setup();
  t.w.DalasiOpeningMigration.buildDraft(t.state);t.submit();
  const first=t.state.manualJournals[0];
  t.w.DalasiOpeningMigration.buildDraft(t.state);t.submit();
  assert.equal(t.state.manualJournals.length,1);
  assert.match(t.events.toast.at(-1),/Reverse it before importing/);
  first.reversalJournalId='pending-reverse';
  assert.ok(t.w.DalasiOpeningMigration.activeOpeningMigration(t.state));
  t.state.manualJournals.unshift({id:'pending-reverse',reversalOf:first.id,status:'Draft'});
  assert.ok(t.w.DalasiOpeningMigration.activeOpeningMigration(t.state));
  t.submit();
  assert.equal(t.state.manualJournals.length,2);
  const modal=t.w.DalasiOpeningMigration.modal(t.state,{field:(name,markup)=>name+markup,icon:()=>'',money2:n=>String(n)});
  assert.match(modal,/Opening migration already posted/);
  assert.match(modal,/type="submit" class="primary" disabled/);
});

test('approved posted reversal permits a corrected migration while retaining the full audit history',()=>{
  const t=setup();
  t.w.DalasiOpeningMigration.buildDraft(t.state);t.submit();
  const first=t.state.manualJournals[0];
  const approved={...t.ctx,approvedRequest:{id:'approval-1',reason:'Correct opening classification',approvedBy:'Owner'}};
  assert.equal(t.w.DalasiAccounting.reverseJournal(first.id,t.state,approved),true);
  assert.equal(t.state.manualJournals.length,2);
  const reversal=t.state.manualJournals[0];
  assert.equal(reversal.reversalOf,first.id);
  assert.equal(reversal.status,'Posted');
  assert.equal(first.reversalJournalId,reversal.id);
  assert.equal(t.w.DalasiOpeningMigration.activeOpeningMigration(t.state),null);
  const draft=t.w.DalasiOpeningMigration.buildDraft(t.state);
  draft.lines.push({account:'Owner / Share Capital',credit:1000,debit:0,memo:'Corrected capital'});
  assert.equal(t.w.DalasiOpeningMigration.totals(draft.lines).balanced,true);
  const before=t.state.manualJournals.length;
  t.submit();
  assert.equal(t.state.manualJournals.length,before+1);
  const corrected=t.state.manualJournals[0];
  assert.equal(corrected.openingMigration,true);
  assert.notEqual(corrected.id,first.id);
  assert.equal(t.state.cashAccounts[0].openingMigrationJournalId,corrected.id);
  assert.equal(first.status,'Posted','original is immutable, not deleted');
  assert.equal(reversal.status,'Posted','reversal stays in the ledger');
  assert.equal(t.w.DalasiOpeningMigration.activeOpeningMigration(t.state)?.id,corrected.id);
  const trial=t.w.DalasiGeneralLedger.trialBalance(t.state);
  assert.equal(trial.balanced,true);
  assert.equal(trial.accounts.find(a=>a.name==='Access Bank').balance,1000,'do not double count opening cash');
  assert.equal(trial.accounts.find(a=>a.name==='Owner / Share Capital').balance,-1000);
  const statement=t.w.DalasiBalanceSheet.statement(t.state);
  assert.equal(statement.totalAssets,1000);
  assert.equal(statement.equity,1000);
  assert.equal(statement.difference,0);
  assert.equal(t.events.saves,2,'no extra persistence beyond two successful migration posts');
});

test('the replacement import cannot bypass balance, permissions or closed-period checks',()=>{
  const t=setup();
  t.w.DalasiOpeningMigration.buildDraft(t.state);t.submit();
  const first=t.state.manualJournals[0];
  const approved={...t.ctx,approvedRequest:{id:'approval-2',reason:'Correct migration',approvedBy:'Owner'}};
  assert.equal(t.w.DalasiAccounting.reverseJournal(first.id,t.state,approved),true);
  const draft=t.w.DalasiOpeningMigration.buildDraft(t.state);
  assert.equal(t.w.DalasiOpeningMigration.totals(draft.lines).balanced,false);
  t.submit();
  assert.match(t.events.toast.at(-1),/debits must equal total credits/);
  assert.equal(t.state.manualJournals.length,2);
  draft.lines.push({account:'Owner / Share Capital',credit:1000,debit:0});
  const blockedCtx={...t.ctx,can:()=>false};
  t.w.DalasiOpeningMigration.submit({preventDefault(){},target:{
    elements:{obDate:{value:'2026-01-01'},obReference:{value:'OPENING-TB'}},
    querySelectorAll:()=>draft.lines.map(line=>({querySelector:sel=>({value:({
      '[name="obAccount"]':line.account,'[name="obMemo"]':line.memo||'',
      '[name="obDebit"]':line.debit,'[name="obCredit"]':line.credit
    })[sel]})}))
  }},t.state,blockedCtx);
  assert.equal(t.state.manualJournals.length,2);
  t.w.DalasiMonthClose.isClosed=()=>true;
  t.submit();
  assert.match(t.events.toast.at(-1),/closed accounting period/);
  assert.equal(t.state.manualJournals.length,2);
});
