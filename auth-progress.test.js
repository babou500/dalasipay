const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
function extract(startMarker,endMarker){
  const start=html.indexOf(startMarker),end=html.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start,'auth function markers exist');
  return html.slice(start,end);
}
function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}
function setup(flow='signin'){
  const pending=deferred(),calls=[],renders=[],loads=[];
  const submit={disabled:false,innerHTML:'Sign in'};
  const email={disabled:false},password={disabled:false},nav={disabled:false};
  const progress={hidden:true,textContent:''};
  const previous={hidden:false};
  const card={
    querySelectorAll(sel){
      if(sel==='button, input, select, textarea')return [submit,email,password,nav];
      if(sel==='.auth-notice, .auth-error, .auth-next-steps')return [previous];
      return [];
    }
  };
  const attrs=new Map();
  const form={
    fields:{email:' OWNER@example.com ',password:'strong-password',name:'Owner'},
    querySelector(sel){return sel==='.auth-submit'?submit:sel==='#auth-progress'?progress:null;},
    closest(sel){return sel==='.auth-card'?card:null;},
    setAttribute(key,value){attrs.set(key,value);},
    removeAttribute(key){attrs.delete(key);}
  };
  class FormDataStub{constructor(target){this.fields=target.fields;}get(key){return this.fields[key];}}
  const auth={
    signIn:async p=>{calls.push({kind:'signin',args:p});return pending.promise;},
    signUp:async p=>{calls.push({kind:'signup',args:p});return pending.promise;},
    resendConfirmation:async p=>{calls.push({kind:'confirmation',args:p});return pending.promise;},
    requestPasswordReset:async p=>{calls.push({kind:'forgot',args:p});return pending.promise;},
    updatePassword:async p=>{calls.push({kind:'recovery',args:p});return pending.promise;},
    signOut:async()=>{calls.push({kind:'signout'});}
  };
  const state={authView:flow,authSubmitting:false,authError:'old error',authNotice:'old notice',authPendingEmail:'',session:null,org:null,organizations:[]};
  const win={DalasiAuth:auth,DalasiAuthFeedback:{feedback:f=>({notice:f==='signup'?'Check for confirmation if needed.':'If available, check your inbox.',error:f==='signin'?'Unable to sign in.':'Unable to complete request.'})}};
  const handler=new Function('state','window','FormData','render','loadOrgState','history','location',
    extract('  async function handleAuth(ev){','  async function handleCompany(ev){')+'return handleAuth;')(
    state,win,FormDataStub,()=>{renders.push(1);},()=>{loads.push(1);},
    {replaceState(){}},{pathname:'/'}
  );
  return {state,submit,email,password,nav,progress,previous,attrs,form,calls,renders,loads,pending,
    start:()=>handler({preventDefault(){},target:form})
  };
}
test('sign-in immediately announces progress and blocks duplicate submissions',async()=>{
  const t=setup();
  const first=t.start();
  const repeated=t.start();await repeated;
  assert.equal(t.state.authSubmitting,true);
  assert.equal(t.submit.disabled,true);
  assert.equal(t.email.disabled,true);
  assert.equal(t.nav.disabled,true);
  assert.match(t.submit.innerHTML,/auth-spinner.*Signing in…/);
  assert.equal(t.progress.hidden,false);
  assert.match(t.progress.textContent,/Signing in/);
  assert.equal(t.attrs.get('aria-busy'),'true');
  assert.equal(t.previous.hidden,true);
  assert.equal(t.calls.length,1);
  assert.equal(t.renders.length,0,'must not replace entered credentials while waiting');
  t.pending.resolve({userId:'test'});
  await first;
  assert.deepEqual(t.calls.map(x=>x.kind),['signin']);
  assert.equal(t.state.session.userId,'test');
  assert.equal(t.loads.length,1);
  assert.equal(t.renders.length,1);
  assert.equal(t.state.authSubmitting,false);
  assert.equal(t.submit.disabled,false);
  assert.equal(t.email.disabled,false);
  assert.equal(t.nav.disabled,false);
  assert.equal(t.progress.hidden,true);
  assert.equal(t.attrs.has('aria-busy'),false);
});
test('auth failure ends spinner, unlocks form, and renders a safe retry message',async()=>{
  const t=setup('signin');
  const first=t.start();t.pending.reject(new Error('INTERNAL PRIVATE ERROR'));await first;
  assert.equal(t.state.authSubmitting,false);
  assert.equal(t.submit.disabled,false);
  assert.equal(t.password.disabled,false);
  assert.equal(t.progress.hidden,true);
  assert.equal(t.attrs.has('aria-busy'),false);
  assert.equal(t.state.authError,'Unable to sign in.');
  assert.doesNotMatch(t.state.authError,/PRIVATE/);
  assert.equal(t.renders.length,1);
  const again=t.start();
  assert.equal(t.calls.length,2,'request is retryable once prior attempt finishes');
  t.pending.resolve({userId:'retry'});await again;
});
test('registration uses a neutral busy message and preserves confirmation protection',async()=>{
  const t=setup('signup');
  const first=t.start();
  assert.match(t.progress.textContent,/Processing registration/);
  assert.doesNotMatch(t.progress.textContent,/created|already registered|email sent/i);
  t.pending.resolve({needsEmailConfirmation:true});await first;
  assert.equal(t.state.authView,'signin');
  assert.equal(t.state.session,null);
  assert.match(t.state.authNotice,/confirmation/i);
  assert.equal(t.state.authSubmitting,false);
  assert.equal(t.calls.length,1);
});
test('recovery, resend confirmation and password reset each show their own status',async()=>{
  for(const [flow,fragment] of [['forgot','password reset'],['confirmation','confirmation'],['recovery','Updating password']]){
    const t=setup(flow),first=t.start();
    assert.match(t.progress.textContent,new RegExp(fragment,'i'));
    assert.equal(t.submit.disabled,true);
    t.pending.resolve({});
    await first;
    assert.equal(t.state.authSubmitting,false);
    assert.equal(t.progress.hidden,true);
    assert.equal(t.submit.disabled,false);
    assert.equal(t.renders.length,1);
  }
});
test('all five auth screens provide accessible live progress status and reduced-motion spinner',()=>{
  const render=new Function('state','window','field','icon','esc',
    extract('  function authScreen(){','  function onboardingScreen(')+'return authScreen;');
  const state={authView:'signin',authPendingEmail:'',authNotice:'',authError:''};
  const win={DalasiProduction:{configured:()=>true},DalasiAuthFeedback:{notices:{signup:'safe signup notice'}}};
  for(const flow of ['signin','signup','forgot','confirmation','recovery']){
    state.authView=flow;
    const screen=render(state,win,(label,field)=>field,()=>'',value=>String(value))();
    assert.match(screen,/<form id="auth-form">[\s\S]*id="auth-progress" role="status" aria-live="polite" hidden/);
    assert.match(screen,/<button class="primary auth-submit" type="submit">/);
  }
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)\{\.auth-spinner/);
  assert.match(html,/if\(state\.authSubmitting\)return;/);
});
