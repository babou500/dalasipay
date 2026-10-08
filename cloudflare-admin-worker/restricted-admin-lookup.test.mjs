import test from 'node:test';
import assert from 'node:assert/strict';
import {createRestrictedAdminLookup} from './restricted-admin-lookup.mjs';
const config={supabaseUrl:'https://example.supabase.co',serverCredential:'test-only'};
test('returns only boolean from restricted RPC',async()=>{
 let seen;
 const lookup=createRestrictedAdminLookup({...config,fetchImpl:async(url,init)=>{seen={url,init};return Response.json(false);}});
 assert.equal(await lookup('verified-access-subject'),false);
 assert.match(seen.url,/\/rpc\/platform_admin_identity_authorized_internal$/);
 assert.deepEqual(JSON.parse(seen.init.body),{p_subject:'verified-access-subject'});
});
test('denied RPC privileges and errors never grant access',async()=>{
 const lookup=createRestrictedAdminLookup({...config,fetchImpl:async()=>Response.json({message:'permission denied'},{status:403})});
 await assert.rejects(()=>lookup('verified-access-subject'),/unavailable/);
});
test('invalid or malformed response cannot authorize',async()=>{
 const lookup=createRestrictedAdminLookup({...config,fetchImpl:async()=>Response.json({authorized:true})});
 await assert.rejects(()=>lookup('verified-access-subject'),/Invalid membership response/);
});
test('invalid subject never calls database',async()=>{
 let calls=0;
 const lookup=createRestrictedAdminLookup({...config,fetchImpl:async()=>{calls++;return Response.json(true);}});
 assert.equal(await lookup('x'),false);assert.equal(calls,0);
});
