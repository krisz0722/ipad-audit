// FIGYELEM: ezt a fájlt a scripts/build-web.js állítja elő az src/web/seller/ mappa részeiből.
// Ne ezt szerkeszd: módosítsd a részeket, és futtasd az npm run build:web parancsot. Egy teszt őrzi, hogy a kettő egyezzen.
// ===== src/web/seller/00-head.js =====
// Az eladói varázsló. Független az átvételi oldal USB-s folyamatától (receiver/app.js).
// Minden adat a böngészőben marad, amíg az eladó a végén meg nem nyomja a Küldés gombot.
// Felépítés: minden képernyő egy lépés (SCREENS). A megtett út (state.path, state.idx) a sessionStorage-ban és a
// böngésző előzményeiben is megvan, ezért a Vissza gomb és a böngésző Vissza gombja is ugyanazt csinálja.
(function () {
  'use strict';

  var P = window.SellerParse;
  var app = document.getElementById('app');
  var hash = (location.hash || '').replace('#', '').trim().toUpperCase();
  var DEMO = /^DEMO(-|$)/.test(hash);
  var DEMO_ID = /^DEMO-/.test(hash) ? hash.slice(5).toLowerCase() : '';
  var CODE_PATTERN = /^(?:[0-9]{9}|[0-9A-Z]{12})$/;
  var CODE = CODE_PATTERN.test(hash) ? hash : '';
  var MAX_FILE = 50 * 1024 * 1024;

  // Melyik gépen nyitották meg az oldalt: az eladandó iOS eszközön, vagy egy számítógépen?
  var DEVICE = P.detectOs(navigator.userAgent, navigator.maxTouchPoints || 0);
  var ON_COMPUTER = !DEVICE;
  var FORCE_OS = ''; // csak a próbaüzem állítja
  function computerOs() {
    if (FORCE_OS) return FORCE_OS;
    var ua = navigator.userAgent;
    if (/Windows/.test(ua)) return 'windows';
    if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
    if (/Linux|X11/.test(ua)) return 'linux';
    return '';
  }
  // A letölthető kiolvasó programok fájlnevei. A USB_TOOL_URL (config.js) a letöltési mappa címe, / jellel a végén.
  var TOOL_FILES = {
    windows: [['ipad-audit-reader-windows-x86_64.exe', 'Windows, egyetlen fájl'],
      ['ipad-audit-reader-windows-x86_64-folder.zip', 'Windows, mappa (ha a vírusirtó jelez)']],
    mac: [['ipad-audit-reader-macos-arm64.tar.gz', 'Mac Apple chippel (M1 és újabb)'],
      ['ipad-audit-reader-macos-x86_64.tar.gz', 'Mac Intel processzorral']],
    linux: [['ipad-audit-reader-linux-x86_64.tar.gz', 'Linux']]
  };
  // A letöltési mappa: a GitHub release legfrissebb kiadása. A config.js-ben a USB_TOOL_URL felülírhatja.
  var TOOL_BASE = window.USB_TOOL_URL || 'https://github.com/krisz0722/ipad-audit/releases/latest/download/';
  function pageAddress() {
    return location.origin + location.pathname + (DEMO ? '#DEMO' : (CODE ? '#' + CODE : ''));
  }

  // Csak olvas, nem ír, nem csatlakozik a hálózatra. A profiles kimenetéből csak a két igen/nem sor jön át,
  // mert a teljes kimenet a felügyeleti szerver címét is tartalmazhatja.
  var MAC_COMMAND =
    "sw_vers -productVersion; " +
    "system_profiler -xml SPHardwareDataType | grep -A1 -E '<key>(machine_name|machine_model|chip_type|cpu_type|physical_memory|serial_number|activation_lock_status)</key>'; " +
    "system_profiler -xml SPPowerDataType | grep -A1 -E '<key>(sppower_battery_cycle_count|sppower_battery_health|sppower_battery_health_maximum_capacity)</key>'; " +
    "profiles status -type enrollment | grep -E 'Enrolled via DEP|MDM enrollment'; " +
    "df -k /System/Volumes/Data | tail -1";

  var state = {
    step: 'welcome', path: ['welcome'], idx: 0,
    osFamily: '', detectedOs: '',
    kind: '', route: '',
    vals: { model: '', storage: '', os: '', memory: '', chip: '', serial: '', cycles: '', capacity: '' },
    parsed: {},
    extra: { condition: '', fileDate: '', activationLock: '', dep: null, mdm: null, modelId: '' },
    shareSerial: true, apple: '', sid: '', sending: false, sent: false, noLog: false, demoSections: null,
    hw: {}, hwSkipped: false
  };

  var SCREENS = {};

// ===== src/web/seller/10-helpers.js =====
  /* ---------- segédek ---------- */

  function esc(text) {
    return String(text === null || text === undefined ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clean(text, max) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }
  function $(id) { return document.getElementById(id); }
  function on(id, fn) { var node = $(id); if (node) node.addEventListener('click', fn); }
  function toInt(text, min, max) {
    var t = String(text).trim();
    if (!/^\d{1,5}$/.test(t)) return null;
    var n = parseInt(t, 10);
    return n >= min && n <= max ? n : null;
  }
  function show(html) {
    app.innerHTML = html;
    // A Vissza gomb mindig a főcím alatt van, így a hosszú oldalakon sem kell lefelé keresni. A láblécből kivesszük.
    var stale = $('back');
    while (stale) { stale.parentNode.removeChild(stale); stale = $('back'); }
    var bars = app.querySelectorAll('.nav');
    for (var b = 0; b < bars.length; b++) { if (!bars[b].children.length) bars[b].parentNode.removeChild(bars[b]); }
    var title = app.querySelector('h1');
    if (title && state.idx > 0 && !state.sent) {
      var row = document.createElement('div');
      row.className = 'backrow';
      row.innerHTML = '<button type="button" class="btn secondary small" id="back">← Vissza</button>';
      title.parentNode.insertBefore(row, title.nextSibling);
    }
    if (title) { title.setAttribute('tabindex', '-1'); try { title.focus({ preventScroll: true }); } catch (e) { /* régi böngésző */ } }
    window.scrollTo(0, 0);
    on('back', goBack);
    save();
  }
  function top() {
    return '<div class="top"><span class="brand">Eszköz-ellenőrzés</span>' +
      (DEMO ? '<span class="demo">Próbaüzem: semmi nem megy el</span>' : '') + '</div>';
  }
  function progress(n) {
    return '<div class="progress"><span style="width:' + (n * 20) + '%"></span></div>' +
      '<p class="step-label">' + n + '. lépés az 5-ből</p>';
  }
  function choice(id, title, sub, selected) {
    return '<button type="button" class="choice' + (selected ? ' on' : '') + '" id="' + id + '"><b>' + title + '</b><span>' + sub + '</span></button>';
  }
  // Lábléc: Vissza (ha van hova) és opcionálisan a Tovább gomb.
  function foot(nextId, nextLabel) {
    return '<div class="nav">' + (state.idx > 0 ? '<button type="button" class="btn secondary" id="back">Vissza</button>' : '') +
      (nextId ? '<button type="button" class="btn" id="' + nextId + '">' + nextLabel + '</button>' : '') + '</div>';
  }
  function textField(id, label, value, placeholder, help, max, extra) {
    return '<label class="field">' + label + '<input type="text" id="' + id + '" value="' + esc(value) + '" placeholder="' + esc(placeholder) +
      '" maxlength="' + max + '" autocomplete="off" spellcheck="false"' + (extra || '') + '><small>' + help + '</small></label>';
  }
  function bindInput(id, key) {
    var node = $(id);
    if (node) node.addEventListener('input', function () { state.vals[key] = this.value; });
  }
  // Az üzenetet a képernyőre görgeti, ha az a látható rész alatt vagy felett jelent meg. Enélkül egy hosszú oldalon "nem történik semmi".
  function message(id, html) {
    var node = $(id);
    if (!node) return;
    node.innerHTML = html;
    if (!html || !node.scrollIntoView) return;
    var box = node.getBoundingClientRect();
    if (box.bottom > window.innerHeight || box.top < 0) node.scrollIntoView(false);
  }
  function copyText(text, done) {
    function fallback() {
      var area = document.createElement('textarea');
      area.value = text; area.setAttribute('readonly', '');
      area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      try { area.setSelectionRange(0, text.length); } catch (e) { /* nem baj */ }
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      document.body.removeChild(area);
      done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else { fallback(); }
  }

// ===== src/web/seller/20-navigation.js =====
  /* ---------- lépéskezelés ---------- */

  // Minden tényleges navigáció növeli. A Vissza tartalék időzítője ebből tudja, hogy közben történt-e más lépés.
  var navCount = 0;

  function render() {
    if (state.sent) state.step = 'done';
    var screen = SCREENS[state.step] || SCREENS.welcome;
    screen();
  }
  function go(name) {
    navCount++;
    state.path = state.path.slice(0, state.idx + 1);
    state.path.push(name);
    state.idx = state.path.length - 1;
    state.step = name;
    try { history.pushState({ idx: state.idx }, ''); } catch (e) { /* nem baj, a gomb enélkül is visszalép */ }
    render();
  }
  function replace(name) {
    navCount++;
    state.path[state.idx] = name;
    state.step = name;
    try { history.replaceState({ idx: state.idx }, ''); } catch (e) { /* nem baj */ }
    render();
  }
  function goBack() {
    if (state.idx <= 0) return;
    var before = state.idx, mark = navCount;
    try { history.back(); } catch (e) { /* lent a tartalék */ }
    // Ha a böngésző nem jelezte a visszalépést, mi lépünk vissza. Ha közben már más navigáció történt (például gyorsan
    // továbbléptek ugyanarra a lépésszámra), a tartalék nem lép vissza még egyszer.
    setTimeout(function () {
      if (navCount === mark && state.idx === before) {
        navCount++;
        state.idx = before - 1;
        state.step = state.path[state.idx];
        render();
      }
    }, 250);
  }
  function onPop(event) {
    var idx = event.state && typeof event.state.idx === 'number' ? event.state.idx : null;
    if (idx === null || idx < 0 || idx >= state.path.length) return;
    navCount++;
    state.idx = idx;
    state.step = state.path[idx];
    render();
  }

// ===== src/web/seller/30-os-steps.js =====
  /* ---------- rendszerverzió szerinti lépések ---------- */

  // Az iOS 9 menünevei egy valódi, magyar nyelvű iPad mini fényképeiről vannak leolvasva. A többi rendszeré az Apple magyar
  // oldalairól és magyar útmutatókból származik, valódi eszközön még ellenőrizendő.
  var OS_LABELS = { legacy: 'iOS 9 vagy 10', mid: 'iOS 11 vagy 12', modern: 'iPadOS 13 vagy 14', latest: 'iPadOS 15 vagy újabb' };
  var OS_ORDER = ['legacy', 'mid', 'modern', 'latest'];
  var OS_STEPS = {
    legacy: {
      paste: true, batteryScreen: false,
      path: '<b>Beállítások &gt; Adatvédelem</b>, majd a lista legalján a <b>Diagn. és használat</b> sor',
      list: 'Koppints a <b>Diag. és használati adatok</b> sorra. A lista betűrendben van, keresd a <b>log-aggregated-...</b> kezdetű bejegyzést (az l betűnél), és válaszd a legfrissebb dátumút.',
      model: 'Beállítások &gt; Általános &gt; Névjegy &gt; Modell. Itt egy kódot látsz (például MD328HC/A), azt is beírhatod.',
      version: 'Beállítások &gt; Általános &gt; Névjegy &gt; Verzió.',
      signout: 'Beállítások &gt; iCloud, legalul Kijelentkezés (Sign Out). iOS 10.3 vagy újabb rendszeren legfelül a neved, lent Kijelentkezés.'
    },
    mid: {
      paste: true, batteryScreen: true,
      path: '<b>Beállítások &gt; Adatvédelem &gt; Elemzés</b> (Analytics)',
      list: 'Koppints az <b>Elemzési adatok</b> (Analytics Data) pontra, és keresd meg a legfrissebb <b>log-aggregated-...</b> nevű bejegyzést.',
      model: 'Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév vagy Modell.',
      version: 'Beállítások &gt; Általános &gt; Névjegy &gt; Verzió.',
      signout: 'Beállítások, legfelül a neved, lent Kijelentkezés.'
    },
    modern: {
      paste: false, batteryScreen: true,
      path: '<b>Beállítások &gt; Adatvédelem &gt; Elemzések és fejlesztések</b>',
      list: 'Koppints az <b>Elemzési adatok</b> pontra, és keresd meg a legfrissebb <b>Analytics-...</b> kezdetű fájlt.',
      model: 'Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév.',
      version: 'Beállítások &gt; Általános &gt; Névjegy &gt; Szoftververzió.',
      signout: 'Beállítások, legfelül a neved, lent Kijelentkezés.'
    },
    latest: {
      paste: false, batteryScreen: true,
      path: '<b>Beállítások &gt; Adatvédelem és biztonság &gt; Elemzések és fejlesztések</b>',
      list: 'Koppints az <b>Elemzési adatok</b> pontra, és keresd meg a legfrissebb <b>Analytics-...</b> kezdetű fájlt.',
      model: 'Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév.',
      version: 'Beállítások &gt; Általános &gt; Névjegy &gt; Szoftververzió.',
      signout: 'Beállítások, legfelül a neved, lent Kijelentkezés.'
    }
  };

  function familyOf(major) {
    if (major <= 10) return 'legacy';
    if (major <= 12) return 'mid';
    if (major <= 14) return 'modern';
    return 'latest';
  }
  function current() { return OS_STEPS[state.osFamily] || OS_STEPS.latest; }
  // Az akku-ág első képernyője az USB-s kérdés után: Beállítások (ha az adott rendszer mutatja), különben a napló.
  function afterUsb() { return current().batteryScreen ? 'screen_ask' : 'log_ask'; }

  function osSelect() {
    var options = '';
    for (var i = 0; i < OS_ORDER.length; i++) {
      options += '<option value="' + OS_ORDER[i] + '"' + (state.osFamily === OS_ORDER[i] ? ' selected' : '') + '>' + OS_LABELS[OS_ORDER[i]] + '</option>';
    }
    var note = state.detectedOs
      ? 'Automatikusan felismertük: ' + esc(state.detectedOs) + '. Ha nem ez a helyes, válaszd ki a megfelelőt.'
      : 'Nem sikerült automatikusan felismerni. Válaszd ki a rendszerverziót (Beállítások &gt; Általános &gt; Névjegy).';
    return '<div class="card"><label class="field">Rendszerverzió<select id="osfam">' + options + '</select><small>' + note + '</small></label></div>';
  }
  function bindOsSelect() {
    var select = $('osfam');
    if (!select) return;
    select.addEventListener('change', function () {
      state.osFamily = this.value;
      if (state.step === 'screen_ask' && !current().batteryScreen) replace('log_ask'); else render();
    });
  }

// ===== src/web/seller/40-persistence-and-collect.js =====
  /* ---------- állapotmentés: egy régi iPad a Beállításokból visszatérve gyakran újratölti a lapot ---------- */

  var STORE_KEY = 'ipad-audit-seller-v2';
  function save() {
    if (state.sent) return;
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ demo: DEMO, code: CODE, state: state })); } catch (e) { /* privát mód: enélkül is működik */ }
  }
  function forget() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* nem baj */ }
  }
  function restore() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
      if (!saved || !saved.state || !SCREENS[saved.state.step] || saved.state.step === 'welcome') return false;
      if (!Array.isArray(saved.state.path) || typeof saved.state.idx !== 'number') return false;
      if (CODE && saved.code && CODE !== saved.code) return false;
      DEMO = !!saved.demo; CODE = saved.code || '';
      for (var key in saved.state) { if (Object.prototype.hasOwnProperty.call(saved.state, key)) state[key] = saved.state[key]; }
      state.sending = false; state.sent = false;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- az elküldendő adatok egyetlen helyen ---------- */

  function collect() {
    var v = state.vals, p = state.parsed, e = state.extra;
    var origin = state.route === 'file' ? (current().paste ? 'naplóból' : 'fájlból')
      : (state.route === 'command' ? 'parancsból' : (state.route === 'usb' ? 'USB-ből' : 'beírta'));
    function src(key) {
      if (v[key] === '' || v[key] === null) return '';
      return p[key] !== undefined && String(p[key]) === String(v[key]) ? origin : 'beírta';
    }
    var serial = P.normalizeSerial(v.serial);
    return {
      kind: state.kind, hw: state.hw,
      model: clean(v.model, 60), modelId: e.modelId, chip: clean(v.chip, 60), memory: clean(v.memory, 20),
      storage: clean(v.storage, 20), os: clean(v.os, 60),
      fingerprint: P.fingerprint(CODE || 'DEMO00000000', serial),
      serialTail: serial ? serial.slice(-4) : '',
      serialRaw: state.shareSerial && serial ? serial : '',
      cycles: toInt(v.cycles, 0, 5000), capacity: toInt(v.capacity, 40, 100), batteryDefer: !!state.noLog,
      condition: e.condition, fileDate: e.fileDate,
      apple: state.apple, activationLock: e.activationLock, dep: e.dep, mdm: e.mdm,
      sources: {
        model: src('model'), chip: src('chip'), memory: src('memory'), storage: src('storage'),
        os: (v.os && v.os === state.detectedOs) ? 'böngészőből' : src('os'),
        serial: src('serial'), cycles: src('cycles'), capacity: src('capacity'),
        condition: e.condition ? 'parancsból' : '', activationLock: e.activationLock ? (state.route === 'usb' ? 'USB-ből' : 'parancsból') : '',
        mdm: (e.dep !== null || e.mdm !== null) ? 'parancsból' : ''
      }
    };
  }

