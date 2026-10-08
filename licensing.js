(function(){
'use strict';

const PLANS={
  free:{
    id:'free',name:'Free',tagline:'For micro and very small businesses',
    limits:{users:2,employees:5,monthlyInvoices:25,monthlyBills:25,companies:1},
    features:['Core accounting','Customer invoices & receipts','Supplier bills & payments','Payroll up to 5 employees','Cash & bank','Basic financial reports','VAT-ready records']
  },
  standard:{
    id:'standard',name:'Standard',tagline:'For growing small businesses',
    limits:{users:5,employees:25,monthlyInvoices:null,monthlyBills:null,companies:1},
    features:['Everything in Free','Unlimited invoices & bills','Payroll up to 25 employees','Recurring billing','Budgets & projects','Advanced Excel reports']
  },
  professional:{
    id:'professional',name:'Professional',tagline:'For businesses needing stronger controls',
    limits:{users:null,employees:null,monthlyInvoices:null,monthlyBills:null,companies:null},
    features:['Everything in Standard','Full payroll','Maker-checker approvals','Month & year close controls','Advanced tax & compliance','Audit and control workflows']
  }
};

function normalize(raw,legacy=true){
  const x=raw&&typeof raw==='object'?raw:{};
  const plan=PLANS[x.plan]?x.plan:(legacy?'professional':'free');
  return {
    plan,
    status:x.status|| (legacy?'preview':'active'),
    licenseKey:x.licenseKey||'',
    activatedAt:x.activatedAt||'',
    expiresAt:x.expiresAt||'',
    source:x.source|| (legacy?'legacy-preview':'workspace'),
    lastCheckedAt:x.lastCheckedAt||'',
    note:x.note||''
  };
}
function planFor(state){return PLANS[normalize(state.license,true).plan]||PLANS.free}
function monthPrefix(){return new Date().toISOString().slice(0,7)}
function usage(state){
  const period=monthPrefix();
  const invoices=(state.customerInvoices||[]).filter(x=>String(x.issueDate||x.createdAt||'').slice(0,7)===period).length;
  const bills=(state.businessBills||[]).filter(x=>String(x.invoiceDate||x.createdAt||'').slice(0,7)===period).length;
  const employees=(state.employees||[]).filter(x=>(x.status||'Active')!=='Exited').length;
  let users=0;
  try{const members=state.org&&window.DalasiAuth?window.DalasiAuth.listMembers(state.org.id):[],pending=state.org&&window.DalasiAuth?window.DalasiAuth.listInvitations(state.org.id).filter(x=>x.status==='Pending'):[];users=members.length+pending.length}catch{}
  return {users,employees,monthlyInvoices:invoices,monthlyBills:bills,companies:(state.organizations||[]).length||1};
}
function limitStatus(state,key){
  const p=planFor(state),u=usage(state),limit=p.limits[key],used=u[key]||0;
  return {key,used,limit,unlimited:limit==null,remaining:limit==null?null:Math.max(0,limit-used),allowed:limit==null||used<limit};
}
function canCreate(state,key){
  const lic=normalize(state.license,true);
  if(lic.status==='preview'&&lic.plan==='professional')return {allowed:true,preview:true};
  const s=limitStatus(state,key);return {allowed:s.allowed,...s};
}
function featureAllowed(state,feature){
  const plan=planFor(state).id;
  const order={free:0,standard:1,professional:2};
  const min={
    payroll:'standard',recurring:'standard',budgets:'standard',projects:'standard',
    makerChecker:'professional',monthClose:'professional',yearClose:'professional',
    advancedTax:'professional',auditControls:'professional'
  }[feature]||'free';
  return order[plan]>=order[min];
}
function label(state){
  const l=normalize(state.license,true),p=PLANS[l.plan];
  return p.name+(l.status==='preview'?' Preview':'');
}
function bar(used,limit){
  if(limit==null)return 0;
  return Math.max(0,Math.min(100,Math.round((used/Math.max(1,limit))*100)));
}
function limitCard(state,key,title){
  const s=limitStatus(state,key),value=s.unlimited?String(s.used)+' / Unlimited':String(s.used)+' / '+s.limit;
  return '<div class="license-usage-item"><div><span>'+title+'</span><b>'+value+'</b></div><i><em style="width:'+(s.unlimited?0:bar(s.used,s.limit))+'%"></em></i><small>'+(s.unlimited?'No plan limit':s.remaining+' remaining')+'</small></div>';
}
function settingsSection(state,h){
  const esc=h.esc,icon=h.icon,l=normalize(state.license,true),p=PLANS[l.plan],preview=l.status==='preview';
  return '<section id="settings-license-section" class="surface setting-section license-section">'+
    '<div class="section-head"><div><h3>Plan & licensing</h3><p>Manage the DalasiPay edition and understand the limits applied to this workspace.</p></div><span class="license-plan-pill '+p.id+'">'+esc(label(state))+'</span></div>'+
    (preview?'<div class="license-preview-banner">'+icon('shield',16)+'<div><b>Professional Preview</b><p>This existing workspace remains fully enabled while licensing is being introduced. No current accounting or payroll feature has been disabled.</p></div></div>':'')+
    '<div class="license-current"><div><span>CURRENT PLAN</span><h4>'+esc(p.name)+'</h4><p>'+esc(p.tagline)+'</p></div><div><span>LICENSE STATUS</span><b>'+esc(l.status==='preview'?'Preview access':l.status.charAt(0).toUpperCase()+l.status.slice(1))+'</b><small>'+(l.expiresAt?'Expires '+esc(l.expiresAt):preview?'No expiry during preview':'Workspace entitlement')+'</small></div></div>'+
    '<div class="license-usage-grid">'+limitCard(state,'users','Users')+limitCard(state,'employees','Active employees')+limitCard(state,'monthlyInvoices','Invoices this month')+limitCard(state,'monthlyBills','Supplier bills this month')+'</div>'+
    '<div class="license-plan-grid">'+Object.values(PLANS).map(x=>'<article class="license-plan-card '+(x.id===p.id?'current':'')+'"><div class="license-plan-head"><div><span>'+esc(x.name.toUpperCase())+'</span><h4>'+esc(x.name)+'</h4></div>'+(x.id===p.id?'<b>Current</b>':'')+'</div><p>'+esc(x.tagline)+'</p><ul>'+x.features.map(f=>'<li>'+icon('check',12)+' '+esc(f)+'</li>').join('')+'</ul><div class="license-plan-limits"><span>'+(x.limits.users==null?'Unlimited users':x.limits.users+' users')+'</span><span>'+(x.limits.employees==null?'Unlimited employees':x.limits.employees+' employees')+'</span><span>'+(x.limits.monthlyInvoices==null?'Unlimited invoices':x.limits.monthlyInvoices+' invoices/month')+'</span></div></article>').join('')+'</div>'+
    '<div class="license-footnote"><b>Commercial activation is not connected yet.</b><span>The plan engine and limits are now separated from accounting logic. Payment-provider activation and license-key verification can be connected later without changing transaction records.</span></div>'+
  '</section>';
}
window.DalasiLicensing={PLANS,normalize,planFor,usage,limitStatus,canCreate,featureAllowed,label,settingsSection};
})();