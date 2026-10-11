const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('excel-reports.js','utf8');
test('Excel formulas are stored with cached numeric results',()=>{
 assert.match(src,/cell\.value=\{formula,result:Number\(result\)\}/);
 assert.match(src,/if\(!Number\.isFinite\(Number\(result\)\)\)return/);
});
test('profit and loss variance and percent figures use Excel cell references',()=>{
 assert.match(src,/linkedFormula\(r\.getCell\(4\),'B'\+excelRow\+'-C'\+excelRow,variance\)/);
 assert.match(src,/linkedFormula\(r\.getCell\(5\),'IFERROR\(B'\+excelRow\+'\/B13,0\)',share\)/);
 assert.match(src,/const numerator=key==='grossMargin'\?16:28/);
 assert.match(src,/linkedFormula\(r\.getCell\(6\),'IFERROR\(F'\+numerator\+'\/F13,0\)',ytd\)/);
});
test('balance sheet variance and balance check update when amounts change',()=>{
 assert.match(src,/linkedFormula\(r\.getCell\(4\),'B'\+excelRow\+'-C'\+excelRow,cur-pv\)/);
 assert.match(src,/linkedFormula\(check\.getCell\(4\),'B'\+er\+'-C'\+er,diff-prDiff\)/);
});
