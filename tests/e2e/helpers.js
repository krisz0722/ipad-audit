// Közös segédek az e2e tesztekhez: lépésenkénti képernyőkép, eszközök, minta adatok, valódi érintés, hamis backend.
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const OUT = path.join(__dirname, '..', '..', 'flows-out');
// PAUSE_MS=1500 esetén minden lépés után megáll, és felirat-sáv mutatja, mit csinál éppen a teszt (npm run watch).
const PAUSE = Number(process.env.PAUSE_MS || 0);
// STEP=1 esetén minden lépés előtt megáll, és a Következő gomb (vagy Szóköz, Enter, jobb nyíl) lépteti tovább (npm run step).
const STEP = !!process.env.STEP;

const UA = {
  ipad9: 'Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13G36 Safari/601.1',
  ipad12: 'Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  ipad14: 'Mozilla/5.0 (iPad; CPU OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
  ipad17: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
};
const IPAD = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 900 };

// Kitalált minta adatok, ugyanazok, amiket a valódi beolvasók értenek.
const LOG9 = '{"os_version":"iPhone OS 9.3.5 (13G36)","timestamp":"2026-11-09 18:00:00.00 +0100"}\n{"message":{"batterycyclecount":245}}';
const FILE17 = '{"os_version":"iPadOS 17.4 (21E219)","timestamp":"2026-11-09 18:00:00.00 +0100"}\n{"message":{"Last_Value_CycleCount":312,"Last_Value_MaximumCapacityPercent":88}}';
const USB = 'iPad akku-kiolvasó.\nIPAD-AUDIT-USB 1\nmodel: iPad2,5\nmodel_name: iPad mini 1\nos: 9.3.5\nserial: DMPS00000FAK\nstorage_gb: 16\ncycles: 245\ndesign_capacity: 4490\nmax_capacity: 3730\ncapacity_percent: 83.1\nactivation_lock: unknown\nEND';
const MAC = '14.5\n<key>chip_type</key>\n<string>Apple M1</string>\n<key>machine_model</key>\n<string>MacBookAir10,1</string>\n<key>machine_name</key>\n<string>MacBook Air</string>\n<key>serial_number</key>\n<string>C02XYZ123456</string>\n<key>sppower_battery_cycle_count</key>\n<integer>212</integer>\n<key>sppower_battery_health_maximum_capacity</key>\n<string>91%</string>';

const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

