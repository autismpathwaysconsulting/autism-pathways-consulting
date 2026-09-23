const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const output=process.env.APC_QA_OUTPUT||'/tmp/apc-sync-qa';fs.mkdirSync(output,{recursive:true});
for(const width of [320,390,768,1440])for(const route of ['','parents','services','schools','programmes','connect','course-waitlist','resources','start','free-tool','about','blog','mornings']){
 await page.setViewportSize({width,height:900});await page.goto('http://localhost:8899/'+route);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('h1').count(),1,route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route} ${width} `+JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll("body,body *")).filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,60),right:el.getBoundingClientRect().right,scroll:el.scrollWidth,width:el.clientWidth,position:getComputedStyle(el).position})))));
 const nav=page.locator('.apc-shell-nav');for(const name of ['Parent Home Support','Learning & Workshops','Upcoming Programmes','APC Calm App'])assert.ok((await nav.textContent()).includes(name));
 await page.screenshot({path:path.join(output,`sync-${route}-${width}.png`),fullPage:true});
}
// Text enlargement and reduced-motion layouts, including the course enquiry route.
await page.emulateMedia({reducedMotion:'reduce'});
for(const route of ['parents','services','schools','programmes','connect','course-waitlist','start','free-tool']){
 await page.setViewportSize({width:390,height:844});await page.goto('http://localhost:8899/'+route);
 await page.evaluate(async()=>{document.documentElement.style.fontSize='200%';await document.fonts.ready;});
 const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,text:el.textContent.slice(0,80)}))}));
 assert.ok(overflow.scroll<=overflow.width,route+' enlarged text '+JSON.stringify(overflow));
 await page.screenshot({path:path.join(output,'large-text-'+route+'.png'),fullPage:true});
}
await page.goto('http://localhost:8899/course-waitlist');
await page.keyboard.press('Tab');
assert.equal(await page.locator('.apc-skip-link').evaluate(el=>el===document.activeElement),true);
await page.keyboard.press('Enter');
assert.equal(await page.evaluate(()=>location.hash),'#main-content');
await page.locator('.apc-nav-dropdown summary').first().focus();await page.keyboard.press('Enter');
assert.equal(await page.locator('.apc-nav-dropdown').first().getAttribute('open'),'');
assert.equal(await page.getByRole('link',{name:'Email CJ about this course',exact:true}).getAttribute('href'),'mailto:cjlim@autismpathwaysconsulting.com?subject=Understanding%20Escalation%20at%20Home%20-%20course%20enquiry');
assert.equal(await page.getByRole('link',{name:'WhatsApp CJ about this course',exact:true}).getAttribute('href'),"https://wa.me/601172998168?text=Hi%20CJ%2C%20I%20am%20interested%20in%20Understanding%20Escalation%20at%20Home.%20Please%20let%20me%20know%20more%20about%20the%20planned%20course.");
assert.equal(await page.locator('footer nav').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
await page.goto('http://localhost:8899/parents#one-concern');assert.equal(await page.locator('#one-concern').count(),1);assert.equal(await page.locator('#home-support').count(),1);
await page.goto('http://localhost:8899/services');assert.match(await page.locator('main').textContent(),/In development/);assert.equal(await page.locator('main a[href*="pay"]').count(),0);
await page.goto('http://localhost:8899/schools');await page.locator('#sf-name').fill('QA Educator');await page.locator('#sf-school').fill('QA School');await page.locator('#school-training-form button[type=submit]').click();await page.locator('#sf-success').waitFor({state:'visible'});assert.match(await page.locator('#school-whatsapp-link').getAttribute('href'),/^https:\/\/wa.me\/601172998168\?text=/);await page.locator('#sf-name').fill('Changed');assert.equal(await page.locator('#sf-success').isVisible(),false);
const denied=await page.request.get('http://localhost:8899/content-os/programmes/follow-up',{maxRedirects:0});assert.equal(denied.status(),302);
assert.deepEqual(errors,[]);await browser.close();console.log('Site sync responsive and enquiry checks passed');})().catch(e=>{console.error(e);process.exit(1);});
