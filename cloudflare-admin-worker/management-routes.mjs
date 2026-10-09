import {billingDocument} from './billing-documents.mjs';
import {renderManagement} from './management-ui.mjs';
const paths={'/businesses':'businesses','/business':'business','/plans':'plans','/requests':'requests','/audit':'audit','/billing':'billing','/settings':'wave_settings','/wave-evidence':'wave_evidence','/wave-receipt':'wave_receipt'};
const H={'cache-control':'no-store, private','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'};
const CSP="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...H,'content-type':'application/json; charset=utf-8'}});
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v??'');
async function smallBody(request){const reader=request.body?.getReader();if(!reader)return '';let total=0,parts=[];while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>16000){await reader.cancel();throw Error('Body too large');}parts.push(value);}const bytes=new Uint8Array(total);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.byteLength;}return new TextDecoder().decode(bytes);}
export async function handleManagement(request,env){
 const url=new URL(request.url);let view=paths[url.pathname];const mutation=url.pathname==='/manage';
 if(!view&&!mutation)return null;
 if((mutation&&request.method!=='POST')||(!mutation&&request.method!=='GET'))return reply(404,{authorized:false});
 const assertion=request.headers.get('cf-access-jwt-assertion');if(!assertion||assertion.length>16000)return reply(403,{authorized:false});
 if(!env?.ADMIN_MEMBERSHIP_SERVICE?.fetch)return reply(503,{authorized:false,check:'service_binding'});
 let action=view,payload={},offset=0,redirect;
 if(mutation){
  if(request.headers.get('origin')!==url.origin||!['same-origin',null].includes(request.headers.get('sec-fetch-site')))return reply(403,{authorized:false});
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return reply(400,{authorized:false});
  let form;try{form=new URLSearchParams(await smallBody(request));}catch{return reply(400,{authorized:false});}
  action=form.get('action');
  if(action==='review'){if(!uuid(form.get('id')))return reply(400,{authorized:false});payload={id:form.get('id'),decision:form.get('decision'),note:form.get('note')};redirect='/requests?saved=1';}
  else if(action==='save_details'){if(!uuid(form.get('id')))return reply(400,{authorized:false});payload={id:form.get('id'),version:Number(form.get('version')),renewal_date:form.get('renewal_date'),notes:form.get('notes')};redirect='/business?id='+encodeURIComponent(payload.id)+'&saved=1';}
  else if(action==='save_wave_settings'){
   const phone=form.get('phone'),account_name=form.get('account_name')?.trim(),reason=form.get('reason')?.trim();if(!/^\+[1-9][0-9]{7,14}$/.test(phone??'')||!account_name||account_name.length<2||account_name.length>100||!reason||reason.length<10||reason.length>1000||form.get('confirmed')!=='yes')return reply(400,{authorized:false});
   payload={phone,account_name,reason,version:Number(form.get('version')),confirmed:true};redirect='/settings?saved=1';
  }
  else if(action==='review_wave_payment'){
   if(!uuid(form.get('id'))||!['verified','rejected'].includes(form.get('decision')))return reply(400,{authorized:false});const amount=form.get('checked_amount_gmd');if(amount&&!/^[0-9]{1,7}$/.test(amount))return reply(400,{authorized:false});
   payload={id:form.get('id'),version:Number(form.get('version')),decision:form.get('decision'),note:form.get('note'),history_checked:form.get('history_checked')==='yes',checked_reference:form.get('checked_reference'),checked_amount_minor:amount?Number(amount)*100:null};redirect='/billing?saved=1';
  }
  else if(action==='save_price'){
   const price=form.get('annual_price_gmd'),reason=form.get('reason')?.trim();if(!/^[0-9]{1,7}$/.test(price??'')||form.get('confirmed')!=='yes'||!reason||reason.length<10||reason.length>1000)return reply(400,{authorized:false});
   payload={plan_id:form.get('plan_id'),version:Number(form.get('version')),annual_price_gmd:Number(price),currency_code:'GMD',billing_period_months:12,confirmed:true,reason};redirect='/plans?saved=1';
  }
  else if(action==='save_plan'){
   const limits={};for(const k of ['companies','users','employees','invoicesPerMonth','supplierBillsPerMonth']){const value=form.get(k);if(value!==''&&!/^[0-9]{1,7}$/.test(value??''))return reply(400,{authorized:false});limits[k]=value===''?null:Number(value);}
   payload={plan_id:form.get('plan_id'),label:form.get('label'),version:Number(form.get('version')),limits,features:form.getAll('features')};redirect='/plans?saved=1';
  }else return reply(400,{authorized:false});
 }else{
  const value=url.searchParams.get('offset')??'0';if(!/^(0|[1-9][0-9]{0,5})$/.test(value)||Number(value)>100000)return reply(400,{authorized:false});offset=Number(value);
  if(['business','wave_evidence','wave_receipt'].includes(view)){const id=url.searchParams.get('id');if(!uuid(id))return reply(400,{authorized:false});payload={id};}
 }
 let result,data;try{result=await env.ADMIN_MEMBERSHIP_SERVICE.fetch(new Request('https://admin-membership.internal/internal/admin/manage',{method:'POST',headers:{'cf-access-jwt-assertion':assertion,'content-type':'application/json'},body:JSON.stringify({action,payload,offset}),signal:AbortSignal.timeout(35000)}));if(view==='wave_evidence'){if(!result.ok)return reply(result.status===403?403:503,{authorized:false});return new Response(result.body,{headers:{...H,'content-type':result.headers.get('content-type'),'content-disposition':'attachment; filename=wave-evidence.'+(result.headers.get('content-type')==='image/png'?'png':'jpg'),'content-security-policy':"default-src 'none'; sandbox"}});}data=await result.json();}catch{return reply(503,{authorized:false,check:'service_binding'});}
 if(!result.ok)return reply([400,403,409].includes(result.status)?result.status:503,{authorized:false,check:result.status===409?'stale_or_unavailable':result.status===400?'invalid_input':'management_service'});
 if(data?.authorized!==true||!data.management||typeof data.management!=='object')return reply(503,{authorized:false,check:'management_response'});
 if(mutation){if(data.management.saved!==true)return reply(503,{authorized:false});return new Response(null,{status:303,headers:{...H,location:redirect}});}
 if(view==='wave_receipt'){try{return new Response(billingDocument(data.management.invoice,data.management.receipt),{headers:{...H,'content-type':'text/html; charset=utf-8','content-security-policy':CSP}});}catch{return reply(503,{authorized:false});}}
 try{return new Response(renderManagement(view,data.management,{offset,notice:url.searchParams.get('saved')==='1'?'Administrative record saved. Subscription entitlements are unchanged.':''}),{headers:{...H,'content-type':'text/html; charset=utf-8','content-security-policy':CSP}});}catch{return reply(503,{authorized:false,check:'management_response'});}
}
