// Adds a new month to data/prices.json.
// Automatic mode reads the monthly price article; manual mode reads MANUAL_* environment variables.
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { MONTH_NAMES, firstWednesday, isoDate, parsePrices, stripHtml, validateEntry } from './lib.mjs';

const FILE = 'data/prices.json';
const UA = 'PumpCheckBot/1.0 (static GitHub Pages fuel price calculator)';

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  if (!new URL(res.url).hostname.endsWith('getaway.co.za')) throw new Error('Redirected to an unexpected host');
  const html = await res.text();
  if (html.length > 3_000_000) throw new Error('Page is unexpectedly large');
  return html;
}

function manualEntry() {
  const e = process.env;
  const n = (k) => (e[k] === undefined || e[k] === '' ? null : Number(e[k]));
  return {
    effective: e.MANUAL_EFFECTIVE,
    prices: {
      p93: { inland: n('P93_IN'), coast: null },
      p95: { inland: n('P95_IN'), coast: n('P95_CO') },
      d500: { inland: n('D500_IN'), coast: n('D500_CO') },
      d50: { inland: n('D50_IN'), coast: n('D50_CO') }
    }
  };
}

async function automaticEntries(history) {
  const now = new Date();
  const found = [];
  for (const offset of [0, 1]) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const effective = firstWednesday(d.getUTCFullYear(), d.getUTCMonth());
    if (history.some((h) => h.effective === effective)) continue;
    const month = MONTH_NAMES[d.getUTCMonth()];
    const url = `https://www.getaway.co.za/news/south-africa-fuel-prices-${month.toLowerCase()}-${d.getUTCFullYear()}/`;
    const html = await fetchPage(url);
    if (!html) { console.log(`Not published yet: ${url}`); continue; }
    const text = stripHtml(html);
    if (!text.includes(`${month} ${d.getUTCFullYear()}`)) throw new Error(`Page does not mention ${month} ${d.getUTCFullYear()}`);
    found.push({ effective, prices: parsePrices(text) });
  }
  return found;
}

async function main() {
  const data = JSON.parse(await readFile(FILE, 'utf8'));
  const entries = process.env.MANUAL_EFFECTIVE ? [manualEntry()] : await automaticEntries(data.history);
  let changed = false;
  for (const entry of entries) {
    const older = data.history.filter((h) => h.effective < entry.effective).sort((a, b) => b.effective.localeCompare(a.effective))[0];
    validateEntry(entry, older);
    const i = data.history.findIndex((h) => h.effective === entry.effective);
    if (i >= 0) data.history[i] = entry; else data.history.push(entry);
    changed = true;
    console.log(`Recorded prices effective ${entry.effective}`);
  }
  if (changed) {
    data.history.sort((a, b) => b.effective.localeCompare(a.effective));
    data.history = data.history.slice(0, 36);
    data.updated = isoDate(new Date());
    await writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
  } else {
    console.log('No new prices.');
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
}

main().catch((err) => { console.error('Update failed:', err.message); process.exitCode = 1; });
