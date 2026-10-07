import assert from 'node:assert/strict';
import { firstWednesday, parsePrices, stripHtml, validateEntry } from './lib.mjs';

assert.equal(firstWednesday(2026, 9), '2026-10-07');
assert.equal(firstWednesday(2026, 8), '2026-09-02');
assert.equal(firstWednesday(2026, 11), '2026-12-02');

const html = `<h2>Confirmed October 2026 fuel price</h2><h3>Inland price</h3><ul>
<li><strong>Petrol 93 ULP/LRP –</strong> R29.88 per litre</li>
<li><strong>Petrol 95 ULP/LRP –</strong> R30.25 per litre</li>
<li><strong>Diesel 0.05% Sulphur/500ppm (wholesale) –</strong> R31.95 per litre</li>
<li><strong>Diesel 0.005% Sulphur/50ppm (wholesale) –</strong> R33.29 per litre</li></ul>
<h3>Coastal price</h3><ul>
<li><strong>Petrol 95 ULP/LRP –</strong> R29.38 per litre</li>
<li><strong>Diesel 0.05% Sulphur/500ppm (wholesale) –</strong> R31.08 per litre</li>
<li><strong>Diesel 0.005% Sulphur/50ppm (wholesale) –</strong> R32.03 per litre</li></ul>`;
const prices = parsePrices(stripHtml(html));
assert.deepEqual(prices, {
  p93: { inland: 29.88, coast: null },
  p95: { inland: 30.25, coast: 29.38 },
  d500: { inland: 31.95, coast: 31.08 },
  d50: { inland: 33.29, coast: 32.03 }
});
const prev = { prices: { p93: { inland: 26.76, coast: null }, p95: { inland: 26.92, coast: 26.05 }, d500: { inland: 29.11, coast: 28.24 }, d50: { inland: 30.05, coast: 28.79 } } };
validateEntry({ effective: '2026-10-07', prices }, prev);
assert.throws(() => validateEntry({ effective: '2026-10-07', prices: { ...prices, p95: { inland: 3.02, coast: 29.38 } } }, prev));
assert.throws(() => validateEntry({ effective: '2026-10-07', prices: { ...prices, p95: { inland: 45, coast: 29.38 } } }, prev));
assert.throws(() => parsePrices('nothing useful here'));
console.log('All tests passed');

import { buildRows, estimateTank, parseCsv } from './epa.mjs';
const csv = [
  'make,model,year,comb08,fuelType1,VClass,displ,cylinders,atvType',
  'Honda,"Civic, Sport",2024,35,Regular Gasoline,Compact Cars,2.0,4,',
  'Honda,"Civic, Sport",2023,34,Regular Gasoline,Compact Cars,2.0,4,',
  'Ford,F-150,2024,20,Regular Gasoline,Standard Pickup Trucks,3.5,6,',
  'Ford,Ranger,2024,28,Diesel,Small Pickup Trucks,2.2,4,',
  'Tesla,Model 3,2024,130,Electricity,Midsize Cars,0,0,EV',
  'Old,Car,1990,20,Regular Gasoline,Compact Cars,2.0,4,'
].join('\n');
assert.equal(parseCsv('a,"b,c"\n1,2').length, 2);
const rows = buildRows(csv);
assert.equal(rows.length, 3);
assert.deepEqual(rows.find((r) => r[1] === 'Civic, Sport'), ['Honda', 'Civic, Sport', '2.0L 4-cyl (2024)', 'p', 6.7, 50, 1]);
assert.equal(rows.find((r) => r[1] === 'Ranger')[3], 'd');
assert.equal(estimateTank('Standard Pickup Trucks'), 90);
console.log('EPA tests passed');
