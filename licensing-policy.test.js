'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const p=require('./licensing-policy.js');
test('agreed free and standard limits',()=>{
 assert.deepEqual(p.PLANS.free.limits,{companies:1,users:2,employees:5,invoicesPerMonth:25,supplierBillsPerMonth:25});
 assert.deepEqual(p.PLANS.standard.limits,{companies:1,users:5,employees:25,invoicesPerMonth:null,supplierBillsPerMonth:null});
 assert.equal(p.PLANS.professional.limits.employees,null);
});
test('preview is explicit and does not change the underlying Free plan',()=>{
 assert.equal(p.getEntitlements('free',{professionalPreview:true}).planId,'professional-preview');
 assert.equal(p.getEntitlements('free').planId,'free');
 assert.equal(p.getEntitlements('invalid'),null);
});
test('limits enforce boundaries and reject invalid usage',()=>{
 const e=p.getEntitlements('free');
 assert.equal(p.checkLimit(e,'invoicesPerMonth',24,1).allowed,true);
 assert.equal(p.checkLimit(e,'invoicesPerMonth',25,1).allowed,false);
 assert.equal(p.checkLimit(e,'users',-1,1).reason,'invalid_usage');
 assert.equal(p.checkLimit(e,'users',1,1.2).reason,'invalid_usage');
 assert.equal(p.checkLimit(e,'unknown',1,1).allowed,false);
 assert.equal(p.checkLimit(p.getEntitlements('standard'),'invoicesPerMonth',100000,1).allowed,true);
});
test('feature checks deny unknown and unavailable features',()=>{
 assert.equal(p.checkFeature(p.getEntitlements('free'),'makerChecker').allowed,false);
 assert.equal(p.checkFeature(p.getEntitlements('professional'),'makerChecker').allowed,true);
 assert.equal(p.checkFeature(p.getEntitlements('professional'),'nonexistent').reason,'unknown_feature');
});
