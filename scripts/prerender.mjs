// Writes the latest prices into index.html as plain HTML so search engines see them without running JavaScript.
import { readFile, writeFile } from 'node:fs/promises';
import { MONTH_NAMES, longDate } from './lib.mjs';

const prices = JSON.parse(await readFile('data/prices.json', 'utf8'));
const h = [...prices.history].sort((a, b) => b.effective.localeCompare(a.effective));
const cur = h[0];
const prev = h[1];
const [y, m] = cur.effective.split('-').map(Number);
const monthYear = `${MONTH_NAMES[m - 1]} ${y}`;

const money = (v) => (v == null ? 'Not sold' : 'R' + v.toFixed(2));
const change = (g) => {
  const a = cur.prices[g].inland;
  const b = prev?.prices?.[g]?.inland;
  if (a == null || b == null) return '–';
  const d = a - b;
  return (d >= 0 ? '+' : '-') + 'R' + Math.abs(d).toFixed(2);
};
const names = { p95: 'Petrol 95', p93: 'Petrol 93', d50: 'Diesel 50ppm (wholesale)', d500: 'Diesel 500ppm (wholesale)' };
const rows = ['p95', 'p93', 'd50', 'd500']
  .map((g) => `<tr><th scope="row">${names[g]}</th><td>${money(cur.prices[g].inland)}</td><td>${money(cur.prices[g].coast)}</td><td>${change(g)}</td></tr>`)
  .join('\n');

const block = `<!--PRICES:START-->
<p>Prices apply from <strong>${longDate(cur.effective)}</strong>, in rand per litre.</p>
<div class="scroll"><table class="tbl pt">
<caption class="sr">South African fuel prices, ${monthYear}</caption>
<thead><tr><th scope="col">Fuel</th><th scope="col">Inland</th><th scope="col">Coast</th><th scope="col">Change (inland)</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
<!--PRICES:END-->`;

let html = await readFile('index.html', 'utf8');
html = html.replace(/<!--PRICES:START-->[\s\S]*?<!--PRICES:END-->/, () => block);
const title = `Petrol and Diesel Price Calculator South Africa (${monthYear}) | Pump Check`;
const desc = `Check what South Africa's ${monthYear} petrol and diesel prices cost your car. Pick your vehicle and see your cost per fill-up, month and year.`;
html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${title}</title>`);
html = html.replace(/(<meta name="description" data-dyn="desc" content=")[^"]*(")/, (_, a, b) => a + desc + b);
html = html.replace(/(<meta property="og:title" data-dyn="ogtitle" content=")[^"]*(")/, (_, a, b) => `${a}Petrol and Diesel Price Calculator South Africa (${monthYear})${b}`);
html = html.replace(/(<meta property="og:description" data-dyn="ogdesc" content=")[^"]*(")/, (_, a, b) => `${a}Petrol 95 is R${cur.prices.p95.inland.toFixed(2)} a litre inland from ${longDate(cur.effective)}. See what it costs your car.${b}`);
html = html.replace(/("dateModified": ")[^"]*(")/, (_, a, b) => a + prices.updated + b);
await writeFile('index.html', html);

let sitemap = await readFile('sitemap.xml', 'utf8');
sitemap = sitemap.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${prices.updated}</lastmod>`);
await writeFile('sitemap.xml', sitemap);
console.log(`Prerendered ${monthYear}`);
