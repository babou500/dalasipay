import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.mjs';
const request=()=>new Request('https://dalasipay-support.invalid/helpdesk/api',{method:'POST',headers:{origin:'https://dalasipay-support.invalid',authorization:'Bearer test'},body:JSON.stringify({action:'list'})});
test('customer ticket endpoint is unavailable by default',async()=>{const result=await worker.fetch(request(),{});assert.equal(result.status,404);assert.equal(result.headers.get('cache-control'),'no-store');});
test('disabled route cannot be activated by values supplied in the request',async()=>{const forged=new Request('https://dalasipay-support.invalid/helpdesk/api?DALASIPAY_HELPDESK_TICKETS_ENABLED=true',{method:'POST',headers:{origin:'https://dalasipay-support.invalid','x-helpdesk-tickets-enabled':'true'},body:'{}'});const result=await worker.fetch(forged,{});assert.equal(result.status,404);});