// ===== src/web/seller/50-results.js =====
  /* ---------- eredmények: ugyanaz a Tovább és javítás gomb minden beolvasás után ---------- */

  function resultActions() {
    return '<button type="button" class="btn" id="res-next">Tovább</button>' +
      '<p><button type="button" class="link" id="res-edit">Az értékek javítása</button></p>';
  }
  function bindResult(editStep) {
    on('res-next', function () { go('details'); });
    on('res-edit', function () { go(editStep); });
  }

  function applyUsbText(text) {
    var r = P.parseUsbOutput(String(text));
    if (!r.valid) {
      message('result', '<div class="error">Ebben a szövegben nem találtuk a program kimenetét. Ellenőrizd, hogy az <b>IPAD-AUDIT-USB</b> sortól az <b>END</b> sorig mindent bemásoltál-e, vagy futtasd újra a programot.</div>');
      return;
    }
    state.parsed = {};
    state.noLog = false;
    state.route = 'usb';
    function put(key, value) {
      if (value === '' || value === null || value === undefined) return;
      state.parsed[key] = String(value); state.vals[key] = String(value);
    }
    put('cycles', r.cycles); put('capacity', r.capacity); put('os', r.os); put('serial', r.serial);
    put('storage', r.storage); put('model', r.modelName || r.model);
    state.extra.activationLock = r.activationLock;
    state.extra.modelId = r.modelName ? r.model : '';
    save();
    var lock = r.activationLock === 'Enabled' ? 'bekapcsolva' : (r.activationLock === 'Disabled' ? 'kikapcsolva' : 'nem olvasható ki');
    message('result', '<div class="result"><dl>' +
      '<dt>Modell</dt><dd>' + esc(r.modelName ? r.modelName + ' (' + r.model + ')' : (r.model || 'nem található')) + '</dd>' +
      '<dt>Rendszer</dt><dd>' + esc(r.os || 'nem található') + '</dd>' +
      '<dt>Ciklusszám</dt><dd>' + esc(r.cycles === null ? 'nem található' : r.cycles) + '</dd>' +
      '<dt>Maximális kapacitás</dt><dd>' + esc(r.capacity === null ? 'nem található' : r.capacity + '%') + '</dd>' +
      '<dt>Aktiválási zár</dt><dd>' + esc(lock) + '</dd>' +
      '</dl></div><div class="success">Kész. A szöveget töröltük a mezőből.</div>' + resultActions());
    bindResult('screen_enter');
  }

  function applyIpadText(text) {
    var r = P.parseIpadFile(String(text));
    var what = current().paste ? 'szöveg' : 'fájl';
    state.parsed = {};
    state.noLog = false;
    state.route = 'file';
    if (r.cycles !== null) { state.parsed.cycles = String(r.cycles); state.vals.cycles = String(r.cycles); }
    if (r.capacity !== null) { state.parsed.capacity = String(r.capacity); state.vals.capacity = String(r.capacity); }
    if (r.os) { state.parsed.os = r.os; state.vals.os = r.os; }
    state.extra.fileDate = r.fileDate;
    save();
    if (r.cycles === null && r.capacity === null) {
      message('result', '<div class="error">Ebben a ' + what + 'ben nem találtunk akkumulátor adatot. Próbáld a következő legfrissebb bejegyzést.</div>' +
        '<p><button type="button" class="link" id="res-none">Nincs több ilyen bejegyzés</button></p>');
      on('res-none', function () { go('nolog'); });
      return;
    }
    message('result', '<div class="result"><dl>' +
      '<dt>Ciklusszám</dt><dd>' + esc(r.cycles === null ? 'nem található' : r.cycles) + '</dd>' +
      '<dt>Maximális kapacitás</dt><dd>' + esc(r.capacity === null ? 'nem található' : r.capacity + '%') + '</dd>' +
      (r.fileDate ? '<dt>A ' + what + ' kelte</dt><dd>' + esc(r.fileDate) + '</dd>' : '') +
      '</dl></div><div class="success">Kész. A ' + what + ' nem hagyta el az eszközt.</div>' + resultActions());
    bindResult('screen_enter');
  }

  function onFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > MAX_FILE) { message('result', '<div class="error">A fájl túl nagy. Válassz másikat.</div>'); return; }
    message('result', '<p class="muted">Olvasás...</p>');
    var reader = new FileReader();
    reader.onload = function () { applyIpadText(reader.result); };
    reader.onerror = function () { message('result', '<div class="error">A fájl nem olvasható. Válassz másikat.</div>'); };
    reader.readAsText(file);
  }

  function parseMac() {
    var r = P.parseMacOutput($('paste') ? $('paste').value : '');
    if (!r.valid) {
      message('result', '<div class="error">Ebben a szövegben nem találtuk a parancs kimenetét. Ellenőrizd, hogy a teljes Terminál-szöveget másoltad ki, vagy futtasd újra a parancsot.</div>');
      return;
    }
    state.parsed = {};
    state.noLog = false;
    state.route = 'command';
    function put(key, val) {
      if (val === '' || val === null || val === undefined) return;
      state.parsed[key] = String(val); state.vals[key] = String(val);
    }
    put('model', r.model); put('chip', r.chip); put('memory', r.memory); put('storage', r.storage); put('os', r.os);
    put('serial', r.serial); put('cycles', r.cycles); put('capacity', r.capacity);
    state.extra = { condition: r.condition, fileDate: '', activationLock: r.activationLock, dep: r.dep, mdm: r.mdm, modelId: r.modelId };
    $('paste').value = '';
    function line(label, val) { return '<dt>' + label + '</dt><dd>' + esc(val === '' || val === null ? 'nem található' : val) + '</dd>'; }
    var lock = r.activationLock === 'Enabled' ? 'bekapcsolva' : (r.activationLock === 'Disabled' ? 'kikapcsolva' : '');
    var mdm = r.dep === null && r.mdm === null ? '' : ((r.dep || r.mdm) ? 'van' : 'nincs');
    save();
    message('result', '<div class="result"><dl>' +
      line('Modell', r.model ? r.model + (r.modelId ? ' (' + r.modelId + ')' : '') : '') + line('Chip', r.chip) + line('Memória', r.memory) +
      line('Tárhely', r.storage) + line('macOS', r.os) + line('Ciklusszám', r.cycles) +
      line('Maximális kapacitás', r.capacity === null ? '' : r.capacity + '%') + line('Akku állapota', r.condition) +
      line('Aktiválási zár', lock) + line('Céges felügyelet', mdm) + line('Sorozatszám', r.serial) +
      '</dl></div><div class="success">Kész. A beillesztett szöveget töröltük a mezőből, csak a fenti értékeket használjuk.</div>' + resultActions());
    bindResult('mac_manual');
  }

