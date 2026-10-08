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
 base.__evidenceGate=true;return true;
}
function install(){if(!installGate())setTimeout(install,0)}
window.DalasiCorporateTaxEvidence={version:'1.0.0',yearOf,rows,evidence,install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
