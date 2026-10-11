const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('./subscription-customer.js');
const feedback=require('./registration-feedback.js');
test('main subscription section renders real owned workspace, configured plans and reviewed history safely',async()=>{class Element{constructor(tag){this.tag=tag;this.children=[];this.isConnected=true;this.textContent='';}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(){}addEventListener(name,fn){(this.events??={})[name]=fn;}}const root=new Element('div');root.ownerDocument={createElement:tag=>new Element(tag)};const data={billing:false,enforcement:false,businesses:[{id:'owned',name:'<Real Business>',created_at:'2026-10-09',subscription:{plan_id:'professional',professional_preview:true,status:'professional_preview'},requests:[{id:'real-request',request_kind:'plan_change',requested_plan:'free',status:'rejected',created_at:'2026-10-09',reason:'Review plan change',review_note:'Recorded administrator reason'}]}],plans:[{plan_id:'free',label:'Configured Free',limits:{employees:6},features:['coreAccounting']}]};await api.mount(root,{workspaceId:'owned',backend:{getClient:()=>({rpc:async()=>({data})})}});const all=[];const walk=el=>{all.push(el);for(const child of el.children)walk(child);};walk(root);const texts=all.map(el=>el.textContent).join('\n');assert.match(texts,/<Real Business>/);assert.match(texts,/Unlimited Professional Preview/);assert.match(texts,/Employees: 6/);assert.match(texts,/Recorded administrator reason/);assert.ok(all.some(el=>el.tag==='option'&&el.value==='plan_change'&&el.textContent.includes('Downgrade')));assert.equal(all.filter(el=>el.tag==='form').length,1);});
test('main session client calls only existing customer RPC; forbidden privileged actions rejected',async()=>{const calls=[];const invoke=api.service({rpc:async(...args)=>{calls.push(args);return {data:{billing:false,enforcement:false}};}});await invoke('list');await invoke('submit',{organization_id:'owned',kind:'plan_change',plan_id:'free',reason:'Owner requested downgrade'});assert.deepEqual(calls[0],['customer_subscription_portal',{p_action:'list',p_payload:{}}]);assert.equal(calls[1][1].p_payload.kind,'plan_change');await assert.rejects(invoke('review'));assert.equal(calls.length,2);});
test('errors fail closed without raw database detail or enabling enforcement',async()=>{await assert.rejects(api.service({rpc:async()=>({error:{code:'42501',message:'private database diagnostic'}})})('list'),/workspace owner/);await assert.rejects(api.service({rpc:async()=>({data:{billing:true}})})('list'),/Unexpected/);assert.equal(api.owned({businesses:[{id:'one',name:'Real'}]},'other'),null);});
test('workspace change discards delayed subscription response',async()=>{let finish;const response=new Promise(r=>finish=r);let current=true;const status={setAttribute(){},textContent:''};const root={isConnected:true,ownerDocument:{createElement(){return status;}},replaceChildren(){}};const mounting=api.mount(root,{workspaceId:'old',isCurrent:()=>current,backend:{getClient:()=>({rpc:()=>response})}});current=false;finish({data:{businesses:[{id:'old'}],billing:false,enforcement:false}});await mounting;assert.equal(status.textContent,'Loading subscription information…');});
test('integrated main UI compiles and uses safe DOM text with no second sign-in or token storage',()=>{const source=fs.readFileSync('subscription-customer.js','utf8');new vm.Script(source);assert.doesNotMatch(source,/innerHTML|localStorage|sessionStorage|service_role|access_token|signInWithPassword/);const html=fs.readFileSync('index.html','utf8');assert.match(html,/subscription-customer\.js/);assert.match(html,/DalasiCustomerSubscription\.mount/);assert.doesNotMatch(html,/view\.getDisplayModel\(workspaceId,null/);for(const [,script]of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(script.trim())new vm.Script(script);}});
test('disabled Wave customer interface never publishes receiving details or enables submission',async()=>{class E{constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.isConnected=true;}append(...c){this.children.push(...c);}replaceChildren(...c){this.children=c;}setAttribute(){}addEventListener(){}}const root=new E('div');root.ownerDocument={createElement:t=>new E(t)};const data={billing:false,enforcement:false,businesses:[{id:'owned',name:'Fixture',subscription:{professional_preview:true},requests:[]}],plans:[],wave:{enabled:false,phone:'+2207000000',account_name:'PRIVATE FIXTURE'}};await api.mount(root,{workspaceId:'owned',backend:{getClient:()=>({rpc:async()=>({data})})}});const all=[];const walk=e=>{all.push(e);e.children.forEach(walk);};walk(root);const text=all.map(e=>e.textContent).join(' ');assert.match(text,/do not transfer funds/i);assert.doesNotMatch(text,/PRIVATE FIXTURE|2207000000/);assert.ok(all.some(e=>e.tag==='fieldset'&&e.disabled));assert.match(text,/Pending Verification · Verified · Rejected/);});
test('Wave evidence validation is PNG/JPEG only and bounded; authenticated upload never upserts or verifies payment',async()=>{for(const file of [{type:'text/html',size:12},{type:'image/svg+xml',size:12},{type:'image/png',size:5242881},{type:'image/jpeg',size:0}])assert.throws(()=>api.validateWaveScreenshot(file));const file={type:'image/png',size:12},calls=[];api.validateWaveScreenshot(file);await api.uploadWaveEvidence({storage:{from:b=>({upload:async(...args)=>{calls.push([b,...args]);return {};}})}},async(...args)=>calls.push(args),'owned/invoice/evidence.png','payment',file);assert.equal(calls[0][0],'subscription-wave-evidence');assert.equal(calls[0][3].upsert,false);assert.deepEqual(calls[1],['wave_attach',{id:'payment'}]);assert.equal(calls.length,2);});