// Egy forgatókönyv: minden lépés után képernyőkép, a lépések leírása a galériához.
class Flow {
  constructor(page, id, title, group, description) {
    this.page = page; this.id = id; this.title = title; this.group = group; this.description = description || '';
    this.dir = path.join(OUT, id);
    this.steps = [];
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }
  // Felirat-sáv a képernyő tetején, csak nézéskor (PAUSE_MS). A képernyőképekbe nem kerül bele.
  async banner(text) {
    if (!PAUSE && !STEP) return;
    await this.page.evaluate((t) => {
      let b = document.getElementById('__flow-banner');
      if (!b) {
        b = document.createElement('div');
        b.id = '__flow-banner';
        b.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147483647;padding:10px 14px;background:#111;color:#fff;font:600 17px/1.3 system-ui,sans-serif;border-radius:10px;opacity:.93;pointer-events:none;text-align:center';
        document.body.appendChild(b);
      }
      b.textContent = t;
      b.style.display = t ? 'block' : 'none';
    }, text).catch(() => {});
  }
  // Megáll, és megvárja a felhasználót. A 'Tovább futás' gomb után a többi lépés magától fut.
  async waitForUser(text) {
    await this.page.evaluate((t) => {
      window.__flowGo = '';
      let b = document.getElementById('__flow-banner');
      if (!b) {
        b = document.createElement('div');
        b.id = '__flow-banner';
        b.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:2147483647;padding:10px 14px;background:#111;color:#fff;font:600 17px/1.3 system-ui,sans-serif;border-radius:10px;opacity:.93;pointer-events:none;text-align:center';
        document.body.appendChild(b);
      }
      b.textContent = t;
      b.style.display = 'block';
      let panel = document.getElementById('__flow-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.id = '__flow-panel';
        panel.style.cssText = 'position:fixed;left:0;right:0;bottom:12px;z-index:2147483647;text-align:center;pointer-events:none';
        const mk = (id, label, go, bg) => {
          const x = document.createElement('button');
          x.id = id; x.type = 'button'; x.textContent = label;
          x.style.cssText = 'pointer-events:auto;margin:0 6px;padding:12px 22px;border:0;border-radius:10px;font:700 17px system-ui,sans-serif;color:#fff;background:' + bg + ';cursor:pointer';
          x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.__flowGo = go; });
          return x;
        };
        panel.appendChild(mk('__flow-next', 'Következő ▶', 'next', '#1d4ed8'));
        panel.appendChild(mk('__flow-run', 'Tovább futás ▶▶', 'run', '#555'));
        document.body.appendChild(panel);
        document.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); window.__flowGo = 'next'; }
        }, true);
      }
      panel.style.display = 'block';
    }, text);
    // A funkció tesztelésére: STEP_AUTOCLICK=1 esetén a gombot magától megnyomja.
    if (process.env.STEP_AUTOCLICK) await this.page.locator('#__flow-next').click();
    await this.page.waitForFunction(() => window.__flowGo, null, { timeout: 0 });
    const go = await this.page.evaluate(() => window.__flowGo);
    if (go === 'run') this.autorun = true;
  }
  async snap(label) {
    await this.banner('');
    await this.page.evaluate(() => { const p = document.getElementById('__flow-panel'); if (p) p.style.display = 'none'; }).catch(() => {});
    const n = this.steps.length + 1;
    const file = String(n).padStart(2, '0') + '-' + slug(label) + '.png';
    await this.page.screenshot({ path: path.join(this.dir, file), fullPage: true });
    const h1 = await this.page.locator('h1').first().textContent({ timeout: 2000 }).catch(() => '');
    this.steps.push({ n, label, file, h1: (h1 || '').trim() });
    if (PAUSE) await this.page.waitForTimeout(PAUSE / 2);
  }
  // Végrehajt egy műveletet, megvárja a várt főcímet (ha van), majd képernyőképet készít.
  async step(label, action, expectedH1) {
    if (STEP && !this.autorun) {
      await this.waitForUser('▶ Következő lépés: ' + (this.steps.length + 1) + '. ' + label);
    } else if (PAUSE) {
      await this.banner('▶ ' + (this.steps.length + 1) + '. ' + label);
      await this.page.waitForTimeout(PAUSE / 2);
    }
    await action();
    if (expectedH1 !== undefined) await expect(this.page.locator('h1').first()).toHaveText(expectedH1);
    await this.snap(label);
  }
  async save() {
    // Léptetéskor a forgatókönyv végén is megáll, hogy lásd az utolsó képernyőt.
    if (STEP && !this.autorun) await this.waitForUser('Vége a forgatókönyvnek. A Következő gomb bezárja az ablakot.');
    fs.writeFileSync(path.join(this.dir, 'steps.json'), JSON.stringify({ id: this.id, title: this.title, group: this.group, description: this.description, steps: this.steps }, null, 2));
  }
}

// Az eszköz képességeit szimuláló init script: a régi iOS-en nincs mediaDevices és nincs requestPermission.
async function emulate(page, kind) {
  await page.addInitScript((k) => {
    // A Chrome hamis kamerája nem ismeri a facingMode megkötést, ezért itt eltávolítjuk. Valódi iPaden az alkalmazás
    // szándékosan pontos kamerairányt kér, hogy tényleg a hátlapi, illetve az előlapi kamerát tesztelje.
    if (k !== 'legacy') {
      try {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function (c) {
          if (c && c.video && typeof c.video === 'object') c = Object.assign({}, c, { video: true });
          return original(c);
        };
      } catch (e) { /* nem baj */ }
    }
    if (k === 'legacy') {
      try { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }); } catch (e) { /* nem baj */ }
      try { DeviceMotionEvent.requestPermission = undefined; } catch (e) { /* nem baj */ }
    } else if (k === 'ios11') {
      try { DeviceMotionEvent.requestPermission = undefined; } catch (e) { /* nem baj */ }
    } else if (k === 'ios13') {
      try { DeviceMotionEvent.requestPermission = function () { return Promise.resolve('granted'); }; } catch (e) { /* nem baj */ }
    }
  }, kind);
}

// A nyitóoldalról indít: beírja a kódot, és megnyomja a Rendben, kezdjük gombot.
async function begin(page, f, code, label) {
  await page.goto('/');
  await expect(page.locator('h1').first()).toHaveText('Az eszközöd állapotának ellenőrzése');
  await f.snap('Nyitóoldal');
  await f.step(label || 'Kód beírása, Rendben, kezdjük', async () => {
    await page.locator('#code').fill(code);
    await page.locator('#start').click();
  }, 'Milyen eszközt adsz el?');
}

async function chooseApple(page, value) {
  await page.locator('input[name=apple][value=' + (value || 'yes') + ']').check();
}