// ===== src/web/seller/60-welcome-and-kind.js =====
  /* ---------- képernyők ---------- */

  // A riport szakaszainak táblázata. Az előnézet és a nyitóoldali példa is ezt használja, ezért a kettő nem térhet el.
  function sectionsHtml(sections) {
    var html = '';
    for (var s = 0; s < sections.length; s++) {
      html += '<h2>' + esc(sections[s].title) + '</h2><div class="tablewrap"><table><thead><tr><th>Adat</th><th>Érték</th><th>Forrás</th></tr></thead><tbody>';
      for (var r = 0; r < sections[s].rows.length; r++) {
        var row = sections[s].rows[r];
        html += '<tr><td>' + esc(row.label) + '</td><td>' + esc(row.value) + '</td><td>' + esc(row.tag) + '</td></tr>';
      }
      html += '</tbody></table></div>';
    }
    return html;
  }

  function begin() {
    var typed = $('code') ? $('code').value : '';
    var text = String(typed).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (text === 'DEMO') { DEMO = true; CODE = ''; go('kind'); return; }
    if (!CODE_PATTERN.test(text)) {
      message('msg', '<div class="error">A meghívókód 9 számjegyből áll. Ellenőrizd, hogy pontosan úgy írtad-e be, ahogy kaptad.</div>');
      return;
    }
    DEMO = false; CODE = text;
    go('kind');
  }

  SCREENS.welcome = function () {
    var example = window.SellerExample
      ? '<details class="example"><summary>Példa: ilyen riportot kapsz a végén (kitalált adatokkal)</summary>' +
        '<p class="muted">Ez egy kitalált példa. A te riportod az előnézetben pontosan így fog kinézni, a te adataiddal, és csak a Küldés gomb után megy el.</p>' +
        sectionsHtml(P.buildSections(window.SellerExample.data)) + '</details>'
      : '';
    show(top() +
      '<h1>Az eszközöd állapotának ellenőrzése</h1>' + (DEMO ? demoPanel() : '') +
      '<p class="lead">A vásárló szeretné látni az akkumulátor és az alapadatok állapotát, mielőtt megveszi az eszközt. Ez az oldal lépésről lépésre végigvezet rajta. Kb. 10 percet vesz igénybe, és nem kell semmit telepítened.</p>' +
      '<h2>Miért kérjük ezt?</h2>' +
      '<p>Egy használt eszköznél az akkumulátor kopását kívülről nem lehet megítélni. Ha mindketten ugyanazokat a számokat látjuk, az átvételnél nem lesz félreértés, és ez neked is megkönnyíti az eladást.</p>' +
      '<h2>Mit olvasunk ki, és mit nem?</h2>' +
      '<div class="grid2">' +
        '<div class="card"><h3>Ezt kérjük</h3><ul class="marks yes">' +
          '<li>az akkumulátor ciklusszáma és maximális kapacitása</li>' +
          '<li>az eszköz típusa, tárhelye és rendszerverziója</li>' +
          '<li>hogy ki van-e jelentkezve az Apple-fiókodból</li>' +
          '<li>a sorozatszám, hogy a vásárló az Apple-nél ellenőrizhesse a modellt (kikapcsolhatod)</li>' +
        '</ul></div>' +
        '<div class="card"><h3>Ezt soha nem kérjük</h3><ul class="marks no">' +
          '<li>jelszavak, Apple-fiók, e-mail cím, telefonszám</li>' +
          '<li>fotók, üzenetek, névjegyek, fájlok</li>' +
          '<li>telepített alkalmazások, böngészési adatok</li>' +
          '<li>IMEI, eszköznév, helyadat, Wi-Fi hálózatok</li>' +
        '</ul></div>' +
      '</div>' +
      example +
      '<h2>Hogyan védjük az adataidat?</h2>' +
      '<ul class="plain">' +
        '<li><b>Te döntesz.</b> Minden adatot előbb te látsz, és csak akkor megy el bármi, ha a végén te nyomod meg a Küldés gombot.</li>' +
        '<li><b>Nem módosítunk semmit.</b> Az oldal nem telepít programot, és nem változtat az eszközödön.</li>' +
        '<li><b>Egyetlen címzett.</b> Az adatok egy emailben mennek el a vásárlónak. Az oldal nem tárol belőlük másolatot.</li>' +
        '<li><b>Nyílt forráskód.</b> Az oldal teljes kódja nyilvános, bárki ellenőrizheti, mit csinál: <a href="https://gitlab.com/krisz0722/ipad-audit/-/tree/main/web" target="_blank" rel="noopener">forráskód megtekintése</a>.</li>' +
        '<li><b>Bármikor kiléphetsz.</b> Ha meggondolod magad, zárd be az oldalt. Addig nem történik semmi.</li>' +
      '</ul>' +
      '<div class="note"><b>Fontos:</b> az oldalt megnyithatod az eladandó eszközön (a Beállításokból adod meg az adatokat), vagy egy számítógépen (iPad és iPhone esetén USB-kábellel olvassuk ki). Macnél azon a Macen nyisd meg, amelyet eladsz.</div>' +
      '<h2>Meghívókód</h2>' +
      '<p>Írd be a vásárlótól kapott 9 számjegyű kódot. A szóköz és a kötőjel nem számít.</p>' +
      '<label class="field">Meghívókód<input type="text" id="code" value="' + esc(DEMO ? 'DEMO' : CODE) + '" placeholder="Például: 123 456 789" maxlength="24" inputmode="numeric" autocomplete="off" spellcheck="false"></label>' +
      '<div id="msg"></div>' +
      '<button type="button" class="btn" id="start">Rendben, kezdjük</button>');
    on('start', begin);
    var demoButtons = app.querySelectorAll('[data-demo]');
    for (var d = 0; d < demoButtons.length; d++) {
      demoButtons[d].addEventListener('click', function () { jumpDemo(this.getAttribute('data-demo')); });
    }
    $('code').addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.keyCode === 13) begin(); });
    $('code').addEventListener('input', function () {
      var digits = this.value.replace(/\D/g, '');
      if (digits.length === this.value.replace(/[\s-]/g, '').length) this.value = digits.replace(/(\d{3})(?=\d)/g, '$1 ');
    });
  };

  function pickKind(kind) {
    if (state.kind !== kind) { state.route = ''; state.parsed = {}; state.hw = {}; state.hwSkipped = false; }
    state.kind = kind;
    if (kind === 'mac') { go('mac_run'); return; }
    if (ON_COMPUTER) { go('usb_get'); return; }
    go(afterUsb());
  }

  SCREENS.kind = function () {
    show(top() + progress(1) +
      '<h1>Milyen eszközt adsz el?</h1>' +
      '<p>Ettől függ, hogyan olvassuk ki az akkumulátor adatait.</p>' +
      choice('k-ios', 'iPad vagy iPhone', 'Az adatokat a Beállításokból olvassuk ki. Nem kell semmit telepítened.', state.kind === 'ios') +
      choice('k-mac', 'Mac', 'MacBook, iMac vagy Mac mini. Egy rövid, csak olvasó parancsot futtatsz a Terminálban.', state.kind === 'mac') +
      foot());
    on('k-ios', function () { pickKind('ios'); });
    on('k-mac', function () { pickKind('mac'); });
  };

// ===== src/web/seller/70-usb.js =====
  /* ---- akku, iPad és iPhone: USB ---- */

  function macDownloadCommand() {
    var base = TOOL_BASE;
    return 'cd ~/Downloads && curl -fsSL -o ipad-audit-reader.tar.gz "' + base + 'ipad-audit-reader-macos-$(uname -m).tar.gz" && tar -xzf ipad-audit-reader.tar.gz && ./ipad-audit-reader';
  }

  SCREENS.usb_get = function () {
    var os = computerOs();
    var groups = os && TOOL_FILES[os] ? [os] : ['windows', 'mac', 'linux'];
    var base = TOOL_BASE;
    var buttons = '';
    for (var g = 0; g < groups.length; g++) {
      var files = TOOL_FILES[groups[g]];
      for (var i = 0; i < files.length; i++) {
        buttons += '<p><a class="btn" href="' + esc(base + files[i][0]) + '" download>' + esc(files[i][1]) + '</a></p>';
      }
    }
    var notes = '';
    if (os === 'windows' || !os) {
      notes += '<div class="note"><b>Windows:</b> az Apple USB-illesztőprogramja is kell hozzá (iTunes vagy Apple Devices alkalmazás). Ha a Windows figyelmeztet ("A Windows megvédte a számítógépet"), kattints a <b>További információ</b>, majd a <b>Futtatás mindenképpen</b> gombra. A program nyílt forráskódú, a letöltés mellett ott az ellenőrző összege.</div>';
    }
    if (os === 'mac' || !os) {
      notes += '<div class="note"><b>Mac:</b> a böngészővel letöltött programot a macOS blokkolhatja. Ilyenkor a Terminálból töltsd le, ott nincs blokk.' +
        '<pre class="code" id="mac-cmd">' + esc(macDownloadCommand()) + '</pre>' +
        '<button type="button" class="btn small" id="copy-mac">Parancs másolása</button><span class="muted" id="copied-mac"></span></div>';
    }
    var trust = '<div class="note"><b>Miért megbízható ez a program?</b><ul class="marks yes">' +
      '<li><b>Nyílt forráskód.</b> A program teljes kódja nyilvános, bárki elolvashatja: ' +
        '<a href="https://github.com/krisz0722/ipad-audit/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">a GitHubon</a> és ' +
        '<a href="https://gitlab.com/krisz0722/ipad-audit/-/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">a GitLabon</a>.</li>' +
      '<li><b>Csak olvas.</b> Semmit nem módosít az eszközön.</li>' +
      '<li><b>Nem küld el semmit.</b> A program saját kódjában nincs internetes kapcsolat, ezt egy automatikus teszt őrzi. Az eredményt te másolod be ide, és az előnézetben látod, mi megy tovább.</li>' +
      '<li><b>Ellenőrizhető letöltés.</b> A fájlt a GitHub építi a nyilvános kódból (<a href="https://github.com/krisz0722/ipad-audit/actions" target="_blank" rel="noopener">a build naplója</a>), ' +
        'a <a href="https://github.com/krisz0722/ipad-audit/releases/latest" target="_blank" rel="noopener">kiadás oldalán</a> minden fájl mellett ott az ellenőrző összeg (.sha256).</li>' +
      '</ul></div>';
    show(top() + progress(2) +
      '<h1>A kiolvasó program letöltése</h1>' + trust +
      '<p class="lead">Töltsd le a számítógépedre a megfelelő fájlt:</p>' + buttons + notes +
      foot('u-next', 'Letöltöttem, tovább'));
    on('u-next', function () { go('usb_run'); });
    on('copy-mac', function () {
      copyText(macDownloadCommand(), function (ok) {
        message('copied-mac', ok ? ' Kimásolva.' : ' Nem sikerült. Jelöld ki a parancsot, és másold ki kézzel.');
      });
    });
  };

  SCREENS.usb_run = function () {
    var os = computerOs();
    var runStep = os === 'windows'
      ? 'Kattints duplán a letöltött fájlra (a mappás változatnál előbb csomagold ki, és az <b>ipad-audit-reader.exe</b> fájlt indítsd).'
      : (os === 'mac'
        ? 'Ha a Terminál-parancsot használtad, a program már fut. Különben nyisd meg a Terminált, és indítsd a letöltött programot.'
        : 'Csomagold ki a letöltött fájlt, és indítsd el a programot egy terminálból.');
    show(top() + progress(2) +
      '<h1>Csatlakoztatás és futtatás</h1>' +
      '<ol class="steps">' +
        '<li>Kösd az eszközt USB-kábellel a számítógéphez, oldd fel, és ha megkérdezi, koppints a <b>Megbízom</b> gombra.</li>' +
        '<li>' + runStep + '</li>' +
        '<li>Pár másodperc múlva a program kiírja a szöveget (az <b>IPAD-AUDIT-USB</b> sortól az <b>END</b> sorig), és <b>a vágólapra másolja</b>. Windowson az ablak bezárásához nyomj Entert.</li>' +
      '</ol>' +
      '<div class="note">Ha a vágólapra másolás nem sikerült, a program ezt kiírja. Ilyenkor jelöld ki a szöveget, és másold ki.</div>' +
      foot('u-next', 'Kész, tovább'));
    on('u-next', function () { go('usb_paste'); });
  };

  SCREENS.usb_switch = function () {
    show(top() + progress(2) +
      '<h1>Nyisd meg az oldalt a számítógépeden</h1>' +
      '<p class="lead">Az USB-s kiolvasáshoz a számítógépen kell dolgoznod, ahová az eszközt rákötöd. Nyisd meg ott ezt a címet (küldd el magadnak például emailben):</p>' +
      '<pre class="code" id="addr">' + esc(pageAddress()) + '</pre>' +
      '<button type="button" class="btn small" id="copy-addr">Cím másolása</button><span class="muted" id="copied-addr"></span>' +
      '<div class="note">A meghívókód a címben benne van, ott nem kell újra beírnod. A számítógépen az elejétől kezdd. Az eszközön eddig megcsinált böngészős tesztek eredménye nem megy át oda. A riport a számítógépről megy el, az USB-ből kiolvasott adatokkal, a böngészős tesztek abban "nem tesztelt" jelzést kapnak. Itt az eszközön nem kell mást tenned.</div>' +
      foot());
    on('copy-addr', function () {
      copyText(pageAddress(), function (ok) {
        message('copied-addr', ok ? ' Kimásolva.' : ' Nem sikerült. Jelöld ki a címet, és másold ki kézzel.');
      });
    });
  };

  SCREENS.usb_paste = function () {
    show(top() + progress(2) +
      '<h1>A kimenet beillesztése</h1>' +
      '<p>Illeszd be a program kimenetét, és koppints a Beolvasás gombra:</p>' +
      '<label class="field"><textarea id="usb-paste" placeholder="Ide illeszd be a program kimenetét" spellcheck="false"></textarea></label>' +
      '<button type="button" class="btn small" id="parse-usb">Beolvasás</button>' +
      '<div class="note">A beillesztett szöveget a beolvasás után töröljük a mezőből. Csak a modellt, a rendszerverziót, a tárhelyet, a sorozatszámot, az akkumulátor adatait és az Aktiválási zár állapotát vesszük ki belőle.</div>' +
      '<div id="result"></div>' + foot());
    on('parse-usb', function () {
      var area = $('usb-paste');
      applyUsbText(area ? area.value : '');
      if (area) area.value = '';
    });
  };

