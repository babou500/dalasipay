const test=require('node:test');
const assert=require('node:assert/strict');
const audit=require('./opening-link-audit.js');
test('linked active opening journal is clean and read-only',()=>{
 const state={cashAccounts:[{id:'bank',openingBalance:100,openingMigrationJournalId:'M1'}],manualJournals:[{id:'M1',openingMigration:true,status:'Posted'}]};const before=JSON.stringify(state);
 const result=audit.inspect(state);assert.equal(result.clean,true);assert.equal(result.checkedSourceCount,1);assert.equal(JSON.stringify(state),before);
});
test('reversed opening journal with stale cash link requires review',()=>{
 const state={cashAccounts:[{id:'bank',openingMigrationJournalId:'M1'}],manualJournals:[{id:'M1',openingMigration:true,status:'Posted',reversalJournalId:'R1'},{id:'R1',status:'Posted',reversalOf:'M1'}]};
 assert.deepEqual(audit.inspect(state).issues.map(x=>x.type),['linked-opening-journal-reversed']);
});
test('missing opening journal requires review',()=>{
 const state={fixedAssets:[{id:'asset',openingMigrationJournalId:'missing'}]};assert.equal(audit.inspect(state).issues[0].type,'missing-posted-opening-journal');
});
test('pending reversal never cancels an active opening migration',()=>{
 const state={cashAccounts:[{id:'bank',openingMigrationJournalId:'M1'}],manualJournals:[{id:'M1',openingMigration:true,status:'Posted',reversalJournalId:'R1'},{id:'R1',status:'Pending',reversalOf:'M1'}]};
 assert.equal(audit.inspect(state).clean,true);
});
test('two unreversed opening migrations are reported',()=>{
 const state={manualJournals:[{id:'M1',openingMigration:true,status:'Posted'},{id:'M2',openingMigration:true,status:'Posted'}]};
 assert.ok(audit.inspect(state).issues.some(x=>x.type==='multiple-active-opening-journals'));
});
