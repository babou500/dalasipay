const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const feedback=require('./registration-feedback.js');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
function setup(response,flow='signup'){
  const calls=[];let writes=0,bootstraps=0,loads=0;
  const client={auth:{
    signUp:async args=>{calls.push(['signup',args]);return response;},
    resend:async args=>{calls.push(['resend',args]);return response;},
    resetPasswordForEmail:async(...args)=>{calls.push(['reset',...args]);return response;},
    signInWithPassword:async args=>{calls.push(['signin',args]);return response;}
  }};
  const window={DALASIPAY_CONFIG:{mode:'supabase',supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'sb_publishable_fixture'},location:{href:'https://app.example/?auth=signup'},supabase:{createClient:()=>client},DalasiAuthFeedback:feedback,DalasiProduction:{bootstrap:async()=>{bootstraps++;}}};
  vm.runInNewContext(scripts.find(script=>script.includes('const repository={')), {window,URL});
  window.DalasiBackend.repository.upsertProfile=async()=>{writes++;};
  const start=html.indexOf('  async function signUp({name,email,password}){');
  const end=html.indexOf('  async function updatePassword(password){',start);
  const session={userId:'authenticated-user'};
  window.DalasiAuth=new Function('CONFIG','window','normalizeEmail','getSession',html.slice(start,end)+'return {signUp,signIn,resendConfirmation,requestPasswordReset};')({mode:'supabase'},window,email=>String(email).trim().toLowerCase(),()=>session);
  const state={authView:flow,authNotice:'',authError:'',authPendingEmail:'',session:null};
  const handlerStart=html.indexOf('  async function handleAuth(ev){');
  const handlerEnd=html.indexOf('  async function handleCompany(ev){',handlerStart);
  class FormDataStub{constructor(target){this.fields=target.fields;}get(key){return this.fields[key];}}
  const handler=new Function('state','window','FormData','render','loadOrgState','history','location',html.slice(handlerStart,handlerEnd)+'return handleAuth;')(state,window,FormDataStub,()=>{},()=>{loads++;},null,null);
  return {state,calls,run:()=>handler({preventDefault(){},target:{fields:{name:'Applicant',email:' PERSON@example.com ',password:'strong-example-password'}}}),counts:()=>({writes,bootstraps,loads})};
}

test('real Supabase adapter and signup UI make new, masked existing, unconfirmed and duplicate responses indistinguishable',async()=>{
  const responses=[
    {data:{user:{id:'new-user',identities:[{provider:'email'}]},session:null},error:null},
    {data:{user:{id:'obfuscated-user',identities:[]},session:null},error:null},
    {data:{user:{id:'unconfirmed-user',email_confirmed_at:null},session:null},error:null},
    {data:null,error:{code:'user_already_exists',message:'User already registered: PRIVATE CUSTOMER'}},
    {data:null,error:{code:'email_exists',message:'PRIVATE CUSTOMER'}},
  ];
  for(const response of responses){
    const app=setup(response);await app.run();
    assert.equal(app.state.authNotice,feedback.notices.signup);
    assert.equal(app.state.authView,'signin');assert.equal(app.state.authError,'');assert.equal(app.state.session,null);
    assert.equal(app.state.authPendingEmail,'person@example.com');
    assert.deepEqual(app.counts(),{writes:0,bootstraps:0,loads:0});
    assert.equal(app.calls.length,1);assert.equal(app.calls[0][1].email,'person@example.com');
    assert.equal(app.calls[0][1].options.emailRedirectTo,'https://app.example/?auth=confirmed');
  }
});

test('signup without a session never grants workspace access; authenticated signup preserves existing bootstrap',async()=>{
  const pending=setup({data:null,error:null});await pending.run();assert.equal(pending.state.session,null);assert.equal(pending.state.authNotice,feedback.notices.signup);
  const signedIn=setup({data:{user:{id:'authenticated-user'},session:{user:{id:'authenticated-user'}}},error:null});await signedIn.run();
  assert.equal(signedIn.state.session.userId,'authenticated-user');assert.deepEqual(signedIn.counts(),{writes:1,bootstraps:1,loads:1});
});

test('SMTP, rate limit and network failures do not claim creation/delivery or reveal raw errors',async()=>{
  for(const flow of ['signup','forgot','confirmation']){
    for(const error of [{code:'unexpected_failure',message:'SMTP PRIVATE CUSTOMER'}, {code:'over_email_send_rate_limit',message:'PRIVATE CUSTOMER'}, {name:'AuthRetryableFetchError',message:'PRIVATE CUSTOMER'}, {code:'email_not_confirmed',message:'PRIVATE CUSTOMER'}]){
      const app=setup({data:null,error},flow);await app.run();
      assert.equal(app.state.authNotice,feedback.notices[flow]);assert.equal(app.state.authError,'');
      assert.doesNotMatch(app.state.authNotice,/account created|email (?:sent|resent)|PRIVATE CUSTOMER/i);
      assert.match(app.state.authNotice,/try again later/i);assert.deepEqual(app.counts(),{writes:0,bootstraps:0,loads:0});
    }
  }
});

