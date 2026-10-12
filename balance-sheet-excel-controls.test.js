const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const s=fs.readFileSync('excel-reports.js','utf8');
const start=s.indexOf('async function exportProfessionalBalanceSheet('),end=s.indexOf('async function exportProfessionalCorporateTax(',start);
const body=s.slice(start,end);
test('Balance Sheet account group totals recalculate from detail cells',()=>{
 assert.match(body,/if\(items\.length\)/);
 assert.match(body,/linkedFormula\(total\.getCell\(2\),'SUM\(B'/);
 assert.match(body,/linkedFormula\(total\.getCell\(3\),'SUM\(C'/);
});
test('Balance Sheet check references totals and liabilities plus equity dynamically',()=>{
 assert.ok(body.includes("locate('TOTAL ASSETS')"));
 assert.ok(body.includes("locate('LIABILITIES + EQUITY')"));
 assert.ok(body.includes("'B'+assetsRow+'-B'+liabilitiesEquityRow"));
 assert.ok(body.includes("'C'+assetsRow+'-C'+liabilitiesEquityRow"));
 assert.match(body,/linkedFormula\(check\.getCell\(4\),'B'\+er\+'-C'\+er,diff-prDiff\)/);
});

test('Balance Sheet equity and liabilities plus equity are formula-linked',()=>{
 assert.ok(body.includes('const equityFirstRow=row'));
 assert.ok(body.includes("'SUM(B'+equityFirstRow+':B'+(er-1)+')'"));
 assert.ok(body.includes("'SUM(C'+equityFirstRow+':C'+(er-1)+')'"));
 assert.ok(body.includes("'TOTAL LIABILITIES'"));
 assert.ok(body.includes("'B'+liabilitiesRow+'+B'+equityRow"));
 assert.ok(body.includes("'C'+liabilitiesRow+'+C'+equityRow"));
});
