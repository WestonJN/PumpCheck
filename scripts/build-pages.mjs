// Writes the static pages for search engines into the output folder (default _site):
// one page per vehicle model, one per make, a hub, a fuel price history page and the sitemap.
// Usage: node scripts/build-pages.mjs [outputDir]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { MONTH_NAMES, esc, groupBy, loadVehicles, longDate, slug } from './lib.mjs';

const OUT = process.argv[2] || '_site';
const prices = JSON.parse(await readFile('data/prices.json', 'utf8'));
const vehicles = loadVehicles(JSON.parse(await readFile('data/vehicles.json', 'utf8')));
const sitemapOld = await readFile('sitemap.xml', 'utf8');
const BASE = process.env.SITE_BASE || sitemapOld.match(/<loc>(https:\/\/[^<]+?)\/<\/loc>/)[1];

const today = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
const hist = [...prices.history].sort((a, b) => b.effective.localeCompare(a.effective));
let ci = hist.findIndex((h) => h.effective <= today);
if (ci < 0) ci = hist.length - 1;
const cur = hist[ci];
const prev = hist[ci + 1] || null;
const [cy, cm] = cur.effective.split('-').map(Number);
const MONTH = `${MONTH_NAMES[cm - 1]} ${cy}`;
const KM = 1500;

const FUEL = { p: { grade: 'p95', name: 'petrol 95' }, d: { grade: 'd50', name: 'diesel (50ppm)' } };
const money = (n, d = 2) => 'R' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/,/g, '\u00a0');
const priceOf = (entry, fuel, region = 'inland') => entry?.prices[FUEL[fuel].grade][region];
const cost = (v, entry = cur) => ({
  litre: priceOf(entry, v.fuel),
  tank: priceOf(entry, v.fuel) * v.tank,
  per100: priceOf(entry, v.fuel) * v.cons,
  month: priceOf(entry, v.fuel) * v.cons * KM / 100
});
const range = (v) => Math.round(v.tank / v.cons * 100);

const page = (path) => `${BASE}/${path}`;
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
const crumbsLd = (items) => ld({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url }))
});

function layout({ path, title, desc, h1, body, crumbs, extraLd = '' }) {
  const url = page(path);
  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#171A1E">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
<link rel="icon" href="${BASE}/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${BASE}/assets/apple-touch-icon.png">
<link rel="stylesheet" href="${BASE}/styles.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Pump Check">
<meta property="og:locale" content="en_ZA">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
${crumbsLd(crumbs)}
${extraLd}
</head>
<body>
<div class="page">
  <header class="top">
    <div><p class="brand-line"><a href="${BASE}/">Pump Check</a></p></div>
    <p class="meta">Prices from ${esc(longDate(cur.effective))}</p>
  </header>
  <main class="article">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, u], i) => (i < crumbs.length - 1 ? `<a href="${u}">${esc(n)}</a> / ` : esc(n))).join('')}</nav>
    <h1>${esc(h1)}</h1>
${body}
  </main>
  <footer class="foot">
    <p>Prices come from the official adjustments published by the <a href="https://www.dmpr.gov.za/Branches/Petroleum-Resources/Fuel-Prices" rel="noopener noreferrer">Department of Mineral and Petroleum Resources</a>. Costs use the inland price for the grade shown and are estimates, not advice. <a href="${BASE}/">Open the calculator</a> to change the vehicle, region, distance or fuel use.</p>
  </footer>
