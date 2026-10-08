import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedOperatorResolver} from './operator-identity-map.mjs';
const subject='cloudflare-subject-123';const userId='11111111-1111-4111-8111-111111111111';
test('only explicitly approved exact-subject operator mapping passes',async()=>{
 const resolver=createApprovedOperatorResolver({lookupIdentity:async s=>({accessSubject:s,userId,approved:true}),lookupMembership:async()=>true});
 assert.equal(await resolver(subject),true);
});
test('unmapped Cloudflare account, unapproved mapping and mismatched subject denied',async()=>{
 for(const mapping of [null,{accessSubject:subject,userId,approved:false},{accessSubject:'another-subject',userId,approved:true}]){
  let membershipCalls=0;
  const resolver=createApprovedOperatorResolver({lookupIdentity:async()=>mapping,lookupMembership:async()=>{membershipCalls++;return true;}});
  assert.equal(await resolver(subject),false);assert.equal(membershipCalls,0);
 }
});
test('operator removed from platform allowlist is denied despite mapped Access identity',async()=>{
 const resolver=createApprovedOperatorResolver({lookupIdentity:async()=>({accessSubject:subject,userId,approved:true}),lookupMembership:async()=>false});
 assert.equal(await resolver(subject),false);
});
test('invalid subjects denied without database lookup; dependency failure rejects',async()=>{
 let calls=0;
 const resolver=createApprovedOperatorResolver({lookupIdentity:async()=>{calls++;return null;},lookupMembership:async()=>false});
 assert.equal(await resolver('bad'),false);assert.equal(calls,0);
 assert.throws(()=>createApprovedOperatorResolver(),TypeError);
 const broken=createApprovedOperatorResolver({lookupIdentity:async()=>{throw Error('unavailable');},lookupMembership:async()=>true});
 await assert.rejects(()=>broken(subject),/unavailable/);
});