// ===== src/web/seller/72-ios-battery.js =====
  /* ---- akku, iPad és iPhone: Beállítások ---- */

  SCREENS.screen_ask = function () {
    if (!current().batteryScreen) { replace('log_ask'); return; }
    show(top() + progress(2) +
      '<h1>Látod az akku állapotát a Beállításokban?</h1>' +
      '<p class="lead">Nyisd meg: <b>Beállítások &gt; Akkumulátor &gt; Akkumulátor állapota</b>. Nem minden iPad és iPhone mutatja ezt.</p>' +
      osSelect() +
      choice('s-yes', 'Igen, látom a számokat', 'Beírod a két értéket.', false) +
      choice('s-no', 'Nem, ilyen képernyőt nem látok', 'Akkor a rendszernaplóból próbáljuk, végigvezetünk rajta.', false) +
      foot());
    bindOsSelect();
    on('s-yes', function () { go('screen_enter'); });
    on('s-no', function () { go('log_ask'); });
  };

  function batteryFields() {
    return '<div class="card">' +
      '<label class="field">Maximális kapacitás (%)<input type="number" id="capacity" inputmode="numeric" min="40" max="100" value="' + esc(state.vals.capacity) + '"><small>Például: 87</small></label>' +
      '<label class="field">Ciklusszám<input type="number" id="cycles" inputmode="numeric" min="0" max="5000" value="' + esc(state.vals.cycles) + '"><small>Ha nem látod, hagyd üresen.</small></label>' +
      '</div><div id="msg"></div>';
  }
  function batteryNext() {
    var cap = state.vals.capacity.trim(), cyc = state.vals.cycles.trim();
    if (cap && toInt(cap, 40, 100) === null) { message('msg', '<div class="error">A kapacitás 40 és 100 közötti szám legyen.</div>'); return; }
    if (cyc && toInt(cyc, 0, 5000) === null) { message('msg', '<div class="error">A ciklusszám 0 és 5000 közötti egész szám legyen.</div>'); return; }
    go('details');
  }
  function clearBattery() {
    state.vals.cycles = ''; state.vals.capacity = '';
    state.parsed = {}; state.extra.fileDate = '';
  }

  SCREENS.screen_enter = function () {
    show(top() + progress(2) +
      '<h1>Írd be a két számot</h1>' +
      '<p class="lead">A <b>maximális kapacitás</b> százalékban, a <b>ciklusszám</b> egész szám. Ha az egyiket nem látod, hagyd üresen.</p>' +
      batteryFields() + foot('next', 'Tovább') +
      '<p><button type="button" class="link" id="skip">Ezt most kihagyom</button></p>');
    bindInput('capacity', 'capacity'); bindInput('cycles', 'cycles');
    on('next', batteryNext);
    on('skip', function () { clearBattery(); go('details'); });
  };

  /* ---- akku, iPad és iPhone: napló vagy fájl ---- */

  SCREENS.log_ask = function () {
    var s = current();
    show(top() + progress(2) +
      '<h1>Keresd meg a rendszernaplót</h1>' +
      '<p class="lead">' + (s.batteryScreen ? '' : 'Ezen a rendszerverzión a Beállítások nem mutatja az akkumulátor állapotát. ') +
        'Az eszköz a ciklusszámot egy ' + (s.paste ? 'diagnosztikai naplóban' : 'analitikai fájlban') + ' tárolja. Csak akkor folytasd, ha az eszközön már van ilyen bejegyzés. Ha nincs, <b>ne kapcsolj be semmit</b>.</p>' +
      osSelect() +
      '<ol class="steps">' +
        '<li>Nyisd meg: ' + s.path + '.</li>' +
        '<li>' + s.list + '</li>' +
      '</ol>' +
      choice('l-found', 'Megtaláltam a bejegyzést', s.paste ? 'Kimásolod a szövegét, és bemásolod ide.' : 'Elmented a Fájlokba, és kiválasztod itt.', false) +
      choice('l-none', 'Nincs ilyen bejegyzés', 'Semmit nem kell bekapcsolnod, megmutatjuk, mi a teendő.', false) +
      foot());
    bindOsSelect();
    on('l-found', function () { go(current().paste ? 'log_paste' : 'log_file'); });
    on('l-none', function () { go('nolog'); });
  };

  SCREENS.log_paste = function () {
    show(top() + progress(2) +
      '<h1>A napló kimásolása</h1>' +
      '<ol class="steps">' +
        '<li>Nyisd meg a legfrissebb bejegyzést, érintsd meg hosszan a szöveget, válaszd a <b>Mindet kijelöl</b> (Select All), majd a <b>Másolás</b> (Copy) lehetőséget.</li>' +
        '<li>Térj vissza ide, érintsd meg hosszan az alábbi mezőt, válaszd a <b>Beillesztés</b> (Paste) lehetőséget, majd koppints a Beolvasás gombra:' +
          '<label class="field"><textarea id="paste" placeholder="Ide illeszd be a napló szövegét" spellcheck="false"></textarea></label>' +
          '<button type="button" class="btn small" id="parse-log">Beolvasás</button></li>' +
      '</ol>' +
      '<div class="note">A beillesztett szöveget a beolvasás után töröljük a mezőből. Belőle kizárólag a ciklusszámot, a kapacitást, a rendszerverziót és a napló dátumát vesszük ki. Ha más adat is van benne (például alkalmazások nevei), azt nem olvassuk ki és nem küldjük el.</div>' +
      '<div id="result"></div>' + foot());
    on('parse-log', function () {
      var area = $('paste');
      applyIpadText(area ? area.value : '');
      if (area) area.value = '';
    });
  };

  SCREENS.log_file = function () {
    show(top() + progress(2) +
      '<h1>A fájl kiválasztása</h1>' +
      '<ol class="steps">' +
        '<li>Nyisd meg a legfrissebb bejegyzést, koppints a <b>Megosztás</b> gombra, majd a <b>Mentés a Fájlokba</b> pontra.</li>' +
        '<li>Térj vissza ide, és válaszd ki a mentett fájlt:<br><input type="file" id="file"></li>' +
      '</ol>' +
      '<div class="note">A fájlból kizárólag a ciklusszámot, a kapacitást, a rendszerverziót és a fájl dátumát vesszük ki. Ha más adat is van benne (például alkalmazások nevei), azt nem olvassuk ki és nem küldjük el.</div>' +
      '<div id="result"></div>' + foot());
    var file = $('file');
    if (file) file.addEventListener('change', onFile);
  };

  SCREENS.nolog = function () {
    show(top() + progress(2) +
      '<h1>Nincs baj, erre van megoldás</h1>' +
      '<p class="lead">Semmit nem kell bekapcsolnod az eszközön. Előbb végigmegyünk mindenen, amit az oldal a böngészőben meg tud nézni. A végén, ha az akkumulátor adata még hiányzik, felajánlunk egy kis programot, ami USB-kábelen át kiolvassa. Azt te döntöd el, hogy kéred-e.</p>' +
      choice('n-skip', 'Rendben, tovább', 'Az akkumulátor adata egyelőre hiányzik, ezt a végén pótolhatod.', false) +
      foot());
    on('n-skip', function () { clearBattery(); state.noLog = true; go('details'); });
  };

// ===== src/web/seller/74-mac.js =====
  /* ---- akku, Mac ---- */

  SCREENS.mac_run = function () {
    var parts = [
      ['<code>sw_vers -productVersion</code>', 'a macOS verziószáma'],
      ['<code>system_profiler -xml SPHardwareDataType</code> és <code>grep</code>', 'a Mac típusa, chipje, memóriája, sorozatszáma és az Aktiválási zár állapota. A gép nevét, az azonosítókat és a hálózati adatokat nem írja ki.'],
      ['<code>system_profiler -xml SPPowerDataType</code> és <code>grep</code>', 'az akkumulátor ciklusszáma, állapota és maximális kapacitása'],
      ['<code>profiles status -type enrollment</code> és <code>grep</code>', 'csak két igen/nem válasz arról, van-e céges vagy iskolai felügyelet. A szervezet nevét és a szerver címét nem írja ki.'],
      ['<code>df -k</code> és <code>tail</code>', 'a tárhely mérete']
    ];
    var rows = '';
    for (var i = 0; i < parts.length; i++) rows += '<tr><td>' + parts[i][0] + '</td><td>' + parts[i][1] + '</td></tr>';
    show(top() + progress(2) +
      '<h1>A Mac adatai</h1>' +
      '<p class="lead">A Mac az akkumulátor és a hardver adatait a Rendszerinformációban tárolja. Egy rövid parancs kiolvassa ezeket, a kimenetet pedig te másolod ide. Így pontosan látod, mi megy tovább.</p>' +
      '<div class="card"><h3>Mit csinál a parancs?</h3><ul class="marks yes">' +
        '<li>Csak olvas, semmit nem módosít és nem telepít.</li>' +
        '<li>Nem csatlakozik az internetre.</li>' +
        '<li>Nem kér jelszót. Ha bármi jelszót kér, állj meg, és ne add meg.</li>' +
        '<li>Csak a felsorolt adatokat írja ki.</li>' +
      '</ul></div>' +
      '<ol class="steps">' +
        '<li>Nyisd meg a <b>Terminált</b>: nyomd meg a <b>Cmd + Szóköz</b> billentyűt, írd be, hogy <b>Terminal</b>, majd nyomj Entert.</li>' +
        '<li>Másold ki az alábbi parancsot, illeszd be a Terminálba, és nyomj <b>Entert</b>. Pár másodpercig dolgozik.' +
          '<pre class="code" id="cmd">' + esc(MAC_COMMAND) + '</pre>' +
          '<button type="button" class="btn small" id="copy">Parancs másolása</button><span class="muted" id="copied"></span></li>' +
      '</ol>' +
      '<details><summary>Mit jelentenek a parancs részei?</summary><div class="tablewrap"><table><thead><tr><th>Rész</th><th>Mit olvas</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>' +
      '<p><button type="button" class="link" id="to-manual">Inkább nem futtatok parancsot</button></p>' +
      foot('m-next', 'Lefuttattam, tovább'));
    on('copy', function () {
      copyText(MAC_COMMAND, function (ok) {
        message('copied', ok ? ' Kimásolva.' : ' Nem sikerült. Jelöld ki a parancsot, és másold ki kézzel.');
      });
    });
    on('to-manual', function () { go('mac_manual'); });
    on('m-next', function () { go('mac_paste'); });
  };

  SCREENS.mac_paste = function () {
    show(top() + progress(2) +
      '<h1>A Terminál szövegének beillesztése</h1>' +
      '<ol class="steps">' +
        '<li>Jelöld ki a Terminál teljes szövegét (<b>Cmd + A</b>), és másold ki (<b>Cmd + C</b>).</li>' +
        '<li>Illeszd be ide, és koppints a Beolvasás gombra:' +
          '<label class="field"><textarea id="paste" placeholder="Ide illeszd be a Terminál szövegét" spellcheck="false"></textarea></label>' +
          '<button type="button" class="btn small" id="parse">Beolvasás</button></li>' +
      '</ol>' +
      '<div id="result"></div>' + foot());
    on('parse', parseMac);
  };

  SCREENS.mac_manual = function () {
    show(top() + progress(2) +
      '<h1>Az akkumulátor adatai kézzel</h1>' +
      '<p class="lead">Az akkumulátor adatait a Rendszerinformációban is megtalálod.</p>' +
      '<ol class="steps">' +
        '<li>Tartsd lenyomva az <b>Option</b> billentyűt, és kattints az Apple menüre, majd a <b>Rendszerinformáció</b> pontra.</li>' +
        '<li>A bal oldalon nyisd meg az <b>Áramellátás</b> pontot.</li>' +
        '<li>Írd be a <b>ciklusszámot</b> és a <b>maximális kapacitást</b> (ha nincs, hagyd üresen).</li>' +
      '</ol>' + batteryFields() + foot('next', 'Tovább') +
      '<p><button type="button" class="link" id="to-command">Mégis futtatom a parancsot</button></p>');
    bindInput('capacity', 'capacity'); bindInput('cycles', 'cycles');
    on('next', batteryNext);
    on('to-command', function () { go('mac_run'); });
  };

// ===== src/web/seller/80-hw-core.js =====
  /* ---- hardverteszt: az oldal maga méri, mit érzékel az eszköz ---- */

  var HW_FLOW = { ios: ['touch', 'motion', 'audio', 'camera_rear', 'camera_front', 'display'], mac: ['keyboard', 'pointer', 'audio', 'camera_front', 'display'] };
  var HW_TITLES = { touch: 'Érintőképernyő', motion: 'Mozgásérzékelők', audio: 'Hangszóró és mikrofon',
    camera_rear: 'Hátlapi kamera', camera_front: 'Előlapi kamera', display: 'Kijelző színei',
    keyboard: 'Billentyűzet', pointer: 'Egér és trackpad' };

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function hwList() { return HW_FLOW[state.kind === 'mac' ? 'mac' : 'ios']; }
  // Számítógépről az iPad hardverét nem lehet böngészőből tesztelni.
  function hwStart() { return (state.kind === 'ios' && ON_COMPUTER) ? 'review' : 'hw_intro'; }
  // Az eszközön lefutott böngészős rész után, ha USB-s adat még nincs, jön a "mi maradt" képernyő.
  function afterHw() { return (state.kind === 'ios' && !ON_COMPUTER && state.route !== 'usb') ? 'remaining' : 'review'; }
  function hwNext() {
    var list = hwList();
    for (var i = 0; i < list.length; i++) {
      if (!state.hw[list[i]]) { go('hw_' + list[i]); return; }
    }
    go(afterHw());
  }
  function hwDone(name, status, detail) { state.hw[name] = { status: status, detail: detail || '' }; save(); }
  function hwResult(name) {
    var r = state.hw[name];
    var icon = r.status === 'ok' ? '✅ ' : (r.status === 'bad' ? '❌ ' : '❔ ');
    var cls = r.status === 'ok' ? 'success' : (r.status === 'bad' ? 'error' : 'note');
    var text = r.status === 'unavailable' ? (r.detail || 'ezen a rendszeren a böngészőből nem ellenőrizhető')
      : (r.status === 'skipped' ? 'kihagyva' + (r.detail ? ': ' + r.detail : '') : (r.detail || (r.status === 'ok' ? 'rendben' : 'hibás')));
    message('result', '<div class="' + cls + '">' + icon + esc(text) + '</div><button type="button" class="btn" id="hw-next">Tovább</button>');
    on('hw-next', hwNext);
  }
  function hwScreen(name, lead, extra, supported, unavailableText, pre) {
    show(top() + progress(4) + '<h1>' + HW_TITLES[name] + '</h1><p class="lead">' + lead + '</p>' + (pre || '') +
      (supported ? '<button type="button" class="btn" id="hw-start">Indítás</button><p><button type="button" class="link" id="hw-skip">Kihagyom</button></p>' : '') +
      (extra || '') + '<div id="result"></div>' + foot());
    if (!supported) { hwDone(name, 'unavailable', unavailableText); hwResult(name); return false; }
    on('hw-skip', function () { hwDone(name, 'skipped'); hwNext(); });
    return true;
  }

  SCREENS.hw_intro = function () {
    var list = hwList(), items = '';
    for (var i = 0; i < list.length; i++) items += '<li>' + HW_TITLES[list[i]] + '</li>';
    show(top() + progress(4) +
      '<h1>Hardverteszt</h1>' +
      '<p class="lead">Néhány rövid teszt, kb. 3 percig. Az oldal <b>maga méri</b>, mit érzékel az eszköz: hány mezőt érzett az érintőképernyő, mekkora mozgást mért az érzékelő, meghallotta-e a mikrofon a hangjelzést. Nem a te válaszod számít. Ami ezen a rendszeren nem mérhető, azt a riport külön jelzi.</p>' +
      '<ul class="marks yes">' + items + '</ul>' +
      choice('hw-go', 'Elkezdem', 'Kb. 3 perc. Ne vegyél fel hívást közben.', false) +
      choice('hw-no', 'Kihagyom a hardvertesztet', 'A riportban "nem tesztelt" jelzést kap.', false) + foot());
    on('hw-go', function () { state.hwSkipped = false; hwNext(); });
    on('hw-no', function () { state.hwSkipped = true; go(afterHw()); });
  };