</div>
</body>
</html>
`;
}

const files = new Map();
const urls = [];
const add = (path, html, priority) => { files.set(path === '' ? 'index.html' : `${path}/index.html`, html); urls.push([path, priority]); };

const byMake = groupBy(vehicles, (v) => v.make);
const makes = [...byMake.keys()].sort();
const modelKey = (v) => v.make + '|' + v.model;
const modelGroups = groupBy(vehicles, modelKey);

function sourceNote(list) {
  const verified = list.filter((v) => v.status === 2).length;
  const part = list.filter((v) => v.status === 1).length;
  if (verified === list.length) return 'Fuel use and tank size for every variant on this page come from published South African sources.';
  if (verified + part === 0) return 'These figures are approximate and have not yet been checked against a published source. Use the calculator to enter your own fuel use.';
  return `Fuel use and tank size for ${verified} of ${list.length} variants come from published South African sources${part ? `, and ${part} more have a sourced fuel use with an approximate tank size` : ''}. The rest are approximate.`;
}

// ---- model pages ----
for (const [key, list] of modelGroups) {
  const [make, model] = key.split('|');
  const name = `${make} ${model}`;
  const path = `cars/${slug(name)}`;
  const sorted = [...list].sort((a, b) => a.variant.localeCompare(b.variant));
  const best = Math.max(...sorted.map((v) => v.status));
  const pool = sorted.filter((v) => v.status === best).sort((a, b) => a.cons - b.cons);
  const first = pool[Math.floor((pool.length - 1) / 2)];
  const c = cost(first);
  const cp = prev ? cost(first, prev) : null;
  const fuel = FUEL[first.fuel].name;
  const rows = sorted.map((v) => {
    const k = cost(v);
    return `<tr><th scope="row" class="l">${esc(v.variant)}</th><td>${v.cons.toFixed(1)}</td><td>${v.tank} l</td><td>${money(k.tank, 0)}</td><td>${money(k.per100)}</td><td>${money(k.month, 0)}</td><td>${range(v).toLocaleString('en-US').replace(',', '\u00a0')} km</td></tr>`;
  }).join('\n');
  const delta = cp ? c.tank - cp.tank : null;
  const change = cp
    ? `<p>The ${fuel} price ${delta >= 0 ? 'rose' : 'fell'} by ${money(Math.abs(c.litre - priceOf(prev, first.fuel)))} a litre on ${esc(longDate(cur.effective))}. That makes a full tank of the ${esc(first.variant)} ${money(Math.abs(delta), 0)} ${delta >= 0 ? 'more' : 'less'} than before.</p>`
    : '';
  const coast = priceOf(cur, first.fuel, 'coast');
  const coastLine = coast != null ? `<p>At the coast, ${fuel} is ${money(coast)} a litre, so the same tank costs about ${money(coast * first.tank, 0)}.</p>` : '';
  const q1 = `How much does it cost to fill a ${name}?`;
  const a1 = `A full tank of the ${first.variant} (${first.tank} litres) costs about ${money(c.tank, 0)} at the ${MONTH} inland ${fuel} price of ${money(c.litre)} a litre.`;
  const q2 = `How much fuel does a ${name} use?`;
  const a2 = `The ${first.variant} uses about ${first.cons.toFixed(1)} litres per 100 km, which is ${money(c.per100)} per 100 km at today's price. Real-world use is usually higher than the manufacturer figure.`;
  const srcs = [...new Set(sorted.map((v) => v.src).filter((u) => /^https:\/\//.test(u)))];
  const srcList = srcs.length
    ? `<p class="hint">Sources: ${srcs.map((u) => `<a href="${esc(u)}" rel="noopener noreferrer">${esc(new URL(u).hostname.replace(/^www\./, ''))}</a>`).join(', ')}.</p>`
    : '';
  const others = (byMake.get(make) ? [...new Set(byMake.get(make).map((v) => v.model))] : []).filter((m) => m !== model).sort();
  const body = `    <p>${esc(a1)} At ${first.cons.toFixed(1)} l/100 km it costs ${money(c.per100)} per 100 km, or about ${money(c.month, 0)} a month at ${KM.toLocaleString('en-US').replace(',', '\u00a0')} km.</p>
    ${change}
    <section class="panel" aria-labelledby="h-t">
      <h2 id="h-t">${esc(name)} fuel cost by variant</h2>
      <div class="scroll"><table class="tbl">
        <caption class="sr">${esc(name)} fuel use and running cost, ${MONTH}</caption>
        <thead><tr><th scope="col" class="l">Variant</th><th scope="col">l/100 km</th><th scope="col">Tank</th><th scope="col">Full tank</th><th scope="col">Per 100 km</th><th scope="col">${KM.toLocaleString('en-US').replace(',', '\u00a0')} km a month</th><th scope="col">Range</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table></div>
      <p class="hint">${esc(sourceNote(sorted))} Costs use the inland price (petrol 95 ${money(priceOf(cur, 'p'))}, diesel 50ppm ${money(priceOf(cur, 'd'))} a litre).</p>
      ${srcList}
    </section>
    ${coastLine}
    <a class="cta" href="${BASE}/?v=${encodeURIComponent(first.make + '|' + first.model + '|' + first.variant)}">Open the calculator with this vehicle</a>
    <section class="faq" aria-labelledby="h-q">
      <h2 id="h-q">Questions about the ${esc(name)}</h2>
      <details open><summary>${esc(q1)}</summary><p>${esc(a1)}</p></details>
      <details open><summary>${esc(q2)}</summary><p>${esc(a2)}</p></details>
    </section>
    <section class="browse" aria-labelledby="h-m">
      <h2 id="h-m">More ${esc(make)} models</h2>
      <ul class="linklist">${others.map((m) => `<li><a href="${BASE}/cars/${slug(make + ' ' + m)}/">${esc(make + ' ' + m)}</a></li>`).join('')}<li><a href="${BASE}/cars/${slug(make)}/">All ${esc(make)} models</a></li></ul>
    </section>`;
  const faqLd = ld({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [[q1, a1], [q2, a2]].map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  });
  add(path, layout({
    path: path + '/',
    title: `${name} fuel cost: full tank and monthly (${MONTH.replace(/^(\w{3})\w*/, '$1')})`,
    desc: `A full tank of the ${first.variant} ${name} costs about ${money(c.tank, 0)} in South Africa (${MONTH}). ${money(c.per100)} per 100 km, ${money(c.month, 0)} a month at ${KM} km.`,
    h1: `${name} fuel cost in South Africa`,
    body,
    crumbs: [['Pump Check', `${BASE}/`], ['Cars', `${BASE}/cars/`], [make, `${BASE}/cars/${slug(make)}/`], [name, `${BASE}/${path}/`]],
    extraLd: faqLd
  }) , '0.8');
}

// ---- make pages ----
for (const make of makes) {
  const list = byMake.get(make);
  const ms = [...new Set(list.map((v) => v.model))].sort();
  const rows = ms.map((m) => {
    const vs = modelGroups.get(make + '|' + m);
    const tanks = vs.map((v) => cost(v).tank);
    const lo = Math.min(...tanks), hi = Math.max(...tanks);
    const lits = vs.map((v) => v.cons);
    return `<tr><th scope="row" class="l"><a href="${BASE}/cars/${slug(make + ' ' + m)}/">${esc(m)}</a></th><td>${vs.length}</td><td>${Math.min(...lits).toFixed(1)}${Math.min(...lits) !== Math.max(...lits) ? ` to ${Math.max(...lits).toFixed(1)}` : ''}</td><td>${lo === hi ? money(lo, 0) : `${money(lo, 0)} to ${money(hi, 0)}`}</td></tr>`;
  }).join('\n');
  const path = `cars/${slug(make)}`;
  add(path, layout({
    path: path + '/',
    title: `${make} fuel cost in South Africa (${MONTH.replace(/^(\w{3})\w*/, '$1')}): every model`,
    desc: `What it costs to fill up a ${make} in South Africa at the ${MONTH} fuel price. Fuel use, tank size and full-tank cost for ${ms.length} ${make} models.`,
    h1: `${make} fuel cost in South Africa`,
    body: `    <p>Full-tank costs below use the inland price from ${esc(longDate(cur.effective))}. Pick a model for the cost per variant.</p>
    <section class="panel"><div class="scroll"><table class="tbl">
      <caption class="sr">${esc(make)} models and full-tank costs</caption>
      <thead><tr><th scope="col" class="l">Model</th><th scope="col">Variants</th><th scope="col">l/100 km</th><th scope="col">Full tank</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table></div></section>`,
    crumbs: [['Pump Check', `${BASE}/`], ['Cars', `${BASE}/cars/`], [make, `${BASE}/${path}/`]]
  }), '0.7');
}

// ---- hub ----
add('cars', layout({
  path: 'cars/',
  title: `Fuel cost by car make and model in South Africa (${MONTH.replace(/^(\w{3})\w*/, '$1')})`,
  desc: `Browse ${modelGroups.size} car models sold in South Africa and see what a full tank, 100 km and a month of driving cost at the ${MONTH} petrol and diesel prices.`,
  h1: 'Fuel cost by car make and model',
  body: `    <p>Choose a make to see what each model costs to fill up at the current South African petrol and diesel prices.</p>
    <section class="browse"><ul class="linklist">${makes.map((m) => `<li><a href="${BASE}/cars/${slug(m)}/">${esc(m)}</a> (${new Set(byMake.get(m).map((v) => v.model)).size})</li>`).join('')}</ul></section>`,
  crumbs: [['Pump Check', `${BASE}/`], ['Cars', `${BASE}/cars/`]]
}), '0.9');

// ---- price history ----
{
  const g = [['p95', 'Petrol 95'], ['p93', 'Petrol 93'], ['d50', 'Diesel 50ppm'], ['d500', 'Diesel 500ppm']];
  const rows = hist.map((h, i) => {
    const older = hist[i + 1];
    const cell = (id) => {
      const v = h.prices[id].inland;
      const o = older?.prices[id].inland;
      return `${money(v)}${o != null && v != null ? ` <span class="hint">(${v - o >= 0 ? '+' : '-'}${money(Math.abs(v - o))})</span>` : ''}`;
    };
    return `<tr><th scope="row" class="l">${esc(longDate(h.effective))}</th>${g.map(([id]) => `<td>${cell(id)}</td>`).join('')}</tr>`;
  }).join('\n');
  add('fuel-price-history', layout({
    path: 'fuel-price-history/',
    title: `South African fuel price history (inland, since ${MONTH_NAMES[Number(hist.at(-1).effective.slice(5, 7)) - 1]} ${hist.at(-1).effective.slice(0, 4)})`,
    desc: `Monthly inland petrol 93, petrol 95 and diesel prices in South Africa, with the change at each adjustment. Latest prices from ${longDate(cur.effective)}.`,
    h1: 'South African fuel price history',
    body: `    <p>Inland prices in rand per litre at each monthly adjustment. Diesel prices are wholesale. The next adjustment is on the first Wednesday of the month.</p>
    <section class="panel"><div class="scroll"><table class="tbl">
      <caption class="sr">Inland fuel prices by adjustment date</caption>
      <thead><tr><th scope="col" class="l">Effective</th>${g.map(([, n]) => `<th scope="col">${n}</th>`).join('')}</tr></thead>
      <tbody>
${rows}
      </tbody>
    </table></div></section>`,
    crumbs: [['Pump Check', `${BASE}/`], ['Fuel price history', `${BASE}/fuel-price-history/`]]
  }), '0.8');
}

// ---- write everything ----
for (const [rel, html] of files) {
  const full = `${OUT}/${rel}`;
  await mkdir(full.slice(0, full.lastIndexOf('/')), { recursive: true });
  await writeFile(full, html);
}
const lastmod = prices.updated;
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE}/</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>
${urls.map(([p, pr]) => `  <url><loc>${BASE}/${p}/</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>${pr}</priority></url>`).join('\n')}
</urlset>
`;
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/sitemap.xml`, sm);
console.log(`Wrote ${files.size} pages and a sitemap with ${urls.length + 1} addresses to ${OUT}`);
