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

test('Pattern Finder bridge preserves the approved parent copy and one verified listing destination', async () => {
  const [parents, thanks] = await Promise.all([source('parents.html'), source('thank-you-big-reactions.html')]);
  const block = parents.match(/<section[^>]*id="pattern-finder"[\s\S]*?<\/section>/)?.[0];
  assert.ok(block, 'parent page has a dedicated Pattern Finder block');
  for (const copy of [
    'When the same difficult moment keeps happening',
    'Compare a few everyday occasions, notice what repeats and what differs, then choose one manageable change to your response or the surroundings.',
    'Overwhelmed? Start with one recurring situation and just two pages.',
    'View the Big Reactions Pattern Finder',
  ]) assert.ok(block.includes(copy), copy);
  const parentHref = block.match(/href="([^"]+)"/)?.[1];
  const thanksHref = thanks.match(/href="([^"]+)"[^>]*>Compare the Pattern<\/a>/)?.[1];
  assert.equal(parentHref, thanksHref, 'both placements share the verified listing-specific link');
  assert.equal(parentHref, 'https://autismpathwaysco.etsy.com/listing/4590236884/autism-parent-pattern-finder-toolkit-big', 'preserve the exact approved shop-domain URL');
  const destination = new URL(parentHref.replaceAll('&amp;', '&'));
  assert.equal(destination.protocol, 'https:');
  assert.ok(destination.hostname === 'www.etsy.com' || destination.hostname.endsWith('.etsy.com'));
  assert.match(destination.pathname, /\/listing\/4590236884(?:\/|$)/);
  assert.doesNotMatch(block, /target="_blank"/, 'preserve the nearby same-tab link behavior');
  assert.ok(parents.indexOf('id="quick-check"') < parents.indexOf('id="pattern-finder"'));
  assert.ok(parents.indexOf('id="pattern-finder"') < parents.indexOf('id="workshops"'));
});

test('Quick Check ending appends the bridge after the unchanged free download instructions', async () => {
  const html = await source('thank-you-big-reactions.html');
  for (const copy of [
    'Is the same situation still happening?',
    'One observation can give you something to notice. If you want to compare the same situation across a few everyday occasions, the Big Reactions Pattern Finder helps you see what repeats, what differs and what you could try changing next.',
    'Compare the Pattern',
    'To type, download the PDF, open it in a PDF reader, then save a copy.',
    'Keep your notes private unless you choose to share them. You do not need to complete both pages today.',
    'Explore the founding live session (optional)',
  ]) assert.ok(html.includes(copy), copy);
  assert.ok(html.indexOf('id="quick-check-download"') < html.indexOf('id="pattern-bridge-title"'));
  assert.equal((html.match(/>Compare the Pattern<\/a>/g) || []).length, 1);
  assert.doesNotMatch(html, /<form\b|<iframe\b|target="_blank"/);
});
