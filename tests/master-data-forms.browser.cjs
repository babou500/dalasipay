'use strict';
// Run with node --test tests/master-data-forms.browser.cjs.
// Set PLAYWRIGHT_MODULE to an installed playwright package and optionally PLAYWRIGHT_BROWSER.
// All backend writes are isolated HTTP fixtures on 127.0.0.1; production is blocked.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const production=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes("const APP_PREFIX = 'dalasipay-v3-org-';"));
const style=html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
let server,browser,origin,sequence=0;
const fixtures=new Map();
const initial=()=>({revision:1,state:{schemaVersion:'fixture',data:{'custom-accounts':[],'payment-beneficiaries':[{id:'existing',organizationId:'workspace',name:'Existing Supplier',kind:'Supplier / vendor',status:'Active',email:'existing@example.test'}],transactions:[{id:'unchanged',amount:123}],subscriptions:Array.from({length:13},(_,id)=>({id,professional_preview:true})),billing:false}}});
function fixtureHtml(id,mode){return `<!doctype html><html><head><meta charset="utf-8"><title>DalasiPay · isolated master data QA</title><style>${style}</style><link rel="stylesheet" href="/accounting-journals.css"><link rel="stylesheet" href="/expenses-purchases.css"></head><body><div id="app"></div>
<script>window.DALASIPAY_CONFIG={mode:'supabase'};window.allowed=true;window.fixtureFailure='';window.globalToastCalls=0;
window.DalasiBackend={configured:()=>true,repository:{saveAppState:async payload=>{const r=await fetch('/fixture-save?id=${id}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,fail:window.fixtureFailure,allowed:window.allowed})});if(!r.ok)throw Error('Fixture backend refused');return r.json();}}};
window.DalasiAuth={getSession:()=>window.state.session,getActiveOrganization:()=>window.state.org,can:()=>window.allowed};
</script><script>${production}</script>
${['master-data-forms.js','business-payments.js','expenses-purchases.js','sales-catalog.js','accounting-journals.js'].map(f=>'<script src="/'+f+'"></script>').join('')}
<script>
window.DalasiGeneralLedger={CHART:[[6000,'Operating Expenses','Expense'],[3000,'Owner Capital','Equity']]};
window.h={field:(label,content)=>'<label class="field"><span>'+label+'</span>'+content+'</label>',icon:()=>'',esc:value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),money2:value=>Number(value).toFixed(2)};
window.mode='${mode}';window.state={org:{id:'workspace'},session:{userId:'owner',name:'Fixture Owner'},cashAccounts:[],manualJournals:[],accountOpen:true,accountParentCode:'6000'};
window.base={can:()=>window.allowed,audit:()=>{throw Error('Old audit path must not be used');},save:()=>{throw Error('Old queued save path must not be used');},toast:()=>{window.globalToastCalls++;renderFixture();},render:()=>renderFixture()};
window.renderFixture=()=>{
 if(DalasiMasterForms.saving(document,state))return;
 const drafts=DalasiMasterForms.capture(document,state),app=document.getElementById('app');
 app.innerHTML=mode==='journal'?DalasiAccounting.journalModal(state,h):mode==='purchase'?DalasiExpensesPurchases.purchaseModal(state,h):mode==='supplier'?DalasiBusinessPayments.beneficiaryModal(state,h):state.accountOpen?DalasiAccounting.accountModal(state,h):'<h2>Saved chart of accounts</h2>';
 DalasiMasterForms.restore(document,state,drafts);
 const account=document.getElementById('ledger-account-form');if(account){DalasiAccounting.bindAccountForm(account,state);account.addEventListener('submit',ev=>DalasiAccounting.createAccount(ev,state,DalasiMasterForms.context(account,state,base)));}
 const supplier=document.getElementById('beneficiary-form');if(supplier){supplier.dataset.workspaceId=state.org.id;supplier.addEventListener('submit',ev=>DalasiBusinessPayments.createBeneficiary(ev,state,DalasiMasterForms.context(supplier,state,base)));}
 const journal=document.getElementById('manual-journal-form');if(journal){DalasiAccounting.bindJournalForm(journal,state,base);journal.addEventListener('submit',ev=>DalasiAccounting.createJournal(ev,state,base));}
 const purchase=document.getElementById('purchase-form');if(purchase){DalasiCatalog.bindLineItems(purchase,state,'purchase');DalasiExpensesPurchases.bindQuickSupplier(purchase,state,base);}
};
window.ready=(async()=>{const remote=await (await fetch('/fixture-state?id=${id}')).json();DalasiProduction.applyWorkspace('workspace',remote.state);localStorage.setItem('dalasipay-prod-revision-workspace',remote.revision);state.customAccounts=remote.state.data['custom-accounts'];state.paymentBeneficiaries=remote.state.data['payment-beneficiaries'];renderFixture();})();
</script></body></html>`;}
test.before(async()=>{
 server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),id=url.searchParams.get('id');
  if(url.pathname==='/actual'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html.replace("mode: 'supabase'","mode: 'local-demo'").replace('<head>','<head><base href="/">'));return;}
  if(url.pathname==='/fixture-state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixtures.get(id)));return;}
  if(url.pathname==='/fixture-save'){
    let text='';for await(const chunk of req)text+=chunk;const {payload,fail,allowed}=JSON.parse(text),fixture=fixtures.get(id);
    if(!allowed||fail==='network'){res.writeHead(403);res.end('{}');return;}
    if(fail==='conflict'||payload.expectedRevision!==fixture.revision){res.end(JSON.stringify({conflict:true}));return;}
    fixture.state=payload.state;res.end(JSON.stringify({revision:++fixture.revision}));return;
  }
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixtureHtml(id,url.searchParams.get('mode')));return;}
  const name=url.pathname.slice(1);if((!/^[a-zA-Z0-9.-]+\.(?:js|mjs|css|svg)$/.test(name)||name.includes('..'))||!fs.existsSync(path.join(root,name))){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/javascript');res.end(fs.readFileSync(path.join(root,name)));
 }catch(error){res.writeHead(500);res.end('Fixture failed');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER||undefined});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function pageFor(mode){
 const id=String(++sequence);fixtures.set(id,initial());const context=await browser.newContext({viewport:{width:1440,height:1100}});const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 await page.goto(origin+'/?id='+id+'&mode='+mode);await page.evaluate(()=>window.ready);
 assert.match(await page.title(),/DalasiPay/);assert.match(await page.locator('body').innerText(),/account|supplier|journal|purchase/i);
 return {page,id,context,errors};
}
async function saved(page){await page.waitForFunction(()=>!document.querySelector('[data-master-busy]'));}
async function screenshot(page,name){if(process.env.MASTER_QA_OUTPUT){fs.mkdirSync(process.env.MASTER_QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.MASTER_QA_OUTPUT,name+'.png'),fullPage:true});}}

