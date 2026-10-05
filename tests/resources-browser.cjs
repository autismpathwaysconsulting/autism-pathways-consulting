const assert = require('node:assert/strict');
const path = require('node:path');

// Called by the existing responsive QA suite. No forms or external services are submitted.
module.exports = async function checkResources(page, output) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width, height:844});
    await page.goto('http://localhost:8899/resources');
    await page.evaluate(() => document.fonts.ready);
    const topics=page.locator('.resource-topics details');
    assert.equal(await topics.count(),5);
    assert.equal(await page.locator('.resource-feature a').count(),1);
    assert.equal(await page.locator('.resource-feature a').getAttribute('href'),'/big-reactions-quick-check');
    assert.equal(await page.locator('.resource-topics img').count(),0);
    assert.equal(await page.locator('.resource-more-grid article').count(),3);
    assert.equal(await page.locator('.resource-topics .resource-links a').first().isVisible(),false);
    const first=topics.first().locator('summary');
    await first.focus();
    await page.keyboard.press('Enter');
    assert.equal(await topics.first().getAttribute('open'),'');
    assert.equal(await page.locator('.resource-topics .resource-links a').first().isVisible(),true);
    await page.keyboard.press('Space');
    assert.equal(await topics.first().getAttribute('open'),null);
    await first.click();await first.click();
    assert.equal(await topics.first().getAttribute('open'),null);
    for (const summary of await page.locator('.resource-topics summary').all()) await summary.click();
    const boxes=await topics.evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,width:r.width,top:r.top,bottom:r.bottom};}));
    for(let i=1;i<boxes.length;i++){
      assert.ok(Math.abs(boxes[i].x-boxes[0].x)<1,'single-column alignment');
      assert.ok(Math.abs(boxes[i].width-boxes[0].width)<1,'equal full-width rows');
      assert.ok(boxes[i].top>=boxes[i-1].bottom-1,'expanded topics remain in document flow');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Resources overflow at ${width}`);
    assert.equal(await page.locator('.resource-topics summary').evaluateAll(nodes=>nodes.every(el=>el.getBoundingClientRect().height>=44)),true);
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
    await page.screenshot({path:path.join(output,`resources-open-${width}.png`),fullPage:true});
    for(const summary of await page.locator('.resource-topics summary').all()) await summary.click();
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});
    await page.screenshot({path:path.join(output,`resources-closed-${width}.png`),fullPage:true});
    await first.click();
    await page.getByRole('link',{name:'When mornings are chaos',exact:true}).click();
    await page.waitForURL('**/mornings');
    await page.goBack();
    assert.equal(new URL(page.url()).pathname,'/resources');
    await page.goForward();
    assert.equal(new URL(page.url()).pathname,'/mornings');

    await page.goto('http://localhost:8899/services#educator-training');
    const contact=page.locator('#educator-training .workshop-contact a');
    const buttons=await contact.evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};}));
    assert.equal(buttons.length,2);
    assert.ok(Math.abs(buttons[0].width-buttons[1].width)<1,'Teacher Talk buttons have equal widths');
    assert.ok(Math.abs(buttons[0].height-buttons[1].height)<1,'Teacher Talk buttons have equal heights');
    assert.ok(buttons.every(b=>b.height>=44));
    assert.match(await contact.first().getAttribute('href'),/^mailto:cjlim@autismpathwaysconsulting.com/);
    assert.match(await contact.last().getAttribute('href'),/^https:\/\/wa.me\/601172998168/);
    assert.equal(await page.locator('.service-action-icon').evaluateAll(nodes=>nodes.every(n=>n.getAttribute('aria-hidden')==='true'&&n.getAttribute('focusable')==='false')),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Services overflow at ${width}`);
    await page.locator('#educator-training .workshop-contact').screenshot({path:path.join(output,`teacher-talk-buttons-${width}.png`)});
  }
  // Native topic disclosure and the main resource journey remain usable without JavaScript.
  const context=await page.context().browser().newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
  const plain=await context.newPage();await plain.goto('http://localhost:8899/resources');
  const summary=plain.locator('.resource-topics summary').first();await summary.click();
  assert.equal(await plain.getByRole('link',{name:'When mornings are chaos',exact:true}).isVisible(),true);
  await summary.click();assert.equal(await plain.getByRole('link',{name:'When mornings are chaos',exact:true}).isVisible(),false);
  await context.close();
  console.log('Resources disclosure, responsive routes, and Teacher Talk contact controls passed');
};
