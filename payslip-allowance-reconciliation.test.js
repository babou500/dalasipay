const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const pdf=html.slice(html.indexOf('function downloadPayslipPdf('),html.indexOf('function downloadPayslipPdf(')+12000);

test('PDF earnings reconcile with itemised allowances and recurring earnings',()=>{
  assert.match(pdf,/calc\.allowanceItems\?\.length/);
  assert.match(pdf,/earnings\.push\(\['Total allowances',money2\(calc\.allowance\)\]\)/);
  assert.match(pdf,/earnings\.push\(\['Recurring earnings',money2\(calc\.recurringEarnings\)\]\)/);
  assert.match(pdf,/earnings\.push\(\['Gross pay',money2\(calc\.gross\),true\]\)/);
  assert.doesNotMatch(pdf,/\['Fixed allowance'/);
});
