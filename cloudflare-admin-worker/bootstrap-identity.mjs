// Offline verifier only. Returns evidence, never a JWT or an appointment.
import {readFile} from 'node:fs/promises';
import {webcrypto,createHash} from 'node:crypto';
const source=await readFile(new URL('./worker-paste-private.js',import.meta.url),'utf8');
const {signedIdentity}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
export async function verifyBootstrapIdentity({jwt,issuer,audience,expectedEmail,fetchImpl=fetch,cryptoImpl=webcrypto,now=Math.floor(Date.now()/1000)}){
 const subject=await signedIdentity(new Request('https://offline.internal/',{headers:{'cf-access-jwt-assertion':jwt}}),{ACCESS_ISSUER:issuer,ACCESS_AUDIENCE:audience},fetchImpl,cryptoImpl,now);
 if(!subject)throw Error('Signed identity verification denied');
 const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url').toString('utf8'));
 const header=JSON.parse(Buffer.from(jwt.split('.')[0],'base64url').toString('utf8'));
 if(expectedEmail && (typeof claims.email!=='string'||claims.email.toLowerCase()!==expectedEmail.toLowerCase()))throw Error('Signed identity is not the verified owner');
 return Object.freeze({subject,email:typeof claims.email==='string'?claims.email:null,issuer:new URL(issuer).origin,audience,signatureVerified:true,keyId:header.kid,verifiedAt:new Date(now*1000).toISOString(),expiresAt:new Date(claims.exp*1000).toISOString(),jwtSha256:createHash('sha256').update(jwt).digest('hex')});
}
