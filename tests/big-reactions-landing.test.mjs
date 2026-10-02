import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = name => readFile(new URL(name, root), 'utf8');

test('Quick Check route uses the dedicated verified Brevo form and transparent consent copy', async () => {
  const html = await source('big-reactions-quick-check.html');
  assert.match(html, /MUIFAI8Y9LxqCbm658xYpspj72FKSjIj/);
  assert.match(html, /two short follow-up emails/);
  assert.match(html, /Parent resources and updates are optional/);
  assert.match(html, /APC Privacy Policy/);
  assert.match(html, /content="index,follow"/);
  assert.doesNotMatch(html, /noindex/);
  assert.doesNotMatch(html, /Communication Course|Get Your Free Parent Guide/);
});

test('Quick Check route uses the shared APC page shell', async () => {
  const html = await source('big-reactions-quick-check.html');
  assert.match(html, /href="\/apc-design-system\.css\?v=/);
  assert.match(html, /<body class="[^"]*apc-v2[^"]*">/);
  assert.match(html, /class="apc-site-header"/);
  assert.match(html, /class="apc-footer-inner"/);
  assert.match(html, /class="apc-footer-bottom"/);
});

test('Quick Check route previews both actual PDF pages', async () => {
  const html = await source('big-reactions-quick-check.html');
  assert.match(html, /APC-Big-Reactions-Quick-Check-page-1\.webp/);
  assert.match(html, /APC-Big-Reactions-Quick-Check-page-2\.webp/);
  assert.ok((await stat(new URL('APC-Big-Reactions-Quick-Check-page-1.webp', root))).size > 50000);
  assert.ok((await stat(new URL('APC-Big-Reactions-Quick-Check-page-2.webp', root))).size > 50000);
});

test('UTM attribution is bounded and analytics never include form fields or arbitrary campaigns', async () => {
  const [script, metrics, thankYou] = await Promise.all([source('big-reactions-quick-check.js'), source('functions/lib/site-metrics.js'), source('thank-you-big-reactions.js')]);
  assert.match(script, /slice\(0, 32\)/);
  assert.match(script, /campaign: query\.get\("utm_campaign"\) === "big_reactions" \? "big_reactions" : "unspecified"/);
  assert.match(script, /sessionStorage\.setItem\("apc\.quick_check_attribution"/);
  assert.match(thankYou, /sessionStorage\.getItem\(["']apc\.quick_check_attribution["']\)/);
  assert.match(metrics, /validAttribution/);
  assert.doesNotMatch(script, /first.?name|email.?address|contact/i);
});

test('confirmation route starts the same-origin download and keeps a visible fallback', async () => {
  const [html, script] = await Promise.all([source('thank-you-big-reactions.html'), source('thank-you-big-reactions.js')]);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /href="\/APC-Big-Reactions-Quick-Check\.pdf" download/);
  assert.match(html, /src="\/thank-you-big-reactions\.js"/);
  assert.match(script, /window\.setTimeout/);
  assert.match(script, /record\("form_submitted"\)/);
  assert.match(script, /link\.click\(\)/);
  assert.ok((await stat(new URL('APC-Big-Reactions-Quick-Check.pdf', root))).size > 100000);
});

test('Quick Check copy matches the fillable next-step resource without changing the consent route', async () => {
  const [landing, thanks] = await Promise.all([source('big-reactions-quick-check.html'), source('thank-you-big-reactions.html')]);
  assert.match(landing, /Download it and open it in a PDF reader to type, or print it and write by hand\./);
  assert.match(landing, /Page two of the Big Reactions Quick Check for choosing and reviewing one small next step/);
  assert.doesNotMatch(landing, /for comparing a second situation|Use it on your phone or computer/);
  assert.match(landing, /APC-Big-Reactions-Quick-Check-page-1\.webp\?v=[a-f0-9]{12}/);
  assert.match(landing, /APC-Big-Reactions-Quick-Check-page-2\.webp\?v=[a-f0-9]{12}/);
  assert.match(thanks, /To type, download the PDF, open it in a PDF reader, then save a copy\./);
  assert.match(thanks, /href="\/course-waitlist#course-contact">Explore the founding live session \(optional\)/);
  assert.match(thanks, /This is an interest test\. Dates, duration, fee and final scope are not confirmed\./);
  assert.match(thanks, /Keep your notes private unless you choose to share them\./);
  assert.doesNotMatch(thanks, /Browse more APC parent resources/);
});
