// Usage: node scripts/set-url.mjs https://yourname.github.io/pump-check
// Replaces the site address in every public file. Safe to run again.
import { readFile, writeFile } from 'node:fs/promises';

const next = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(\/[a-z0-9._-]+)?$/i.test(next)) {
  console.error('Give a full https address, for example https://yourname.github.io/pump-check');
  process.exit(1);
}
const sitemap = await readFile('sitemap.xml', 'utf8');
const current = sitemap.match(/<loc>(https:\/\/[^<]+?)\/<\/loc>/)?.[1];
if (!current) throw new Error('Could not find the current address in sitemap.xml');
if (current === next) { console.log('Address already set.'); process.exit(0); }
for (const f of ['index.html', '404.html', 'sitemap.xml', 'robots.txt']) {
  const text = await readFile(f, 'utf8');
  await writeFile(f, text.split(current).join(next));
}
console.log(`Site address changed from ${current} to ${next}`);
