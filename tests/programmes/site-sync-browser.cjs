const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const labels=JSON.parse(fs.readFileSync(path.join(__dirname,'../../scripts/site-labels.json'),'utf8'));
const navNames=[...labels.primary,...labels.resources].map(([,name])=>name.replace(/&amp;/g,'&'));
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const output=process.env.APC_QA_OUTPUT||'/tmp/apc-sync-qa';fs.mkdirSync(output,{recursive:true});
for(const width of [320,390,768,1440])for(const route of ['','parents','schools','teacher-talk','resources','free-tool','about','blog','mornings','big-reactions-quick-check']){
 await page.setViewportSize({width,height:900});await page.goto('http://localhost:8899/'+route);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('h1').count(),1,route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route} ${width} `+JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll("body,body *")).filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,60),right:el.getBoundingClientRect().right,scroll:el.scrollWidth,width:el.clientWidth,position:getComputedStyle(el).position})))));
 const nav=await page.locator('.apc-shell-nav').textContent();for(const name of navNames)assert.ok(nav.includes(name),`${route} nav missing ${name}`);
 await page.screenshot({path:path.join(output,`sync-${route||'home'}-${width}.png`),fullPage:true});
}
// Text enlargement and reduced-motion layouts.
await page.emulateMedia({reducedMotion:'reduce'});
for(const route of ['parents','schools','teacher-talk','free-tool','resources','big-reactions-quick-check']){
 await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:8899/'+route);
 await page.evaluate(async()=>{document.documentElement.style.fontSize='200%';await document.fonts.ready;});
 const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,text:el.textContent.slice(0,80)}))}));
 assert.ok(overflow.scroll<=overflow.width,route+' enlarged text '+JSON.stringify(overflow));
 const start=await page.locator('.apc-shell-start').evaluate(el=>el.getBoundingClientRect().right);
 assert.ok(start<=390,route+' Quick Check header button must stay on screen at 200% text size');
 if(route==='resources'){
  const clipped=await page.locator('.apc-footer :is(a,p)').evaluateAll(nodes=>nodes.filter(el=>el.getBoundingClientRect().right>innerWidth+1||el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));
  assert.deepEqual(clipped,[],'Resources footer content must remain readable at 200% text size');
 }
 await page.screenshot({path:path.join(output,'large-text-'+route+'.png'),fullPage:true});
}
await page.setViewportSize({width:1440,height:900});
await page.goto('http://localhost:8899/parents');
await page.keyboard.press('Tab');
assert.equal(await page.locator('.apc-skip-link').first().evaluate(el=>el===document.activeElement),true);
await page.keyboard.press('Enter');
assert.equal(await page.evaluate(()=>location.hash),'#main-content');
assert.equal(await page.locator('footer nav').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
await page.goto('http://localhost:8899/parents#home-support');assert.equal(await page.locator('#home-support').count(),1);
await page.goto('http://localhost:8899/schools');await page.locator('#sf-name').fill('QA Educator');await page.locator('#sf-school').fill('QA School');await page.locator('#school-training-form button[type=submit]').click();await page.locator('#sf-success').waitFor({state:'visible'});assert.match(await page.locator('#school-whatsapp-link').getAttribute('href'),/^https:\/\/wa.me\/601172998168\?text=/);await page.locator('#sf-name').fill('Changed');assert.equal(await page.locator('#sf-success').isVisible(),false);
const denied=await page.request.get('http://localhost:8899/content-os/programmes/follow-up',{maxRedirects:0});assert.equal(denied.status(),302);
await require('../resources-browser.cjs')(page,output);
assert.deepEqual(errors,[]);await browser.close();console.log('Site sync responsive and enquiry checks passed');})().catch(e=>{console.error(e);process.exit(1);});
