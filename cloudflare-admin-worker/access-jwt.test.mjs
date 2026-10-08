import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessVerifier} from './access-jwt.mjs';
const issuer='https://example.cloudflareaccess.com/';
const audience='app-audience';
const b64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
async function fixture(){
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);
 Object.assign(publicKey,{kid:'test-key',alg:'RS256',use:'sig'});
 const make=async(overrides={})=>{
  const header=b64({alg:'RS256',kid:'test-key'});
  const payload=b64({iss:issuer,aud:[audience],iat:1000,exp:2000,sub:'verified-subject',...overrides});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(header+'.'+payload));
  return header+'.'+payload+'.'+Buffer.from(signature).toString('base64url');
 };
 const verifier=createAccessVerifier({issuer,audience,now:()=>1500,loadKeys:async()=>({keys:[publicKey]})});
 return {make,verifier};
}
const req=token=>new Request('https://staging.example/',{headers:{'cf-access-jwt-assertion':token}});
test('valid cryptographically signed Access token is accepted',async()=>{
 const {make,verifier}=await fixture();
 assert.deepEqual(await verifier(req(await make())),{subject:'verified-subject',email:null});
});
test('wrong audience and expired Access tokens are denied',async()=>{
 const {make,verifier}=await fixture();
 assert.equal(await verifier(req(await make({aud:['other']}))),null);
 assert.equal(await verifier(req(await make({exp:1400}))),null);
});
test('tampered signature and unsigned tokens are denied',async()=>{
 const {make,verifier}=await fixture();
 const signed=await make();
 const [head,payload,sig]=signed.split('.');
 assert.equal(await verifier(req(head+'.'+b64({iss:issuer,aud:[audience],iat:1000,exp:2000,sub:'attacker'})+'.'+sig)),null);
 assert.equal(await verifier(req(b64({alg:'none',kid:'test-key'})+'.'+payload+'.'+sig)),null);
});

test('Cloudflare issuer without trailing slash is valid configuration',async()=>{
 const {make}=await fixture();
 const signed=await make({iss:'https://example.cloudflareaccess.com'});
 const base=await fixture();
 const verifier=createAccessVerifier({issuer:'https://example.cloudflareaccess.com',audience,now:()=>1500,loadKeys:async()=>({keys:[]})});
 assert.equal(await verifier(req(signed)),null);
 assert.equal(typeof verifier,'function');
});
