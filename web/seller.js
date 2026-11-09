// Az eladói varázsló. Független az átvételi oldal USB-s folyamatától (receiver/app.js).
// Minden adat a böngészőben marad, amíg az eladó a végén meg nem nyomja a Küldés gombot.
// Felépítés: minden képernyő egy lépés (SCREENS). A megtett út (state.path, state.idx) a sessionStorage-ban és a
// böngésző előzményeiben is megvan, ezért a Vissza gomb és a böngésző Vissza gombja is ugyanazt csinálja.
(function () {
  'use strict';

  var P = window.SellerParse;
  var app = document.getElementById('app');
  var hash = (location.hash || '').replace('#', '').trim().toUpperCase();
  var DEMO = hash === 'DEMO';
  var CODE_PATTERN = /^(?:[0-9]{9}|[0-9A-Z]{12})$/;
  var CODE = CODE_PATTERN.test(hash) ? hash : '';
  var MAX_FILE = 50 * 1024 * 1024;

  // Melyik gépen nyitották meg az oldalt: az eladandó iOS eszközön, vagy egy számítógépen?
  var DEVICE = P.detectOs(navigator.userAgent, navigator.maxTouchPoints || 0);
  var ON_COMPUTER = !DEVICE;
  function computerOs() {
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
    shareSerial: true, apple: '', sid: '', sending: false, sent: false, noLog: false, demoSections: null
  };

  var SCREENS = {};

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
    var title = app.querySelector('h1');
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
    return '<div class="progress"><span style="width:' + (n * 25) + '%"></span></div>' +
      '<p class="step-label">' + n + '. lépés a 4-ből</p>';
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

  /* ---------- lépéskezelés ---------- */

  function render() {
    if (state.sent) state.step = 'done';
    var screen = SCREENS[state.step] || SCREENS.welcome;
    screen();
  }
  function go(name) {
    state.path = state.path.slice(0, state.idx + 1);
    state.path.push(name);
    state.idx = state.path.length - 1;
    state.step = name;
    try { history.pushState({ idx: state.idx }, ''); } catch (e) { /* nem baj, a gomb enélkül is visszalép */ }
    render();
  }
  function replace(name) {
    state.path[state.idx] = name;
    state.step = name;
    try { history.replaceState({ idx: state.idx }, ''); } catch (e) { /* nem baj */ }
    render();
  }
  function goBack() {
    if (state.idx <= 0) return;
    var before = state.idx;
    try { history.back(); } catch (e) { /* lent a tartalék */ }
    // Ha a böngésző nem jelezte a visszalépést, mi lépünk vissza.
    setTimeout(function () {
      if (state.idx === before) {
        state.idx = before - 1;
        state.step = state.path[state.idx];
        render();
      }
    }, 250);
  }
  function onPop(event) {
    var idx = event.state && typeof event.state.idx === 'number' ? event.state.idx : null;
    if (idx === null || idx < 0 || idx >= state.path.length) return;
    state.idx = idx;
    state.step = state.path[idx];
    render();
  }

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
      kind: state.kind,
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

  /* ---------- képernyők ---------- */

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
    show(top() +
      '<h1>Az eszközöd állapotának ellenőrzése</h1>' +
      '<p class="lead">A vásárló szeretné látni az akkumulátor és az alapadatok állapotát, mielőtt megveszi az eszközt. Ez az oldal lépésről lépésre végigvezet rajta. Kb. 5 percet vesz igénybe, és nem kell semmit telepítened.</p>' +
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
    $('code').addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.keyCode === 13) begin(); });
    $('code').addEventListener('input', function () {
      var digits = this.value.replace(/\D/g, '');
      if (digits.length === this.value.replace(/[\s-]/g, '').length) this.value = digits.replace(/(\d{3})(?=\d)/g, '$1 ');
    });
  };

  function pickKind(kind) {
    if (state.kind !== kind) { state.route = ''; state.parsed = {}; }
    state.kind = kind;
    if (kind === 'mac') { go('mac_run'); return; }
    if (ON_COMPUTER) { go('usb_get'); return; }
    go('usb_ask');
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

  /* ---- akku, iPad és iPhone: USB ---- */

  SCREENS.usb_ask = function () {
    show(top() + progress(2) +
      '<h1>Van számítógéped?</h1>' +
      '<p class="lead">Ha igen, egy kis programmal USB-kábelen át kiolvashatjuk az akkumulátor adatát. Ez a legpontosabb, és minden eszközön működik. Ehhez ezt az oldalt a számítógépen kell megnyitnod, ahová az eszközt rákötöd.</p>' +
      choice('u-yes', 'Igen, USB-vel olvasom ki', 'Letöltesz egy kis programot, és a kimenetét bemásolod ide.', false) +
      choice('u-no', 'Nincs, vagy most nem szeretném', 'Akkor a Beállításokból vagy a rendszernaplóból próbáljuk.', false) +
      foot());
    on('u-yes', function () { go(ON_COMPUTER ? 'usb_get' : 'usb_switch'); });
    on('u-no', function () { go(afterUsb()); });
  };

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
      '<div class="note">A meghívókód a címben benne van, ott nem kell újra beírnod. A számítógépen az elejétől kezdd, és válaszd az USB-s utat. Itt az eszközön nem kell mást tenned.</div>' +
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
      '<p class="lead">Semmit nem kell bekapcsolnod az eszközön. Ennél az eszköznél az akkumulátor adatát egy USB-kábellel a számítógépre kötött kis program tudja kiolvasni.</p>' +
      choice('n-usb', 'Van számítógépem, USB-vel kiolvasom', 'Letöltesz egy kis programot, és a kimenetét bemásolod ide.', false) +
      choice('n-skip', 'Kihagyom az akkumulátort', 'A vásárló a riportban látni fogja, hogy erre az adatra még szükség van.', false) +
      foot());
    on('n-usb', function () { go(ON_COMPUTER ? 'usb_get' : 'usb_switch'); });
    on('n-skip', function () { clearBattery(); state.noLog = true; go('details'); });
  };

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

  /* ---- az eszköz adatai, előnézet, küldés ---- */

  SCREENS.details = function () {
    var v = state.vals, mac = state.kind === 'mac', cur = current();
    show(top() + progress(3) +
      '<h1>Az eszköz adatai</h1>' +
      '<p class="lead">Ezeket egyszer kérjük, hogy a vásárló össze tudja vetni a hirdetéssel. Ami előre ki van töltve, azt az előző lépésben olvastuk ki. Javíthatod.</p>' +
      textField('f-model', 'Modell', v.model, mac ? 'Például: MacBook Air' : 'Például: iPad Air (4. generáció)',
        (mac ? 'Apple menü &gt; Erről a Macről.' : cur.model) + ' Ne írj ide személyes adatot.', 60) +
      textField('f-storage', 'Tárhely', v.storage, 'Például: 64 GB', mac ? 'Apple menü &gt; Erről a Macről.' : 'A Névjegy oldalon, a Kapacitás sorban.', 20) +
      textField('f-os', 'Rendszerverzió', v.os, mac ? 'Például: 14.5' : 'Például: 17.4', mac ? 'Apple menü &gt; Erről a Macről.' : cur.version, 60) +
      textField('f-serial', 'Sorozatszám', v.serial, 'Például: C02XXXXXXXXX',
        mac ? 'Apple menü &gt; Erről a Macről.' : 'Beállítások &gt; Általános &gt; Névjegy &gt; Sorozatszám. Hosszan nyomva másolhatod.', 20,
        ' autocapitalize="characters"') +
      '<div class="note">A sorozatszámot elküldjük a vásárlónak, hogy az Apple lefedettség-ellenőrzőjén megnézhesse a modellt. Ha ezt nem szeretnéd, vedd ki a pipát: akkor <b>csak egy lenyomatot</b> küldünk, egy kódot, amiből a sorozatszám nem fejthető vissza, és az utolsó 4 karakterét.</div>' +
      '<label class="check"><input type="checkbox" id="share"' + (state.shareSerial ? ' checked' : '') + '> A sorozatszámot elküldöm a vásárlónak, hogy ellenőrizhesse az Apple-nél a modellt.</label>' +
      '<h2>Ki vagy jelentkezve az Apple-fiókodból?</h2>' +
      '<p class="muted">Ha az eszköz még a te Apple-fiókodhoz van kötve (Aktiválási zár), az új tulajdonos nem tudja használni. Kijelentkezés: ' + (mac ? 'Apple menü &gt; Rendszerbeállítások, legfelül a neved, majd Kijelentkezés.' : cur.signout) + '</p>' +
      '<label class="radio"><input type="radio" name="apple" value="yes"' + (state.apple === 'yes' ? ' checked' : '') + '> Kijelentkeztem, és a Keresés funkció ki van kapcsolva</label>' +
      '<label class="radio"><input type="radio" name="apple" value="no"' + (state.apple === 'no' ? ' checked' : '') + '> Még nem jelentkeztem ki</label>' +
      '<label class="radio"><input type="radio" name="apple" value="unsure"' + (state.apple === 'unsure' ? ' checked' : '') + '> Nem vagyok biztos benne</label>' +
      '<div id="msg"></div>' + foot('next', 'Tovább'));
    bindInput('f-model', 'model'); bindInput('f-storage', 'storage'); bindInput('f-os', 'os'); bindInput('f-serial', 'serial');
    $('share').addEventListener('change', function () { state.shareSerial = this.checked; });
    var radios = app.querySelectorAll('input[name=apple]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', function () { state.apple = this.value; });
    on('next', function () {
      if (state.vals.serial.trim() && !P.normalizeSerial(state.vals.serial)) {
        message('msg', '<div class="error">A sorozatszám 8 és 14 karakter hosszú, betűkből és számokból áll.</div>'); return;
      }
      if (!state.apple) { message('msg', '<div class="error">Válaszd ki, hogy ki vagy-e jelentkezve az Apple-fiókodból.</div>'); return; }
      go('review');
    });
  };

  SCREENS.review = function () {
    var d = collect();
    var sections = P.buildSections(d);
    var html = top() + progress(4) +
      '<h1>Ellenőrizd, mit küldünk el</h1>' +
      '<p class="lead">Az alábbi lista a teljes tartalom. Ezeken kívül semmi nem megy el.</p>';
    if (d.cycles === null && d.capacity === null) {
      html += '<div class="note warn">Nem adtál meg akkumulátor adatot. A vásárló ezt hiányként fogja látni.</div>';
    }
    for (var s = 0; s < sections.length; s++) {
      html += '<h2>' + esc(sections[s].title) + '</h2><div class="tablewrap"><table><thead><tr><th>Adat</th><th>Érték</th><th>Forrás</th></tr></thead><tbody>';
      for (var r = 0; r < sections[s].rows.length; r++) {
        var row = sections[s].rows[r];
        html += '<tr><td>' + esc(row.label) + '</td><td>' + esc(row.value) + '</td><td>' + esc(row.tag) + '</td></tr>';
      }
      html += '</tbody></table></div>';
    }
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

  /* ---------- indítás ---------- */

  var detected = DEVICE;
  var restored = restore();
  if (!restored) { state.path = ['welcome']; state.idx = 0; state.step = 'welcome'; }
  if (detected) state.detectedOs = detected.version;
  if (!state.osFamily) state.osFamily = detected ? familyOf(detected.major) : 'latest';
  if (detected && !state.vals.os) state.vals.os = detected.version;
  try { history.replaceState({ idx: state.idx }, ''); } catch (e) { /* nem baj */ }
  window.addEventListener('popstate', onPop);
  render();
})();