// ===== src/web/seller/81-hw-touch-keyboard-pointer.js =====
  /* érintőképernyő */
  SCREENS.hw_touch = function () {
    if (hwScreen('touch', 'Húzd végig az ujjad a kijelzőn úgy, hogy minden mezőt érintsél, a végén pedig tegyél egyszerre két ujjat a kijelzőre. Az oldal számolja, hány mezőt érzékelt az eszköz.', '', true, '')) {
      on('hw-start', startTouch);
    }
  };

  function startTouch() {
    var cols = 8, rows = 12, total = cols * rows, tracker = P.touchTracker(total), finished = false, timer;
    var html = '<table id="touch-grid"><tbody>', index = 0;
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var c = 0; c < cols; c++) html += '<td data-i="' + (index++) + '"></td>';
      html += '</tr>';
    }
    html += '</tbody></table><div id="touch-note">Húzd végig az ujjad minden mezőn</div><button type="button" class="btn secondary" id="touch-skip">Kihagyom</button>';
    var overlay = document.createElement('div');
    overlay.id = 'touch-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      hwDone('touch', status, detail);
      if (status === 'skipped' && !detail) { hwNext(); return; }
      hwResult('touch');
    }
    var cellEls = overlay.getElementsByTagName('td'), note = document.getElementById('touch-note');
    // A mezőt a koordinátából számoljuk, mert az elementFromPoint régi Safarin egy táblázat fölött nem megbízható.
    function cellAt(x, y) {
      var grid = document.getElementById('touch-grid');
      if (!grid) return -1;
      var box = grid.getBoundingClientRect();
      if (!box.width || !box.height) return -1;
      var col = Math.floor((x - box.left) * cols / box.width), row = Math.floor((y - box.top) * rows / box.height);
      if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
      return row * cols + col;
    }
    function mark(event) {
      // A Kihagyom gomb érintését nem nyeljük el, különben nem kattintható.
      if (event.target && event.target.id === 'touch-skip') return;
      event.preventDefault();
      // Csak a kifejezetten szkriptből küldött esemény számít hamisnak. A Safari 9 az isTrusted értéket nem adja meg (undefined).
      if (event.isTrusted === false) return;
      var touches = event.touches || [], fingers = touches.length;
      tracker.hit(-1, fingers);
      for (var t = 0; t < fingers; t++) {
        var i = cellAt(touches[t].clientX, touches[t].clientY);
        if (i >= 0 && cellEls[i]) { cellEls[i].className = 'on'; tracker.hit(i, fingers); }
      }
      var st = tracker.state();
      if (st.complete) finish('ok', 'mind a ' + st.total + ' mező érzékelt, két ujjal is');
      else if (st.cells === st.total) note.textContent = 'Most tegyél egyszerre két ujjat a kijelzőre';
      else note.textContent = 'Érzékelt mezők: ' + st.cells + ' / ' + st.total + '. Húzd végig az ujjad minden mezőn';
    }
    overlay.addEventListener('touchstart', mark, false);
    overlay.addEventListener('touchmove', mark, false);
    document.getElementById('touch-skip').addEventListener('click', function () { finish('skipped'); });
    timer = setTimeout(function () {
      var st = tracker.state();
      if (st.cells >= st.total * 0.6) finish('bad', st.cells + ' / ' + st.total + ' mezőt érzékelt' + (st.multi ? ', két ujjal is' : ', két ujjas érintés nélkül'));
      else finish('skipped', 'csak ' + st.cells + ' / ' + st.total + ' mezőt érintett meg');
    }, 180000);
  }

  /* billentyűzet (Macen) */
  SCREENS.hw_keyboard = function () {
    var pre = '<div class="note"><b>Milyen az Enter billentyű alakja?</b>' +
      '<label class="radio"><input type="radio" name="kbl" value="ansi" checked> Lapos, egysoros (amerikai, ANSI)</label>' +
      '<label class="radio"><input type="radio" name="kbl" value="iso"> Magas, L alakú (európai, magyar, ISO)</label></div>';
    if (hwScreen('keyboard', 'Nyomd meg egyenként az összes billentyűt, a képernyőn kigyulladnak. A felső F1-F12 sort az Fn billentyűvel együtt nyomd. A Cmd, Ctrl, Opt és Shift billentyűt önmagában nyomd meg, ne kombinációban. Az Fn, a hangerő, a fényerő és a Touch ID gombot a böngésző nem látja, ezeket nem kell megnyomnod.', '', true, '', pre)) {
      on('hw-start', startKeyboard);
    }
  };

  function startKeyboard() {
    var radio = app.querySelector('input[name=kbl]:checked');
    var rows = P.keyboardLayout(radio && radio.value === 'iso' ? 'iso' : 'ansi'), tracker = P.keyboardTracker(rows), finished = false;
    var html = '<div id="key-wrap"><h2 id="key-note"></h2><div id="key-board">', r, c, key, i;
    for (r = 0; r < rows.length; r++) {
      html += '<div class="krow">';
      for (c = 0; c < rows[r].length; c++) {
        key = rows[r][c];
        html += '<div class="kcell' + (key.soft ? ' soft' : '') + '" data-code="' + esc(key.code) + '" style="flex:' + key.w + ' 1 0">' + esc(key.label) + '</div>';
      }
      html += '</div>';
    }
    html += '</div><p id="key-list" class="muted"></p><div class="nav"><button type="button" class="btn" id="key-done">Kész</button>' +
      '<button type="button" class="btn secondary" id="key-skip">Kihagyom</button></div></div>';
    var overlay = document.createElement('div');
    overlay.id = 'key-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    var cells = {}, nodes = overlay.querySelectorAll('.kcell');
    for (i = 0; i < nodes.length; i++) cells[nodes[i].getAttribute('data-code')] = nodes[i];
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    function light(el) { if (el && el.className.indexOf(' on') < 0) el.className += ' on'; }
    function refresh() {
      var st = tracker.state();
      $('key-note').textContent = st.complete ? 'Minden billentyű érzékelve. Nyomd meg a Kész gombot.' : 'Érzékelt billentyűk: ' + st.pressed + ' / ' + st.total;
      $('key-list').textContent = (st.softTotal ? 'Funkciósor (az Fn-nel együtt): ' + st.softPressed + ' / ' + st.softTotal : '') +
        (st.doubles.length ? '. Dupla leütés gyanú: ' + st.doubleLabels.join(', ') : '');
    }
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      hwDone('keyboard', status, detail);
      if (status === 'skipped' && !detail) { hwNext(); return; }
      hwResult('keyboard');
    }
    function onDown(event) {
      if (finished || event.isTrusted === false) return;
      var code = event.code;
      if (!code) { // régi böngésző: nincs event.code
        finish('unavailable', 'a böngésző nem adja meg a billentyű fizikai kódját (túl régi böngésző), ezért ezt nem tudtuk ellenőrizni');
        return;
      }
      event.preventDefault();
      tracker.down(code, event.repeat);
      var el = cells[code];
      light(el);
      // A kigyulladt billentyűn a valódi felirat látszik (például a magyar kiosztás betűi).
      if (el && event.key && event.key.length === 1 && /^(Key|Digit|Semicolon|Quote|Comma|Period|Slash|Bracket|Minus|Equal|Backquote|IntlBackslash|Backslash)/.test(code)) el.textContent = event.key.toUpperCase();
      refresh();
    }
    function onUp(event) {
      if (finished || event.isTrusted === false || !event.code) return;
      event.preventDefault();
      tracker.up(event.code);
      if (event.code === 'CapsLock') light(cells.CapsLock);
      refresh();
    }
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    $('key-done').addEventListener('click', function () { var v = P.keyboardVerdict(tracker.state()); finish(v.status, v.detail); });
    $('key-skip').addEventListener('click', function () { finish('skipped'); });
    refresh();
  }

  /* egér és trackpad (Macen) */
  SCREENS.hw_pointer = function () {
    if (hwScreen('pointer', 'Mozgasd végig a kurzort az egész képernyőn, kattints a kék karikákra (a négy sarokban és középen, így a trackpad sarkait is próbálod), kattints jobb gombbal vagy két ujjal, majd görgess felfelé és lefelé. Nem kötelező próbák: vízszintes görgetés, csippentés, dupla kattintás.', '', true, '')) {
      on('hw-start', startPointer);
    }
  };

  function startPointer() {
    var cols = 8, rows = 6, total = cols * rows, tracker = P.pointerTracker(total), finished = false, r, c, t;
    var html = '<table id="pointer-grid"><tbody>';
    for (r = 0; r < rows; r++) { html += '<tr>'; for (c = 0; c < cols; c++) html += '<td></td>'; html += '</tr>'; }
    html += '</tbody></table>';
    for (t = 0; t < P.POINTER_TARGETS.length; t++) {
      html += '<button type="button" class="ptarget p-' + P.POINTER_TARGETS[t][0] + '" data-id="' + P.POINTER_TARGETS[t][0] + '">' + (t + 1) + '</button>';
    }
    html += '<div id="pointer-panel"></div><div id="pointer-actions"><button type="button" class="btn" id="pointer-done">Kész</button>' +
      '<button type="button" class="btn secondary" id="pointer-skip">Kihagyom</button></div>';
    var overlay = document.createElement('div');
    overlay.id = 'pointer-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    var cellEls = overlay.getElementsByTagName('td'), grid = $('pointer-grid');
    function mark(v) { return v ? '✅' : '⬜'; }
    function refresh() {
      var st = tracker.state();
      $('pointer-panel').innerHTML = 'Mozgás: ' + st.cells + ' / ' + st.total + ' mező<br>Bal kattintás: ' + st.targets + ' / ' + st.targetsTotal + ' pont<br>' +
        'Jobb kattintás: ' + mark(st.right) + '<br>Görgetés felfelé: ' + mark(st.up) + ' lefelé: ' + mark(st.down) + '<br>' +
        '<span class="muted">Nem kötelező: vízszintes görgetés ' + mark(st.side) + ' csippentés ' + mark(st.pinch) + ' dupla kattintás ' + mark(st.dbl) + '</span>' +
        (st.complete ? '<br><b>Minden kötelező próba kész, nyomd meg a Kész gombot.</b>' : '');
    }
    function cellAt(x, y) {
      var box = grid.getBoundingClientRect();
      if (!box.width || !box.height) return -1;
      var col = Math.floor((x - box.left) * cols / box.width), row = Math.floor((y - box.top) * rows / box.height);
      if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
      return row * cols + col;
    }
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      hwDone('pointer', status, detail);
      if (status === 'skipped' && !detail) { hwNext(); return; }
      hwResult('pointer');
    }
    overlay.addEventListener('mousemove', function (e) {
      if (finished || e.isTrusted === false) return;
      var i = cellAt(e.clientX, e.clientY);
      if (i >= 0) { tracker.move(i); if (cellEls[i].className !== 'on') cellEls[i].className = 'on'; }
      refresh();
    }, false);
    // A kattintás csak akkor számít, ha tényleg a mutató nyomta (a billentyűzettel kiváltott kattintásnak nincs detail értéke).
    overlay.addEventListener('click', function (e) {
      if (finished || e.isTrusted === false || !(e.detail > 0)) return;
      var id = e.target && e.target.getAttribute ? e.target.getAttribute('data-id') : null;
      if (id) { tracker.target(id); if (e.target.className.indexOf(' on') < 0) e.target.className += ' on'; refresh(); }
    }, false);
    overlay.addEventListener('contextmenu', function (e) { e.preventDefault(); if (finished || e.isTrusted === false) return; tracker.right(); refresh(); }, false);
    overlay.addEventListener('wheel', function (e) { e.preventDefault(); if (finished || e.isTrusted === false) return; tracker.wheel(e.deltaX, e.deltaY, e.ctrlKey); refresh(); }, false);
    overlay.addEventListener('dblclick', function (e) { if (finished || e.isTrusted === false) return; tracker.dbl(); refresh(); }, false);
    overlay.addEventListener('gesturechange', function (e) { e.preventDefault(); tracker.pinch(); refresh(); }, false);
    $('pointer-done').addEventListener('click', function () { var v = P.pointerVerdict(tracker.state()); finish(v.status, v.detail); });
    $('pointer-skip').addEventListener('click', function () { finish('skipped'); });
    refresh();
  }

