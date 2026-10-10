import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Verify the authentication page as well as customer assets after an approved release.
export async function verifyPublicSources({baseUrl,revision,fetchImpl=fetch,readSource=path=>readFileSync(path,'utf8')}){
  const hash=value=>createHash('sha256').update(value.replace(/\r\n/g,'\n')).digest('hex');
  for(const path of ['index.html','registration-feedback.js','subscription-customer.js']){
    const url=new URL(path==='index.html'?'./':path,baseUrl);url.searchParams.set('release',revision||'source-check');
    const response=await fetchImpl(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok||hash(await response.text())!==hash(readSource(path)))throw Error(`Live public source differs from approved commit: ${path}`);
  }
}
