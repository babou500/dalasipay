/* Shared subscription RPC, using the main application's existing authenticated client.
 * No new session, local subscription record or entitlement writes.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DalasiCustomerSubscription=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function annualPrice(p){return Number.isSafeInteger(p?.annual_price_gmd)&&p.annual_price_gmd>=0&&p.currency_code==='GMD'&&p.billing_period_months===12?'D'+p.annual_price_gmd.toLocaleString('en-GB')+' per year (GMD · 12 months)':'Annual price unavailable';}
 const order=['free','standard','professional'];
 const labels={companies:'Companies',users:'Users',employees:'Employees',invoicesPerMonth:'Invoices / month',supplierBillsPerMonth:'Supplier bills / month'};
 const featureLabel=k=>String(k).replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase());
 function service(client){return async(action,payload={})=>{if(!['list','submit','cancel'].includes(action))throw Error('Unsupported request.');const {data,error}=await client.rpc('customer_subscription_portal',{p_action:action,p_payload:payload});if(error)throw Error(error.code==='55000'?'A request is already pending or no longer available.':error.code==='42501'?'Sign in with the workspace owner account to manage subscriptions.':'Subscription information could not be loaded or saved. Please try again.');if(data?.billing!==undefined&&data.billing!==false||data?.enforcement!==undefined&&data.enforcement!==false)throw Error('Unexpected subscription configuration.');return data;};}
 function owned(data,id){return data?.businesses?.find(b=>b.id===id)??null;}
 async function mount(root,{backend,workspaceId,isCurrent=()=>true}){
  if(!root)return;const active=()=>root.isConnected&&isCurrent();
  const node=(tag,text)=>{const el=root.ownerDocument.createElement(tag);if(text!==undefined)el.textContent=String(text??'Not recorded');return el;};
  const status=node('p','Loading subscription information…');status.setAttribute('role','status');root.replaceChildren(status);
  try{
   const client=backend.getClient()||await backend.connect();const api=service(client);
   async function load(notice=''){
    const data=await api('list');if(!active())return;const business=owned(data,workspaceId);root.replaceChildren();
    const msg=node('p',notice||'Billing and restrictions are disabled. Requests and review decisions do not change your access.');msg.setAttribute('role','status');root.append(msg);
    if(!business){root.append(node('p','Subscription management is available to the owner of this workspace.'));return;}
    const sub=business.subscription;const card=node('div');card.className='subscription-overview';
    card.append(node('h3',business.name),node('p','Workspace: '+business.id),node('p','Registered: '+(business.created_at??'Not recorded')),node('h4',sub?.professional_preview?'Unlimited Professional Preview':featureLabel(sub?.plan_id??'Subscription not recorded')),node('p','Status: '+(sub?.status??'Not recorded')));root.append(card);
    const plans=[...(data.plans||[])].sort((a,b)=>order.indexOf(a.plan_id)-order.indexOf(b.plan_id));
    const catalogue=node('div');catalogue.className='subscription-plan-grid';
    for(const plan of plans){const article=node('article');article.className='subscription-plan-card';article.append(node('h4',plan.label),node('p',annualPrice(plan)),node('p','Draft plan — no payments or restrictions are active.'));const list=node('ul');for(const [key,label]of Object.entries(labels)){if(plan.limits&&Object.hasOwn(plan.limits,key))list.append(node('li',label+': '+(plan.limits[key]===null?'Unlimited':plan.limits[key])));}for(const feature of plan.features||[])list.append(node('li',featureLabel(feature)));article.append(list);catalogue.append(article);}root.append(node('h3','Available plans'),catalogue);
    const form=node('form');form.className='subscription-request-form';
    const field=(label,name,type,choices=[])=>{const wrap=node('label',label);const el=node(type);el.name=name;for(const [value,title]of choices){const option=node('option',title);option.value=value;el.append(option);}wrap.append(el);form.append(wrap);return el;};
    field('Request type','kind','select',[['upgrade','Upgrade'],['plan_change','Downgrade / plan change'],['renewal','Renewal']]);const plan=field('Requested plan','plan_id','select',plans.map(p=>[p.plan_id,p.label]));if(plans.some(p=>p.plan_id===sub?.plan_id))plan.value=sub.plan_id;
    const reason=field('Reason','reason','textarea');reason.required=true;reason.minLength=10;reason.maxLength=1000;
    const submit=node('button','Submit request');submit.className='primary';submit.type='submit';submit.disabled=!plans.length||business.requests.some(r=>r.status==='pending');form.append(submit);if(submit.disabled)form.append(node('p','A pending request is awaiting administrator review, or the plan catalogue is unavailable.'));
    form.addEventListener('submit',async event=>{event.preventDefault();if(!active()||submit.disabled)return;submit.disabled=true;try{const fields=new FormData(form);await api('submit',{organization_id:workspaceId,kind:fields.get('kind'),plan_id:fields.get('plan_id'),reason:fields.get('reason')});await load('Request submitted. Your plan and unlimited Preview access are unchanged.');}catch(error){if(active()){msg.textContent=error.message;submit.disabled=false;}}});root.append(node('h3','Request a subscription change'),form,node('h3','Previous requests'));
    if(!business.requests.length)root.append(node('p','No subscription requests recorded.'));
    for(const req of business.requests){const item=node('article');item.className='subscription-overview';item.append(node('h4',featureLabel(req.request_kind)+' · '+req.requested_plan),node('p','Status: '+req.status+' · '+req.created_at),node('p',req.reason),node('p','Administrator reason: '+(req.review_note??'Awaiting review')));if(req.status==='pending'){const cancel=node('button','Cancel request');cancel.type='button';cancel.className='secondary';cancel.addEventListener('click',async()=>{if(!active())return;cancel.disabled=true;try{await api('cancel',{id:req.id});await load('Request cancelled. Your access is unchanged.');}catch(error){if(active()){msg.textContent=error.message;cancel.disabled=false;}}});item.append(cancel);}root.append(item);}
    root.append(node('h3','Billing history'));const bills=(data.billing_history||[]).filter(i=>i.organization_id===workspaceId);if(!bills.length)root.append(node('p','No subscription invoices or payments recorded.'));for(const bill of bills)root.append(node('p',bill.number+' · '+bill.payment_status+' · GMD '+(bill.amount_minor/100).toLocaleString('en-GB')+' · Renewal '+bill.service_end));
    const refresh=node('button','Refresh subscription information');refresh.type='button';refresh.className='secondary';refresh.addEventListener('click',async()=>{refresh.disabled=true;try{await load();}catch(error){if(active()){msg.textContent=error.message;refresh.disabled=false;}}});root.append(refresh);
   }
   await load();
  }catch(error){if(active())status.textContent=error.message;}
 }
 return Object.freeze({service,owned,mount,annualPrice});
});
