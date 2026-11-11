// A flows-out/ mappa tartalmából egyetlen oldalt épít (flows-out/index.html): minden forgatókönyv lépésről lépésre,
// mint egy képregény, utána az összes képernyő. Futtatás: npm run gallery
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'flows-out');
if (!fs.existsSync(OUT)) { console.error('Nincs flows-out mappa. Előbb futtasd: npm run e2e'); process.exit(1); }

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const flows = [];
for (const name of fs.readdirSync(OUT)) {
  const file = path.join(OUT, name, 'steps.json');
  if (name !== 'screens' && fs.existsSync(file)) flows.push(JSON.parse(fs.readFileSync(file, 'utf8')));
}
const order = ['iPad, iOS 9 és 10', 'iPad, iOS 11 és 12', 'iPad, iPadOS 13 és 14', 'iPad, iPadOS 15 és újabb',
  'Számítógép, USB-s kiolvasás (iPad vagy iPhone)', 'Mac eladása', 'Nyitás és hibák', 'Küldés és a backend hibaágai'];
const byGroup = {};
for (const f of flows) (byGroup[f.group] = byGroup[f.group] || []).push(f);
const groups = Object.keys(byGroup).sort((a, b) => (order.indexOf(a) + 100) % 100 - (order.indexOf(b) + 100) % 100);

let screens = { groups: [] };
const screensFile = path.join(OUT, 'screens', 'screens.json');
if (fs.existsSync(screensFile)) screens = JSON.parse(fs.readFileSync(screensFile, 'utf8'));

let nav = '', body = '';
for (const g of groups) {
  nav += `<h3>${esc(g)}</h3><ul>`;
  body += `<h2>${esc(g)}</h2>`;
  for (const f of byGroup[g].sort((a, b) => a.id.localeCompare(b.id))) {
    nav += `<li><a href="#${esc(f.id)}">${esc(f.title)}</a></li>`;
    body += `<section id="${esc(f.id)}"><h3>${esc(f.title)}</h3><p class="id">${esc(f.id)} · ${f.steps.length} lépés</p><div class="strip">`;
    for (const s of f.steps) {
      body += `<figure><a href="${esc(f.id)}/${esc(s.file)}" target="_blank"><img loading="lazy" src="${esc(f.id)}/${esc(s.file)}" alt=""></a>` +
        `<figcaption><b>${s.n}.</b> ${esc(s.label)}<small>${esc(s.h1)}</small></figcaption></figure>`;
    }
    body += '</div></section>';
  }
  nav += '</ul>';
}
if (screens.groups.length) {
  nav += '<h3>Összes képernyő</h3><ul><li><a href="#screens">A #DEMO lista minden állapota</a></li></ul>';
  body += '<h2 id="screens">Összes képernyő (a #DEMO lista)</h2>';
  for (const g of screens.groups) {
    body += `<h3>${esc(g.title)}</h3><div class="strip wrap">`;
    for (const s of g.items) {
      body += `<figure><a href="screens/${esc(s.file)}" target="_blank"><img loading="lazy" src="screens/${esc(s.file)}" alt=""></a>` +
        `<figcaption>${esc(s.title)}<small>#DEMO-${esc(s.id)}</small></figcaption></figure>`;
    }
    body += '</div>';
  }
}

const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Forgatókönyvek és képernyők</title>
<style>
:root { color-scheme: light dark; --bg:#f6f5f2; --card:#fff; --text:#1c1917; --muted:#57534e; --line:#e2dfd9; --accent:#1d4ed8; }
@media (prefers-color-scheme: dark) { :root { --bg:#141311; --card:#1d1c1a; --text:#f4f2ee; --muted:#b5b0a8; --line:#34322e; --accent:#7aa2ff; } }
body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui,sans-serif; display:flex; }
nav { width:290px; flex:none; height:100vh; overflow:auto; position:sticky; top:0; padding:16px; border-right:1px solid var(--line); box-sizing:border-box; }
nav h3 { font-size:13px; color:var(--muted); margin:16px 0 4px; text-transform:uppercase; letter-spacing:.04em; }
nav ul { list-style:none; margin:0; padding:0; } nav a { color:var(--accent); text-decoration:none; display:block; padding:2px 0; }
main { flex:1; min-width:0; padding:16px 24px 80px; }
h1 { margin:0 0 4px; } h2 { margin-top:40px; border-bottom:2px solid var(--line); padding-bottom:6px; }
section { margin:22px 0; padding:12px 14px; background:var(--card); border:1px solid var(--line); border-radius:12px; }
section h3 { margin:0; } .id { color:var(--muted); margin:2px 0 10px; font-size:13px; }
.strip { display:flex; gap:12px; overflow-x:auto; padding-bottom:8px; } .strip.wrap { flex-wrap:wrap; overflow:visible; }
figure { margin:0; flex:none; width:230px; } figure img { width:230px; border:1px solid var(--line); border-radius:8px; display:block; background:#fff; }
figcaption { margin-top:4px; font-size:13px; } figcaption small { display:block; color:var(--muted); }
@media (max-width:800px) { body { display:block; } nav { display:none; } }
</style></head><body><nav>${nav}</nav><main>
<h1>Forgatókönyvek és képernyők</h1>
<p>${flows.length} végigjárt forgatókönyv, lépésenként egy képernyőképpel. Generálta: <code>npm run flows</code>. Kattints egy képre a teljes méretért.</p>
${body}</main></body></html>`;
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('Kész: ' + path.join(OUT, 'index.html') + ' (' + flows.length + ' forgatókönyv, ' + screens.groups.reduce((n, g) => n + g.items.length, 0) + ' képernyő)');
