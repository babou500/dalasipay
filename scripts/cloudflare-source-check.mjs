import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Check the exact approved bytes. Cloudflare asset propagation can lag a Worker
// deployment briefly, so an approved release performs bounded retries.
// A persistent mismatch still fails the release; no hash check is skipped.
export async function verifyPublicSources({
  baseUrl,revision,fetchImpl=fetch,readSource=path=>readFileSync(path,'utf8'),
  maxAttempts=1,retryDelayMs=0,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
}){
  if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>12||retryDelayMs<0)
    throw Error('Invalid source-verification retry configuration');
  const hash=value=>createHash('sha256').update(value.replace(/\r\n/g,'\n')).digest('hex');
  for(const path of ['index.html','registration-feedback.js','subscription-customer.js']){
    const url=new URL(path==='index.html'?'./':path,baseUrl);
    url.searchParams.set('release',revision||'source-check');
    const approvedHash=hash(readSource(path));
    let verified=false;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      try{
        const response=await fetchImpl(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
        verified=response.ok&&hash(await response.text())===approvedHash;
      }catch{
        verified=false;
      }
      if(verified)break;
      if(attempt<maxAttempts){
        console.warn('Public source not verified yet: '+path+' (attempt '+attempt+'/'+maxAttempts+'); retrying.');
        await wait(retryDelayMs);
      }
    }
    if(!verified)throw Error('Live public source differs from approved commit: '+path+' after '+maxAttempts+' attempt(s)');
  }
}