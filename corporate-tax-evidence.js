(function(){
'use strict';
const yearOf=v=>String(v||'').slice(0,4);
function rows(state,year){return (state.corporateTaxAdjustments||[]).filter(x=>String(x.year)===String(year))}
function evidence(state,year){
 const items=rows(state,year);
 const missing=items.filter(x=>!String(x.description||'').trim()||!String(x.evidenceReference||'').trim()||(x.kind==='Loss brought forward'&&!/^\d{4}$/.test(String(x.sourceYear||''))));
 return {total:items.length,complete:items.length-missing.length,missing,ready:missing.length===0};
}
window.DalasiCorporateTaxEvidence={version:'1.0.0',yearOf,rows,evidence};
})();
