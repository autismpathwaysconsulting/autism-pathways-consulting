import fs from 'node:fs/promises';
import {PUBLIC_FILES} from './build-site.mjs';
const config=JSON.parse(await fs.readFile(new URL('./site-labels.json',import.meta.url),'utf8'));
const root=new URL('../',import.meta.url);
const links=items=>items.map(([href,label])=>`<a href="${href}">${label}</a>`).join('');
// Phones get a Menu button; apc-navigation.js reveals it and keeps the full nav for larger screens.
// The inline script marks the header before the nav paints, so the phone header does not jump when apc-navigation.js loads.
const toggle=`<button class="apc-nav-toggle" type="button" aria-expanded="false" aria-controls="apc-primary-nav" aria-label="Menu">Menu</button><script>document.currentScript.closest('.apc-site-header').classList.add('apc-nav-js')</script>`;
const nav=`<nav class="apc-shell-nav" id="apc-primary-nav" aria-label="Primary navigation">${links(config.primary)}${config.resources.length?`<details class="apc-nav-dropdown"><summary>Resources</summary><div class="apc-dropdown-panel">${links(config.resources)}</div></details>`:''}${links([config.contact])}</nav>`;
const [ctaHref,ctaLabel]=config.cta;
// Phones show the short label; the hidden one is display:none, so the accessible name always matches what is on screen.
const cta=current=>`<a class="apc-shell-start" href="${ctaHref}"${current?' aria-current="page"':''}><span class="apc-cta-long">${ctaLabel}</span><span class="apc-cta-short">Free call</span></a>`;
const [legal,scope]=config.footer;
// The footer keeps every audience page and the free Quick Check, whatever the header menu shows.
const pages=[['/about','About CJ'],['/parents','For Parents'],['/schools','For Centres and Schools'],['/teacher-talk','Teacher Talk'],['/resources','Resources']];
const explore=[...pages,['/parents#pattern-session','Pattern Session'],['/big-reactions-quick-check','Free Quick Check']];
const policies=[['/privacy','Privacy Policy'],['/terms','Terms and Conditions'],['/cancellation-policy','Cancellation Policy'],['/disclaimer','Disclaimer']];
// Every public page carries the company line and the scope paragraph; main pages keep the link columns.
const mainFooter=`<footer class="apc-footer">
  <div class="apc-footer-inner">
    <div class="apc-footer-brand"><a href="/" class="apc-footer-logo">Autism Pathways Consulting</a></div>
    <nav class="apc-footer-column" aria-label="Explore"><h3>Explore</h3>${links(explore)}</nav>
    <div class="apc-footer-column"><h3>Contact</h3><a href="/go/first-step-call">Free 15-Min First Step Call</a><a href="https://wa.me/601172998168" target="_blank" rel="noopener"><span>WhatsApp: <span class="apc-footer-nowrap">011-7299 8168</span></span></a><a href="mailto:cjlim@autismpathwaysconsulting.com">cjlim@autismpathwaysconsulting.com</a><a href="https://www.instagram.com/autismpathwaysconsulting/" target="_blank" rel="noopener">Instagram</a></div>
  </div>
  <div class="apc-footer-bottom"><p>${legal}</p><nav class="apc-footer-policies" aria-label="Policies">${policies.map(([href,label])=>`<a href="${href}">${label}</a>`).join('<span aria-hidden="true"> · </span>')}</nav><p>${scope}</p></div>
</footer>`;
const minimalFooter=`<footer class="apc-footer apc-footer-minimal">
  <div class="apc-footer-minimal-inner">
    <a href="/" class="apc-footer-logo">Autism Pathways Consulting</a>
    <nav class="apc-footer-minimal-links" aria-label="Footer navigation">${links(pages)}</nav>
    <p>${legal}</p>
    <nav class="apc-footer-minimal-policies" aria-label="Policies">${policies.slice(0,2).map(([href,label])=>`<a href="${href}">${label}</a>`).join('<span aria-hidden="true">·</span>')}</nav>
    <p>${scope}</p>
  </div>
</footer>`;
const changed=[];
for(const file of PUBLIC_FILES.filter(p=>p.endsWith('.html')&&!p.startsWith('content-os/')&&!p.startsWith('pathways-lab/'))){
 const url=new URL(file,root),old=await fs.readFile(url,'utf8');
 let next=old.replace(/<button class="apc-nav-toggle"[\s\S]*?<\/button>(?:<script>[^<]*<\/script>)?/g,'');
 next=next.replace(/<nav class="apc-shell-nav"[\s\S]*?<\/nav>/g,toggle+nav);
 next=next.replace(/<a class="apc-shell-start"[^>]*>[\s\S]*?<\/a>/g,cta(false));
 // Retired routes: educator training moved to /teacher-talk, everything else under /services to /parents.
 next=next.replace(/href="\/services#educator-training"/g,'href="/teacher-talk"').replace(/href="\/services(#[^"]*)?"/g,'href="/parents"');
 next=next.replace(/APC Calm(?: Companion)?(?![\w])/g,'APC Calm App').replace(/APC Calm App App/g,'APC Calm App');
 next=next.replace(/<footer class="apc-footer apc-footer-minimal">[\s\S]*?<\/footer>/g,minimalFooter);
 next=next.replace(/<footer class="apc-footer">[\s\S]*?<\/footer>/g,mainFooter);
 if(file==='programmes.html')for(const [id,name]of Object.entries(config.programmes)){
  const label=name.replace(/&/g,'&amp;');
  next=next.replace(new RegExp(`(<input[^>]*name="programmes"[^>]*value="${id}"[^>]*>)[^<]*`),`$1${label}`);
  next=next.replace(new RegExp(`(id="tab-${id}"[\\s\\S]*?<strong>)[^<]*`),`$1${label}`);
 }
 if(next!==old){changed.push(file);if(!process.argv.includes('--check'))await fs.writeFile(url,next);}
}
// Private planning labels share the public programme-name source.
{
 const file='content-os/programmes/resources.html',url=new URL(file,root);
 const old=await fs.readFile(url,'utf8');
 const next=old.replace(/(<span data-programme-name="([^"]+)">)[^<]*(<\/span>)/g,(all,open,id,close)=>{
  if(!config.programmes[id])throw Error('Unknown programme name: '+id);
  return open+config.programmes[id].replace(/&/g,'&amp;')+close;
 });
 if(next!==old){changed.push(file);if(!process.argv.includes('--check'))await fs.writeFile(url,next);}
}
for(const [file,variable] of [['programme-interest.js','names'],['content-os/programmes/app.js','labels']]){
 const url=new URL(file,root),old=await fs.readFile(url,'utf8');
 const next=old.replace(new RegExp(`const ${variable}\\s*=\\s*\\{[^;]+;`),`const ${variable} = ${JSON.stringify(config.programmes)};`);
 if(next!==old){changed.push(file);if(!process.argv.includes('--check'))await fs.writeFile(url,next);}
}
if(process.argv.includes('--check')&&changed.length)throw Error('Run node scripts/sync-site-labels.mjs: '+changed.join(', '));
console.log(changed.length?'Synced '+changed.length+' files.':'Shared site labels are consistent.');
