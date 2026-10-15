'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync('index.html','utf8');
const styles=fs.readFileSync('ui-refinement.css','utf8');
const source=name=>fs.readFileSync(name,'utf8');
const router=html.slice(html.indexOf("document.addEventListener('click', async e =>"));

test('nested record actions display usable forms above the parent drawer',()=>{
  assert.match(styles,/\.record-drawer-wrap\s*\{[^}]*z-index:\s*120\s*\}/s);
  assert.match(styles,/\.center-modal\.incoming-payment-modal\s*\{z-index:130\}/);
  assert.match(styles,/\.center-modal\.payment-approval-modal,\s*\.center-modal\.purchase-bill-modal\s*\{z-index:130\}/);
  assert.match(styles,/\.center-modal\.cash-account-modal\s*\{z-index:140\}/);
  const dialogs=[
    ['business-payments.js','payment-approval-modal','close-payment-approval','payment-approval-form'],
    ['expenses-purchases.js','purchase-bill-modal','close-purchase-bill','purchase-bill-form'],
    ['cash-bank.js','cash-account-modal','close-cash-account','cash-account-form']
  ];
  for(const [moduleName,klass,closeAction,formId] of dialogs){
    const code=source(moduleName);
    assert.ok(code.includes('class="center-modal payment-modal '+klass+'"'),klass+' class missing');
    assert.ok(code.includes('data-action="'+closeAction+'"'),closeAction+' close missing');
    assert.ok(code.includes('id="'+formId+'"'),formId+' form missing');
    assert.ok(html.includes('getElementById(\''+formId+'\')'),formId+' submit hookup missing');
    assert.match(html,new RegExp('src="\\./'+moduleName.replace('.','\\.')+'\\?v='+(moduleName==='business-payments.js'?'20261015-receipt-confirm':'20261015-dialog-stack')+'"'));
  }
  assert.match(html,/ui-refinement\.css\?v=20261015-receipt-confirm/);
  for(const action of ['payment-approve:','payment-return:','payment-reject:','purchase-to-bill:']){
    assert.ok(router.includes("a.startsWith('"+action+"')"),action+' is not dispatched');
  }
  assert.ok(router.includes("a==='payment-add-cash-account'"));
  assert.match(html,/state\.paymentApprovalAction\?window\.DalasiBusinessPayments\.paymentApprovalModal/);
  assert.match(html,/state\.purchaseBillId\?window\.DalasiExpensesPurchases\.purchaseBillModal/);
  assert.match(html,/state\.cashAccountOpen\?window\.DalasiCashBank\.accountModal/);
});

test('all static module button actions have a main delegated click route',()=>{
  const exact=new Set([...router.matchAll(/\ba\s*===\s*['"]([^'"]+)['"]/g)].map(m=>m[1]));
  const prefixes=[...router.matchAll(/\ba\.startsWith\(['"]([^'"]+)['"]\)/g)].map(m=>m[1]);
  const modules=fs.readdirSync('.').filter(name=>name.endsWith('.js')&&!name.endsWith('.test.js')&&name!=='index.js');
  const failures=[];let scanned=0;
  for(const name of modules){
    const content=source(name);
    for(const match of content.matchAll(/data-action="([^"<>\r\n]+)"/g)){
      const value=match[1].split("'")[0].trim();
      if(!value||value.includes('$')||value.includes('\\')||value.startsWith('<'))continue;
      scanned++;
      if(!exact.has(value)&&!prefixes.some(prefix=>value.startsWith(prefix)))failures.push(name+': '+value);
    }
  }
  assert.ok(scanned>=120,'auditor did not scan enough UI actions');
  assert.deepEqual(failures,[],'unhandled UI button actions');
});

test('rendered form IDs have direct form bindings in the app or owning module',()=>{
  const modules=fs.readdirSync('.').filter(name=>name.endsWith('.js')&&!name.endsWith('.test.js')&&name!=='index.js');
  const unbound=[];let count=0;
  for(const name of modules){
    const content=source(name);
    for(const match of content.matchAll(/<form\b[^>]{0,500}\bid="([^"]+)"/g)){
      const id=match[1];if(id.includes("'")||id.includes('$'))continue;
      count++;
      if(!html.includes("getElementById('"+id+"')")&&!html.includes('getElementById("'+id+'")')
        &&!content.includes("getElementById('"+id+"')")&&!content.includes('getElementById("'+id+'")'))
        unbound.push(name+': '+id);
    }
  }
  assert.ok(count>=25,'auditor did not scan enough forms');
  assert.deepEqual(unbound,[],'forms without an application binding');
});
