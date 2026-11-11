// A web/seller.js-t az src/web/seller/ mappa részeiből fűzi össze, sorrendben (a fájlnevek elején lévő szám dönt).
// Az eredmény továbbra is egyetlen, olvasható, ES5-ös fájl, ez megy ki az éles oldalra. A részek egy közös zárt függvényen
// belül vannak, ezért a szétbontás nem változtat a működésen. Futtatás: npm run build:web
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PARTS_DIR = path.join(ROOT, 'src', 'web', 'seller');
const OUT = path.join(ROOT, 'web', 'seller.js');

const BANNER = [
  '// FIGYELEM: ezt a fájlt a scripts/build-web.js állítja elő az src/web/seller/ mappa részeiből.',
  '// Ne ezt szerkeszd: módosítsd a részeket, és futtasd az npm run build:web parancsot. Egy teszt őrzi, hogy a kettő egyezzen.',
  ''
].join('\n');

function parts() {
  return fs.readdirSync(PARTS_DIR).filter((n) => /^\d+-.*\.js$/.test(n)).sort();
}

function build() {
  let out = BANNER;
  for (const name of parts()) {
    out += '// ===== src/web/seller/' + name + ' =====\n';
    out += fs.readFileSync(path.join(PARTS_DIR, name), 'utf8');
    if (!out.endsWith('\n')) out += '\n';
  }
  return out;
}

module.exports = { build, parts, OUT, PARTS_DIR };

if (require.main === module) {
  const text = build();
  fs.writeFileSync(OUT, text);
  console.log('web/seller.js előállítva: ' + parts().length + ' részből, ' + text.split('\n').length + ' sor');
}
