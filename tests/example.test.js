// A példa riport őrzése: a repóbeli docs/example-report.md mindig egyezzen a generálttal, és a példa adata kitalált legyen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { render } = require('../scripts/make-example.js');
const E = require('../web/example.js');

test('a docs/example-report.md megegyezik a generálttal (node scripts/make-example.js)', () => {
  const file = fs.readFileSync(path.join(__dirname, '..', 'docs', 'example-report.md'), 'utf8');
  assert.strictEqual(file, render());
});

test('a példa adata nyilvánvalóan kitalált', () => {
  assert.match(E.data.serialRaw, /^PELDA/);
  assert.match(E.data.model, /\(példa\)/);
});

test('a példa riportban minden szakasz és a hardverteszt is szerepel', () => {
  const text = render();
  ['Összegzés a vevőnek', 'Eszköz', 'Akkumulátor', 'Zárak és felügyelet', 'Hardverteszt'].forEach((title) => {
    assert.ok(text.includes('## ' + title), title);
  });
});