// ===== src/web/seller/82-hw-motion-audio.js =====
  /* mozgásérzékelők */
  SCREENS.hw_motion = function () {
    if (hwScreen('motion', 'Koppints az Indításra, majd dönts meg és fordíts el az eszközt minden irányba kb. fél percig.', '', true, '')) {
      on('hw-start', startMotion);
    }
  };

  function startMotion() {
    if (!window.DeviceMotionEvent) { hwDone('motion', 'unavailable', 'a böngésző nem ad mozgásadatot'); hwResult('motion'); return; }
    var tracker = P.motionTracker(), finished = false, timer;
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener('devicemotion', onMotion);
      hwDone('motion', status, detail);
      hwResult('motion');
    }
    function onMotion(event) {
      tracker.feed(event.accelerationIncludingGravity, event.rotationRate);
      var st = tracker.state();
      if (st.complete) finish('ok', 'mért mozgás: ' + Math.round(st.rangeX) + ' és ' + Math.round(st.rangeY) + ' m/s² tartomány, ' + Math.round(st.rotation) + ' °/s forgás');
    }
    function begin() {
      message('result', '<p class="muted">Mozgasd az eszközt...</p>');
      window.addEventListener('devicemotion', onMotion);
      timer = setTimeout(function () {
        if (tracker.state().events === 0) finish('bad', 'nem érkezett mozgásadat az érzékelőtől');
        else finish('skipped', 'a mozgás nem érte el a küszöböt');
      }, 40000);
    }
    if (window.DeviceMotionEvent.requestPermission) {
      window.DeviceMotionEvent.requestPermission().then(function (answer) {
        if (answer === 'granted') begin();
        else { hwDone('motion', 'skipped', 'nem engedélyezte a mozgásadatokat'); hwResult('motion'); }
      }).catch(function () { hwDone('motion', 'skipped', 'nem engedélyezte a mozgásadatokat'); hwResult('motion'); });
    } else { begin(); }
  }

  /* hangszóró és mikrofon */
  function audioSupported() {
    return !!((window.AudioContext || window.webkitAudioContext) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  SCREENS.hw_audio = function () {
    var ok = hwScreen('audio', 'Húzd ki a fülhallgatót, és vedd fel a hangerőt legalább a felére. Az oldal hangjelzéseket játszik le a hangszórón, és a mikrofon próbálja meghallani őket. Légy csendben közben.', '',
      audioSupported(), 'ezen a rendszeren a böngésző nem engedi a mikrofon használatát (iOS 11 vagy újabb kell), ezért ezt nem tudtuk ellenőrizni');
    if (ok) on('hw-start', startAudio);
  };

  function randomTones() {
    var pool = [700, 950, 1250, 1600, 2000, 2500, 3100, 3800], out = [];
    while (out.length < 4) {
      var f = pool[Math.floor(Math.random() * pool.length)];
      if (out.indexOf(f) < 0) out.push(f);
    }
    return out;
  }

  function startAudio() {
    var AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
    if (ctx.resume) ctx.resume();
    message('result', '<p class="muted">Hangjelzések...</p>');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      ctx.createMediaStreamSource(stream).connect(analyser);
      var bins = new Float32Array(analyser.frequencyBinCount);
      function level(freq) {
        analyser.getFloatFrequencyData(bins);
        var hz = ctx.sampleRate / analyser.fftSize, center = Math.round(freq / hz), peak = -200, sum = 0, n = 0;
        for (var i = 0; i < bins.length; i++) {
          if (i * hz < 300) continue;
          if (Math.abs(i - center) <= 3) { if (bins[i] > peak) peak = bins[i]; }
          else if (bins[i] > -180) { sum += bins[i]; n++; }
        }
        return peak - (n ? sum / n : -120);
      }
      function play(freq, pan) {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.value = freq; gain.gain.value = 0.9;
        osc.connect(gain);
        if (ctx.createStereoPanner) {
          var panner = ctx.createStereoPanner(); panner.pan.value = pan; gain.connect(panner); panner.connect(ctx.destination);
        } else { gain.connect(ctx.destination); }
        osc.start();
        return sleep(180).then(function () {
          var best = -999, i = 0;
          return (function sample() {
            best = Math.max(best, level(freq));
            if (++i >= 8) return best;
            return sleep(40).then(sample);
          })();
        }).then(function (best) { osc.stop(); return sleep(180).then(function () { return best; }); });
      }
      function channel(pan) {
        var expected = randomTones(), heard = [], chain = Promise.resolve();
        expected.forEach(function (f) {
          chain = chain.then(function () { return play(f, pan); }).then(function (v) { heard.push(v >= 25); });
        });
        return chain.then(function () { return { expected: expected, heard: heard }; });
      }
      var stereo = !!ctx.createStereoPanner;
      var run = stereo
        ? channel(-1).then(function (left) { return channel(1).then(function (right) { return { left: left, right: right }; }); })
        : channel(0).then(function (mono) { return { mono: mono }; });
      return run.then(function (res) {
        var tracks = stream.getTracks();
        for (var t = 0; t < tracks.length; t++) tracks[t].stop();
        try { ctx.close(); } catch (e) { /* nem baj */ }
        var detail, good;
        if (res.mono) {
          var v = P.toneVerdict(res.mono.expected, res.mono.heard);
          good = v.ok; detail = 'a hangjelzésekből ' + v.heard + ' / ' + v.total + ' hallatszott (ezen a rendszeren a két csatorna külön nem mérhető)';
          if (!v.heard) detail += '. A hangszóró vagy a mikrofon hibás, vagy nincs felvéve a hangerő';
        } else {
          var l = P.toneVerdict(res.left.expected, res.left.heard), r = P.toneVerdict(res.right.expected, res.right.heard);
          good = l.ok && r.ok;
          detail = 'bal csatorna ' + l.heard + ' / ' + l.total + ', jobb csatorna ' + r.heard + ' / ' + r.total + ' hang hallatszott';
          if (!l.heard && !r.heard) detail += '. A hangszóró vagy a mikrofon hibás, vagy nincs felvéve a hangerő';
        }
        hwDone('audio', good ? 'ok' : 'bad', detail);
        hwResult('audio');
      });
    }).catch(function (error) {
      var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      hwDone('audio', denied ? 'skipped' : 'bad', denied ? 'nem engedélyezte a mikrofont' : 'a mikrofon nem érhető el');
      hwResult('audio');
    });
  }

// ===== src/web/seller/83-hw-camera-display.js =====
  /* kamerák */
  function cameraSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  function cameraScreen(name, facing, lead) {
    return function () {
      var ok = hwScreen(name, lead, '<div id="preview"></div>', cameraSupported(),
        'ezen a rendszeren a böngésző nem engedi a kamera használatát (iOS 11 vagy újabb kell), ezért ezt nem tudtuk ellenőrizni');
      if (ok) on('hw-start', function () { startCamera(name, facing); });
    };
  }
  SCREENS.hw_camera_rear = cameraScreen('camera_rear', 'environment', 'Koppints az Indításra, engedélyezd a kamerát, és tartsd a hátlapi kamerát valami elé, ami nem egyszínű. Az oldal azt nézi, hogy valódi kép jön-e.');
  SCREENS.hw_camera_front = cameraScreen('camera_front', 'user', 'Koppints az Indításra, engedélyezd a kamerát, és nézz az előlapi kamerába. Az oldal azt nézi, hogy valódi kép jön-e.');

  function startCamera(name, facing) {
    var constraints = state.kind === 'mac' ? { video: true } : { video: { facingMode: { exact: facing } } };
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      var video = document.createElement('video');
      video.setAttribute('playsinline', ''); video.setAttribute('autoplay', ''); video.muted = true;
      video.style.width = '100%';
      $('preview').appendChild(video);
      video.srcObject = stream;
      var canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      var ctx = canvas.getContext('2d'), started = new Date().getTime(), done = false;
      function stop() {
        var tracks = stream.getTracks();
        for (var t = 0; t < tracks.length; t++) tracks[t].stop();
        if (video.parentNode) video.parentNode.removeChild(video);
      }
      (function sample() {
        if (done) return;
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, 64, 48);
          if (P.frameLooksReal(P.frameStats(ctx.getImageData(0, 0, 64, 48).data))) {
            done = true; stop(); hwDone(name, 'ok', 'élő kép érkezik'); hwResult(name); return;
          }
        }
        if (new Date().getTime() - started > 15000) {
          done = true; stop();
          hwDone(name, 'bad', 'csak fekete vagy egyszínű kép érkezett (a lencsét takarja valami, vagy hibás)');
          hwResult(name);
          return;
        }
        setTimeout(sample, 400);
      })();
    }).catch(function (error) {
      var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      if (denied) hwDone(name, 'skipped', 'nem engedélyezte a kamerát');
      else hwDone(name, 'bad', 'nem található működő ' + (facing === 'user' ? 'előlapi' : 'hátlapi') + ' kamera');
      hwResult(name);
    });
  }

  /* kijelző: az egyetlen teszt, ami az eladó válaszára épül, ezért a riportban bemondásként szerepel */
  SCREENS.hw_display = function () {
    if (hwScreen('display', 'Végigmegyünk néhány egyszínű képen. Figyeld, van-e halott pixel, folt vagy elszíneződés valamelyiken.', '', true, '')) {
      on('hw-start', startDisplay);
    }
  };

  function startDisplay() {
    var colors = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#808080'], i = 0;
    var overlay = document.createElement('div');
    overlay.id = 'color-overlay';
    overlay.innerHTML = '<div id="color"></div><div id="colorbar"><button type="button" class="btn" id="color-next">Következő szín</button></div>';
    document.body.appendChild(overlay);
    document.getElementById('color').style.background = colors[0];
    document.getElementById('color-next').addEventListener('click', function () {
      i++;
      if (i < colors.length) { document.getElementById('color').style.background = colors[i]; return; }
      document.body.removeChild(overlay);
      message('result', '<p>Láttál halott pixelt, foltot vagy elszíneződést valamelyik színen?</p>' +
        '<button type="button" class="btn" id="d-no">Nem láttam hibát</button>' +
        '<button type="button" class="btn secondary" id="d-yes">Igen, van hiba</button>');
      on('d-no', function () { hwDone('display', 'ok', 'az eladó nem látott hibát'); hwResult('display'); });
      on('d-yes', function () { hwDone('display', 'bad', 'az eladó hibát látott a kijelzőn'); hwResult('display'); });
    });
  }

