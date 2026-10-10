const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('./subscription-customer.js');
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
