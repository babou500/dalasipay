import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyBootstrapIdentity} from './bootstrap-identity.mjs';
const issuer='https://fixture.cloudflareaccess.com',audience='fixture-audience';
const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const key={...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function token(claims={}){const input=encode({alg:'RS256',kid:key.kid})+'.'+encode({iss:issuer,aud:[audience],sub:'actual-signed-subject',email:'owner@fixture.test',iat:1000,exp:2000,...claims});return input+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(input))).toString('base64url');}
const config={issuer,audience,expectedEmail:'owner@fixture.test',now:1500,fetchImpl:async()=>Response.json({keys:[key]})};
test('owner evidence uses actual signed sub and excludes raw JWT and login-log ID',async()=>{
 const jwt=await token();const evidence=await verifyBootstrapIdentity({...config,jwt,loginLogUserId:'unrelated-log-id'});
 assert.equal(evidence.subject,'actual-signed-subject');assert.equal(evidence.signatureVerified,true);assert.match(evidence.jwtSha256,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(evidence),/unrelated-log-id|eyJ/);assert.ok(!Object.values(evidence).includes(jwt));
});
test('wrong owner, audience, expiry or tampered subject produces no evidence',async()=>{
 for(const claims of [{email:'other@fixture.test'},{aud:['wrong']},{exp:1499}])await assert.rejects(verifyBootstrapIdentity({...config,jwt:await token(claims)}));
 const jwt=await token();const [h,,sig]=jwt.split('.');await assert.rejects(verifyBootstrapIdentity({...config,jwt:h+'.'+encode({iss:issuer,aud:[audience],sub:'forged-subject',email:'owner@fixture.test',iat:1000,exp:2000})+'.'+sig}));
});
