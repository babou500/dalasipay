(function(root,factory){
  'use strict';
  const api=factory(typeof module==='object'&&module.exports?require('./accounting-calendar.js'):root?.DalasiAccountingCalendar);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DalasiFiscalReportingPreview=api;
})(typeof window!=='undefined'?window:null,function(calendar){
  'use strict';
  if(!calendar)throw new Error('Accounting calendar calculation dependency missing');
  function periodFor(state,date){
    const settings=calendar.readOnlyConfig(state);
    return calendar.financialYearFor(date,settings.financialYearStartMonth);
  }
  function periodOptions(state,dates){
    const input=Array.isArray(dates)?dates:[];
    const unique=new Map();
    input.forEach(date=>{
      if(!calendar.validDate(date))return;
      const p=periodFor(state,date);
      unique.set(p.start,p);
    });
    return Object.freeze([...unique.values()].sort((a,b)=>b.start.localeCompare(a.start)).map(p=>Object.freeze({...p})));
  }
  function impactPreview(state,proposal,dates){
    const next=calendar.proposedConfig(state,proposal);
    const existing=periodOptions(state,dates);
    const proposed=periodOptions({accountingCalendar:next},dates);
    const byDate=(date,config)=>calendar.financialYearFor(date,config.financialYearStartMonth).start;
    const prior=calendar.readOnlyConfig(state);
    const affected=(Array.isArray(dates)?dates:[]).filter(date=>calendar.validDate(date)&&byDate(date,prior)!==byDate(date,next));
    return Object.freeze({existing,proposed,affectedDateCount:affected.length,
      requiresAccountingReview:affected.length>0||next.migrationDate!==prior.migrationDate,
      doesNotPostOrModifyRecords:true});
  }
  return Object.freeze({periodFor,periodOptions,impactPreview});
});
