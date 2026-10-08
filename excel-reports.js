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
function previousMonth(period){
 const m=/^(\d{4})-(\d{2})$/.exec(String(period||''));if(!m)return '';
 let y=Number(m[1]),n=Number(m[2])-1;if(n===0){n=12;y--}return y+'-'+String(n).padStart(2,'0');
}
function periodEnd(period){const m=/^(\d{4})-(\d{2})$/.exec(String(period||''));if(!m)return '9999-12-31';return new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).toISOString().slice(0,10)}
function statementWorkbook(title,state,kind,columns){
 const wb=new ExcelJS.Workbook();wb.creator='DalasiPay';wb.lastModifiedBy='DalasiPay';wb.created=new Date();wb.modified=new Date();wb.company='BE Business Solutions';wb.title=title;wb.subject=title;
 const ws=wb.addWorksheet(safeSheetName(title),{properties:{defaultRowHeight:20},pageSetup:{orientation:columns>4?'landscape':'portrait',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.35,right:0.35,top:0.55,bottom:0.55,header:0.2,footer:0.2}}});
 addTitle(ws,title,state,kind,columns);ws.views=[{state:'frozen',ySplit:6,activeCell:'A7',showGridLines:false}];
 ws.headerFooter.oddHeader='&LDalasiPay&C'+title+'&RPage &P of &N';ws.headerFooter.oddFooter='&L'+companyName(state)+'&CConfidential financial statement&RGenerated '+today();
 return {wb,ws};
}
async function saveWorkbook(wb,fileBase,ctx){
 const buffer=await wb.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=fileBase+'-'+today()+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);ctx?.toast?.('Professional Excel report downloaded');
}
function statementHeader(ws,row,labels){
 const r=ws.getRow(row);r.values=labels;r.height=25;r.eachCell(c=>{c.font={name:'Aptos',size:10,bold:true,color:{argb:WHITE}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN}};c.alignment={vertical:'middle',horizontal:'right',wrapText:true};c.border={bottom:{style:'medium',color:{argb:GREEN_DARK}}}});r.getCell(1).alignment={vertical:'middle',horizontal:'left'};
}
function statementRow(ws,row,label,values,type='line'){
 const r=ws.getRow(row);r.values=[label,...values];r.height=20;
 r.eachCell((c,i)=>{c.font={name:'Aptos',size:10,color:{argb:TEXT},bold:type==='total'||type==='key'};c.alignment={vertical:'middle',horizontal:i===1?'left':'right'};c.border={bottom:{style:'hair',color:{argb:BORDER}}};if(i>1&&typeof c.value==='number')c.numFmt=MONEY_FMT});
 if(type==='section'){r.eachCell(c=>{c.font={...c.font,bold:true,color:{argb:GREEN_DARK}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN_LIGHT}};c.border={bottom:{style:'thin',color:{argb:GREEN}}}})}
 if(type==='total'){r.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN_LIGHT}};c.border={top:{style:'thin',color:{argb:GREEN}},bottom:{style:'double',color:{argb:GREEN_DARK}}}})}
 if(type==='key'){r.eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'F1F5F3'}};c.border={top:{style:'thin',color:{argb:BORDER}},bottom:{style:'thin',color:{argb:BORDER}}}})}
 return r;
}
async function exportProfessionalProfitLoss(state,ctx){
 if(!window.ExcelJS)throw new Error('Excel export engine is still loading. Refresh and try again.');
 const period=state.pnlPeriod||state.currentPeriod,prev=previousMonth(period),m=window.DalasiProfitLoss?.statement?.(state,period),p=prev?window.DalasiProfitLoss?.statement?.(state,prev):null,y=window.DalasiProfitLoss?.ytd?.(state,period);if(!m||!y)return;
 const {wb,ws}=statementWorkbook('Profit & Loss',state,'profit-loss',6);statementHeader(ws,6,['Profit & Loss line',period,prev||'Prior period','Variance','% of revenue',String(period).slice(0,4)+' YTD']);
 const val=(obj,key)=>Number(obj?.[key])||0, pct=(v)=>m.revenue?Number(v||0)/m.revenue:0;
 const rows=[
  ['REVENUE',[], 'section'],
  ['Gross invoice sales','invoiceSalesGross'],['Less: sales discounts','salesDiscounts'],['Net invoice sales','invoiceRevenue'],
  ['Direct / other income','directIncome'],['Discounts received','discountsReceived'],['TOTAL REVENUE','revenue','total'],
  ['COST OF SALES',[],'section'],['Cost of goods sold','cogs'],['GROSS PROFIT','grossProfit','total'],['Gross margin %','grossMargin','ratio'],
  ['OPERATING EXPENSES',[],'section'],['Business operating expenses','businessExpenses'],['Supplier bill expenses','supplierBillExpenses'],['Payroll & employer costs','payroll'],['Depreciation expense','depreciationExpense'],['TOTAL OPERATING EXPENSES','operatingExpenses','total'],
  ['OTHER INCOME / (EXPENSE)',[],'section'],['Gain on asset disposal','assetDisposalGain'],['Loss on asset disposal','assetDisposalLoss'],['Finance costs / loan interest','financeCosts'],
  ['NET PROFIT','netProfit','total'],['Net margin %','netMargin','ratio']
 ];
 let row=7;
 rows.forEach(entry=>{
  const [label,key,type='line']=entry;
  if(type==='section'){statementRow(ws,row++,label,['','','','',''],'section');return}
  if(type==='ratio'){
   const cur=val(m,key)/100,prior=val(p,key)/100,variance=cur-prior,ytd=val(y,key)/100;const r=statementRow(ws,row++,label,[cur,prior,variance,cur,ytd],'key');for(let c=2;c<=6;c++)r.getCell(c).numFmt=PCT_FMT;return;
  }
  const cur=val(m,key),prior=val(p,key),variance=cur-prior,share=pct(cur),ytd=val(y,key);const r=statementRow(ws,row++,label,[cur,prior,variance,share,ytd],type);
  r.getCell(5).numFmt=PCT_FMT;
 });
 ws.getColumn(1).width=38;[2,3,4,5,6].forEach(i=>ws.getColumn(i).width=17);ws.pageSetup.printTitlesRow='1:6';
 const note=row+1;ws.mergeCells(note,1,note,6);ws.getCell(note,1).value='Management presentation: current period compared with prior month. Percent-of-revenue column shows common-size analysis.';ws.getCell(note,1).font={name:'Aptos',size:9,italic:true,color:{argb:MUTED}};
 await saveWorkbook(wb,'dalasipay-profit-loss-'+period,ctx);
}
function balanceAsOf(state,endDate){
 const rows=(window.DalasiGeneralLedger?.journals?.(state)||[]).filter(x=>String(x.date||'')<=endDate),map=new Map();
 rows.forEach(x=>{const key=String(x.accountCode||'')+'|'+String(x.account||'');if(!map.has(key))map.set(key,{code:x.accountCode||'',name:x.account||'',type:x.accountType||'',debit:0,credit:0});const a=map.get(key);a.debit+=Number(x.debit)||0;a.credit+=Number(x.credit)||0});
 const accounts=[...map.values()].map(a=>({...a,balance:Math.round((a.debit-a.credit)*100)/100}));
 const assets=accounts.filter(a=>a.type==='Asset'&&Math.abs(a.balance)>.004).map(a=>({...a,amount:a.balance})).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
 const liabilities=accounts.filter(a=>a.type==='Liability'&&Math.abs(a.balance)>.004).map(a=>({...a,amount:-a.balance})).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
 const equityAccounts=accounts.filter(a=>a.type==='Equity'&&Math.abs(a.balance)>.004).map(a=>({...a,amount:-a.balance})).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
 const revenue=accounts.filter(a=>a.type==='Revenue').reduce((n,a)=>n-a.balance,0),expenses=accounts.filter(a=>a.type==='Expense').reduce((n,a)=>n+a.balance,0),currentEarnings=Math.round((revenue-expenses)*100)/100;
 const totalAssets=Math.round(assets.reduce((n,a)=>n+a.amount,0)*100)/100,totalLiabilities=Math.round(liabilities.reduce((n,a)=>n+a.amount,0)*100)/100,directEquity=Math.round(equityAccounts.reduce((n,a)=>n+a.amount,0)*100)/100,equity=Math.round((directEquity+currentEarnings)*100)/100;
 return {assets,liabilities,equityAccounts,currentEarnings,totalAssets,totalLiabilities,equity,liabilitiesEquity:Math.round((totalLiabilities+equity)*100)/100};
}
async function exportProfessionalTrialBalance(state,ctx){
 if(!window.ExcelJS)throw new Error('Excel export engine is still loading. Refresh and try again.');
 const t=window.DalasiGeneralLedger?.trialBalance?.(state);if(!t)return;
 const {wb,ws}=statementWorkbook('Trial Balance',state,'trial-balance',6);statementHeader(ws,6,['Code','Account','Type','Debit','Credit','Balance']);
 let row=7;
 const groups=['Asset','Liability','Equity','Revenue','Expense'];
 groups.forEach(type=>{
  const items=(t.accounts||[]).filter(a=>a.type===type);if(!items.length)return;
  statementRow(ws,row++,type.toUpperCase(),['','','','',''],'section');
  items.forEach(a=>{const r=statementRow(ws,row++,String(a.code||''),[String(a.name||''),type,Number(a.debit)||0,Number(a.credit)||0,Number(a.balance)||0]);r.getCell(2).alignment={horizontal:'left'};r.getCell(3).alignment={horizontal:'left'};for(let c=4;c<=6;c++)r.getCell(c).numFmt=MONEY_FMT;});
 });
 statementRow(ws,row++,'TOTAL',['','',t.debit,t.credit,t.difference],'total');
 const check=statementRow(ws,row++,'TRIAL BALANCE CHECK',['','',t.debit,t.credit,t.difference],Math.abs(t.difference||0)<.01?'key':'total');if(Math.abs(t.difference||0)>=.01)check.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:WARN}});
 ws.getColumn(1).width=13;ws.getColumn(2).width=40;ws.getColumn(3).width=15;[4,5,6].forEach(i=>ws.getColumn(i).width=18);ws.pageSetup.printTitlesRow='1:6';
 const note=row+1;ws.mergeCells(note,1,note,6);ws.getCell(note,1).value='Generated from posted double-entry transactions. Difference should be zero before period close.';ws.getCell(note,1).font={name:'Aptos',size:9,italic:true,color:{argb:MUTED}};
 await saveWorkbook(wb,'dalasipay-trial-balance',ctx);
}
async function exportProfessionalLedger(state,ctx){
 if(!window.ExcelJS)throw new Error('Excel export engine is still loading. Refresh and try again.');
 const rows=window.DalasiGeneralLedger?.ledgerRows?.(state)||[];if(!rows.length){ctx?.toast?.('There is no General Ledger activity to export.');return}
 const wb=new ExcelJS.Workbook();wb.creator='DalasiPay';wb.company='BE Business Solutions';wb.title='General Ledger';wb.subject='General Ledger';
 const grouped=new Map();rows.forEach(x=>{const key=String(x.accountCode||'')+' · '+String(x.account||'');if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(x)});
 const summary=wb.addWorksheet('Ledger Summary',{pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
 addTitle(summary,'General Ledger',state,'general-ledger',5);statementHeader(summary,6,['Account','Debits','Credits','Closing balance','Side']);
 let sr=7;
 [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([name,list])=>{const debit=list.reduce((n,x)=>n+(Number(x.debit)||0),0),credit=list.reduce((n,x)=>n+(Number(x.credit)||0),0),balance=Math.round((debit-credit)*100)/100;statementRow(summary,sr++,name,[debit,credit,Math.abs(balance),balance>=0?'Dr':'Cr']);});
 summary.getColumn(1).width=42;[2,3,4].forEach(i=>summary.getColumn(i).width=18);summary.getColumn(5).width=10;
 const detail=wb.addWorksheet('Ledger Detail',{pageSetup:{orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0}});
 addTitle(detail,'General Ledger Detail',state,'general-ledger',11);statementHeader(detail,6,['Date','Journal','Reference','Source','Account Code','Account','Memo','Debit','Credit','Running Balance','Side']);
 let dr=7,accountRunning=new Map();
 rows.forEach(x=>{const key=String(x.accountCode||'')+'|'+String(x.account||''),run=Math.round(((accountRunning.get(key)||0)+(Number(x.debit)||0)-(Number(x.credit)||0))*100)/100;accountRunning.set(key,run);const r=detail.getRow(dr++);r.values=[x.date||'',x.journalId||'',x.reference||'',x.source||'',x.accountCode||'',x.account||'',x.memo||'',Number(x.debit)||0,Number(x.credit)||0,Math.abs(run),run>=0?'Dr':'Cr'];r.height=19;r.eachCell((c,i)=>{c.font={name:'Aptos',size:9,color:{argb:TEXT}};c.border={bottom:{style:'hair',color:{argb:BORDER}}};c.alignment={vertical:'middle',horizontal:i>=8&&i<=10?'right':'left'};});[8,9,10].forEach(i=>r.getCell(i).numFmt=MONEY_FMT);});
 detail.autoFilter={from:{row:6,column:1},to:{row:6,column:11}};detail.views=[{state:'frozen',ySplit:6,activeCell:'A7',showGridLines:false}];
 [14,18,18,24,13,32,38,16,16,18,9].forEach((w,i)=>detail.getColumn(i+1).width=w);
 summary.headerFooter.oddFooter='&L'+companyName(state)+'&CGeneral Ledger Summary&RPage &P of &N';detail.headerFooter.oddFooter='&L'+companyName(state)+'&CGeneral Ledger Detail&RPage &P of &N';
 await saveWorkbook(wb,'dalasipay-general-ledger',ctx);
}
async function exportProfessionalBalanceSheet(state,ctx){
 if(!window.ExcelJS)throw new Error('Excel export engine is still loading. Refresh and try again.');
 const period=String(state.currentPeriod||''),prev=previousMonth(period),current=window.DalasiBalanceSheet?.statement?.(state);if(!current)return;
 const prior=prev?balanceAsOf(state,periodEnd(prev)):null,{wb,ws}=statementWorkbook('Balance Sheet',state,'balance-sheet',4);statementHeader(ws,6,['Account','Current','Prior period','Variance']);
 const priorMap=new Map([...(prior?.assets||[]),...(prior?.liabilities||[]),...(prior?.equityAccounts||[])].map(x=>[String(x.code)+'|'+String(x.name),Number(x.amount)||0]));
 let row=7;
 const section=(title,items,currentTotal,priorTotal)=>{
  statementRow(ws,row++,title,['','',''],'section');
  items.forEach(a=>{const pv=priorMap.get(String(a.code)+'|'+String(a.name))||0;statementRow(ws,row++,String(a.code||'')+' · '+String(a.name||''),[Number(a.amount)||0,pv,(Number(a.amount)||0)-pv]);});
  statementRow(ws,row++,'TOTAL '+title,[currentTotal,priorTotal,currentTotal-priorTotal],'total');
 };
 section('ASSETS',current.assets,current.totalAssets,prior?.totalAssets||0);
 section('LIABILITIES',current.liabilities,current.totalLiabilities,prior?.totalLiabilities||0);
 statementRow(ws,row++,'EQUITY',['','',''],'section');
 current.equityAccounts.forEach(a=>{const pv=priorMap.get(String(a.code)+'|'+String(a.name))||0;statementRow(ws,row++,String(a.code||'')+' · '+String(a.name||''),[Number(a.amount)||0,pv,(Number(a.amount)||0)-pv]);});
 statementRow(ws,row++,'Current-year earnings',[current.currentEarnings,prior?.currentEarnings||0,current.currentEarnings-(prior?.currentEarnings||0)]);
 statementRow(ws,row++,'TOTAL EQUITY',[current.equity,prior?.equity||0,current.equity-(prior?.equity||0)],'total');
 statementRow(ws,row++,'LIABILITIES + EQUITY',[current.liabilitiesEquity,prior?.liabilitiesEquity||0,current.liabilitiesEquity-(prior?.liabilitiesEquity||0)],'total');
 const diff=Number(current.totalAssets||0)-Number(current.liabilitiesEquity||0),prDiff=(prior?.totalAssets||0)-(prior?.liabilitiesEquity||0);const check=statementRow(ws,row++,'BALANCE CHECK',[diff,prDiff,diff-prDiff],Math.abs(diff)<.01?'key':'total');if(Math.abs(diff)>=.01)check.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:WARN}});
 ws.getColumn(1).width=43;[2,3,4].forEach(i=>ws.getColumn(i).width=19);ws.pageSetup.printTitlesRow='1:6';
 const note=row+1;ws.mergeCells(note,1,note,4);ws.getCell(note,1).value='Comparative Balance Sheet. Prior period is calculated from General Ledger postings through '+(prev?periodEnd(prev):'the prior reporting date')+'.';ws.getCell(note,1).font={name:'Aptos',size:9,italic:true,color:{argb:MUTED}};
 await saveWorkbook(wb,'dalasipay-balance-sheet-'+period,ctx);
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
 base.exportReport=function(kind,state,ctx){if(kind==='profit-loss')return exportProfessionalProfitLoss(state,ctx).catch(e=>ctx?.toast?.(e.message||'Excel export failed'));if(kind==='balance-sheet')return exportProfessionalBalanceSheet(state,ctx).catch(e=>ctx?.toast?.(e.message||'Excel export failed'));if(kind==='trial-balance')return exportProfessionalTrialBalance(state,ctx).catch(e=>ctx?.toast?.(e.message||'Excel export failed'));if(kind==='general-ledger')return exportProfessionalLedger(state,ctx).catch(e=>ctx?.toast?.(e.message||'Excel export failed'));const title=base.reportTitle?.(kind)||String(kind||'Report').replace(/-/g,' ');return original(kind,state,wrapContext(ctx,title,state,kind))}
 base.__excelWrapped=true;
}
function installAll(){installModuleExports();installBusinessReports()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAll);else installAll();
window.DalasiExcelReports={parseCsv,exportRows,exportProfessionalProfitLoss,exportProfessionalBalanceSheet,exportProfessionalTrialBalance,exportProfessionalLedger,balanceAsOf,wrapContext,companyName,reportPeriod,installBusinessReports,installModuleExports,version:'1.4.0'};
})();
