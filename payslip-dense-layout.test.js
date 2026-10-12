const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const src=fs.readFileSync('index.html','utf8');const pdf=src.slice(src.indexOf('function downloadPayslipPdf('),src.indexOf('function downloadPayslipPdf(')+14000);
test('dense named-allowance payslips fit above the footer',()=>{
 assert.match(pdf,/maxRows=Math\.max\(earnings\.length,deductions\.length\)/);
 assert.match(pdf,/cardTop-headerH-310/);
 for(let count=2;count<=18;count++){const rowH=Math.max(14,Math.min(23,Math.floor((608-31-310)/count)));const bottom=608-31-count*rowH;assert.ok(bottom>=310,'card encroaches summary at '+count+' rows');}
});
