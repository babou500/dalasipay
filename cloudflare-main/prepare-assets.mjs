// Explicit public assets only. Tests, SQL, docs, config and credentials excluded.
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url),out=new URL('../.wrangler/main-assets/',import.meta.url);
await mkdir(out,{recursive:true});
const files=(await readdir(root)).filter(n=>/\.(html|js|css|svg|mjs)$/.test(n)&&!n.includes('.test.'));
for(const file of files)await writeFile(new URL(file,out),(await readFile(new URL(file,root),'utf8')).replace(/\r\n/g,'\n'));
console.log(`Prepared ${files.length} public assets for the existing dalasipay Worker.`);
