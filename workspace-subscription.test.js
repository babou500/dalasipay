'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const subscriptions=require('./workspace-subscription.js');
test('existing workspace without a record retains Professional Preview',()=>{
 const record=subscriptions.resolveExistingWorkspace('org_123');
 assert.equal(record.status,'professional_preview');
 assert.equal(subscriptions.describe(record).entitlements.planId,'professional-preview');
 assert.equal(subscriptions.describe(record).entitlements.limits.employees,null);
});
test('new workspace defaults to free without changing old workspace',()=>{
 const record=subscriptions.resolveNewWorkspace('org_456');
 assert.equal(record.planId,'free');
 assert.equal(subscriptions.describe(record).entitlements.limits.invoicesPerMonth,25);
 assert.equal(subscriptions.resolveExistingWorkspace('org_456').professionalPreview,true);
});
test('records are read-only and reject invalid assignments',()=>{
 assert.equal(subscriptions.resolveExistingWorkspace('../unsafe'),null);
 assert.equal(subscriptions.parseRecord('org_1',{workspaceId:'org_2',planId:'free',status:'active'}),null);
 assert.equal(subscriptions.parseRecord('org_1',{workspaceId:'org_1',planId:'free',status:'professional_preview',professionalPreview:true}),null);
 const record=subscriptions.freeRecord('org_1');
 assert.equal(Object.isFrozen(record),true);
 assert.equal(subscriptions.describe(record).label,'Free');
});
test('invalid or missing data never authorizes a feature',()=>{
 assert.equal(subscriptions.describe(null).valid,false);
 assert.equal(subscriptions.resolveNewWorkspace('',null),null);
});
