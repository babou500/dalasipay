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
 const originalEvidenceReady=base.evidenceReady,originalReview=base.reviewReturn,originalReady=base.markReady,originalFile=base.fileReturn;
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
  if(kind==='Loss brought forward'&&!/^\\d{4}$/.test(sourceYear)){ev.preventDefault();ctx.toast('Enter the source tax year for the brought-forward loss.');return}
  const before=(state.corporateTaxAdjustments||[]).length;
  originalSave(ev,state,ctx);
  const item=(state.corporateTaxAdjustments||[])[0];
  if(item&&(state.corporateTaxAdjustments||[]).length>before){item.evidenceReference=evidenceReference;item.sourceYear=kind==='Loss brought forward'?sourceYear:'';item.evidenceNote=String(fd.get('evidenceNote')||'').trim();ctx.audit?.('tax.corporate_adjustment_evidence_added',{year:item.year,adjustmentId:item.id,evidenceReference});ctx.save();}
 };
 base.__evidenceGate=true;return true;
}
function install(){if(!installGate())setTimeout(install,0)}
window.DalasiCorporateTaxEvidence={version:'1.0.0',yearOf,rows,evidence,install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
