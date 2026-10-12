import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './helpdesk-staging.mjs';
const origin='https://staging.example';
const request=(path,method='POST')=>new Request(origin+path,{method,headers:{origin}});
test('disabled staging bridge preserves static site',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('site')}};
 assert.equal((await worker.fetch(request('/'),env)).status,200);
 assert.equal((await worker.fetch(request('/helpdesk/api'),env)).status,404);
});
test('enabled staging proxy requires a service binding',async()=>{
 const env={ASSETS:{fetch:async()=>new Response('site')},DALASIPAY_HELPDESK_TICKETS_ENABLED:'true'};
 assert.equal((await worker.fetch(request('/helpdesk/api'),env)).status,404);
 env.HELPDESK_SERVICE={fetch:async()=>new Response('api')};
 assert.equal((await worker.fetch(request('/helpdesk/api'),env)).status,200);
 assert.equal((await worker.fetch(request('/helpdesk/api','GET'),env)).status,405);
});