test('sub-account validation preserves typed fields; backend failure is useful; success persists with inherited type after refresh',async()=>{
 const {page,id,context,errors}=await pageFor('account');
 await page.locator('[name="code"]').fill('6000');await page.locator('[name="name"]').fill('New Expense Child');await page.getByRole('button',{name:'Add account',exact:true}).click();
 assert.match(await page.locator('[data-master-feedback]').innerText(),/already exists/);assert.equal(await page.locator('[name="name"]').inputValue(),'New Expense Child');
 await page.locator('[name="code"]').fill('6015');await page.evaluate(()=>renderFixture());assert.equal(await page.locator('[name="code"]').inputValue(),'6015');
 await page.evaluate(()=>window.fixtureFailure='conflict');await page.getByRole('button',{name:'Add account',exact:true}).click();await saved(page);assert.match(await page.locator('[data-master-feedback]').innerText(),/newer workspace/);assert.equal(fixtures.get(id).state.data['custom-accounts'].length,0);
 await page.evaluate(()=>window.fixtureFailure='');await page.getByRole('button',{name:'Add account',exact:true}).click();await page.getByRole('heading',{name:'Saved chart of accounts'}).waitFor();
 const row=fixtures.get(id).state.data['custom-accounts'][0];assert.equal(row.parentCode,'6000');assert.equal(row.type,'Expense');assert.equal(row.organizationId,'workspace');
 await page.reload();await page.evaluate(()=>window.ready);assert.equal(await page.evaluate(()=>state.customAccounts[0].name),'New Expense Child');assert.equal(await page.evaluate(()=>globalToastCalls),0);assert.deepEqual(errors,[]);await context.close();
});

