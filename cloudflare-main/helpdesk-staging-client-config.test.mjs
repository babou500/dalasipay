import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './helpdesk-staging.mjs';
const base='https://dalasipay-staging.example';
const assets={fetch:async()=>new Response('<html><head></head><body>DalasiPay</body></html>',{headers:{'content-type':'text/html'}})};
test('staging page loads only local ticket configuration',async()=>{const response=await worker.fetch(new Request(base+'/'),{ASSETS:assets});const html=await response.text();assert.match(html,/src="\/helpdesk\/client-config\.js"/);assert.match(html,/DalasiPay/)});
test('ticket UI stays disabled without server setting and service binding',async()=>{const r=await worker.fetch(new Request(base+'/helpdesk/client-config.js'),{ASSETS:assets});assert.match(await r.text(),/ENABLED=false/);assert.equal(r.headers.get('cache-control'),'no-store')});
test('configuration permits UI only with both server flag and binding',async()=>{const env={ASSETS:assets,DALASIPAY_HELPDESK_TICKETS_ENABLED:'true',HELPDESK_SERVICE:{fetch:async()=>new Response('ok')}};const r=await worker.fetch(new Request(base+'/helpdesk/client-config.js'),env);assert.match(await r.text(),/ENABLED=true/)});
