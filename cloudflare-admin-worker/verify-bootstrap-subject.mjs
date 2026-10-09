// Offline identity evidence only. Does not appoint anyone or contact Supabase.
import {readFile,writeFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const [tokenPath,evidencePath]=process.argv.slice(2);
if(!tokenPath||!evidencePath)throw Error('Usage: node verify-bootstrap-subject.mjs PROTECTED_TOKEN_FILE NEW_EVIDENCE_FILE');
try{
 const source=await readFile(new URL('./worker-paste-private.js',import.meta.url),'utf8');
 const {signedIdentity}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const jwt=(await readFile(tokenPath,'utf8')).trim();
 const env={ACCESS_ISSUER:process.env.ACCESS_ISSUER,ACCESS_AUDIENCE:process.env.ACCESS_AUDIENCE};
 if(!env.ACCESS_ISSUER||!env.ACCESS_AUDIENCE)throw Error('Configuration required');
 const subject=await signedIdentity(new Request('https://offline.internal/',{headers:{'cf-access-jwt-assertion':jwt}}),env,fetch,webcrypto);
 if(!subject)throw Error('Identity verification denied');
 await writeFile(evidencePath,JSON.stringify({subject,issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUDIENCE,verifiedAt:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});
 console.log('Verified subject evidence written. Independent account and appointment approval still required.');
}catch{console.error('Subject verification failed; no appointment performed.');process.exitCode=1;}