// ===== src/web/seller/90-details-remaining-review-send.js =====
  /* ---- az eszköz adatai, előnézet, küldés ---- */

  SCREENS.details = function () {
    var v = state.vals, mac = state.kind === 'mac', cur = current();
    var seen = '', known = '', rows = [['Modell', v.model], ['Tárhely', v.storage], ['Rendszerverzió', v.os], ['Sorozatszám', v.serial]], list = '';
    for (var r = 0; r < rows.length; r++) { if (rows[r][1]) list += '<dt>' + rows[r][0] + '</dt><dd>' + esc(rows[r][1]) + '</dd>'; }
    if (list) known = '<div class="result"><dl>' + list + '</dl></div>';
    if (!mac && DEVICE && state.route !== 'usb') {
      var scr = window.screen ? (window.screen.width + '×' + window.screen.height) : '';
      seen = '<div class="note"><b>A böngészőből már kiolvastuk:</b> ' + esc(DEVICE.device) + ', ' + esc(DEVICE.name) + ' ' + esc(DEVICE.version) + (scr ? ', kijelző ' + esc(scr) : '') + '.' +
        '<br>A pontos modellt, a tárhelyet és a sorozatszámot a böngésző nem látja. Ezeket nem kell beírnod: az USB-s program olvassa ki, ha a végén azt választod.</div>';
    }
    show(top() + progress(3) +
      '<h1>Az eszköz adatai</h1>' +
      '<p class="lead">Ezek segítenek a vásárlónak összevetni az eszközt a hirdetéssel. Amit az oldal ki tudott olvasni, azt itt látod.</p>' + seen +
      known +
      (v.serial ? '<div class="note">A sorozatszámot elküldjük a vásárlónak, hogy az Apple lefedettség-ellenőrzőjén megnézhesse a modellt. Ha ezt nem szeretnéd, vedd ki a pipát: akkor <b>csak egy lenyomatot</b> küldünk, egy kódot, amiből a sorozatszám nem fejthető vissza, és az utolsó 4 karakterét.</div>' +
        '<label class="check"><input type="checkbox" id="share"' + (state.shareSerial ? ' checked' : '') + '> A sorozatszámot elküldöm a vásárlónak, hogy ellenőrizhesse az Apple-nél a modellt.</label>' : '') +
      '<h2>Ki vagy jelentkezve az Apple-fiókodból?</h2>' +
      '<p class="muted">Ha az eszköz még a te Apple-fiókodhoz van kötve (Aktiválási zár), az új tulajdonos nem tudja használni. Kijelentkezés: ' + (mac ? 'Apple menü &gt; Rendszerbeállítások, legfelül a neved, majd Kijelentkezés.' : cur.signout) + '</p>' +
      '<label class="radio"><input type="radio" name="apple" value="yes"' + (state.apple === 'yes' ? ' checked' : '') + '> Kijelentkeztem, és a Keresés funkció ki van kapcsolva</label>' +
      '<label class="radio"><input type="radio" name="apple" value="no"' + (state.apple === 'no' ? ' checked' : '') + '> Még nem jelentkeztem ki</label>' +
      '<label class="radio"><input type="radio" name="apple" value="unsure"' + (state.apple === 'unsure' ? ' checked' : '') + '> Nem vagyok biztos benne</label>' +
      '<div id="msg"></div>' + foot('next', 'Tovább'));
    if ($('share')) $('share').addEventListener('change', function () { state.shareSerial = this.checked; });
    var radios = app.querySelectorAll('input[name=apple]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', function () { state.apple = this.value; });
    on('next', function () {
      if (state.vals.serial.trim() && !P.normalizeSerial(state.vals.serial)) {
        message('msg', '<div class="error">A sorozatszám 8 és 14 karakter hosszú, betűkből és számokból áll.</div>'); return;
      }
      if (!state.apple) { message('msg', '<div class="error">Válaszd ki, hogy ki vagy-e jelentkezve az Apple-fiókodból.</div>'); return; }
      go(hwStart());
    });
  };

  /* ---- mi maradt: az USB-s program ajánlata ---- */

  function toUsb() { go(ON_COMPUTER ? 'usb_get' : 'usb_switch'); }

  SCREENS.remaining = function () {
    var v = state.vals, open = [];
    if (v.cycles === '' && v.capacity === '') open.push('<li><b>Akkumulátor:</b> nincs adat. A program az eszközből olvassa ki a ciklusszámot és a kapacitást.</li>');
    else open.push('<li><b>Akkumulátor:</b> amit megadtál vagy a naplóból olvastunk. A program az eszközből méri meg pontosan.</li>');
    open.push('<li><b>Aktiválási zár:</b> jelenleg csak a te válaszod. A program az eszközből olvassa ki.</li>');
    open.push('<li><b>Modell és sorozatszám:</b> jelenleg amit beírtál. A program az eszközből olvassa ki.</li>');
    var missing = [], list = hwList();
    for (var i = 0; i < list.length; i++) {
      var r = state.hw[list[i]];
      if (!r || r.status === 'skipped' || r.status === 'unavailable') missing.push(HW_TITLES[list[i]]);
    }
    if (missing.length) open.push('<li><b>Böngészőből nem mérhető volt:</b> ' + esc(missing.join(', ')) + '.</li>');
    show(top() + progress(4) +
      '<h1>Ez még nincs ellenőrizve</h1>' +
      '<p class="lead">A böngészőben mindent megnéztünk, amit lehetett. Az alábbiakat egy böngésző nem tudja megmérni:</p>' +
      '<ul class="marks open">' + open.join('') + '</ul>' +
      '<p>Ahhoz, hogy a hardver is tesztelve legyen, egy audit programot kellene telepíteni a számítógépedre, és USB-kábellel rákötni az eszközt. Mielőtt bármit letöltenél, részletesen leírjuk, mit csinál. Te döntesz.</p>' +
      choice('r-yes', 'Igen, megnézem, mit csinál a program', 'Még nem töltesz le semmit, előbb elolvasod a részleteket.', false) +
      choice('r-no', 'Nem, így küldöm', 'Ezek a riportban "nem ellenőrzött" jelzést kapnak. Ez rendben van, a vásárló látni fogja, mi mért és mi bemondás.', false) +
      foot());
    on('r-yes', function () { go('usb_about'); });
    on('r-no', function () { go('review'); });
  };

  SCREENS.usb_about = function () {
    show(top() + progress(4) +
      '<h1>Mit csinál a program, és mit kapsz belőle?</h1>' +
      '<div class="note"><b>Fontos:</b> a programot egy számítógépen használod, és ott ugyanezzel a kóddal újrakezded az oldalt. Az eddigi böngészős tesztek eredménye nem megy át. A riport a számítógépről megy el, az USB-ből kiolvasott adatokkal.</div>' +
      '<h2>Mit csinál</h2>' +
      '<ol class="steps"><li>Letöltöd a számítógépedre (nyílt forráskódú, a letöltés előtt megnézheted a kódját és az ellenőrző összegét).</li>' +
      '<li>Rákötöd az eszközt USB-kábellel, és az eszközön megerősíted a <b>Megbízom</b> kérdést.</li>' +
      '<li>A program lefut, kiír egy összegzést a képernyőre, és a vágólapra másol egy rövid szöveget. Ezt illeszted be ide.</li></ol>' +
      '<h2>Mit olvas ki</h2>' +
      '<ul class="marks yes"><li>modell, rendszerverzió, tárhely</li><li>az akkumulátor ciklusszáma és kapacitása</li><li>az Aktiválási zár állapota</li><li>a sorozatszám (az előnézetben ugyanúgy kikapcsolhatod, mint eddig)</li></ul>' +
      '<h2>Amit nem olvas ki, és nem is tud</h2>' +
      '<ul class="marks no"><li>fotók, üzenetek, névjegyek, fájlok, alkalmazások</li><li>Apple-fiók, jelszavak, helyadat, Wi-Fi hálózatok</li><li>eszköznév, IMEI, UDID</li></ul>' +
      '<p class="muted">A program csak olvas, semmit nem módosít az eszközön, és nem küld el semmit az internetre. Az eredményt te másolod be ide, és az előnézetben látod, mi megy tovább.</p>' +
      '<h2>Mit kapsz belőle te</h2>' +
      '<p>A program a te képernyődön is kiírja, mit talált: az akkumulátor valódi kopását és az Aktiválási zár állapotát. Ha az akku gyengébb, mint gondoltad, előbb tudod meg te, mint a vásárló.</p>' +
      choice('a-go', 'Rendben, letöltöm a programot', 'A következő lépésben megkapod a letöltést.', false) +
      choice('a-no', 'Mégsem, így küldöm', 'A hardveres részek "nem ellenőrzött" jelzést kapnak a riportban.', false) +
      foot());
    on('a-go', toUsb);
    on('a-no', function () { go('review'); });
  };

  SCREENS.review = function () {
    var d = collect();
    var sections = P.buildSections(d);
    var html = top() + progress(5) +
      '<h1>Ellenőrizd, mit küldünk el</h1>' +
      '<p class="lead">Az alábbi lista a teljes tartalom. Ezeken kívül semmi nem megy el.</p>';
    if (d.cycles === null && d.capacity === null) {
      html += '<div class="note warn">Nem adtál meg akkumulátor adatot. A vásárló ezt hiányként fogja látni.</div>';
    }
    html += sectionsHtml(sections);
    html += (DEMO ? '<div class="note">Próbaüzemben a Küldés gomb nem küld el semmit.</div>' : '') +
      '<label class="check"><input type="checkbox" id="consent"> Elolvastam, és beleegyezem, hogy ezek az adatok elmenjenek a vásárlónak.</label>' +
      '<div id="msg"></div>' +
      '<div class="nav"><button type="button" class="btn secondary" id="back">Vissza</button>' +
      '<button type="button" class="btn" id="send" disabled>Küldés</button></div>';
    show(html);
    $('consent').addEventListener('change', function () { $('send').disabled = !this.checked; });
    on('send', function () { send(sections, d); });
  };

  function post(payload) {
    var body = JSON.stringify(payload);
    if (window.fetch) {
      return fetch(window.BACKEND_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body
      }).then(function (response) { return response.json(); });
    }
    // A régi Safarinak (iOS 9, 10) nincs fetch-e.
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', window.BACKEND_URL);
      xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
      xhr.onload = function () { try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); } };
      xhr.onerror = function () { reject(new TypeError('network')); };
      xhr.send(body);
    });
  }
  function serverError(text) { var e = new Error(text); e.fromServer = true; return e; }

  function send(sections, d) {
    if (state.sending || state.sent) return;
    var serialField = d.fingerprint || 'nincs';
    if (DEMO) { done(sections); return; }
    if (!window.BACKEND_URL) { message('msg', '<div class="error">Az oldal nincs beállítva, a küldés most nem lehetséges.</div>'); return; }
    state.sending = true;
    $('send').disabled = true;
    message('msg', '<p class="muted">Küldés...</p>');
    var started = state.sid ? Promise.resolve(state.sid) : post({ action: 'start', code: CODE }).then(function (r) {
      if (!r || !r.ok) throw serverError((r && r.error ? r.error : 'A link nem érvényes.') + ' Új meghívókódra van szükséged.');
      state.sid = r.sid;
      return r.sid;
    });
    started.then(function (sid) {
      return post({ action: 'finish', sid: sid, serial: serialField, sections: sections });
    }).then(function (r) {
      if (!r || !r.ok) throw serverError(r && r.error ? r.error : 'A küldés nem sikerült.');
      state.sending = false;
      done(sections);
    }).catch(function (error) {
      state.sending = false;
      if ($('send')) $('send').disabled = false;
      message('msg', '<div class="error">' + esc(error && error.fromServer ? error.message : 'Nincs kapcsolat a szerverrel. Ellenőrizd az internetet, és próbáld újra a Küldés gombbal.') + '</div>');
    });
  }

  // Küldés után a Vissza nem hozza vissza az előnézetet: a render mindig a záró képernyőt mutatja, és semmi nem mentődik.
  function done(sections) {
    state.sent = true;
    state.demoSections = DEMO ? sections : null;
    go('done');
    forget();
  }

  SCREENS.done = function () {
    var html = top() + '<h1>Köszönjük!</h1>' +
      '<div class="success">Az adatok elmentek a vásárlónak. Az oldalt bezárhatod.</div>' +
      '<p>Ezen az eszközön nem tároltunk semmit.</p>';
    if (DEMO && state.demoSections) {
      html += '<details><summary>Ezt küldtük volna (próbaüzem)</summary><pre class="code">' + esc(JSON.stringify(state.demoSections, null, 2)) + '</pre></details>';
    }
    show(html);
  };

