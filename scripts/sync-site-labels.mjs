import fs from 'node:fs/promises';
import {PUBLIC_FILES} from './build-site.mjs';
const config=JSON.parse(await fs.readFile(new URL('./site-labels.json',import.meta.url),'utf8'));
const root=new URL('../',import.meta.url);
const links=items=>items.map(([href,label])=>`<a href="${href}">${label}</a>`).join('');
const nav=`<nav class="apc-shell-nav" aria-label="Primary navigation"><a href="/about">About CJ</a><details class="apc-nav-dropdown"><summary>Services</summary><div class="apc-dropdown-panel">${links(config.services)}</div></details><details class="apc-nav-dropdown"><summary>Resources</summary><div class="apc-dropdown-panel">${links(config.resources)}</div></details></nav>`;
const changed=[];
for(const file of PUBLIC_FILES.filter(p=>p.endsWith('.html')&&!p.startsWith('content-os/')&&!p.startsWith('pathways-lab/'))){
 const url=new URL(file,root),old=await fs.readFile(url,'utf8');
 let next=old.replace(/<nav class="apc-shell-nav"[\s\S]*?<\/nav>/g,nav);
 next=next.replace(/<a\b([^>]*?)href="\/services(#[^"]*)?"([^>]*)>([\s\S]*?)<\/a>/g,(all,before,fragment,after,label)=>{
  if(fragment||/support|parent sessions|parent session/i.test(label))return `<a${before}href="/parents${fragment==='#service-slide-session'?'#one-concern':fragment||''}"${after}>${label.replace(/Parent sessions &amp; programmes|Parent Support Options|parent support options|Parent support/g,'Parent Home Support')}</a>`;
  return all;
 });
 next=next.replace(/APC Calm(?: Companion)?(?![\w])/g,'APC Calm App').replace(/APC Calm App App/g,'APC Calm App');
 next=next.replace(/>Parent support</g,'>Parent Home Support<').replace(/>Explore parent support</g,'>Explore Parent Home Support<');
 next=next.replace(/<footer\b[\s\S]*?<\/footer>/g,footer=>footer.replace(/<a href="\/services">Services<\/a>/g,'<a href="/services">Learning &amp; Workshops</a>').replace(/(<a href="\/resources">Resources<\/a>)(?!<a href="\/programmes">)/g,'$1<a href="/programmes">Upcoming Programmes</a>'));
 if(next!==old){changed.push(file);if(!process.argv.includes('--check'))await fs.writeFile(url,next);}
}
for(const [file,variable] of [['programme-interest.js','names'],['content-os/programmes/app.js','labels']]){
 const url=new URL(file,root),old=await fs.readFile(url,'utf8');
 const next=old.replace(new RegExp(`const ${variable}\\s*=\\s*\\{[^;]+;`),`const ${variable} = ${JSON.stringify(config.programmes)};`);
 if(next!==old){changed.push(file);if(!process.argv.includes('--check'))await fs.writeFile(url,next);}
}
if(process.argv.includes('--check')&&changed.length)throw Error('Run node scripts/sync-site-labels.mjs: '+changed.join(', '));
console.log(changed.length?'Synced '+changed.length+' files.':'Shared site labels are consistent.');
