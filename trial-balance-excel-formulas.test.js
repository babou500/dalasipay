const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('excel-reports.js','utf8');
const start=source.indexOf('async function exportProfessionalTrialBalance(');
const end=source.indexOf('async function exportProfessionalLedger(',start);
const code=source.slice(start,end);
test('trial balance net balance links to posted debit and credit cells',()=>{
 assert.match(code,/linkedFormula\(r\.getCell\(6\),'D'\+excelRow\+'-E'\+excelRow,Number\(a\.balance\)\|\|0\)/);
});
test('trial balance total and check use Excel formulas, not frozen export values',()=>{
 assert.match(code,/const totalRow=row,total=statementRow/);
 assert.match(code,/linkedFormula\(total\.getCell\('F'\),'D'\+totalRow\+'-E'\+totalRow,t\.difference\)/);
 assert.match(code,/linkedFormula\(check\.getCell\(col\),col\+totalRow/);
 assert.match(code,/SUM\(/);
});