// ===== src/web/seller/95-demo.js =====
  /* ---------- próbaüzem: ugrás bármelyik képernyőre és állapotra (csak #DEMO címen él) ---------- */

  var DEMO_ENVS = {
    ipad9: { device: { device: 'iPad', major: 9, version: '9.3.5', name: 'iOS' } },
    ipad12: { device: { device: 'iPad', major: 12, version: '12.5.7', name: 'iOS' } },
    ipad14: { device: { device: 'iPad', major: 14, version: '14.8', name: 'iOS' } },
    ipad17: { device: { device: 'iPad', major: 17, version: '17.4', name: 'iPadOS' } },
    win: { os: 'windows' }, macpc: { os: 'mac' }, linux: { os: 'linux' }
  };
  var USB_V = { model: 'iPad mini 1', storage: '16 GB', os: '9.3.5', serial: 'DMPS00000FAK', cycles: '245', capacity: '85' };
  var MAC_V = { model: 'MacBook Air', chip: 'Apple M1', memory: '8 GB', storage: '256 GB', os: '14.5', serial: 'C02XYZ123456', cycles: '212', capacity: '91' };
  var MAC_E = { condition: 'Normal', modelId: 'MacBookAir10,1', activationLock: 'Disabled', dep: false, mdm: false };
  var DEMO_VALS = {
    none: { v: {}, e: {} },
    log: { v: { cycles: '245' }, e: { fileDate: '2026-11-09' } },
    logweak: { v: { cycles: '1180' }, e: { fileDate: '2026-11-09' } },
    entered: { v: { cycles: '312', capacity: '88' }, e: {} },
    file: { v: { cycles: '312', capacity: '88' }, e: { fileDate: '2026-11-09' } },
    usb: { v: USB_V, e: { modelId: 'iPad2,5', activationLock: 'Disabled' } },
    usblock: { v: USB_V, e: { modelId: 'iPad2,5', activationLock: 'Enabled' } },
    usbweak: { v: { model: 'iPad mini 1', storage: '16 GB', os: '9.3.5', serial: 'DMPS00000FAK', cycles: '1100', capacity: '70' }, e: { modelId: 'iPad2,5', activationLock: 'Disabled' } },
    mac: { v: MAC_V, e: MAC_E },
    macmdm: { v: MAC_V, e: { condition: 'Service Recommended', modelId: 'MacBookAir10,1', activationLock: 'Enabled', dep: true, mdm: true } }
  };
  var DEMO_LIST = [];
  function demo(group, id, title, o) { DEMO_LIST.push({ group: group, id: id, title: title, o: o }); }

  function demoHw(kind, mode) {
    var out = {}, list = HW_FLOW[kind === 'mac' ? 'mac' : 'ios'], i, name;
    if (mode === 'none') return out;
    function demoKeyboard(allKeys) {
      var kr = P.keyboardLayout('ansi'), kt = P.keyboardTracker(kr), a, b;
      for (a = 0; a < kr.length; a++) { for (b = 0; b < kr[a].length; b++) { if (allKeys || kr[a][b].code !== 'KeyQ') { kt.down(kr[a][b].code, false); kt.up(kr[a][b].code); } } }
      return P.keyboardVerdict(kt.state());
    }
    function demoPointer(allDone) {
      var pt = P.pointerTracker(48), q;
      for (q = 0; q < (allDone ? 48 : 30); q++) pt.move(q);
      pt.target('tl'); pt.target('c'); pt.wheel(0, 40, false);
      if (allDone) { pt.target('tr'); pt.target('bl'); pt.target('br'); pt.right(); pt.wheel(0, -40, false); }
      return P.pointerVerdict(pt.state());
    }
    var good = { keyboard: demoKeyboard(true).detail, pointer: demoPointer(true).detail, touch: 'minden mező érzékelve, két ujj is', motion: 'mért mozgás: 12 és 10 m/s² tartomány, 55 °/s forgás',
      audio: 'a hangszóró és a mikrofon rendben, a mikrofon meghallotta a hangjelzéseket', camera_rear: 'élő kép érkezik',
      camera_front: 'élő kép érkezik', display: 'az eladó nem látott hibát' };
    var bad = { keyboard: [demoKeyboard(false).status, demoKeyboard(false).detail], pointer: [demoPointer(false).status, demoPointer(false).detail], touch: ['ok', good.touch], motion: ['bad', 'nem érkezett mozgásadat az érzékelőtől'], audio: ['bad', 'a mikrofon nem hallotta a hangszórót'],
      camera_rear: ['bad', 'csak fekete vagy egyszínű kép érkezett'], camera_front: ['ok', good.camera_front], display: ['bad', 'az eladó hibát látott a kijelzőn'] };
    var legacy = { touch: ['ok', good.touch], motion: ['ok', good.motion], display: ['ok', good.display] };
    for (i = 0; i < list.length; i++) {
      name = list[i];
      if (mode === 'ok') out[name] = { status: 'ok', detail: good[name] };
      else if (mode === 'bad') out[name] = { status: bad[name][0], detail: bad[name][1] };
      else if (mode === 'legacy') {
        out[name] = legacy[name] ? { status: legacy[name][0], detail: legacy[name][1] }
          : { status: 'unavailable', detail: 'ezen a rendszeren a böngésző nem engedi a használatát (iOS 11 vagy újabb kell), ezért ezt nem tudtuk ellenőrizni' };
      }
    }
    return out;
  }

  function applyDemo(spec) {
    var o = spec.o, env = DEMO_ENVS[o.env] || DEMO_ENVS.ipad9, preset = DEMO_VALS[o.vals || 'none'], key;
    DEVICE = env.device || null; ON_COMPUTER = !DEVICE; FORCE_OS = env.os || '';
    state.sent = false; state.sending = false; state.sid = ''; state.demoSections = null;
    state.kind = o.kind || 'ios';
    state.osFamily = o.fam || (DEVICE ? familyOf(DEVICE.major) : 'latest');
    state.detectedOs = DEVICE ? DEVICE.version : '';
    state.vals = { model: '', storage: '', os: '', memory: '', chip: '', serial: '', cycles: '', capacity: '' };
    for (key in preset.v) { if (Object.prototype.hasOwnProperty.call(preset.v, key)) state.vals[key] = preset.v[key]; }
    if (DEVICE && !state.vals.os) state.vals.os = DEVICE.version;
    state.route = o.route || '';
    state.parsed = {};
    if (state.route) { for (key in preset.v) { if (Object.prototype.hasOwnProperty.call(preset.v, key)) state.parsed[key] = preset.v[key]; } }
    state.extra = { condition: '', fileDate: '', activationLock: '', dep: null, mdm: null, modelId: '' };
    for (key in preset.e) { if (Object.prototype.hasOwnProperty.call(preset.e, key)) state.extra[key] = preset.e[key]; }
    state.apple = o.apple === undefined ? 'yes' : o.apple;
    state.shareSerial = true;
    state.noLog = !!o.noLog;
    state.hw = demoHw(state.kind, o.hw || 'none');
    state.hwSkipped = o.hw === 'none' && !!o.hwSkipped;
    state.path = ['welcome']; state.idx = 0; state.step = 'welcome';
    try { history.replaceState({ idx: 0 }, ''); } catch (e) { /* nem baj */ }
    if (o.screen === 'done') { done(P.buildSections(collect())); return; }
    go(o.screen);
  }

  function jumpDemo(id) {
    for (var i = 0; i < DEMO_LIST.length; i++) { if (DEMO_LIST[i].id === id) { applyDemo(DEMO_LIST[i]); return true; } }
    return false;
  }

  function demoPanel() {
    var html = '<div class="demo-panel"><h2>Próbaüzem: ugrás bármelyik képernyőre</h2>' +
      '<p class="muted">Egy kattintás beállítja az eszközt, a rendszert és az adatokat, és a kiválasztott képernyőre visz. A Vissza ide hoz. Közvetlen cím: a #DEMO után egy kötőjel és az azonosító, például <b>#DEMO-ios9-review-log</b>. Ez csak a #DEMO címen létezik.</p>', group = '', i;
    for (i = 0; i < DEMO_LIST.length; i++) {
      var item = DEMO_LIST[i];
      if (item.group !== group) {
        if (group) html += '</div>';
        html += '<h3>' + esc(item.group) + '</h3><div class="demo-list">';
        group = item.group;
      }
      html += '<button type="button" class="demo-btn" data-demo="' + esc(item.id) + '">' + esc(item.title) + '<small>#DEMO-' + esc(item.id) + '</small></button>';
    }
    return html + '</div></div>';
  }

  var G_OPEN = 'Nyitás';
  demo(G_OPEN, 'kind', 'Milyen eszközt adsz el?', { env: 'ipad9', kind: '', screen: 'kind' });

  var G9 = 'iPad, iOS 9 és 10';
  demo(G9, 'ios9-log-ask', 'Rendszernapló keresése', { env: 'ipad9', screen: 'log_ask' });
  demo(G9, 'ios9-log-paste', 'Napló beillesztése', { env: 'ipad9', screen: 'log_paste' });
  demo(G9, 'ios9-nolog', 'Nincs napló bejegyzés', { env: 'ipad9', screen: 'nolog' });
  demo(G9, 'ios9-details-nodata', 'Az eszköz adatai, még nincs akku adat', { env: 'ipad9', apple: '', screen: 'details' });
  demo(G9, 'ios9-details-log', 'Az eszköz adatai, napló beolvasva', { env: 'ipad9', vals: 'log', route: 'file', apple: '', screen: 'details' });
  demo(G9, 'ios9-hw-intro', 'Hardverteszt bevezető', { env: 'ipad9', screen: 'hw_intro' });
  demo(G9, 'ios9-hw-touch', 'Érintőképernyő teszt', { env: 'ipad9', screen: 'hw_touch' });
  demo(G9, 'ios9-hw-motion', 'Mozgásérzékelő teszt', { env: 'ipad9', screen: 'hw_motion' });
  demo(G9, 'ios9-hw-audio', 'Hang és mikrofon (iOS 9-en nem ellenőrizhető)', { env: 'ipad9', screen: 'hw_audio' });
  demo(G9, 'ios9-hw-camera-rear', 'Hátlapi kamera (iOS 9-en nem ellenőrizhető)', { env: 'ipad9', screen: 'hw_camera_rear' });
  demo(G9, 'ios9-hw-camera-front', 'Előlapi kamera (iOS 9-en nem ellenőrizhető)', { env: 'ipad9', screen: 'hw_camera_front' });
  demo(G9, 'ios9-hw-display', 'Kijelző színei', { env: 'ipad9', screen: 'hw_display' });
  demo(G9, 'ios9-remaining-nolog', 'Mi maradt, akku adat nélkül', { env: 'ipad9', noLog: true, hw: 'legacy', screen: 'remaining' });
  demo(G9, 'ios9-remaining-log', 'Mi maradt, napló beolvasva', { env: 'ipad9', vals: 'log', route: 'file', hw: 'legacy', screen: 'remaining' });
  demo(G9, 'ios9-usb-about', 'Mit csinál az USB-s program', { env: 'ipad9', screen: 'usb_about' });
  demo(G9, 'ios9-usb-switch', 'Nyisd meg a számítógépeden', { env: 'ipad9', screen: 'usb_switch' });
  demo(G9, 'ios9-review-nolog', 'Előnézet: akku adat nélkül, hardverteszt kihagyva', { env: 'ipad9', noLog: true, hw: 'none', hwSkipped: true, screen: 'review' });
  demo(G9, 'ios9-review-log', 'Előnézet: napló, hardverteszt iOS 9 szerint', { env: 'ipad9', vals: 'log', route: 'file', hw: 'legacy', screen: 'review' });
  demo(G9, 'ios9-review-weak', 'Előnézet: kopott akku, hibás tesztek', { env: 'ipad9', vals: 'logweak', route: 'file', hw: 'bad', apple: 'no', screen: 'review' });
  demo(G9, 'ios9-done', 'Köszönjük (a küldés után)', { env: 'ipad9', vals: 'log', route: 'file', hw: 'legacy', screen: 'done' });

  var G12 = 'iPad, iOS 11 és 12';
  demo(G12, 'mid-screen-ask', 'Látod az akku állapotát a Beállításokban?', { env: 'ipad12', screen: 'screen_ask' });
  demo(G12, 'mid-screen-enter', 'Akku értékek beírása', { env: 'ipad12', screen: 'screen_enter' });
  demo(G12, 'mid-log-ask', 'Rendszernapló keresése', { env: 'ipad12', screen: 'log_ask' });
  demo(G12, 'mid-log-paste', 'Napló beillesztése', { env: 'ipad12', screen: 'log_paste' });
  demo(G12, 'mid-hw-audio', 'Hang és mikrofon teszt', { env: 'ipad12', screen: 'hw_audio' });
  demo(G12, 'mid-hw-camera-rear', 'Hátlapi kamera teszt', { env: 'ipad12', screen: 'hw_camera_rear' });
  demo(G12, 'mid-review', 'Előnézet: beírt akku, minden teszt rendben', { env: 'ipad12', vals: 'entered', hw: 'ok', screen: 'review' });

  var G14 = 'iPad, iPadOS 13 és 14';
  demo(G14, 'modern-screen-ask', 'Látod az akku állapotát a Beállításokban?', { env: 'ipad14', screen: 'screen_ask' });
  demo(G14, 'modern-screen-enter', 'Akku értékek beírása', { env: 'ipad14', screen: 'screen_enter' });
  demo(G14, 'modern-log-ask', 'Analitikai fájl keresése', { env: 'ipad14', screen: 'log_ask' });
  demo(G14, 'modern-log-file', 'Fájl kiválasztása', { env: 'ipad14', screen: 'log_file' });
  demo(G14, 'modern-review', 'Előnézet: fájlból, minden teszt rendben', { env: 'ipad14', vals: 'file', route: 'file', hw: 'ok', screen: 'review' });

  var G17 = 'iPad, iPadOS 15 és újabb';
  demo(G17, 'latest-screen-ask', 'Látod az akku állapotát a Beállításokban?', { env: 'ipad17', screen: 'screen_ask' });
  demo(G17, 'latest-log-file', 'Fájl kiválasztása', { env: 'ipad17', screen: 'log_file' });
  demo(G17, 'latest-hw-audio', 'Hang és mikrofon teszt', { env: 'ipad17', screen: 'hw_audio' });
  demo(G17, 'latest-remaining', 'Mi maradt, minden teszt rendben', { env: 'ipad17', vals: 'file', route: 'file', hw: 'ok', screen: 'remaining' });
  demo(G17, 'latest-review-ok', 'Előnézet: minden rendben', { env: 'ipad17', vals: 'file', route: 'file', hw: 'ok', screen: 'review' });
  demo(G17, 'latest-review-bad', 'Előnézet: hibás tesztek, kijelentkezés nélkül', { env: 'ipad17', vals: 'file', route: 'file', hw: 'bad', apple: 'no', screen: 'review' });

  var GPC = 'Számítógép, USB-s kiolvasás (iPad vagy iPhone)';
  demo(GPC, 'pc-win-get', 'Letöltés: Windows', { env: 'win', screen: 'usb_get' });
  demo(GPC, 'pc-mac-get', 'Letöltés: Mac', { env: 'macpc', screen: 'usb_get' });
  demo(GPC, 'pc-linux-get', 'Letöltés: Linux', { env: 'linux', screen: 'usb_get' });
  demo(GPC, 'pc-run', 'Csatlakoztatás és futtatás', { env: 'win', screen: 'usb_run' });
  demo(GPC, 'pc-paste', 'A kimenet beillesztése', { env: 'win', screen: 'usb_paste' });
  demo(GPC, 'pc-details', 'Az eszköz adatai, USB-ből kitöltve', { env: 'win', vals: 'usb', route: 'usb', apple: '', screen: 'details' });
  demo(GPC, 'pc-review', 'Előnézet: USB-s adatok, Aktiválási zár kikapcsolva', { env: 'win', vals: 'usb', route: 'usb', screen: 'review' });
  demo(GPC, 'pc-review-lock', 'Előnézet: Aktiválási zár BEKAPCSOLVA', { env: 'win', vals: 'usblock', route: 'usb', apple: 'no', screen: 'review' });
  demo(GPC, 'pc-review-weak', 'Előnézet: kopott akku', { env: 'win', vals: 'usbweak', route: 'usb', screen: 'review' });
  demo(GPC, 'pc-done', 'Köszönjük (a küldés után)', { env: 'win', vals: 'usb', route: 'usb', screen: 'done' });

  var GMAC = 'Mac eladása';
  demo(GMAC, 'mac-run', 'Terminál-parancs futtatása', { env: 'macpc', kind: 'mac', screen: 'mac_run' });
  demo(GMAC, 'mac-paste', 'A kimenet beillesztése', { env: 'macpc', kind: 'mac', screen: 'mac_paste' });
  demo(GMAC, 'mac-manual', 'Kézi megadás (ha a parancs nem megy)', { env: 'macpc', kind: 'mac', screen: 'mac_manual' });
  demo(GMAC, 'mac-details', 'Az eszköz adatai, parancsból kitöltve', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', apple: '', screen: 'details' });
  demo(GMAC, 'mac-hw-intro', 'Hardverteszt bevezető', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', screen: 'hw_intro' });
  demo(GMAC, 'mac-hw-keyboard', 'Billentyűzet teszt', { env: 'macpc', kind: 'mac', screen: 'hw_keyboard' });
  demo(GMAC, 'mac-hw-pointer', 'Egér és trackpad teszt', { env: 'macpc', kind: 'mac', screen: 'hw_pointer' });
  demo(GMAC, 'mac-hw-audio', 'Hang és mikrofon teszt', { env: 'macpc', kind: 'mac', screen: 'hw_audio' });
  demo(GMAC, 'mac-review-ok', 'Előnézet: minden rendben', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', hw: 'ok', screen: 'review' });
  demo(GMAC, 'mac-review-mdm', 'Előnézet: céges felügyelet, zár bekapcsolva, hibás tesztek', { env: 'macpc', kind: 'mac', vals: 'macmdm', route: 'command', hw: 'bad', apple: 'no', screen: 'review' });
  demo(GMAC, 'mac-review-nohw', 'Előnézet: hardverteszt kihagyva', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', hw: 'none', hwSkipped: true, screen: 'review' });
  demo(GMAC, 'mac-done', 'Köszönjük (a küldés után)', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', hw: 'ok', screen: 'done' });

// ===== src/web/seller/99-start.js =====
  /* ---------- indítás ---------- */

  var detected = DEVICE;
  var restored = DEMO_ID ? false : restore();
  if (!restored) { state.path = ['welcome']; state.idx = 0; state.step = 'welcome'; }
  if (detected) state.detectedOs = detected.version;
  if (!state.osFamily) state.osFamily = detected ? familyOf(detected.major) : 'latest';
  if (detected && !state.vals.os) state.vals.os = detected.version;
  try { history.replaceState({ idx: state.idx }, ''); } catch (e) { /* nem baj */ }
  window.addEventListener('popstate', onPop);
  if (DEMO && DEMO_ID && jumpDemo(DEMO_ID)) { /* a mélylink a kért képernyőre vitt */ } else { render(); }
})();
