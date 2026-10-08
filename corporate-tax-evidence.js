(function(){
'use strict';
const yearOf=v=>String(v||'').slice(0,4);
function rows(state,year){return (state.corporateTaxAdjustments||[]).filter(x=>String(x.year)===String(year))}
function evidence(state,year){
 const items=rows(state,year);
 const missing=items.filter(x=>!String(x.description||'').trim()||!String(x.evidenceReference||'').trim()||(x.kind==='Loss brought forward'&&!/^\d{4}$/.test(String(x.sourceYear||''))));
 return {total:items.length,complete:items.length-missing.length,missing,ready:missing.length===0};
}
function installGate(){
 const base=window.DalasiCorporateTax;if(!base||base.__evidenceGate)return false;
 const originalEvidenceReady=base.evidenceReady,originalReview=base.reviewReturn,originalReady=base.markReady,originalFile=base.fileReturn,originalRender=base.render;
 base.evidenceReady=function(state,year){const g=originalEvidenceReady(state,year),e=evidence(state,year);return {...g,adjustmentEvidence:e,canReview:g.canReview&&e.ready,canReady:g.canReady&&e.ready,canFile:g.canFile&&e.ready}};
 base.reviewReturn=function(year,state,ctx){if(!evidence(state,year).ready){ctx.toast('Complete supporting evidence for every tax adjustment before review.');return}return originalReview(year,state,ctx)};
 base.markReady=function(year,state,ctx){if(!evidence(state,year).ready){ctx.toast('Complete supporting evidence for every tax adjustment before marking ready to file.');return}return originalReady(year,state,ctx)};
 base.fileReturn=function(ev,state,ctx){const year=String(state.citFileYear||'');if(!evidence(state,year).ready){ev.preventDefault();ctx.toast('Tax adjustment evidence is incomplete. Complete it before filing.');return}return originalFile(ev,state,ctx)};
 const originalModal=base.adjustmentModal,originalSave=base.saveAdjustment;
 base.adjustmentModal=function(state,h){
  const html=originalModal(state,h);
  return html.replace('</div><div class="modal-actions">',h.field('Evidence reference','<input name="evidenceReference" required placeholder="Voucher, certificate, schedule or document reference">')+h.field('Source year (for brought-forward losses)','<input name="sourceYear" inputmode="numeric" maxlength="4" placeholder="e.g. 2025">')+h.field('Evidence note','<textarea name="evidenceNote" rows="3" placeholder="Optional supporting note"></textarea>')+'</div><div class="modal-actions">');
 };
 base.saveAdjustment=function(ev,state,ctx){
  const fd=new FormData(ev.target),kind=String(fd.get('kind')||''),evidenceReference=String(fd.get('evidenceReference')||'').trim(),sourceYear=String(fd.get('sourceYear')||'').trim();
  if(evidenceReference.length<2){ev.preventDefault();ctx.toast('Enter a supporting evidence reference.');return}
  if(kind==='Loss brought forward'&&!/^\d{4}$/.test(sourceYear)){ev.preventDefault();ctx.toast('Enter the source tax year for the brought-forward loss.');return}
  const before=(state.corporateTaxAdjustments||[]).length;
  originalSave(ev,state,ctx);
  const item=(state.corporateTaxAdjustments||[])[0];
  if(item&&(state.corporateTaxAdjustments||[]).length>before){item.evidenceReference=evidenceReference;item.sourceYear=kind==='Loss brought forward'?sourceYear:'';item.evidenceNote=String(fd.get('evidenceNote')||'').trim();ctx.audit?.('tax.corporate_adjustment_evidence_added',{year:item.year,adjustmentId:item.id,evidenceReference});ctx.save();ctx.render();}
 };
 base.render=function(state,h){
  const year=String(state.corporateTaxYear||yearOf(state.currentPeriod)),e=evidence(state,year),items=rows(state,year);
  let html=originalRender(state,h);
  const summary='<div class="accounting-summary"><div class="surface"><span>Tax adjustment items</span><b>'+e.total+'</b><small>reconciliation schedule</small></div><div class="surface"><span>Evidence complete</span><b>'+e.complete+'</b><small>supported items</small></div><div class="surface"><span>Evidence missing</span><b>'+e.missing.length+'</b><small>'+(e.ready?'nothing outstanding':'review blocked')+'</small></div><div class="surface"><span>Evidence status</span><b>'+(e.ready?'Complete':'Action required')+'</b><small>before tax review</small></div></div>';
  const details=items.length?'<div class="table-scroll"><table><thead><tr><th>TYPE</th><th>TAX BASIS</th><th>EVIDENCE</th><th>SOURCE YEAR</th><th>STATUS</th></tr></thead><tbody>'+items.map(x=>{const ok=String(x.description||'').trim()&&String(x.evidenceReference||'').trim()&&(x.kind!=='Loss brought forward'||/^\d{4}$/.test(String(x.sourceYear||'')));return '<tr><td>'+String(x.kind||'')+'</td><td>'+String(x.description||'')+'</td><td>'+String(x.evidenceReference||'—')+'</td><td>'+String(x.sourceYear||'—')+'</td><td>'+(ok?'Supported':'Missing evidence')+'</td></tr>'}).join('')+'</tbody></table></div>':'';
  const panel='<section class="surface employee-card"><div class="table-tools"><div><h3>Tax adjustment evidence</h3><p>Supporting references for add-backs, deductions, capital allowances, losses and tax credits.</p></div>'+h.pill(e.ready?'EVIDENCE COMPLETE':'EVIDENCE MISSING',e.ready?'ready':'warning')+'</div>'+summary+details+'</section>';
  const anchor='<section class="surface employee-card"><div class="table-tools"><div><h3>Quarterly and annual payment record</h3>';
  if(html.includes(anchor))html=html.replace(anchor,panel+anchor);
  return html;
 };
 base.__evidenceGate=true;return true;
}
function install(){if(!installGate())setTimeout(install,0)}
window.DalasiCorporateTaxEvidence={version:'1.0.0',yearOf,rows,evidence,install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
