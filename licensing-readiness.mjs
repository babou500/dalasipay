/* Read-only licensing readiness signals; no transaction decisions. */
export function planReadiness(observation){
 if(!observation?.ok || observation.enforcementActive !== false)return {ready:false,signals:[]};
 const signals=Object.entries(observation.usage||{}).map(([key,item])=>{
  const count=item?.count,limit=item?.limit;
  if(limit===null)return {key,state:'unlimited'};
  if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(limit)||limit<0)return {key,state:'unverified'};
  return {key,state:count>=limit?'at_limit':count>=limit*0.8?'approaching':'within_limit',remaining:Math.max(0,limit-count)};
 });
 return {ready:!signals.some(x=>x.state==='unverified'),signals,enforcementActive:false};
}