const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const output=process.env.APC_QA_OUTPUT||'/tmp/apc-sync-qa';fs.mkdirSync(output,{recursive:true});
for(const width of [320,390,768,1440])for(const route of ['parents','services','schools','programmes']){
 await page.setViewportSize({width,height:900});await page.goto('http://localhost:8899/'+route);await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('h1').count(),1,route);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route} ${width}`);
 const nav=page.locator('.apc-shell-nav');for(const name of ['Parent Home Support','Learning & Workshops','Upcoming Programmes','APC Calm App'])assert.ok((await nav.textContent()).includes(name));
 await page.screenshot({path:path.join(output,`sync-${route}-${width}.png`),fullPage:true});
}
await page.goto('http://localhost:8899/parents#one-concern');assert.equal(await page.locator('#one-concern').count(),1);assert.equal(await page.locator('#home-support').count(),1);
await page.goto('http://localhost:8899/services');assert.match(await page.locator('main').textContent(),/In development/);assert.equal(await page.locator('main a[href*="pay"]').count(),0);
await page.goto('http://localhost:8899/schools');await page.locator('#sf-name').fill('QA Educator');await page.locator('#sf-school').fill('QA School');await page.locator('#school-training-form button[type=submit]').click();await page.locator('#sf-success').waitFor({state:'visible'});assert.match(await page.locator('#school-whatsapp-link').getAttribute('href'),/^https:\/\/wa.me\/601172998168\?text=/);await page.locator('#sf-name').fill('Changed');assert.equal(await page.locator('#sf-success').isVisible(),false);
const denied=await page.request.get('http://localhost:8899/content-os/programmes/follow-up',{maxRedirects:0});assert.equal(denied.status(),302);
assert.deepEqual(errors,[]);await browser.close();console.log('Site sync responsive and enquiry checks passed');})().catch(e=>{console.error(e);process.exit(1);});
