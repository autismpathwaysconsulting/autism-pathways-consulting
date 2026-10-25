import fs from 'node:fs/promises';
import {PUBLIC_FILES} from './build-site.mjs';

const root = new URL('../', import.meta.url);
const snippet = `<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "6c750908318848459fde353678a080a6"}'></script><!-- End Cloudflare Web Analytics -->`;
const snippetPattern = /<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->\s*/g;

const changed = [];
for (const file of PUBLIC_FILES.filter(p => p.endsWith('.html'))) {
  const url = new URL(file, root);
  const old = await fs.readFile(url, 'utf8');
  const next = old.replace(snippetPattern, '').replace(/<\/body>/, snippet + '</body>');
  if (next !== old) {
    changed.push(file);
    if (!process.argv.includes('--check')) await fs.writeFile(url, next);
  }
}
if (process.argv.includes('--check') && changed.length) {
  throw Error('Run node scripts/sync-analytics.mjs: ' + changed.join(', '));
}
console.log(changed.length ? 'Synced ' + changed.length + ' files.' : 'Cloudflare Web Analytics snippet is already in sync.');
