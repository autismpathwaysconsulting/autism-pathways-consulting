import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
test('course copy and sharing metadata use the current development-stage offer',()=>{
 for(const page of ['connect/index.html','course-waitlist.html','services.html']){
  const html=read(page);
  assert.match(html,/Understanding Escalation at Home/,page);
  assert.match(html,/in development|still in development/i,page);
  assert.doesNotMatch(html,/Hanen-backed|RM\s*(147|197)\b|Communication Course|How to Connect with Your Child|early.bird|special price/i,page);
 }
 const interest=read('course-waitlist.html');
 assert.doesNotMatch(interest,/<iframe|sibforms\.com/i);
 assert.match(interest,/mailto:cjlim@autismpathwaysconsulting\.com\?subject=Understanding/);
 assert.match(interest,/does not reserve a place or subscribe you to marketing emails/);
 assert.doesNotMatch(read('connect/index.html'),/sibforms\.com/);
});
test('resource guide entries lead to guides rather than the workshops page',()=>{
 const main=read('resources.html').split('<main')[1].split('</main>')[0];
 assert.doesNotMatch(main,/href="\/services"/);
 for(const route of ['/task-initiation','/communication'])assert.ok(main.includes(`href="${route}"`));
});
test('private resources use current programme names and distinguish availability from verification',()=>{
 const html=read('content-os/programmes/resources.html');
 const names=JSON.parse(read('scripts/site-labels.json')).programmes;
 for(const [id,name] of Object.entries(names))assert.ok(html.includes(`<span data-programme-name="${id}">${name.replaceAll('&','&amp;')}</span>`));
 assert.doesNotMatch(html,/remains disabled in this draft|Community Adventure Camp/);
 assert.match(html,/genuine submission/);
});
test('cross-page support and course fragments resolve to actual destinations',()=>{
 for(const file of ['services.html','start.html','resources.html','connect/index.html','course-waitlist.html']){
  for(const [,href]of read(file).matchAll(/href="(\/[^"]*#[^"]+)"/g)){
   const url=new URL(href,'https://example.test');
   const path=url.pathname.slice(1);
   const target=[path+'.html',path+'/index.html'].find(p=>existsSync(resolve(root,p)));
   assert.ok(target,`${file}: ${href}`);
   assert.ok(read(target).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`${file}: ${href}`);
  }
 }
});