// Valódi (megbízható) érintések a Chrome DevTools protokollal, egy ujjal cikkcakkban, majd két ujjal.
async function dragAllCells(page, f) {
  const cdp = await page.context().newCDPSession(page);
  const { width: W, height: H } = page.viewportSize();
  const COLS = 8, ROWS = 12;
  const cx = (c) => Math.round((c + 0.5) * W / COLS), cy = (r) => Math.round((r + 0.5) * H / ROWS);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
  await touch('touchStart', [[cx(0), cy(0)]]);
  for (let r = 0; r < ROWS; r++) {
    const cols = Array.from({ length: COLS }, (_, i) => i);
    if (r % 2) cols.reverse();
    for (const c of cols) { await touch('touchMove', [[cx(c), cy(r)]]); if (PAUSE) await page.waitForTimeout(25); }
    if (r === 5) await f.snap('Érintés: félúton, az érzékelt mezők zöldek');
  }
  await touch('touchEnd', []);
  await f.snap('Érintés: minden mező érzékelve, jön a két ujj');
  await touch('touchStart', [[W / 3, H / 3], [2 * W / 3, 2 * H / 3]]);
  await touch('touchEnd', []);
  await cdp.detach();
}

async function hwNext(page) { await page.locator('#hw-next').click(); }

async function hwTouch(page, f, mode) {
  if (mode === 'skip') { await f.step('Érintés: kihagyom', () => page.locator('#hw-skip').click(), 'Mozgásérzékelők'); return; }
  await f.step('Érintés: Indítás, a rács megjelenik', () => page.locator('#hw-start').click());
  await expect(page.locator('#touch-overlay')).toBeVisible();
  await dragAllCells(page, f);
  await expect(page.locator('#touch-overlay')).toHaveCount(0);
  await expect(page.locator('#result')).toContainText('mind a 96 mező');
  await f.snap('Érintés: eredmény');
  await hwNext(page);
}

async function hwMotion(page, f, mode) {
  if (mode === 'skip') { await f.step('Mozgás: kihagyom', () => page.locator('#hw-skip').click(), 'Hangszóró és mikrofon'); return; }
  await f.step('Mozgás: Indítás', () => page.locator('#hw-start').click());
  await expect(page.locator('#result')).toContainText('Mozgasd az eszközt');
  await page.evaluate(() => {
    window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: -6, y: -5, z: 0 }, rotationRate: { alpha: 10, beta: 0, gamma: 0 } }));
    window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 6, y: 5, z: 0 }, rotationRate: { alpha: 0, beta: 55, gamma: 0 } }));
  });
  await expect(page.locator('#result')).toContainText('mért mozgás');
  await f.snap('Mozgás: eredmény');
  await hwNext(page);
}

// mode: 'unavailable' (a böngésző nem engedi), 'skip', vagy 'run' (a hamis kamera és mikrofon fut)
async function hwMedia(page, f, mode, name) {
  if (mode === 'unavailable') {
    await expect(page.locator('#hw-next')).toBeVisible();
    await f.snap(name + ': ezen a rendszeren nem ellenőrizhető');
    await hwNext(page);
    return;
  }
  if (mode === 'skip') { await f.step(name + ': kihagyom', () => page.locator('#hw-skip').click()); return; }
  await f.step(name + ': Indítás', () => page.locator('#hw-start').click());
  await expect(page.locator('#hw-next')).toBeVisible({ timeout: 70000 });
  await f.snap(name + ': eredmény');
  await hwNext(page);
}

// Egy billentyű megnyomása. Amit a Playwright nem ismer (például az ISO IntlBackslash), azt a protokollon küldjük.
const RAW_KEYS = { IntlBackslash: { key: '<', vk: 226 } };
async function pressCode(page, code) {
  if (!RAW_KEYS[code]) { await page.keyboard.press(code); return; }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: RAW_KEYS[code].key, windowsVirtualKeyCode: RAW_KEYS[code].vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: RAW_KEYS[code].key, windowsVirtualKeyCode: RAW_KEYS[code].vk });
  await cdp.detach();
}

