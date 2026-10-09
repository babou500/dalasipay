import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const worker=await readFile(new URL('./worker-paste-private.js',import.meta.url),'utf8');
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(worker).toString('base64'));
const base={ACCESS_ISSUER:'https://example.cloudflareaccess.com',ACCESS_AUDIENCE:'test-audience',DALASIPAY_SUPABASE_URL:'https://zdpmlzmljozcmqndyfog.supabase.co',DALASIPAY_SUPABASE_SERVICE_ROLE_KEY:'not-real'};
const request=(path,method='POST')=>new Request('https://admin-membership.internal'+path,{method});
test('identity comparison endpoint requires POST and cannot reveal subjects',async()=>{
 const r=await handler.fetch(request('/internal/admin/identity-match','GET'),base);
 assert.equal(r.status,404);assert.deepEqual(await r.json(),{authorized:false});
});
test('identity comparison denies missing Access assertion',async()=>{
 const r=await handler.fetch(request('/internal/admin/identity-match'),{...base,EXPECTED_ADMIN_ACCESS_SUBJECT:'2c90d82a-265c-53a5-9d04-ad762ab8c4e5'});
 assert.equal(r.status,403);assert.deepEqual(await r.json(),{authorized:false});
});
test('identity comparison fails closed without trusted configuration',async()=>{
 const r=await handler.fetch(request('/internal/admin/identity-match'),{});
 assert.equal(r.status,503);assert.deepEqual(await r.json(),{authorized:false});
});
test('authorization endpoint remains denied without assertion',async()=>{
 const r=await handler.fetch(request('/internal/admin/authorize'),base);
 assert.equal(r.status,403);assert.deepEqual(await r.json(),{authorized:false});
});
