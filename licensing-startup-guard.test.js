'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');

test('legacy licensing script is never loaded',()=>{
 assert.doesNotMatch(html,/<script\b[^>]*\bsrc=["'][^"']*\/??licensing\.js(?:[?"'])/i);
});
test('server licensing observer and HTTP adapter are not loaded by the browser',()=>{
 assert.doesNotMatch(html,/<script\b[^>]*\bsrc=["'][^"']*(?:cloudflare-licensing-observer|licensing-http-adapter|licensing-observer-core)\.mjs/i);
});
test('subscription view is optional and keeps its safe fallback',()=>{
 assert.match(html,/DalasiPlanView/);
 assert.match(html,/Subscription information is temporarily unavailable/);
 assert.match(html,/renderPlanComparison\?\.\(\)/);
});
test('dashboard startup is independent of licensing service',()=>{
 assert.match(html,/if\(state\.session\)loadOrgState\(\)/);
 assert.match(html,/\bwindow\.DalasiProduction\.bootstrap\(\)/);
 assert.doesNotMatch(html,/await\s+(?:window\.)?(?:DalasiPlanView|DalasiLicensingPolicy|DalasiWorkspaceSubscription|DalasiPlanUsage)/);
});