// Billentyűzet (Mac): valódi billentyűesemények a Playwright billentyűzetével.
// o.layout: 'iso', o.fn: a funkciósort is megnyomja, o.skip: kihagyott billentyű kódok, o.double: dupla leütést is előidéz.
async function hwKeyboard(page, f, o) {
  o = o || {};
  if (o.layout === 'iso') await page.locator('input[name=kbl][value=iso]').check();
  await f.snap('Billentyűzet: a kiosztás kiválasztása');
  await f.step('Billentyűzet: Indítás, a kiosztás megjelenik', () => page.locator('#hw-start').click());
  await expect(page.locator('#key-overlay')).toBeVisible();
  const keys = await page.evaluate(() => Array.from(document.querySelectorAll('.kcell')).map((e) => ({ code: e.getAttribute('data-code'), soft: e.className.indexOf('soft') >= 0 })));
  const skip = o.skip || [];
  const list = keys.filter((k) => (!k.soft || o.fn) && skip.indexOf(k.code) < 0).map((k) => k.code);
  const half = Math.floor(list.length / 2);
  for (const code of list.slice(0, half)) await pressCode(page, code);
  await f.snap('Billentyűzet: félúton, az érzékelt billentyűk zöldek');
  for (const code of list.slice(half)) await pressCode(page, code);
  if (o.double) {
    // Két leütés felengedés nélkül (a Playwright billentyűzete ezt ismétlésnek venné, ezért a protokollon küldjük).
    const cdp = await page.context().newCDPSession(page);
    for (let i = 0; i < 2; i++) await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyA', key: 'a', windowsVirtualKeyCode: 65 });
    await cdp.detach();
  }
  await f.snap('Billentyűzet: a nyomogatás után');
  await f.step('Billentyűzet: Kész', () => page.locator('#key-done').click());
  await expect(page.locator('#result')).toContainText(o.expect || 'mind a');
  await f.snap('Billentyűzet: eredmény');
  await hwNext(page);
}

// Egér és trackpad (Mac): valódi egéresemények. o.partial: csak a rács egy része, két kattintás és egy görgetési irány.
async function hwPointer(page, f, o) {
  o = o || {};
  await f.step('Egér: Indítás', () => page.locator('#hw-start').click());
  await expect(page.locator('#pointer-overlay')).toBeVisible();
  const { width: W, height: H } = page.viewportSize();
  const COLS = 8, ROWS = 6;
  const cx = (c) => Math.round((c + 0.5) * W / COLS), cy = (r) => Math.round((r + 0.5) * H / ROWS);
  const limit = o.partial ? 30 : COLS * ROWS;
  let n = 0;
  for (let r = 0; r < ROWS && n < limit; r++) {
    const cols = Array.from({ length: COLS }, (_, i) => i);
    if (r % 2) cols.reverse();
    for (const c of cols) { if (n++ >= limit) break; await page.mouse.move(cx(c), cy(r)); }
    if (r === 2) await f.snap('Egér: félúton, a bejárt mezők zöldek');
  }
  const center = async (id) => { const b = await page.locator('.ptarget[data-id=' + id + ']').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
  for (const id of (o.partial ? ['tl', 'c'] : ['tl', 'tr', 'bl', 'br', 'c'])) await center(id);
  await f.snap('Egér: a kattintási pontok');
  if (!o.partial) await page.mouse.click(W / 2, Math.round(H * 0.65), { button: 'right' });
  await page.mouse.move(W / 2, H / 2);
  await page.mouse.wheel(0, 120);
  if (!o.partial) {
    await page.mouse.wheel(0, -120);
    await page.mouse.wheel(60, 0);
    await page.mouse.dblclick(W / 2, Math.round(H * 0.7));
  }
  await f.snap('Egér: jobb kattintás és görgetés után');
  await f.step('Egér: Kész', () => page.locator('#pointer-done').click());
  await expect(page.locator('#result')).toContainText(o.expect || 'mind a 48 mezőn');
  await f.snap('Egér: eredmény');
  await hwNext(page);
}

async function hwDisplay(page, f, verdict) {
  await f.step('Kijelző: Indítás, az első szín', () => page.locator('#hw-start').click());
  for (let i = 0; i < 6; i++) await page.locator('#color-next').click();
  await expect(page.locator('#d-no')).toBeVisible();
  await f.snap('Kijelző: látsz-e hibát?');
  await page.locator(verdict === 'bad' ? '#d-yes' : '#d-no').click();
  await expect(page.locator('#hw-next')).toBeVisible();
  await f.snap('Kijelző: eredmény');
  await hwNext(page);
}

// Hamis Apps Script: soha nem éri el az éles backendet. A kéréseket rögzíti.
async function mockBackend(page, handler) {
  const requests = [];
  await page.route('https://script.google.com/**', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    requests.push(body);
    const answer = handler(body, requests.length);
    if (answer === 'abort') { await route.abort('failed'); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer) });
  });
  return requests;
}

module.exports = { OUT, UA, IPAD, DESKTOP, LOG9, FILE17, USB, MAC, Flow, emulate, begin, chooseApple, hwTouch, hwMotion, hwMedia, hwDisplay, hwKeyboard, hwPointer, hwNext, mockBackend, expect };
