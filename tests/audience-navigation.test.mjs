import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PUBLIC_FILES } from '../scripts/build-site.mjs';
const navCode = await readFile(new URL('../apc-navigation.js', import.meta.url), 'utf8');
const formCode = await readFile(new URL('../apc-school-enquiry.js', import.meta.url), 'utf8');
class Target {
  constructor() { this.events = {}; this.attributes = {}; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  fire(name, event = {}) { for (const fn of this.events[name] || []) fn(event); }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  focus() { this.focused = true; }
}
function navigation(href = 'https://autismpathwaysconsulting.com/') {
  const dropdowns = [new Target(), new Target()];
  for (const d of dropdowns) {
    d.summary = new Target(); d.open = false;
    d.querySelector = () => d.summary;
    d.contains = t => t === d || t === d.summary;
  }
  const anchors = ['https://autismpathwaysconsulting.com/parents','https://calm.autismpathwaysconsulting.com/'].map(href => Object.assign(new Target(), { href }));
  anchors[1].setAttribute('aria-current', 'page');
  const document = new Target();
  document.querySelectorAll = selector => selector === '.apc-nav-dropdown' ? dropdowns : anchors;
  const tasks = [];
  vm.runInNewContext(navCode, { document, window: { location: { href } }, URL, setTimeout: fn => tasks.push(fn) });
  return { dropdowns, document, anchors, tasks };
}
test('dropdowns dismiss on Escape with focus restored and only one stays open', () => {
  const { dropdowns: [a,b] } = navigation();
  a.open = true; a.fire('toggle'); b.open = true; b.fire('toggle');
  assert.equal(a.open,false); assert.equal(b.open,true);
  let prevented = false;
  b.fire('keydown',{ key:'Escape', preventDefault:()=>{prevented=true;} });
  assert.equal(b.open,false); assert.equal(b.summary.focused,true); assert.equal(prevented,true);
});
test('outside click and leaving focus close the disclosure; internal focus does not', () => {
  const { dropdowns: [a], document, tasks } = navigation();
  a.open = true; document.activeElement = a.summary; a.fire('focusout'); tasks.shift()(); assert.equal(a.open,true);
  document.activeElement = {}; a.fire('focusout'); tasks.shift()(); assert.equal(a.open,false);
  a.open = true; document.fire('click',{target:{}}); assert.equal(a.open,false);
});
test('current navigation compares origins as well as paths', () => {
  const {anchors} = navigation('https://autismpathwaysconsulting.com/parents/');
  assert.equal(anchors[0].attributes['aria-current'],'page');
  assert.equal(anchors[1].attributes['aria-current'],undefined);
  assert.equal(navigation().anchors[1].attributes['aria-current'],undefined);
});
function enquiry(valid) {
  const form = new Target(); form.reportValidity = () => valid;
  const link = new Target(); const success = { hidden:true };
  const fields = { 'school-training-form':form, 'school-whatsapp-link':link, 'sf-success':success };
  for (const [id,value] of Object.entries({'sf-name':' A & B ','sf-school':'School + Centre','sf-role':'Teacher','sf-phone':'+60 12 345 6789','sf-message':'Line 1\nLine 2? & #'})) fields[id]={value,setCustomValidity(message){this.validationMessage=message;}};
  const document = { getElementById:id=>fields[id] };
  vm.runInNewContext(formCode,{document,encodeURIComponent});
  let prevented = false; form.fire('submit',{preventDefault:()=>{prevented=true;}});
  return {link,success,prevented};
}
test('school enquiry validates before preparing a safely encoded WhatsApp handoff', () => {
  const invalid = enquiry(false); assert.equal(invalid.success.hidden,true); assert.equal(invalid.link.href,undefined);
  const {link,success,prevented} = enquiry(true);
  const url = new URL(link.href);
  assert.equal(url.origin,'https://wa.me'); assert.equal(url.pathname,'/601172998168');
  assert.match(url.searchParams.get('text'),/Name: A & B\n/);
  assert.match(url.searchParams.get('text'),/Line 1\nLine 2\? & #$/);
  assert.equal(url.hash,''); assert.equal(success.hidden,false); assert.equal(link.focused,true); assert.equal(prevented,true);
  // No fetch, window.open or navigation globals exist in this test: submit only prepares a link.
});
test('all shared public headers provide native disclosures and both audience routes', async () => {
  let count=0;
  for (const path of PUBLIC_FILES.filter(p=>p.endsWith('.html'))) {
    const text=await readFile(new URL('../'+path,import.meta.url),'utf8');
    if (!text.includes('class="apc-shell-nav"')) continue;
    const nav=text.match(/<nav class="apc-shell-nav"[\s\S]*?<\/nav>/)[0];
    assert.equal((nav.match(/<details /g)||[]).length,2,path);
    for (const route of ['/parents','/schools','/services','/blog','/resources']) assert.ok(nav.includes(`href="${route}"`),path+route);
    assert.ok(text.includes('/apc-navigation.js?v='),path);
    assert.ok(text.includes('/apc-navigation.css?v='),path); count++;
  }
  assert.equal(count,32);
});
