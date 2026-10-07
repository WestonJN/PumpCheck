// Downloads the EPA vehicle list and writes data/vehicles-epa.json.
// If anything goes wrong it prints a warning and leaves the existing file alone, so a deploy never fails because of this.
import { writeFile } from 'node:fs/promises';
import { buildRows } from './epa.mjs';

const URL_CSV = 'https://www.fueleconomy.gov/feg/epadata/vehicles.csv';
try {
  const res = await fetch(URL_CSV, { headers: { 'user-agent': 'PumpCheckBot/1.0' }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = await res.text();
  if (text.length > 80_000_000) throw new Error('File is unexpectedly large');
  const rows = buildRows(text);
  if (rows.length < 500) throw new Error('Too few vehicles found: ' + rows.length);
  const body = '{\n  "source": "US EPA fueleconomy.gov (US-market figures, tank sizes estimated)",\n  "vehicles": [\n' +
    rows.map((r) => '    ' + JSON.stringify(r)).join(',\n') + '\n  ]\n}\n';
  await writeFile('data/vehicles-epa.json', body);
  console.log(`Wrote ${rows.length} EPA vehicles`);
} catch (err) {
  console.warn('Vehicle list not refreshed:', err.message);
}
