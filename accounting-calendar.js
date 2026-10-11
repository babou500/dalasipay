(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DalasiAccountingCalendar=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const iso=/^\d{4}-\d{2}-\d{2}$/;
  function validDate(value){
    if(typeof value!=='string'||!iso.test(value))return false;
    const [year,month,day]=value.split('-').map(Number);
    if(year<1900||year>9999||month<1||month>12)return false;
    return day>=1&&day<=new Date(Date.UTC(year,month,0)).getUTCDate();
  }
  function validStartMonth(month){return Number.isInteger(month)&&month>=1&&month<=12;}
  function readOnlyConfig(state){
    const saved=state&&state.accountingCalendar;
    const startMonth=saved?.financialYearStartMonth??1;
    const migrationDate=saved?.migrationDate??null;
    if(!validStartMonth(startMonth))throw new Error('Invalid financial year start month');
    if(migrationDate!==null&&!validDate(migrationDate))throw new Error('Invalid migration date');
    return Object.freeze({financialYearStartMonth:startMonth,migrationDate,legacyCalendar:!saved});
  }
  function financialYearFor(date,startMonth=1){
    if(!validDate(date)||!validStartMonth(startMonth))throw new Error('Invalid accounting calendar date');
    const [year,month]=date.slice(0,7).split('-').map(Number);
    const firstYear=month>=startMonth?year:year-1;
    const start=String(firstYear).padStart(4,'0')+'-'+String(startMonth).padStart(2,'0')+'-01';
    const endYear=firstYear+1;
    const lastDay=new Date(Date.UTC(endYear,startMonth,0)).getUTCDate();
    const end=String(endYear).padStart(4,'0')+'-'+String(startMonth).padStart(2,'0')+'-'+String(lastDay).padStart(2,'0');
    // Calendar-year end is December of the same year, not the preceding December.
    if(startMonth===1)return Object.freeze({start,end:String(firstYear)+'-12-31',label:String(firstYear)});
    return Object.freeze({start,end,label:String(firstYear)+'/'+String(endYear)});
  }
  function proposedConfig(state,proposal){
    const prior=readOnlyConfig(state);
    const month=proposal?.financialYearStartMonth??prior.financialYearStartMonth;
    const migration=proposal?.migrationDate===undefined?prior.migrationDate:proposal.migrationDate;
    if(!validStartMonth(month)||migration!==null&&!validDate(migration))throw new Error('Invalid proposed accounting calendar');
    // No state mutation: owner approval and historical-impact checks must precede persistence.
    return Object.freeze({financialYearStartMonth:month,migrationDate:migration});
  }
  return Object.freeze({validDate,validStartMonth,readOnlyConfig,financialYearFor,proposedConfig});
});
