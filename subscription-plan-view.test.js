'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const view=require('./subscription-plan-view.js');
test('existing workspace displays Professional Preview with unlimited allowances',()=>{
 const m=view.getDisplayModel('org_1',null,{existingWorkspace:true});
 assert.equal(m.title,'Professional Preview');
 assert.equal(m.preview,true);
 assert.equal(m.usage.find(x=>x.key==='employees').limitLabel,'Unlimited');
 assert.match(view.renderReadOnly(m),/Professional Preview/);
});
test('new workspace displays Free limits without enforcement',()=>{
 const m=view.getDisplayModel('org_2',null,{existingWorkspace:false});
 assert.equal(m.title,'Free');
 assert.equal(m.usage.find(x=>x.key==='invoicesPerMonth').limit,25);
 assert.equal(m.features.find(x=>x.key==='makerChecker').included,false);
 assert.match(m.note,/enforcement is not active/);
});
test('invalid workspace renders harmless error state',()=>{
 const m=view.getDisplayModel('../no',null,{existingWorkspace:true});
 assert.equal(m.valid,false);
 assert.match(view.renderReadOnly(m),/Subscription unavailable/);
});
test('HTML content is escaped',()=>{
 assert.equal(view.escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
