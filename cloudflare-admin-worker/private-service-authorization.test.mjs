import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateServiceAuthorization} from './private-service-authorization.mjs';
const request=token=>new Request('https://admin.example.test/',{headers:token?{'cf-access-jwt-assertion':token}:{}});
test('missing assertion never calls private service',async()=>{
 let calls=0;const authorize=createPrivateServiceAuthorization({service:{fetch:async()=>{calls++;return Response.json({authorized:true})}}});
 assert.equal(await authorize(request()),false);assert.equal(calls,0);
});
test('forwards token only to internal binding and requires explicit boolean approval',async()=>{
 let target,assertion;
 const authorize=createPrivateServiceAuthorization({service:{fetch:async req=>{target=req.url;assertion=req.headers.get('cf-access-jwt-assertion');return Response.json({authorized:true});}}});
 assert.equal(await authorize(request('signed-assertion')),true);
 assert.equal(target,'https://admin-membership.internal/internal/admin/authorize');
 assert.equal(assertion,'signed-assertion');
});
test('denied, malformed, or failed private responses cannot approve',async()=>{
 const denied=createPrivateServiceAuthorization({service:{fetch:async()=>Response.json({authorized:false},{status:403})}});
 assert.equal(await denied(request('token')),false);
 const malformed=createPrivateServiceAuthorization({service:{fetch:async()=>Response.json({status:'ok'})}});
 await assert.rejects(()=>malformed(request('token')),/Invalid private verification response/);
 const down=createPrivateServiceAuthorization({service:{fetch:async()=>new Response('',{status:503})}});
 await assert.rejects(()=>down(request('token')),/unavailable/);
});
test('binding absence and overlong assertion fail closed',async()=>{
 assert.throws(()=>createPrivateServiceAuthorization(),TypeError);
 let calls=0;const authorize=createPrivateServiceAuthorization({service:{fetch:async()=>{calls++;return Response.json({authorized:true})}}});
 assert.equal(await authorize(request('x'.repeat(16001))),false);assert.equal(calls,0);
});
