'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const expense=fs.readFileSync(require('node:path').join(__dirname,'expenses-purchases.js'),'utf8');
const start=html.indexOf('  async function commitExpenseDraft(');
const end=html.indexOf('  function queueSync(',start);
assert.ok(start>0&&end>start,'Acknowledged expense-saving adapter is installed');
assert.match(expense,/await window\.DalasiProduction\.commitExpenseDraft\(state\.org\?\.id,record\)/);
assert.match(expense,/state\.businessExpenses=\[record,\.\.\.existing\]/);
function harness({revision=3,conflict=false,offline=false,pending=false}={}){
  const data={'business-expenses':[{id:'old',amount:10}],subscriptions:[{id:'preview'}],billing:false};
  const remote={revision,state:{schemaVersion:'test',data}};
  const items=new Map([['active','workspace'],['revisionworkspace',String(revision)]]);
  const storage={getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,String(v))};
  const calls=[];
  const fn=new Function('configured','hydrating','navigator','status','store','ACTIVE_ORG_KEY','REV_PREFIX','window','CONFIG','workspacePrefix','setStatus','now',html.slice(start,end)+';return commitExpenseDraft;')(
    ()=>true,false,{onLine:!offline},()=>({pending}),()=>storage,'active','revision',
    {DalasiBackend:{repository:{
      appState:async()=>structuredClone(remote),
      saveAppState:async payload=>{calls.push(payload);return conflict?{conflict:true}:{revision:revision+1};}
    }}},{appVersion:'test'},org=>'org-'+org+'-',()=>{},()=>new Date().toISOString()
  );
  return {fn,data,remote,items,calls};
}
test('acknowledged expense commit preserves unrelated data and saves exactly once',async()=>{
  const h=harness();await h.fn('workspace',{id:'new',amount:25,status:'Draft'});
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].expectedRevision,3);
  assert.deepEqual(h.calls[0].state.data.subscriptions,[{id:'preview'}]);
  assert.equal(h.calls[0].state.data.billing,false);
  assert.equal(JSON.parse(h.items.get('org-workspace-business-expenses')).length,2);
  assert.equal(h.items.get('revisionworkspace'), '4');
});
test('revision conflict never changes locally saved expense data',async()=>{
  const h=harness({conflict:true});
  await assert.rejects(h.fn('workspace',{id:'new'}),/did not confirm/);
  assert.equal(h.items.has('org-workspace-business-expenses'),false);
  assert.equal(h.items.get('revision'),'3');
});
test('offline and pending workspace changes block expense submission',async()=>{
  for(const options of [{offline:true},{pending:true}]){
    const h=harness(options);await assert.rejects(h.fn('workspace',{id:'new'}));
    assert.equal(h.calls.length,0);
  }
});
test('wrong workspace prevents remote write',async()=>{
  const h=harness();await assert.rejects(h.fn('other',{id:'new'}),/Workspace changed/);assert.equal(h.calls.length,0);
});