test('purchase supplier form reuses all beneficiary fields, preserves items and selects the saved supplier; duplicate and cancel retain selection',async()=>{
 const {page,id,context,errors}=await pageFor('purchase');
 await page.locator('[name="supplierId"]').selectOption('existing');
 for(const [name,value] of Object.entries({supplierName:'Typed supplier',requestDate:'2026-10-13',requiredDate:'2026-10-20',requestedBy:'Procurement',reference:'PO-UNFINISHED',description:'Keep description',notes:'Keep notes',lineDescription:'Unfinished item',lineQuantity:'3',lineUnitPrice:'44',lineDiscount:'5'}))await page.locator('[name="'+name+'"]').first().fill(value);
 await page.locator('[data-line-add]').click();await page.locator('[name="lineDescription"]').nth(1).fill('Second line');
 const before=await page.locator('#purchase-form').evaluate(form=>[...form.querySelectorAll('[name]:not([name="supplierId"])')].filter(x=>!x.name.startsWith('quickSupplier_')).map(x=>[x.name,x.value]));
 await page.locator('[name="supplierId"]').selectOption('__add_supplier__');await page.locator('[data-quick-supplier-cancel]').click();assert.equal(await page.locator('[name="supplierId"]').inputValue(),'existing');
 await page.locator('[name="supplierId"]').selectOption('__add_supplier__');await page.locator('[name="quickSupplier_name"]').fill('New Supplier');await page.locator('[name="quickSupplier_email"]').fill('invalid');await page.locator('[data-quick-supplier-save]').click();assert.match(await page.locator('[data-master-feedback]').innerText(),/valid email/);
 await page.locator('[name="quickSupplier_email"]').fill('new@example.test');await page.locator('[name="quickSupplier_contact"]').fill('Contact Person');await page.locator('[name="quickSupplier_reference"]').fill('VENDOR-REF');
 await page.evaluate(()=>renderFixture());await page.locator('[data-quick-supplier-save]').click();await page.waitForFunction(()=>document.querySelector('[name="supplierId"]').value.startsWith('BEN-'));
 const newId=await page.locator('[name="supplierId"]').inputValue();assert.equal(fixtures.get(id).state.data['payment-beneficiaries'].find(x=>x.id===newId).reference,'VENDOR-REF');
 const after=await page.locator('#purchase-form').evaluate(form=>[...form.querySelectorAll('[name]:not([name="supplierId"])')].filter(x=>!x.name.startsWith('quickSupplier_')).map(x=>[x.name,x.value]));assert.deepEqual(after,before);
 await screenshot(page,'purchase-supplier-preserved');
 await page.locator('[name="supplierId"]').selectOption('__add_supplier__');await page.locator('[name="quickSupplier_name"]').fill(' new supplier ');await page.locator('[data-quick-supplier-save]').click();await page.waitForFunction(()=>document.querySelector('[name="supplierId"]').value.startsWith('BEN-'));assert.equal(await page.locator('[name="supplierId"]').inputValue(),newId);assert.equal(fixtures.get(id).state.data['payment-beneficiaries'].length,2);
 assert.equal(await page.evaluate(()=>globalToastCalls),0);assert.deepEqual(errors,[]);await page.reload();await page.evaluate(()=>window.ready);assert.equal(await page.locator('[name="supplierId"] option[value="'+newId+'"]').count(),1);await context.close();
});

test('journal inline creation preserves date, reference, memo, partial and zero lines; selects exact line; main and child accounts supported',async()=>{
 const {page,id,context,errors}=await pageFor('journal');
 await page.locator('[name="journalDate"]').fill('2026-10-13');await page.locator('[name="reference"]').fill('J-UNFINISHED');await page.locator('[name="memo"]').fill('Unfinished memo');
 await page.locator('[name="journalAccount"]').nth(0).selectOption('Operating Expenses');await page.locator('[name="journalDebit"]').nth(0).fill('125.50');await page.locator('[name="journalMemo"]').nth(0).fill('Keep line memo');
 await page.locator('[name="journalAccount"]').nth(1).selectOption('Owner Capital');await page.locator('[name="journalCredit"]').nth(1).fill('125.50');await page.locator('[data-journal-add]').click();await page.locator('[name="journalDebit"]').nth(2).fill('0');await page.locator('[name="journalMemo"]').nth(2).fill('Incomplete zero line');
 const before=await page.locator('#manual-journal-form').evaluate(form=>[...form.querySelectorAll('[name]')].filter(x=>!x.name.startsWith('quickAccount_')).map(x=>[x.name,x.value]));
 await page.locator('[name="journalAccount"]').nth(1).selectOption('__add_account__');await page.locator('[data-quick-account-cancel]').click();assert.equal(await page.locator('[name="journalAccount"]').nth(1).inputValue(),'Owner Capital');
 await page.locator('[name="journalAccount"]').nth(1).selectOption('__add_account__');await page.locator('[data-quick-parent]').selectOption('3000');await page.locator('[data-quick-name]').fill('New Equity Child');
 await page.evaluate(()=>renderFixture());await page.locator('[data-quick-account-save]').click();await page.waitForFunction(()=>document.querySelectorAll('[name="journalAccount"]')[1].value==='New Equity Child');
 const after=await page.locator('#manual-journal-form').evaluate(form=>[...form.querySelectorAll('[name]')].filter(x=>!x.name.startsWith('quickAccount_')).map(x=>[x.name,x.value]));const expected=before.map((entry,index)=>entry[0]==='journalAccount'&&entry[1]==='Owner Capital'?['journalAccount','New Equity Child']:entry);assert.deepEqual(after,expected);
 assert.equal(fixtures.get(id).state.data['custom-accounts'][0].type,'Equity');await screenshot(page,'journal-account-preserved');
 await page.locator('[name="journalAccount"]').nth(0).selectOption('__add_account__');await page.locator('[data-quick-parent]').selectOption('');await page.locator('[data-quick-type]').selectOption('Expense');await page.locator('[data-quick-code]').fill('6020');await page.locator('[data-quick-name]').fill('New Main Expense');await page.locator('[data-quick-account-save]').click();await page.waitForFunction(()=>document.querySelectorAll('[name="journalAccount"]')[0].value==='New Main Expense');assert.equal(await page.locator('[name="journalAccount"]').nth(1).inputValue(),'New Equity Child');assert.equal(fixtures.get(id).state.data['custom-accounts'][1].parentCode,null);
 assert.equal(fixtures.get(id).state.data.transactions[0].amount,123);assert.equal(fixtures.get(id).state.data.subscriptions.length,13);assert.equal(fixtures.get(id).state.data.billing,false);assert.equal(await page.evaluate(()=>globalToastCalls),0);assert.deepEqual(errors,[]);await context.close();
});


