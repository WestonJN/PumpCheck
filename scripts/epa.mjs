// Turns the US EPA fueleconomy.gov vehicles.csv into compact rows for the vehicle picker.
// Row: [make, model, variant, fuel (p or d), litres per 100 km, tank litres (estimated), 1]

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function estimateTank(vclass) {
  const c = vclass.toLowerCase();
  if (/pickup/.test(c)) return /small/.test(c) ? 70 : 90;
  if (/minivan/.test(c)) return 70;
  if (/van/.test(c)) return 80;
  if (/sport utility/.test(c)) return /small/.test(c) ? 55 : 75;
  if (/two seater/.test(c)) return 50;
  if (/minicompact/.test(c)) return 40;
  if (/subcompact/.test(c)) return 45;
  if (/compact/.test(c)) return 50;
  if (/midsize/.test(c)) return 60;
  if (/large/.test(c)) return 70;
  if (/wagon/.test(c)) return 55;
  return 55;
}

export function buildRows(csvText, { years = 10 } = {}) {
  const table = parseCsv(csvText);
  const head = table.shift();
  const col = (n) => { const i = head.indexOf(n); if (i < 0) throw new Error('Missing column ' + n); return i; };
  const ix = { make: col('make'), model: col('model'), year: col('year'), comb: col('comb08'), fuel: col('fuelType1'), vclass: col('VClass'), displ: col('displ'), cyl: col('cylinders'), atv: col('atvType') };
  const best = new Map();
  let newest = 0;
  for (const r of table) { const y = Number(r[ix.year]); if (y > newest) newest = y; }
  if (!newest) throw new Error('No model years found');
  for (const r of table) {
    const year = Number(r[ix.year]);
    if (!year || year <= newest - years) continue;
    const fuel = r[ix.fuel];
    const type = fuel === 'Diesel' ? 'd' : /Gasoline/.test(fuel) ? 'p' : null;
    if (!type) continue;
    if (/EV|Plug-in|CNG/.test(r[ix.atv] || '')) continue;
    const mpg = Number(r[ix.comb]);
    if (!(mpg > 5 && mpg < 150)) continue;
    const displ = Number(r[ix.displ]);
    const cyl = Number(r[ix.cyl]);
    const key = [r[ix.make], r[ix.model], displ, cyl, type].join('|');
    const old = best.get(key);
    if (!old || year > old.year || (year === old.year && mpg < old.mpg)) best.set(key, { r, year, mpg, type, displ, cyl });
  }
  const out = [];
  for (const { r, year, mpg, type, displ, cyl } of best.values()) {
    const eng = (displ > 0 ? displ.toFixed(1) + 'L' : '') + (cyl > 0 ? ' ' + cyl + '-cyl' : '');
    const variant = (eng.trim() || 'Standard') + ' (' + year + ')';
    out.push([r[ix.make], r[ix.model], variant, type, Math.round(235.215 / mpg * 10) / 10, estimateTank(r[ix.vclass]), 1]);
  }
  out.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  return out;
}
