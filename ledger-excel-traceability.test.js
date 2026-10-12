const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const file=fs.readFileSync('excel-reports.js','utf8');
const code=file.slice(file.indexOf('async function exportProfessionalLedger('),file.indexOf('async function exportProfessionalBalanceSheet('));
test('ledger summary links debit and credit to detail transactions with exact code and name',()=>{
 assert.ok(code.includes('SUMIFS('));
 assert.ok(code.includes("'Ledger Detail'!H7:H"));
 assert.ok(code.includes("'Ledger Detail'!I7:I"));
 assert.ok(code.includes("'Ledger Detail'!E7:E"));
 assert.ok(code.includes("'Ledger Detail'!F7:F"));
 assert.match(code,/JSON\.stringify\(code\)/);
 assert.match(code,/JSON\.stringify\(account\)/);
});
test('ledger summary recomputes account closing amount, side, and debit-credit check',()=>{
 assert.match(code,/linkedFormula\(r\.getCell\(4\),'ABS\(B'\+excelRow\+'-C'\+excelRow\+'\)'/);
 assert.ok(code.includes('IF(B'));
 assert.ok(code.includes('DEBIT / CREDIT CHECK'));
 assert.ok(code.includes('B'+"'"+'+summaryTotalRow'));
 assert.ok(code.includes('wb.calcProperties.fullCalcOnLoad=true'));
});