test('password recovery takes priority over auto-restored sessions and handles invalid links',()=>{
  const html=fs.readFileSync('index.html','utf8');
  // These are the exact route expressions used by index.html, evaluated with
  // valid, expired and normal URLs to prevent accidental dashboard redirects.
  const start=html.indexOf('  const initialAuthParams = new URLSearchParams(location.search);');
  const end=html.indexOf('  const state = {',start);
  assert.ok(start>=0&&end>start,'recovery route initialization must exist');
  const setup=html.slice(start,end);
  const view=html.match(/    authView: ([^\n]+),\n    authFlowActive: ([^\n]+),\n    authError: ([^\n]+),/);
  assert.ok(view,'recovery state must include forced-auth and invalid-link handling');
  const route=new Function('location',setup+'return {view:('+view[1]+'),active:('+view[2]+'),error:('+view[3]+')};');
  const valid=route({search:'?auth=recovery'});
  assert.deepEqual(valid,{view:'recovery',active:true,error:''});
  const expired=route({search:'?auth=recovery&error=access_denied&error_code=otp_expired'});
  assert.equal(expired.view,'forgot');
  assert.equal(expired.active,true);
  assert.match(expired.error,/invalid or has expired/i);
  const normal=route({search:'/'});
  assert.equal(normal.view,'signin');
  assert.equal(normal.active,false);
  const forced=html.match(/if\((state\.authFlowActive\|\|!state\.session)\)\{app\.innerHTML=authScreen\(\);bindInputs\(\);return;\}/);
  assert.ok(forced,'auth screen must override a session during recovery');
  const hasAuth=new Function('state','return '+forced[1]);
  assert.equal(hasAuth({authFlowActive:true,session:{userId:'recovery-session'}}),true);
  assert.equal(hasAuth({authFlowActive:false,session:{userId:'normal-session'}}),false);
  assert.equal(hasAuth({authFlowActive:false,session:null}),true);
});
test('password update signs out temporary recovery session before showing normal sign-in',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const start=html.indexOf("      if(state.authView==='recovery'){");
  const end=html.indexOf("      const email=String(fd.get('email')",start);
  assert.ok(start>=0&&end>start,'recovery handler exists');
  const recovery=html.slice(start,end);
  const update=recovery.indexOf('await window.DalasiAuth.updatePassword(password)');
  const signout=recovery.indexOf('await window.DalasiAuth.signOut()');
  const clear=recovery.indexOf('state.authFlowActive=false;state.authView=\'signin\'');
  assert.ok(update>=0&&signout>update&&clear>signout,'password update must finish before sign-out and sign-in transition');
  assert.match(html,/else if\(a==='back-signin'\)\{state\.authView='signin';state\.authFlowActive=false;/);
  // Existing full-page script compilation test above guards against JS syntax errors.
});