test('actual application wiring preserves unfinished purchase and journal forms through online re-renders and saves scoped records',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[],localFailures=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400&&!response.url().includes('favicon'))localFailures.push(response.url());});
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 await page.goto(origin+'/actual');await page.getByRole('button',{name:'Open demo workspace'}).click();
 await page.locator('.sidebar [data-page="accounting"]').click();await page.locator('[data-action="open-journal"]').first().click();
 await page.locator('[name="reference"]').fill('ACTUAL-UNFINISHED');await page.locator('[name="journalDebit"]').nth(0).fill('37.25');
 await page.locator('[name="journalAccount"]').nth(0).selectOption('__add_account__');await page.locator('[data-quick-parent]').selectOption('6000');await page.locator('[data-quick-name]').fill('Actual QA Child');
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));assert.equal(await page.locator('[name="reference"]').inputValue(),'ACTUAL-UNFINISHED');assert.equal(await page.locator('[data-quick-name]').inputValue(),'Actual QA Child');
 await page.evaluate(()=>{document.querySelector('[data-quick-account-save]').click();window.dispatchEvent(new Event('online'));});await page.waitForFunction(()=>document.querySelector('[name="journalAccount"]').value==='Actual QA Child');await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.locator('[name="journalDebit"]').nth(0).inputValue(),'37.25');
 await page.locator('#manual-journal-form [data-action="close-journal"]').last().click();
 await page.locator('.sidebar [data-page="expenses"]').click();await page.locator('[data-action="expense-tab:purchases"]').click();await page.locator('[data-action="open-purchase"]').first().click();
 await page.locator('[name="reference"]').fill('ACTUAL-PO');await page.locator('[name="lineDescription"]').fill('Do not lose this line');await page.locator('[name="lineUnitPrice"]').fill('81.50');
 await page.locator('[name="supplierId"]').selectOption('__add_supplier__');await page.locator('[name="quickSupplier_name"]').fill('Actual QA Vendor');
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));assert.equal(await page.locator('[name="reference"]').inputValue(),'ACTUAL-PO');assert.equal(await page.locator('[name="quickSupplier_name"]').inputValue(),'Actual QA Vendor');
 await page.locator('[data-quick-supplier-save]').click();await page.waitForFunction(()=>document.querySelector('[name="supplierId"]').value.startsWith('BEN-'));
 assert.equal(await page.locator('[name="lineDescription"]').inputValue(),'Do not lose this line');assert.equal(await page.locator('[name="lineUnitPrice"]').inputValue(),'81.50');
 await screenshot(page,'actual-purchase-preserved');
 const stored=await page.evaluate(()=>{const org=DalasiAuth.getActiveOrganization();return {orgId:org.id,accounts:DalasiAuth.getOrgValue(org.id,'custom-accounts',[]),suppliers:DalasiAuth.getOrgValue(org.id,'payment-beneficiaries',[]),journals:DalasiAuth.getOrgValue(org.id,'manual-journals',[]),purchases:DalasiAuth.getOrgValue(org.id,'purchase-orders',[])};});
 assert.equal(stored.accounts.find(x=>x.name==='Actual QA Child').organizationId,stored.orgId);assert.equal(stored.suppliers.find(x=>x.name==='Actual QA Vendor').organizationId,stored.orgId);assert.equal(stored.journals.length,0);assert.equal(stored.purchases.length,0);
 await page.reload();await page.locator('.sidebar').waitFor();assert.equal(await page.evaluate(()=>DalasiAuth.getOrgValue(DalasiAuth.getActiveOrganization().id,'custom-accounts',[]).some(x=>x.name==='Actual QA Child')),true);
 assert.deepEqual(errors,[]);assert.deepEqual(localFailures,[]);await context.close();
});
