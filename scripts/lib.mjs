// Shared helpers for the price updater and the prerenderer. No dependencies.

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const GRADE_IDS = ['p93', 'p95', 'd500', 'd50'];

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// South African fuel prices change on the first Wednesday of the month.
export function firstWednesday(year, monthIndex) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (3 - first.getUTCDay() + 7) % 7;
  return isoDate(new Date(Date.UTC(year, monthIndex, 1 + offset)));
}

export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY_NAMES[dow]} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&ndash;|&#8211;|&#x2013;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function section(text, label) {
  const re = new RegExp(label + '\\s+price', 'gi');
  let m;
  while ((m = re.exec(text))) {
    const chunk = text.slice(m.index, m.index + 700);
    if (/Petrol\s*9[35]|Diesel/i.test(chunk)) return chunk;
  }
  return null;
}

function pick(chunk, re) {
  const m = chunk && chunk.match(re);
  return m ? Number(m[1].replace(',', '.')) : null;
}

// Reads the inland and coastal price lists from the text of a monthly price article.
export function parsePrices(text) {
  const inland = section(text, 'Inland');
  const coast = section(text, 'Coastal');
  if (!inland || !coast) throw new Error('Could not find the inland and coastal price lists');
  const cut = inland.search(/Coastal\s+price/i);
  const inlandOnly = cut > 0 ? inland.slice(0, cut) : inland;
  const num = '\\bR\\s*(\\d{2}[.,]\\d{2})';
  const find = (chunk, label) => pick(chunk, new RegExp(label + '.{0,70}?' + num, 'i'));
  const prices = {
    p93: { inland: find(inlandOnly, 'Petrol\\s*93\\b'), coast: find(coast, 'Petrol\\s*93\\b') },
    p95: { inland: find(inlandOnly, 'Petrol\\s*95\\b'), coast: find(coast, 'Petrol\\s*95\\b') },
    d500: { inland: find(inlandOnly, 'Diesel\\s*0[.,]05\\s*%'), coast: find(coast, 'Diesel\\s*0[.,]05\\s*%') },
    d50: { inland: find(inlandOnly, 'Diesel\\s*0[.,]005\\s*%'), coast: find(coast, 'Diesel\\s*0[.,]005\\s*%') }
  };
  return prices;
}

// Throws if the entry looks wrong. prev is the older entry to compare against, if any.
export function validateEntry(entry, prev) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.effective)) throw new Error('Bad effective date');
  const required = [['p95', 'inland'], ['p95', 'coast'], ['p93', 'inland'], ['d500', 'inland'], ['d500', 'coast'], ['d50', 'inland'], ['d50', 'coast']];
  for (const [g, r] of required) {
    const v = entry.prices?.[g]?.[r];
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(`Missing price for ${g} ${r}`);
  }
  for (const g of GRADE_IDS) {
    for (const r of ['inland', 'coast']) {
      const v = entry.prices[g][r];
      if (v == null) continue;
      if (v < 10 || v > 80) throw new Error(`Price out of range: ${g} ${r} ${v}`);
      const old = prev?.prices?.[g]?.[r];
      if (typeof old === 'number' && Math.abs(v - old) > 8) throw new Error(`Jump too large: ${g} ${r} ${old} to ${v}`);
    }
  }
}
