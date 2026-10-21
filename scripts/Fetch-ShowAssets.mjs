// Downloads only public author-shared CC0 Quaternius character files.
import fs from 'node:fs/promises';
const ids=process.argv.slice(2);
async function folder(id){const response=await fetch('https://drive.google.com/drive/folders/'+id,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error('Folder HTTP '+response.status);const html=await response.text();const match=html.match(/window\['_DRIVE_ivd'\] = '([^']*)'/);if(!match)throw Error('Public listing missing for '+id);const raw=match[1].replace(/\\x([0-9a-f]{2})/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/\\'/g,"'");const files=JSON.parse(raw)[0]||[];return files.map(row=>({id:row[0],name:row[2],type:row[3]}));}
if(ids[0]==='--download'){
 const [,id,target]=ids;if(!id||!target||!target.startsWith('Frontend/public/assets/characters/'))throw Error('Specify public file and workspace character target.');
 const response=await fetch('https://drive.usercontent.google.com/download?id='+encodeURIComponent(id)+'&export=download',{signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('Asset HTTP '+response.status);if(response.headers.get('content-type')?.includes('text/html'))throw Error('Download returned HTML, not a model.');await fs.mkdir('Frontend/public/assets/characters',{recursive:true});const bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(target,bytes);console.log(target,bytes.length);
}else for(const id of ids){const files=await folder(id);await fs.writeFile('artifacts/drive-'+id+'.json',JSON.stringify(files,null,2));console.log(id,files);}
