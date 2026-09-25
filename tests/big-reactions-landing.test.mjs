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
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /Communication Course|Get Your Free Parent Guide/);
});

test('UTM attribution is bounded and analytics never include form fields or arbitrary campaigns', async () => {
  const [script, metrics, thankYou] = await Promise.all([source('big-reactions-quick-check.js'), source('functions/lib/site-metrics.js'), source('thank-you-big-reactions.html')]);
  assert.match(script, /slice\(0, 32\)/);
  assert.match(script, /campaign: query\.get\("utm_campaign"\) === "big_reactions" \? "big_reactions" : "unspecified"/);
  assert.match(script, /sessionStorage\.setItem\("apc\.quick_check_attribution"/);
  assert.match(thankYou, /sessionStorage\.getItem\('apc\.quick_check_attribution'\)/);
  assert.match(metrics, /validAttribution/);
  assert.doesNotMatch(script, /first.?name|email.?address|contact/i);
});

test('confirmation route starts the same-origin download and keeps a visible fallback', async () => {
  const html = await source('thank-you-big-reactions.html');
  assert.match(html, /href="\/APC-Big-Reactions-Quick-Check\.pdf" download/);
  assert.match(html, /window\.setTimeout\(\(\) => \{ record\('download'\); link\.click\(\); \}, 500\)/);
  assert.match(html, /record\('form_submitted'\)/);
  assert.ok((await stat(new URL('APC-Big-Reactions-Quick-Check.pdf', root))).size > 100000);
});
