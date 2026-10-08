(function(){
'use strict';
const MONEY_FMT='#,##0.00;[Red]-#,##0.00';
const INT_FMT='#,##0';
const PCT_FMT='0.0%';
const GREEN='0F5E50',GREEN_DARK='17493F',GREEN_LIGHT='E8F3EF',TEXT='17211F',MUTED='71807B',BORDER='D8E2DD',WHITE='FFFFFF',GOLD='B88A2B',ALT='F7FAF8',WARN='FFF5E5';
function today(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
function companyName(state){return state?.org?.name||state?.businessProfile?.name||state?.companyProfile?.businessName||state?.settings?.companyName||'DalasiPay Business'}
function reportPeriod(state,kind){
 if(kind==='profit-loss')return state.pnlPeriod||state.currentPeriod||'';
 if(kind==='cash-flow-statement')return state.cashStatementPeriod||state.currentPeriod||'';
 if(kind==='vat-return')return state.taxPeriod||state.currentPeriod||'';
 if(kind==='budget-vs-actual')return String(state.budgetYear||state.currentPeriod||'').slice(0,4);
 if(kind==='project-profitability'||kind==='cost-centre-performance')return state.dimensionPeriod||state.currentPeriod||'';
 if(kind==='product-margin'||kind==='inventory-movements')return state.inventoryPeriod||state.currentPeriod||'';
 if(kind==='month-end-close')return state.monthClosePeriod||state.currentPeriod||'';
 if(kind==='year-end-close')return state.yearCloseYear||String(state.currentPeriod||'').slice(0,4);
 return state.currentPeriod||'';
}
function parseCsv(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<String(text||'').length;i++){
  const c=text[i],n=text[i+1];
  if(quoted){
   if(c==='"'&&n==='"'){field+='"';i++}
   else if(c==='"')quoted=false;
   else field+=c;
  }else{
   if(c==='"')quoted=true;
   else if(c===','){row.push(field);field=''}
   else if(c==='\n'){row.push(field);rows.push(row);row=[];field=''}
   else if(c!=='\r')field+=c;
  }
 }
 if(field.length||row.length){row.push(field);rows.push(row)}
 return rows;
}
function coerce(v){
 const s=String(v??'').trim();
 if(!s)return '';
 if(/^[-+]?\d+(?:\.\d+)?$/.test(s)&&!/^0\d{2,}$/.test(s))return Number(s);
 return s;
}
function safeSheetName(s){return String(s||'Report').replace(/[\\/*?:\[\]]/g,' ').slice(0,31)||'Report'}
function isMoneyHeader(h){return /amount|balance|revenue|profit|cost|expense|payable|receivable|outstanding|overdue|collected|invoiced|cash|asset|liabilit|equity|debit|credit|value|price|subtotal|discount|vat|tax|interest|principal|budget|actual|inflow|outflow|net book|gross|paid|received|monthly equivalent/i.test(String(h||''))}
function isPercentHeader(h){return /%|percent|margin|utilization/i.test(String(h||''))}
function isIntegerHeader(h){return /days|lines|count|quantity|stock on hand|reorder|employees|transactions/i.test(String(h||''))}
function isDateHeader(h){return /date|due|created|updated|filed|reviewed|prepared|received|period end/i.test(String(h||''))}
function totalLike(label){return /^(total|net |gross |closing |opening |final |balance check|corporation tax liability|liabilities \+ equity|chargeable income)/i.test(String(label||'').trim())}
function addTitle(ws,title,state,kind,colCount){
 const end=Math.max(2,colCount);
 ws.mergeCells(1,1,1,end);ws.getCell(1,1).value=companyName(state);ws.getCell(1,1).font={name:'Aptos Display',size:16,bold:true,color:{argb:WHITE}};ws.getCell(1,1).fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN_DARK}};ws.getCell(1,1).alignment={vertical:'middle'};ws.getRow(1).height=28;
 ws.mergeCells(2,1,2,end);ws.getCell(2,1).value=title;ws.getCell(2,1).font={name:'Aptos Display',size:20,bold:true,color:{argb:TEXT}};ws.getRow(2).height=30;
 const period=reportPeriod(state,kind);
 ws.mergeCells(3,1,3,end);ws.getCell(3,1).value=(period?'Reporting period: '+period+'   •   ':'')+'Generated: '+today()+'   •   Currency: GMD (Dalasi)';ws.getCell(3,1).font={name:'Aptos',size:10,color:{argb:MUTED}};ws.getRow(3).height=20;
 ws.mergeCells(4,1,4,end);ws.getCell(4,1).value='DalasiPay • Powered by BE Business Solutions';ws.getCell(4,1).font={name:'Aptos',size:9,italic:true,color:{argb:MUTED}};
}
function styleTable(ws,headers,data,startRow){
 const header=ws.getRow(startRow);header.values=headers;
 header.height=24;
 header.eachCell((c)=>{c.font={name:'Aptos',size:10,bold:true,color:{argb:WHITE}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN}};c.alignment={vertical:'middle',wrapText:true};c.border={bottom:{style:'medium',color:{argb:GREEN_DARK}}}});
 data.forEach((raw,idx)=>{
  const row=ws.getRow(startRow+1+idx);row.values=raw.map(coerce);row.height=20;
  row.eachCell((c,col)=>{c.font={name:'Aptos',size:10,color:{argb:TEXT}};c.alignment={vertical:'middle',wrapText:false};c.border={bottom:{style:'hair',color:{argb:BORDER}}};if(idx%2)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:ALT}}});
  if(totalLike(raw[0]))row.eachCell(c=>{c.font={...c.font,bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN_LIGHT}};c.border={top:{style:'thin',color:{argb:GREEN}},bottom:{style:'thin',color:{argb:GREEN}}}});
 });
 headers.forEach((h,i)=>{
  const col=i+1,letter=ws.getColumn(col);
  if(isMoneyHeader(h))letter.numFmt=MONEY_FMT;
  else if(isPercentHeader(h))letter.numFmt='0.0';
  else if(isIntegerHeader(h))letter.numFmt=INT_FMT;
  if(isDateHeader(h))letter.width=Math.max(letter.width||0,14);
 });
 ws.autoFilter={from:{row:startRow,column:1},to:{row:startRow,column:headers.length}};
 ws.views=[{state:'frozen',ySplit:startRow,activeCell:'A'+(startRow+1),showGridLines:false}];
}
function widths(ws,headers,data){
 headers.forEach((h,i)=>{
  let max=String(h||'').length;
  for(let r=0;r<Math.min(data.length,250);r++)max=Math.max(max,String(data[r]?.[i]??'').length);
  ws.getColumn(i+1).width=Math.min(Math.max(max+2,11),i===0?34:28);
 });
}
async function exportRows(title,headers,data,state,kind,fileBase){
 if(!window.ExcelJS){throw new Error('Excel export engine is still loading. Refresh the page and try again.')}
 const wb=new ExcelJS.Workbook();wb.creator='DalasiPay';wb.lastModifiedBy='DalasiPay';wb.created=new Date();wb.modified=new Date();wb.company='BE Business Solutions';wb.subject=title;wb.title=title;
 const ws=wb.addWorksheet(safeSheetName(title),{properties:{defaultRowHeight:20},pageSetup:{orientation:headers.length>7?'landscape':'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.3,right:0.3,top:0.5,bottom:0.5,header:0.2,footer:0.2}}});
 addTitle(ws,title,state,kind,headers.length);
 styleTable(ws,headers,data,6);
 widths(ws,headers,data);
 ws.pageSetup.printTitlesRow='1:6';
 ws.headerFooter.oddHeader='&LDalasiPay&C'+title+'&RPage &P of &N';
 ws.headerFooter.oddFooter='&L'+companyName(state)+'&CConfidential business report&RGenerated '+today();
 const buffer=await wb.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(fileBase||'dalasipay-'+String(kind||'report').replace(/[^a-z0-9-]+/gi,'-').toLowerCase())+'-'+today()+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function wrapContext(ctx,title,state,kind){
 if(ctx?.__dalasiExcelContext)return ctx;
 const wrapped=Object.create(ctx||null);Object.assign(wrapped,ctx||{});
 wrapped.__dalasiExcelContext=true;
 wrapped.toast=function(msg){if(/downloaded/i.test(String(msg||'')))return;ctx?.toast?.(msg)};
 wrapped.downloadText=function(filename,text){
  const rows=parseCsv(text);if(!rows.length){ctx?.toast?.('There is no report data to export.');return}
  const headers=rows.shift(),base=String(filename||'').replace(/\.csv$/i,'');
  exportRows(title,headers,rows,state,kind,base).then(()=>ctx?.toast?.('Professional Excel report downloaded')).catch(e=>ctx?.toast?.(e.message||'Excel export failed'));
 };
 return wrapped;
}
function wrapMethod(obj,name,ctxIndex,title,kind,stateIndex=0){
 if(!obj||typeof obj[name]!=='function'||obj[name].__excelWrapped)return;
 const original=obj[name];
 const fn=function(...args){const state=args[stateIndex],ctx=args[ctxIndex];args[ctxIndex]=wrapContext(ctx,title,state,kind);return original.apply(this,args)};
 fn.__excelWrapped=true;obj[name]=fn;
}
function installModuleExports(){
 wrapMethod(window.DalasiProfitLoss,'exportCsv',1,'Profit & Loss','profit-loss');
 wrapMethod(window.DalasiBalanceSheet,'exportCsv',1,'Balance Sheet','balance-sheet');
 wrapMethod(window.DalasiEquityStatement,'exportCsv',1,'Statement of Changes in Equity','equity-statement');
 wrapMethod(window.DalasiGeneralLedger,'exportTrialBalance',1,'Trial Balance','trial-balance');
 wrapMethod(window.DalasiGeneralLedger,'exportLedger',1,'General Ledger','general-ledger');
 wrapMethod(window.DalasiCashBank,'exportCsv',1,'Cash & Bank register','cash-bank-register');
 wrapMethod(window.DalasiBankReconciliation,'exportRegister',1,'Bank reconciliations','bank-reconciliations');
 wrapMethod(window.DalasiFixedAssets,'exportCsv',1,'Fixed asset register','fixed-assets');
 wrapMethod(window.DalasiTax,'exportReturn',2,'VAT return working paper','vat-return');
 wrapMethod(window.DalasiBudgets,'exportCsv',2,'Budget vs Actual','budget-vs-actual');
 wrapMethod(window.DalasiDimensions,'exportCsv',3,'Management dimension report','management-report');
 wrapMethod(window.DalasiLoans,'exportCsv',1,'Loans & Debt','loan-register');
 wrapMethod(window.DalasiMonthClose,'exportRecord',2,'Month-End Close','month-end-close',1);
 wrapMethod(window.DalasiYearClose,'exportRecord',2,'Year-End Close','year-end-close',1);
 wrapMethod(window.DalasiDebits,'exportCsv',2,'Debit notes','debit-notes');
 wrapMethod(window.DalasiReturns,'exportCsv',2,'Credit notes','credit-notes');
 wrapMethod(window.DalasiCreditControl,'exportAging',2,'Ageing report','ageing');
 wrapMethod(window.DalasiCashFlow,'exportStatement',2,'Cash Flow Statement','cash-flow-statement');
 wrapMethod(window.DalasiCashFlow,'exportForecast',1,'Cash Forecast','cash-forecast');
}
function installBusinessReports(){
 const base=window.DalasiBusinessReports;if(!base||base.__excelWrapped){if(!base)setTimeout(installBusinessReports,0);return}
 const original=base.exportReport;
 base.exportReport=function(kind,state,ctx){const title=base.reportTitle?.(kind)||String(kind||'Report').replace(/-/g,' ');return original(kind,state,wrapContext(ctx,title,state,kind))}
 base.__excelWrapped=true;
}
function installAll(){installModuleExports();installBusinessReports()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAll);else installAll();
window.DalasiExcelReports={parseCsv,exportRows,wrapContext,companyName,reportPeriod,installBusinessReports,installModuleExports,version:'1.2.0'};
})();
