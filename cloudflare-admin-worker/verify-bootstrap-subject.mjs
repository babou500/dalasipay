// Offline identity evidence only. Does not appoint anyone or contact Supabase.
import {readFile,writeFile} from 'node:fs/promises';
import {verifyBootstrapIdentity} from './bootstrap-identity.mjs';
const [tokenPath,evidencePath]=process.argv.slice(2);
if(!tokenPath||!evidencePath)throw Error('Usage: node verify-bootstrap-subject.mjs PROTECTED_TOKEN_FILE NEW_EVIDENCE_FILE');
try{
 const jwt=(await readFile(tokenPath,'utf8')).trim();
 const env={ACCESS_ISSUER:process.env.ACCESS_ISSUER,ACCESS_AUDIENCE:process.env.ACCESS_AUDIENCE};
 if(!env.ACCESS_ISSUER||!env.ACCESS_AUDIENCE)throw Error('Configuration required');
 const evidence=await verifyBootstrapIdentity({jwt,issuer:env.ACCESS_ISSUER,audience:env.ACCESS_AUDIENCE,expectedEmail:process.env.OWNER_EMAIL});
 await writeFile(evidencePath,JSON.stringify(evidence,null,2),{flag:'wx',mode:0o600});
 console.log('Verified signed-subject evidence written. Ownership and documented appointment authorization are still required.');
}catch{console.error('Subject verification failed; no appointment performed.');process.exitCode=1;}
