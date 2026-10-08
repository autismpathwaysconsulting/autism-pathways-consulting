const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const output = process.env.APC_QA_OUTPUT || 'qa/programmes';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  for (const viewport of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(`${viewport.name}: ${error.message}`));
    await page.goto('http://localhost:8899/big-reactions-quick-check?utm_source=instagram&utm_medium=organic_social&utm_campaign=big_reactions', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${viewport.name} horizontal overflow`);
    assert.match(await page.locator('.privacy-note').innerText(), /handled through Brevo/);
    const iframe = page.locator('[data-brevo-form]');
    await iframe.waitFor();
    const src = await iframe.getAttribute('src');
    assert.match(src, /utm_source=instagram/);
    assert.match(src, /utm_medium=organic_social/);
    assert.match(src, /utm_campaign=big_reactions/);
    await page.screenshot({ path: path.join(output, `big-reactions-${viewport.name}.png`), fullPage: true });
    for (const bridge of [
      { route: '/parents', label: 'View the Big Reactions Pattern Finder', file: 'pattern-finder-parents' },
      { route: '/thank-you-big-reactions', label: 'Compare the Pattern', file: 'pattern-finder-thanks' },
    ]) {
      await page.goto('http://localhost:8899' + bridge.route, { waitUntil: 'domcontentloaded' });
      const link = page.getByRole('link', { name: bridge.label, exact: true });
      await link.waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${viewport.name} ${bridge.route} horizontal overflow`);
      assert.equal(await link.getAttribute('target'), null, 'preserve existing same-tab behavior');
      const bounds = await link.boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44, 'adequate touch target');
      let reached = false;
      for (let index = 0; index < 50; index += 1) {
        await page.keyboard.press('Tab');
        if (await link.evaluate(element => element === document.activeElement)) { reached = true; break; }
      }
      assert.ok(reached, 'bridge is reachable by keyboard');
      assert.notEqual(await link.evaluate(element => getComputedStyle(element).outlineStyle), 'none', 'bridge has visible keyboard focus');
      await page.screenshot({ path: path.join(output, `${bridge.file}-${viewport.name}.png`) });
      const href = await link.getAttribute('href');
      assert.equal(href, 'https://autismpathwaysco.etsy.com/listing/4590236884/autism-parent-pattern-finder-toolkit-big', 'exact approved shop-domain URL');
      const destination = new URL(href);
      assert.ok(destination.hostname === 'www.etsy.com' || destination.hostname.endsWith('.etsy.com'));
      assert.match(destination.pathname, /\/listing\/4590236884(?:\/|$)/);
      // Exercise activation without sending test traffic to Etsy or creating a cart.
      await page.route(href, route => route.fulfill({ contentType: 'text/html', body: '<h1>Listing destination test</h1>' }));
      await Promise.all([page.waitForURL(href), link.press('Enter')]);
      assert.equal(page.url(), href);
      await page.goBack();
      await page.getByRole('link', { name: bridge.label, exact: true }).waitFor();
      await page.unroute(href);
    }
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const download = page.waitForEvent('download');
  await page.goto('http://localhost:8899/thank-you-big-reactions');
  const file = await download;
  assert.equal(file.suggestedFilename(), 'APC-Big-Reactions-Quick-Check.pdf');
  const downloadPath = await file.path();
  assert.ok(fs.statSync(downloadPath).size > 100000);
  await page.screenshot({ path: path.join(output, 'big-reactions-thank-you-mobile.png'), fullPage: true });
  assert.equal(errors.length, 0, errors.join('\n'));
  await browser.close();
  fs.writeFileSync(path.join(output, 'big-reactions-browser-results.json'), JSON.stringify({
    passed: true,
    checks: ['390 × 844 layout', '1440 × 1000 layout', 'no horizontal overflow', 'privacy wording', 'bounded UTM propagation to Brevo', 'immediate PDF download', 'Pattern Finder bridge mobile and desktop layout', 'keyboard activation and Back navigation', 'correct listing-specific href in both placements'],
    boundary: 'Unpublished local QA. No Brevo contact submitted and no production analytics written.'
  }, null, 2));
  console.log('Big Reactions browser checks passed');
})().catch(error => { console.error(error); process.exit(1); });
