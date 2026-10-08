'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {render}=require('./subscription-usage-panel.js');
const org='11111111-1111-4111-8111-111111111111';
test('renders verified and provisional numbers separately',()=>{
 const html=render({ok:true,workspaceId:org,enforcementActive:false,usage:{users:{count:1},employees:{count:0}},monthlyDiagnostics:{month:'2026-10',invoices:2,supplierBills:0,authoritative:false}},org);
 assert.match(html,/Workspace usage/);assert.match(html,/Monthly document diagnostics/);assert.match(html,/2026-10/);assert.match(html,/Provisional/);
});
test('no cross workspace or unverified HTML',()=>{
 assert.equal(render({ok:true,workspaceId:'other',enforcementActive:false},org),'');
 assert.equal(render({ok:true,workspaceId:org,enforcementActive:true},org),'');
});
test('does not inject untrusted fields into markup',()=>{
 const html=render({ok:true,workspaceId:org,enforcementActive:false,usage:{users:{count:'<img src=x>'}}},org);
 assert.doesNotMatch(html,/<img/);assert.match(html,/Unavailable/);
});
