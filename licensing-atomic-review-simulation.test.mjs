import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateAtomicReview} from './licensing-atomic-review-simulation.mjs';
const request=Object.freeze({id:'request-a',status:'pending'});
test('failed audit leaves original request pending',async()=>{
 const result=await simulateAtomicReview({request,decision:'approved',authorize:async()=>true,writeAudit:async()=>{throw Error('audit failure')}});
 assert.equal(result.ok,false);assert.equal(result.reason,'rolled_back');
 assert.equal(result.request.status,'pending');assert.equal(request.status,'pending');
});
test('valid decision stages an audit event',async()=>{
 const records=[];
 const result=await simulateAtomicReview({request,decision:'rejected',authorize:async()=>true,writeAudit:async e=>records.push(e)});
 assert.equal(result.ok,true);assert.equal(result.request.status,'rejected');
 assert.deepEqual(records,[{requestId:'request-a',eventType:'review_rejected'}]);
});
test('unauthorized reviewer never writes',async()=>{
 let called=false;
 const result=await simulateAtomicReview({request,decision:'approved',authorize:async()=>false,writeAudit:async()=>{called=true}});
 assert.equal(result.ok,false);assert.equal(called,false);
});
