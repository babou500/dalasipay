const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');

function extract(begin,end){
  const start=html.indexOf(begin),stop=html.indexOf(end,start);
  assert.ok(start>=0&&stop>start,'expected onboarding function present: '+begin);
  return html.slice(start,stop);
}
function makeForm(fields){
  const submit={disabled:false,textContent:'',innerHTML:'Create company workspace'};
  const error={hidden:true,textContent:''};
  return {fields,submit,error,querySelector(sel){return sel==='button[type="submit"]'?submit:sel==='#company-error'?error:null;}};
}
class FormDataStub{constructor(form){this.values=form.fields;}get(name){return this.values[name]??null;}}
function makeHandler({create,production=true,sync=async()=>({ok:true}),load=()=>{}}){
  const state={companyCreating:false,createCompanyOpen:true,justCreatedWorkspaceId:null};
  const calls={create:0,audit:0,save:0,render:0,sample:0};
  const win={
    DalasiProduction:{configured:()=>production,syncNow:sync},
    DalasiAuth:{createOrganization:async payload=>{calls.create++;return create(payload);},setOrgValue:()=>{calls.sample++;}}
  };
  const handler=new Function('state','window','FormData','loadOrgState','audit','save','toast','render','seedEmployees',
    extract('  async function handleCompany(ev){','  async function handleInvite(ev){')+'return handleCompany;')
    (state,win,FormDataStub,load,()=>{calls.audit++;},()=>{calls.save++;},()=>{},()=>{calls.render++;},[]);
  return {state,calls,handler};
}

test('production onboarding is one clear step with no misleading sample data option',()=>{
  const factory=new Function('window','field','icon',
    extract('  function onboardingScreen(extra=false){','  function workspaceMenu(){')+'return onboardingScreen;');
  const production=factory({DalasiProduction:{configured:()=>true}},(label,mark)=>label+mark,()=>'')();
  assert.match(production,/Business profile · One-time setup/);
  assert.match(production,/Your new workspace starts empty/);
  assert.match(production,/id="company-error"/);
  assert.match(production,/button class="primary" type="submit"/);
  assert.match(production,/maxlength="120"/);
  assert.doesNotMatch(production,/name="sample"/);
  assert.doesNotMatch(production,/Start with demonstration data/);
  const demo=factory({DalasiProduction:{configured:()=>false}},(label,mark)=>label+mark,()=>'')();
  assert.match(demo,/name="sample"/);
});

test('one rapid double click creates only one workspace and reaches the dashboard',async()=>{
  let resolve;
  const pending=new Promise(r=>resolve=r);
  const app=makeHandler({create:async()=>pending});
  const form=makeForm({company:'  Example Enterprise  ',industry:'Retail',size:'1-10',sample:null});
  const ev={target:form,preventDefault(){}};
  const first=app.handler(ev),second=app.handler(ev);
  await second;
  assert.equal(app.calls.create,1,'duplicate submission must be blocked');
  assert.equal(form.submit.disabled,true);
  resolve({id:'test-org'});
  await first;
  assert.equal(app.state.companyCreating,false);
  assert.equal(app.state.justCreatedWorkspaceId,'test-org');
  assert.equal(app.state.createCompanyOpen,false);
  assert.equal(app.calls.render,1);
  assert.equal(app.calls.audit,1);
  assert.equal(app.calls.save,1);
  assert.equal(app.calls.sample,0,'production cannot silently add sample employees');
});

test('missing company name shows an inline error and keeps form inputs intact',async()=>{
  const app=makeHandler({create:async()=>({id:'should-not-create'})});
  const form=makeForm({company:'   ',industry:'Retail',size:'1-10'});
  await app.handler({target:form,preventDefault(){}});
  assert.equal(app.calls.create,0);
  assert.match(form.error.textContent,/enter your company name/i);
  assert.equal(form.error.hidden,false);
  assert.equal(form.fields.industry,'Retail');
  assert.equal(form.submit.disabled,false);
  assert.equal(app.calls.render,0,'do not replace form and lose entered values');
});

test('server failure keeps the form editable and never fabricates a workspace',async()=>{
  const app=makeHandler({create:async()=>{throw Error('Could not create workspace');}});
  const form=makeForm({company:'Business',industry:'NGO / nonprofit',size:'11-50'});
  await app.handler({target:form,preventDefault(){}});
  assert.match(form.error.textContent,/could not create/i);
  assert.equal(form.submit.disabled,false);
  assert.equal(app.state.justCreatedWorkspaceId,null);
  assert.equal(app.calls.audit,0);
  assert.equal(app.calls.render,0);
});

test('failure after server creation warns against repeating a possible successful creation',async()=>{
  const app=makeHandler({create:async()=>({id:'created-org'}),load:()=>{throw Error('Private hydration failure');}});
  const form=makeForm({company:'Business',industry:'Retail',size:'1-10'});
  await app.handler({target:form,preventDefault(){}});
  assert.match(form.error.textContent,/may already have been created/i);
  assert.doesNotMatch(form.error.textContent,/Private hydration failure/);
  assert.equal(form.submit.disabled,true,'do not allow creating a duplicate while state is uncertain');
  assert.equal(app.calls.create,1);
});

test('getting-started guide appears only for a just-created owner workspace and offers safe navigation',()=>{
  const fn=new Function('state','esc','icon',extract('  function firstWorkspaceGuide(){','  function dashboard(){')+'return firstWorkspaceGuide;');
  const show=state=>fn(state,x=>String(x).replace(/</g,'&lt;'),()=>'')();
  const matching={org:{id:'new'},role:'owner',justCreatedWorkspaceId:'new',company:'<New Shop>'};
  const guide=show(matching);
  assert.match(guide,/WELCOME TO DALASIPAY/);
  assert.match(guide,/&lt;New Shop>/);
  for(const page of ['accounting','customers','invoices'])assert.match(guide,new RegExp('data-page="'+page+'"'));
  assert.match(guide,/data-action="dismiss-onboarding-guide"/);
  assert.equal(show({...matching,justCreatedWorkspaceId:null}),'');
  assert.equal(show({...matching,role:'viewer'}),'');
  assert.equal(show({...matching,org:{id:'other'}}),'');
  assert.match(html,/a==='dismiss-onboarding-guide'/);
});