test('reset and confirmation success remain conditional and preserve Supabase methods and redirect targets',async()=>{
  for(const flow of ['forgot','confirmation']){
    const app=setup({data:{},error:null},flow);await app.run();
    assert.equal(app.state.authNotice,feedback.notices[flow]);assert.equal(app.calls.length,1);
    if(flow==='forgot'){assert.equal(app.calls[0][0],'reset');assert.equal(app.calls[0][2].redirectTo,'https://app.example/?auth=recovery');}
    else{assert.equal(app.calls[0][0],'resend');assert.equal(app.calls[0][1].type,'signup');assert.equal(app.calls[0][1].options.emailRedirectTo,'https://app.example/?auth=confirmed');}
  }
});

test('sign-in failures for missing, existing and unconfirmed accounts share one safe error',async()=>{
  for(const code of ['invalid_credentials','user_not_found','email_not_confirmed','unexpected_failure']){
    const app=setup({data:null,error:{code,message:'PRIVATE CUSTOMER'}},'signin');await app.run();
    assert.equal(app.state.authError,feedback.feedback('signin').error);assert.equal(app.state.authNotice,'');assert.equal(app.state.session,null);
    assert.deepEqual(app.counts(),{writes:0,bootstraps:0,loads:0});
  }
});

test('input validation gives safe actionable errors without copying provider messages',async()=>{
  for(const code of ['weak_password','email_address_invalid','validation_failed']){
    const app=setup({data:null,error:{code,message:'PRIVATE CUSTOMER'}},'signup');await app.run();
    assert.equal(app.state.authView,'signup');assert.equal(app.state.authNotice,'');assert.ok(app.state.authError);assert.doesNotMatch(app.state.authError,/PRIVATE CUSTOMER/);
  }
});

test('confirmation is available before signup and asks for the current email instead of reusing an old field',()=>{
  const start=html.indexOf('  function authScreen(){');const end=html.indexOf('  function onboardingScreen(',start);
  const authScreen=new Function('state','window','field','icon','esc',html.slice(start,end)+'return authScreen;')({authView:'signin',authPendingEmail:'',authError:'',authNotice:''},{DalasiProduction:{configured:()=>true}},(label,content)=>label+content,()=>'',value=>String(value));
  assert.match(authScreen(),/data-action="resend-confirmation"/);
  assert.match(html,/else if\(a==='resend-confirmation'\)\{state.authView='confirmation'/);
  assert.doesNotMatch(html,/Email confirmed\. You can sign in now\.|serviceWorker\.register/);
});

test('Cloudflare package includes feedback and revalidation headers; CI includes auth tests',()=>{
  const headers=fs.readFileSync('cloudflare-main/_headers','utf8');
  assert.match(headers,/\/index\.html\s+Cache-Control: no-cache, must-revalidate/);
  assert.match(headers,/\/registration-feedback\.js\s+Cache-Control: no-cache, must-revalidate/);
  assert.match(fs.readFileSync('cloudflare-main/prepare-assets.mjs','utf8'),/writeFile\(new URL\('_headers',out\)/);
  assert.match(html,/registration-feedback\.js\?v=/);
  assert.match(fs.readFileSync('.github/workflows/licensing-checks.yml','utf8'),/registration-feedback\.test\.js/);
});


test('post-signup screen presents returning and new customer paths without asserting account existence',()=>{
  const begin=html.indexOf('  function authScreen(){'),end=html.indexOf('  function onboardingScreen(',begin);
  assert.ok(begin>=0&&end>begin);
  const render=new Function('state','window','field','icon','esc',html.slice(begin,end)+'return authScreen;');
  const makeScreen=(notice)=>render(
    {authView:'signin',authPendingEmail:'returning@example.com',authError:'',authNotice:notice},
    {DalasiAuthFeedback:feedback,DalasiProduction:{configured:()=>true}},
    (label,markup)=>label+markup,
    ()=>'',value=>String(value)
  )();
  const result=makeScreen(feedback.notices.signup);
  assert.match(result,/Choose how to continue/);
  assert.match(result,/Already have a DalasiPay account\?/);
  assert.match(result,/Sign in with your existing password/);
  assert.match(result,/New to DalasiPay\?/);
  assert.match(result,/confirmation email was sent/);
  for(const action of ['back-signin','forgot-password','resend-confirmation'])
    assert.match(result,new RegExp('data-action="'+action+'"'));
  assert.doesNotMatch(result,/Account created|This email is already registered/);
  const normal=makeScreen('');
  assert.doesNotMatch(normal,/auth-next-steps/);
  assert.match(normal,/Welcome back/);
});

test('outcome screen is the same for masked existing, new and unconfirmed accounts',async()=>{
  for(const response of [
    {data:{user:{id:'new',identities:[{provider:'email'}]},session:null},error:null},
    {data:{user:{id:'masked',identities:[]},session:null},error:null},
    {data:{user:{id:'unconfirmed',email_confirmed_at:null},session:null},error:null},
    {data:null,error:{code:'user_already_exists',message:'PRIVATE CUSTOMER'}}
  ]){
    const app=setup(response);
    await app.run();
    assert.equal(app.state.authView,'signin');
    assert.equal(app.state.authNotice,feedback.notices.signup);
    assert.deepEqual(app.counts(),{writes:0,bootstraps:0,loads:0});
  }
});