test('signup uses non-enumerating confirmation guidance for new or existing emails',async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const start=html.indexOf('  async function handleAuth(ev){');
  const end=html.indexOf('  async function handleCompany(ev){',start);
  assert.ok(start>=0&&end>start,'signup handler exists');
  const makeHandler=new Function('state','window','FormData','render','loadOrgState','history','location',html.slice(start,end)+'return handleAuth;');
  class FormDataStub {constructor(target){this.fields=target.fields;}get(key){return this.fields[key];}}
  for(const type of ['new account','existing account hidden by Supabase']){
    const state={authView:'signup',authError:'',authNotice:'',authPendingEmail:'',session:null};
    const window={DalasiAuthFeedback:feedback,DalasiAuth:{signUp:async()=>({needsEmailConfirmation:true,email:'repeat@example.com'})}};
    let rendered=0;
    const handle=makeHandler(state,window,FormDataStub,()=>{rendered++;},()=>{},null,null);
    await handle({preventDefault(){},target:{fields:{name:'Applicant',email:'REPEAT@example.com',password:'safe-example-password'}}});
    assert.equal(state.authView,'signin',type);
    assert.equal(state.authPendingEmail,'repeat@example.com',type);
    assert.equal(state.authNotice,feedback.notices.signup,type);
    assert.match(state.authNotice,/forgot password/i,type);
    assert.doesNotMatch(state.authNotice,/account created/i,type);
    assert.equal(rendered,1,type);
  }
});

test('explicit duplicate signup error routes to sign-in without exposing account details',async()=>{
  const html=fs.readFileSync('index.html','utf8');
  const start=html.indexOf('  async function handleAuth(ev){');
  const end=html.indexOf('  async function handleCompany(ev){',start);
  assert.ok(start>=0&&end>start);
  const makeHandler=new Function('state','window','FormData','render','loadOrgState','history','location',html.slice(start,end)+'return handleAuth;');
  class FormDataStub {constructor(target){this.fields=target.fields;}get(key){return this.fields[key];}}
  const state={authView:'signup',authError:'',authNotice:'',authPendingEmail:'',session:null};
  const window={DalasiAuthFeedback:feedback,DalasiAuth:{signUp:async()=>{throw new Error('User already registered');}}};
  let rendered=0;
  await makeHandler(state,window,FormDataStub,()=>{rendered++;},()=>{},null,null)({preventDefault(){},target:{fields:{name:'Applicant',email:'repeat@example.com',password:'safe-example-password'}}});
  assert.equal(state.authView,'signin');
  assert.equal(state.authNotice,feedback.notices.signup);
  assert.match(state.authNotice,/forgot password/i);
  assert.equal(state.authError,'');
  assert.equal(rendered,1);
});


test('dashboard plan summary trusts only the owned server subscription and preserves Professional Preview',()=>{
  const businesses=[
    {id:'fresh',subscription:{plan_id:'free',status:'active',professional_preview:false}},
    {id:'legacy',subscription:{plan_id:'professional',status:'professional_preview',professional_preview:true}},
    {id:'team',subscription:{plan_id:'standard',status:'active',professional_preview:false}}
  ];
  const data={businesses,billing:false,enforcement:false};
  assert.deepEqual(api.planSummary(data,'fresh'),{label:'Free Plan',detail:'No payment required. Billing is not active.',status:'active'});
  assert.match(api.planSummary(data,'legacy').label,/Professional Preview/);
  assert.equal(api.planSummary(data,'team').label,'Standard Plan');
  assert.equal(api.planSummary(data,'another-workspace').label,'Plan unavailable');
  assert.equal(api.planSummary({businesses:[{id:'fresh'}]},'fresh').label,'Plan unavailable');
  assert.equal(api.planSummary({businesses:[{id:'fresh',subscription:{plan_id:'unexpected'}}]},'fresh').label,'Plan unavailable');
});

