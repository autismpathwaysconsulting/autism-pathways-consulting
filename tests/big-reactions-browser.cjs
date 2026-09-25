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
    checks: ['390 × 844 layout', '1440 × 1000 layout', 'no horizontal overflow', 'privacy wording', 'bounded UTM propagation to Brevo', 'immediate PDF download'],
    boundary: 'Unpublished local QA. No Brevo contact submitted and no production analytics written.'
  }, null, 2));
  console.log('Big Reactions browser checks passed');
})().catch(error => { console.error(error); process.exit(1); });
