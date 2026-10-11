(function(root,factory){
 'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DalasiOpeningLinkAudit=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function inspect(state){
  const all=state?.manualJournals||[];
  const migration=all.filter(j=>j.openingMigration&&j.status==='Posted');
  const byId=new Map(all.map(j=>[String(j.id),j]));
  const issues=[];const sources=[['cash-account',state?.cashAccounts||[]],['fixed-asset',state?.fixedAssets||[]],['loan',state?.businessLoans||[]]];
  for(const [kind,records] of sources){
   for(const record of records){
    if(!record.openingMigrationJournalId)continue;
    const linked=byId.get(String(record.openingMigrationJournalId));
    if(!linked||!linked.openingMigration||linked.status!=='Posted')issues.push({kind,id:String(record.id),type:'missing-posted-opening-journal'});
    else {
     const rev=byId.get(String(linked.reversalJournalId||''));
     if(rev&&rev.status==='Posted'&&String(rev.reversalOf||'')===String(linked.id))issues.push({kind,id:String(record.id),type:'linked-opening-journal-reversed'});
    }
   }
  }
  for(const j of migration){
   const reversal=byId.get(String(j.reversalJournalId||''));
   const reversed=!!reversal&&reversal.status==='Posted'&&String(reversal.reversalOf||'')===String(j.id);
   if(reversed)continue;
   const others=migration.filter(x=>x.id!==j.id).some(x=>{
    const rev=byId.get(String(x.reversalJournalId||''));return !(rev&&rev.status==='Posted'&&String(rev.reversalOf||'')===String(x.id));
   });
   if(others)issues.push({kind:'opening-migration',id:String(j.id),type:'multiple-active-opening-journals'});
  }
  return Object.freeze({checkedSourceCount:sources.reduce((n,x)=>n+x[1].length,0),issues:Object.freeze(issues),clean:issues.length===0,readOnly:true});
 }
 return Object.freeze({inspect});
});