test('dashboard plan mount calls only read-only owner RPC, renders plan text safely and provides comparison navigation',async()=>{
  class E {
    constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.isConnected=true;this.dataset={};}
    replaceChildren(...args){this.children=args;}
  }
  const root=new E('section');root.ownerDocument={createElement:tag=>new E(tag)};
  const calls=[];
  const backend={getClient:()=>({rpc:async(...args)=>{calls.push(args);return {data:{businesses:[{id:'owned',subscription:{plan_id:'professional',status:'professional_preview',professional_preview:true}}],billing:false,enforcement:false}};}})};
  await api.mountSummary(root,{backend,workspaceId:'owned'});
  const texts=root.children.map(x=>x.textContent).join(' ');
  assert.match(texts,/CURRENT PLAN/);
  assert.match(texts,/Unlimited Professional Preview/);
  assert.doesNotMatch(texts,/Free Plan/);
  const compare=root.children.find(x=>x.tag==='button');
  assert.equal(compare.textContent,'Compare plans');
  assert.equal(compare.dataset.action,'open-subscription-plans');
  assert.deepEqual(calls,[['customer_subscription_portal',{p_action:'list',p_payload:{}}]]);
});

test('dashboard never labels plan Free on missing record, unauthorized error or mismatched workspace',async()=>{
  class E{constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.isConnected=true;this.dataset={};}replaceChildren(...c){this.children=c;}}
  for(const response of [
    {data:{businesses:[{id:'another',subscription:{plan_id:'free',status:'active'}}],billing:false,enforcement:false}},
    {data:{businesses:[{id:'owned'}],billing:false,enforcement:false}},
    {error:{code:'42501',message:'private database diagnostics'}},
    {data:{businesses:[{id:'owned',subscription:{plan_id:'free',status:'active'}}],billing:true,enforcement:false}}
  ]){
    const root=new E('section');root.ownerDocument={createElement:t=>new E(t)};
    await api.mountSummary(root,{backend:{getClient:()=>({rpc:async()=>response})},workspaceId:'owned'});
    const text=root.children.map(x=>x.textContent).join(' ');
    assert.match(text,/Plan unavailable/);
    assert.doesNotMatch(text,/Free Plan|private database diagnostics/);
  }
});

test('dashboard discards delayed plan responses after workspace switch',async()=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const root={isConnected:true,ownerDocument:{createElement:tag=>({tag,dataset:{},textContent:''})},replaceChildren(...children){this.children=children;}};
  let current=true;
  const promise=api.mountSummary(root,{workspaceId:'first',isCurrent:()=>current,backend:{getClient:()=>({rpc:async()=>pending})}});
  current=false;
  finish({data:{billing:false,enforcement:false,businesses:[{id:'first',subscription:{plan_id:'free',status:'active'}}]}});
  await promise;
  const text=root.children.map(c=>c.textContent).join(' ');
  assert.match(text,/Checking plan/);
  assert.doesNotMatch(text,/Free Plan/);
});

test('dashboard plan card is owner-only, points to actual subscription catalogue, and remains non-enforcing',()=>{
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/state\.role==='owner'\?'<section id="dashboard-subscription-summary"/);
  assert.match(html,/DalasiCustomerSubscription\.mountSummary\(planRoot/);
  assert.match(html,/a==='open-subscription-plans'/);
  assert.match(html,/getElementById\('settings-subscription-section'\)/);
  assert.match(html,/id="customer-subscription-content"/);
  assert.match(require('node:fs').readFileSync('subscription-ui.css','utf8'),/\.subscription-dashboard-card/);
  const source=fs.readFileSync('subscription-customer.js','utf8');
  assert.doesNotMatch(source,/localStorage|sessionStorage|innerHTML|service_role|access_token/);
});
