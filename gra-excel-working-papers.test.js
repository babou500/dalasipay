const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const corporate=fs.readFileSync('corporate-tax.js','utf8');
const excel=fs.readFileSync('excel-reports.js','utf8');
test('GRA corporate tax working paper downloads Excel, not a CSV',()=>{
 const exportCode=corporate.slice(corporate.indexOf('function exportWorkingPaper('),corporate.indexOf('window.DalasiCorporateTax='));
 assert.match(exportCode,/DalasiExcelReports\?\.exportCorporateTax/);
 assert.doesNotMatch(exportCode,/downloadText|\.csv/);
 assert.match(excel,/dalasipay-gra-corporate-tax-working-paper-/);
});
test('tax working paper contains linked computation, adjustments, payment, reconciliation and evidence worksheets',()=>{
 for(const sheet of ['Tax Adjustments','Tax Payments','GL Reconciliation','Filing Evidence'])assert.ok(excel.includes(sheet),sheet);
 for(const formula of ['MAX(0,B8+B9-B10-B11-B12)','MAX(B14,B15)','MAX(0,B16-B17-B18-B19)','SUMIF(','SUM('])assert.ok(excel.includes(formula),formula);
 assert.match(excel,/calcProperties\.fullCalcOnLoad=true/);
});
test('VAT workbook recalculates totals, net payable and credit',()=>{
 assert.match(excel,/kind==='vat-return'/);
 for(const formula of ['C13+C18','C22+C23','C19-C24','MAX(0,C26-C27)','MAX(0,-C26)'])assert.ok(excel.includes(formula),formula);
 assert.match(excel,/expected\.every/);
});
