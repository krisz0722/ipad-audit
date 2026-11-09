'use strict';
// A docs/example-report.md előállítása a web/example.js kitalált adataiból, ugyanazzal a buildSections függvénnyel,
// amit az oldal is használ. Futtatás: node scripts/make-example.js
const fs = require('fs');
const path = require('path');
const P = require('../web/parse.js');
const E = require('../web/example.js');

const ICONS = { ok: '✅', warn: '⚠️', bad: '❌', info: 'ℹ️', nodata: '❔' };

function cell(text) {
  return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function render() {
  const sections = P.buildSections(E.data);
  let out = '# Példa riport\n\n';
  out += 'Ez egy **kitalált példa**: így néz ki az a riport, amit a vásárló kap, és amit az eladó a küldés előtt az előnézetben lát. ' +
    'Az adatok nem valódi eszközről valók.\n\n';
  out += 'A fájl a `web/example.js` adataiból készül a `scripts/make-example.js` szkripttel, ugyanazzal a függvénnyel (`buildSections`), ' +
    'amit az oldal is használ, és egy teszt őrzi, hogy mindig megegyezzen vele.\n\n';
  sections.forEach((section) => {
    out += '## ' + section.title + '\n\n| Adat | Érték | Forrás |\n|---|---|---|\n';
    section.rows.forEach((row) => {
      out += '| ' + cell(row.label) + ' | ' + (ICONS[row.status] || '') + ' ' + cell(row.value) + ' | ' + cell(row.tag) + ' |\n';
    });
    out += '\n';
  });
  return out;
}

module.exports = { render };

if (require.main === module) {
  fs.mkdirSync(path.join(__dirname, '..', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'example-report.md'), render());
  console.log('docs/example-report.md kész');
}
