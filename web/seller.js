// Az eladói varázsló. Független az átvételi oldal USB-s folyamatától (receiver/app.js).
// Minden adat a böngészőben marad, amíg az eladó a végén meg nem nyomja a Küldés gombot.
(function () {
  'use strict';

  var P = window.SellerParse;
  var app = document.getElementById('app');
  var hash = (location.hash || '').replace('#', '').trim().toUpperCase();
  var DEMO = hash === 'DEMO';
  var CODE_PATTERN = /^(?:[0-9]{9}|[0-9A-Z]{12})$/;
  var CODE = CODE_PATTERN.test(hash) ? hash : '';
  var MAX_FILE = 50 * 1024 * 1024;

  // Csak olvas, nem ír, nem csatlakozik a hálózatra. A profiles kimenetéből csak a két igen/nem sor jön át,
  // mert a teljes kimenet a felügyeleti szerver címét is tartalmazhatja.
  var MAC_COMMAND =
    "sw_vers -productVersion; " +
    "system_profiler -xml SPHardwareDataType | grep -A1 -E '<key>(machine_name|machine_model|chip_type|cpu_type|physical_memory|serial_number|activation_lock_status)</key>'; " +
    "system_profiler -xml SPPowerDataType | grep -A1 -E '<key>(sppower_battery_cycle_count|sppower_battery_health|sppower_battery_health_maximum_capacity)</key>'; " +
    "profiles status -type enrollment | grep -E 'Enrolled via DEP|MDM enrollment'; " +
    "df -k /System/Volumes/Data | tail -1";

  var state = {
    step: '', osFamily: '', detectedOs: '',
    kind: '', route: '',
    vals: { model: '', storage: '', os: '', memory: '', chip: '', serial: '', cycles: '', capacity: '' },
    parsed: {},
    extra: { condition: '', fileDate: '', activationLock: '', dep: null, mdm: null, modelId: '' },
    shareSerial: false, apple: '', sid: '', sending: false
  };

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
  function nav(backId, nextId, nextLabel) {
    return '<div class="nav"><button type="button" class="btn secondary" id="' + backId + '">Vissza</button>' +
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
  function message(id, html) { var node = $(id); if (node) node.innerHTML = html; }
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

  /* ---------- rendszerverzió szerinti lépések ---------- */

  // Az iOS 9 menünevei egy valódi, magyar nyelvű iPad mini fényképeiről vannak leolvasva. A többi rendszeré az Apple magyar
  // oldalairól és magyar útmutatókból származik, valódi eszközön még ellenőrizendő.
  var OS_LABELS = { legacy: 'iOS 9 vagy 10', mid: 'iOS 11 vagy 12', modern: 'iPadOS 13 vagy 14', latest: 'iPadOS 15 vagy újabb' };
  var OS_ORDER = ['legacy', 'mid', 'modern', 'latest'];
  var OS_STEPS = {
    legacy: {
      paste: true, batteryScreen: false,
      path: '<b>Beállítások &gt; Adatvédelem</b>, majd a lista legalján a <b>Diagn. és használat</b> sor',
      toggle: 'Ha az <b>Automatikus küldés</b> helyett a <b>Küldés mellőzése</b> van kipipálva, válaszd az <b>Automatikus küldés</b> lehetőséget.',
      list: 'Koppints a <b>Diag. és használati adatok</b> sorra. A lista betűrendben van, keresd a <b>log-aggregated-...</b> kezdetű bejegyzést (az l betűnél), és válaszd a legfrissebb dátumút.',
      model: 'Beállítások &gt; Általános &gt; Névjegy &gt; Modell. Itt egy kódot látsz (például MD328HC/A), azt is beírhatod.',
      version: 'Beállítások &gt; Általános &gt; Névjegy &gt; Verzió.',
      signout: 'Beállítások &gt; iCloud, legalul Kijelentkezés (Sign Out). iOS 10.3 vagy újabb rendszeren legfelül a neved, lent Kijelentkezés.'
    },
    mid: {
      paste: true, batteryScreen: true,
      path: '<b>Beállítások &gt; Adatvédelem &gt; Elemzés</b> (Analytics)',
      toggle: 'Ha az <b>iPad / iPhone elemzésének megosztása</b> (Share iPad Analytics) ki van kapcsolva, kapcsold be.',
      list: 'Koppints az <b>Elemzési adatok</b> (Analytics Data) pontra, és keresd meg a legfrissebb <b>log-aggregated-...</b> nevű bejegyzést.',
      model: 'Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév vagy Modell.',
      version: 'Beállítások &gt; Általános &gt; Névjegy &gt; Verzió.',
      signout: 'Beállítások, legfelül a neved, lent Kijelentkezés.'
    },
    modern: {
      paste: false, batteryScreen: true,
      path: '<b>Beállítások &gt; Adatvédelem &gt; Elemzések és fejlesztések</b>',
      toggle: 'Ha az <b>iPad / iPhone elemzésének megosztása</b> ki van kapcsolva, kapcsold be.',
      list: 'Koppints az <b>Elemzési adatok</b> pontra, és keresd meg a legfrissebb <b>Analytics-...</b> kezdetű fájlt.',
      model: 'Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév.',
      version: 'Beállítások &gt; Általános &gt; Névjegy &gt; Szoftververzió.',
      signout: 'Beállítások, legfelül a neved, lent Kijelentkezés.'
    },
    latest: {
      paste: false, batteryScreen: true,
      path: '<b>Beállítások &gt; Adatvédelem és biztonság &gt; Elemzések és fejlesztések</b>',
      toggle: 'Ha az <b>iPad / iPhone elemzésének megosztása</b> ki van kapcsolva, kapcsold be.',
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

  /* ---------- állapotmentés: egy régi iPad a Beállításokból visszatérve gyakran újratölti a lapot ---------- */

  var STORE_KEY = 'ipad-audit-seller-v1';
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ demo: DEMO, code: CODE, state: state })); } catch (e) { /* privát mód: enélkül is működik */ }
  }
  function forget() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* nem baj */ }
  }
  function restore() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
      if (!saved || !saved.state || !STEPS[saved.state.step] || saved.state.step === 'welcome') return false;
      if (CODE && saved.code && CODE !== saved.code) return false;
      DEMO = !!saved.demo; CODE = saved.code || '';
      for (var key in saved.state) { if (Object.prototype.hasOwnProperty.call(saved.state, key)) state[key] = saved.state[key]; }
      state.sending = false;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- az elküldendő adatok egyetlen helyen ---------- */

  function collect() {
    var v = state.vals, p = state.parsed, e = state.extra;
    var origin = state.route === 'file' ? (current().paste ? 'naplóból' : 'fájlból') : (state.route === 'command' ? 'parancsból' : 'beírta');
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
      cycles: toInt(v.cycles, 0, 5000), capacity: toInt(v.capacity, 40, 100),
      condition: e.condition, fileDate: e.fileDate,
      apple: state.apple, activationLock: e.activationLock, dep: e.dep, mdm: e.mdm,
      sources: {
        model: src('model'), chip: src('chip'), memory: src('memory'), storage: src('storage'),
        os: (v.os && v.os === state.detectedOs) ? 'böngészőből' : src('os'),
        serial: src('serial'), cycles: src('cycles'), capacity: src('capacity'),
        condition: e.condition ? 'parancsból' : '', activationLock: e.activationLock ? 'parancsból' : '',
        mdm: (e.dep !== null || e.mdm !== null) ? 'parancsból' : ''
      }
    };
  }

  /* ---------- képernyők ---------- */

  function begin() {
    var typed = $('code') ? $('code').value : '';
    var text = String(typed).toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (text === 'DEMO') { DEMO = true; CODE = ''; kind(); return; }
    if (!CODE_PATTERN.test(text)) {
      message('msg', '<div class="error">A meghívókód 9 számjegyből áll. Ellenőrizd, hogy pontosan úgy írtad-e be, ahogy kaptad.</div>');
      return;
    }
    DEMO = false; CODE = text;
    kind();
  }

  function welcome() {
    state.step = 'welcome';
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
          '<li>a sorozatszám lenyomata, nem maga a sorozatszám</li>' +
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
      '<div class="note"><b>Fontos:</b> ezt az oldalt azon az eszközön nyisd meg, amelyet eladsz.</div>' +
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
  }

  function kind() {
    state.step = 'kind';
    show(top() + progress(1) +
      '<h1>Milyen eszközt adsz el?</h1>' +
      '<p>Ettől függ, hogyan olvassuk ki az akkumulátor adatait.</p>' +
      choice('k-ios', 'iPad vagy iPhone', 'Az adatokat a Beállításokból olvassuk ki. Nem kell semmit telepítened.', state.kind === 'ios') +
      choice('k-mac', 'Mac', 'MacBook, iMac vagy Mac mini. Egy rövid, csak olvasó parancsot futtatsz a Terminálban.', state.kind === 'mac') +
      '<div class="nav"><button type="button" class="btn secondary" id="back">Vissza</button></div>');
    on('k-ios', function () { if (state.kind !== 'ios') { state.route = ''; state.parsed = {}; } state.kind = 'ios'; data(); });
    on('k-mac', function () { if (state.kind !== 'mac') { state.route = ''; state.parsed = {}; } state.kind = 'mac'; data(); });
    on('back', welcome);
  }

  function data() { state.step = 'data'; if (state.kind === 'mac') dataMac(); else dataIos(); }

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
    details();
  }

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

  function shareNote(s) {
    return ' Ez névtelen használati adatot küld az Apple-nek, később visszakapcsolhatod. A ' + (s.paste ? 'napló' : 'fájl') +
      ' legfeljebb egy nap múlva jelenik meg. Akkor térj vissza erre az oldalra, a link a kiküldéstől számított 72 óráig érvényes.';
  }

  function pasteSteps(s) {
    return '<h2>Az akkumulátor adatai a rendszernaplóból</h2>' +
      '<p>Az eszköz a ciklusszámot egy diagnosztikai naplóban tárolja. Ezt a naplót másolod ide, az oldal csak ezen az eszközön olvassa ki belőle a ciklusszámot és a kapacitást.</p>' +
      '<ol class="steps">' +
        '<li>Nyisd meg: ' + s.path + '.</li>' +
        '<li>' + s.toggle + shareNote(s) + '</li>' +
        '<li>' + s.list + '</li>' +
        '<li>Érintsd meg hosszan a szöveget, válaszd a <b>Mindet kijelöl</b> (Select All), majd a <b>Másolás</b> (Copy) lehetőséget.</li>' +
        '<li>Térj vissza ide, érintsd meg hosszan az alábbi mezőt, válaszd a <b>Beillesztés</b> (Paste) lehetőséget, majd koppints a Beolvasás gombra:' +
          '<label class="field"><textarea id="paste" placeholder="Ide illeszd be a napló szövegét" spellcheck="false"></textarea></label>' +
          '<button type="button" class="btn small" id="parse-log">Beolvasás</button></li>' +
      '</ol>' +
      '<div class="note">A beillesztett szöveget a beolvasás után töröljük a mezőből. Belőle kizárólag a ciklusszámot, a kapacitást, a rendszerverziót és a napló dátumát vesszük ki. Ha más adat is van benne (például alkalmazások nevei), azt nem olvassuk ki és nem küldjük el.</div>' +
      '<div id="fileResult"></div>';
  }

  function fileSteps(s) {
    return '<h2>Az akkumulátor adatai a rendszerfájlból</h2>' +
      '<p>Az eszköz a ciklusszámot egy analitikai fájlban tárolja. Ezt a fájlt választod ki az oldalon. Az oldal csak ezen az eszközön olvassa, nem tölti fel.</p>' +
      '<ol class="steps">' +
        '<li>Nyisd meg: ' + s.path + '.</li>' +
        '<li>' + s.toggle + shareNote(s) + '</li>' +
        '<li>' + s.list + '</li>' +
        '<li>Nyisd meg, koppints a <b>Megosztás</b> gombra, majd a <b>Mentés a Fájlokba</b> pontra.</li>' +
        '<li>Térj vissza ide, és válaszd ki a mentett fájlt:<br><input type="file" id="file"></li>' +
      '</ol>' +
      '<div class="note">A fájlból kizárólag a ciklusszámot, a kapacitást, a rendszerverziót és a fájl dátumát vesszük ki. Ha más adat is van benne (például alkalmazások nevei), azt nem olvassuk ki és nem küldjük el.</div>' +
      '<div id="fileResult"></div>';
  }

  function dataIos() {
    var s = current();
    var r = s.batteryScreen ? state.route : (state.route = 'file');
    var html = top() + progress(2) +
      '<h1>Az akkumulátor állapota</h1>' +
      '<p class="lead">Két számot keresünk: a <b>ciklusszámot</b> (hányszor töltötték fel teljesen) és a <b>maximális kapacitást</b> (az eredeti kapacitás hány százalékát tudja még tárolni).</p>' +
      osSelect();
    if (s.batteryScreen) {
      html += '<h2>Látod az akku állapotát a Beállításokban?</h2>' +
        '<p>Nyisd meg: <b>Beállítások &gt; Akkumulátor &gt; Akkumulátor állapota</b>. Nem minden iPad és iPhone mutatja ezt.</p>' +
        choice('r-screen', 'Igen, látom a számokat', 'Beírod a két értéket.', r === 'screen') +
        choice('r-file', 'Nem, ilyen képernyőt nem látok', 'Az eszköz egy rendszernaplóból is megadja őket. Végigvezetünk rajta.', r === 'file');
    } else {
      html += '<div class="note">Ezen a rendszerverzión a Beállítások nem mutatja az akkumulátor állapotát. Az eszköz egy rendszernaplóból adja meg a ciklusszámot, ehhez végigvezetünk.</div>';
    }
    if (r === 'file') html += s.paste ? pasteSteps(s) : fileSteps(s);
    if (r) html += batteryFields();
    html += nav('back', r ? 'next' : '', 'Tovább');
    if (r) html += '<p><button type="button" class="link" id="skip">Ezt most kihagyom</button></p>';
    show(html);
    on('r-screen', function () { state.route = 'screen'; dataIos(); });
    on('r-file', function () { state.route = 'file'; dataIos(); });
    on('back', kind);
    on('next', batteryNext);
    on('skip', function () { state.vals.cycles = ''; state.vals.capacity = ''; details(); });
    bindInput('capacity', 'capacity'); bindInput('cycles', 'cycles');
    var select = $('osfam');
    if (select) select.addEventListener('change', function () { state.osFamily = this.value; dataIos(); });
    var file = $('file');
    if (file) file.addEventListener('change', onFile);
    on('parse-log', function () {
      var area = $('paste');
      applyIpadText(area ? area.value : '');
      if (area) area.value = '';
    });
  }

  function applyIpadText(text) {
    var r = P.parseIpadFile(String(text));
    var what = current().paste ? 'szöveg' : 'fájl';
    state.parsed = {};
    if (r.cycles !== null) { state.parsed.cycles = String(r.cycles); state.vals.cycles = String(r.cycles); }
    if (r.capacity !== null) { state.parsed.capacity = String(r.capacity); state.vals.capacity = String(r.capacity); }
    if (r.os) { state.parsed.os = r.os; state.vals.os = r.os; }
    state.extra.fileDate = r.fileDate;
    save();
    if ($('cycles')) $('cycles').value = state.vals.cycles;
    if ($('capacity')) $('capacity').value = state.vals.capacity;
    if (r.cycles === null && r.capacity === null) {
      message('fileResult', '<div class="error">Ebben a ' + what + 'ben nem találtunk akkumulátor adatot. Próbáld a következő legfrissebb bejegyzést, vagy írd be az értékeket lent kézzel, ha látod őket valahol.</div>');
      return;
    }
    message('fileResult', '<div class="result"><dl>' +
      '<dt>Ciklusszám</dt><dd>' + esc(r.cycles === null ? 'nem található' : r.cycles) + '</dd>' +
      '<dt>Maximális kapacitás</dt><dd>' + esc(r.capacity === null ? 'nem található' : r.capacity + '%') + '</dd>' +
      (r.fileDate ? '<dt>A ' + what + ' kelte</dt><dd>' + esc(r.fileDate) + '</dd>' : '') +
      '</dl></div><div class="success">Kész. A ' + what + ' nem hagyta el az eszközt. Az értékeket lent javíthatod.</div>');
  }

  function onFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > MAX_FILE) { message('fileResult', '<div class="error">A fájl túl nagy. Válassz másikat.</div>'); return; }
    message('fileResult', '<p class="muted">Olvasás...</p>');
    var reader = new FileReader();
    reader.onload = function () { applyIpadText(reader.result); };
    reader.onerror = function () { message('fileResult', '<div class="error">A fájl nem olvasható. Válassz másikat.</div>'); };
    reader.readAsText(file);
  }

  function dataMac() {
    if (!state.route) state.route = 'command';
    var html = top() + progress(2) + '<h1>A Mac adatai</h1>';
    if (state.route === 'manual') {
      html +=
        '<p class="lead">Az akkumulátor adatait a Rendszerinformációban is megtalálod.</p>' +
        '<ol class="steps">' +
          '<li>Tartsd lenyomva az <b>Option</b> billentyűt, és kattints az Apple menüre, majd a <b>Rendszerinformáció</b> pontra.</li>' +
          '<li>A bal oldalon nyisd meg az <b>Áramellátás</b> pontot.</li>' +
          '<li>Írd be a <b>ciklusszámot</b> és a <b>maximális kapacitást</b> (ha nincs, hagyd üresen).</li>' +
        '</ol>' + batteryFields() +
        '<p><button type="button" class="link" id="to-command">Mégis futtatom a parancsot</button></p>';
    } else {
      var parts = [
        ['<code>sw_vers -productVersion</code>', 'a macOS verziószáma'],
        ['<code>system_profiler -xml SPHardwareDataType</code> és <code>grep</code>', 'a Mac típusa, chipje, memóriája, sorozatszáma és az Aktiválási zár állapota. A gép nevét, az azonosítókat és a hálózati adatokat nem írja ki.'],
        ['<code>system_profiler -xml SPPowerDataType</code> és <code>grep</code>', 'az akkumulátor ciklusszáma, állapota és maximális kapacitása'],
        ['<code>profiles status -type enrollment</code> és <code>grep</code>', 'csak két igen/nem válasz arról, van-e céges vagy iskolai felügyelet. A szervezet nevét és a szerver címét nem írja ki.'],
        ['<code>df -k</code> és <code>tail</code>', 'a tárhely mérete']
      ];
      var rows = '';
      for (var i = 0; i < parts.length; i++) rows += '<tr><td>' + parts[i][0] + '</td><td>' + parts[i][1] + '</td></tr>';
      html +=
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
          '<li>Jelöld ki a Terminál teljes szövegét (<b>Cmd + A</b>), másold ki (<b>Cmd + C</b>), és illeszd be ide:' +
            '<label class="field"><textarea id="paste" placeholder="Ide illeszd be a Terminál szövegét" spellcheck="false"></textarea></label>' +
            '<button type="button" class="btn small" id="parse">Beolvasás</button></li>' +
        '</ol>' +
        '<div id="parsed"></div>' +
        '<details><summary>Mit jelentenek a parancs részei?</summary><div class="tablewrap"><table><thead><tr><th>Rész</th><th>Mit olvas</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>' +
        '<p><button type="button" class="link" id="to-manual">Inkább nem futtatok parancsot</button></p>';
    }
    html += nav('back', 'next', 'Tovább');
    show(html);
    on('back', kind);
    on('next', batteryNext);
    on('to-manual', function () { state.route = 'manual'; state.parsed = {}; dataMac(); });
    on('to-command', function () { state.route = 'command'; dataMac(); });
    on('copy', function () {
      copyText(MAC_COMMAND, function (ok) {
        message('copied', ok ? ' Kimásolva.' : ' Nem sikerült. Jelöld ki a parancsot, és másold ki kézzel.');
      });
    });
    on('parse', parseMac);
    bindInput('capacity', 'capacity'); bindInput('cycles', 'cycles');
  }

  function parseMac() {
    var r = P.parseMacOutput($('paste') ? $('paste').value : '');
    if (!r.valid) {
      message('parsed', '<div class="error">Ebben a szövegben nem találtuk a parancs kimenetét. Ellenőrizd, hogy a teljes Terminál-szöveget másoltad ki, vagy futtasd újra a parancsot.</div>');
      return;
    }
    state.parsed = {};
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
    message('parsed', '<div class="result"><dl>' +
      line('Modell', r.model ? r.model + (r.modelId ? ' (' + r.modelId + ')' : '') : '') + line('Chip', r.chip) + line('Memória', r.memory) +
      line('Tárhely', r.storage) + line('macOS', r.os) + line('Ciklusszám', r.cycles) +
      line('Maximális kapacitás', r.capacity === null ? '' : r.capacity + '%') + line('Akku állapota', r.condition) +
      line('Aktiválási zár', lock) + line('Céges felügyelet', mdm) + line('Sorozatszám', r.serial) +
      '</dl></div><div class="success">Kész. A beillesztett szöveget töröltük a mezőből, csak a fenti értékeket használjuk.</div>');
    if ($('capacity')) $('capacity').value = state.vals.capacity;
    if ($('cycles')) $('cycles').value = state.vals.cycles;
  }

  function details() {
    state.step = 'details';
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
      '<div class="note">A sorozatszámból alapértelmezés szerint <b>csak egy lenyomatot</b> küldünk, egy kódot, amiből a sorozatszám nem fejthető vissza, és az utolsó 4 karakterét. A vásárló átvételkor kiszámolja ugyanezt a készülékről, így ellenőrzi, hogy ugyanaz az eszköz érkezett-e meg.</div>' +
      '<label class="check"><input type="checkbox" id="share"' + (state.shareSerial ? ' checked' : '') + '> A teljes sorozatszámot is megosztom, hogy a vásárló le tudja ellenőrizni az Apple jótállási adatait. (Nem kötelező.)</label>' +
      '<h2>Ki vagy jelentkezve az Apple-fiókodból?</h2>' +
      '<p class="muted">Ha az eszköz még a te Apple-fiókodhoz van kötve (Aktiválási zár), az új tulajdonos nem tudja használni. Kijelentkezés: ' + (mac ? 'Apple menü &gt; Rendszerbeállítások, legfelül a neved, majd Kijelentkezés.' : cur.signout) + '</p>' +
      '<label class="radio"><input type="radio" name="apple" value="yes"' + (state.apple === 'yes' ? ' checked' : '') + '> Kijelentkeztem, és a Keresés funkció ki van kapcsolva</label>' +
      '<label class="radio"><input type="radio" name="apple" value="no"' + (state.apple === 'no' ? ' checked' : '') + '> Még nem jelentkeztem ki</label>' +
      '<label class="radio"><input type="radio" name="apple" value="unsure"' + (state.apple === 'unsure' ? ' checked' : '') + '> Nem vagyok biztos benne</label>' +
      '<div id="msg"></div>' + nav('back', 'next', 'Tovább'));
    bindInput('f-model', 'model'); bindInput('f-storage', 'storage'); bindInput('f-os', 'os'); bindInput('f-serial', 'serial');
    $('share').addEventListener('change', function () { state.shareSerial = this.checked; });
    var radios = app.querySelectorAll('input[name=apple]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', function () { state.apple = this.value; });
    on('back', data);
    on('next', function () {
      if (state.vals.serial.trim() && !P.normalizeSerial(state.vals.serial)) {
        message('msg', '<div class="error">A sorozatszám 8 és 14 karakter hosszú, betűkből és számokból áll.</div>'); return;
      }
      if (!state.apple) { message('msg', '<div class="error">Válaszd ki, hogy ki vagy-e jelentkezve az Apple-fiókodból.</div>'); return; }
      review();
    });
  }

  function review() {
    state.step = 'review';
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
    on('back', details);
    $('consent').addEventListener('change', function () { $('send').disabled = !this.checked; });
    on('send', function () { send(sections, d); });
  }

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
    if (state.sending) return;
    var serialField = d.serialRaw || d.fingerprint || 'nincs';
    if (DEMO) { done(sections); return; }
    if (!window.BACKEND_URL) { message('msg', '<div class="error">Az oldal nincs beállítva. Szólj a vásárlónak.</div>'); return; }
    state.sending = true;
    $('send').disabled = true;
    message('msg', '<p class="muted">Küldés...</p>');
    var started = state.sid ? Promise.resolve(state.sid) : post({ action: 'start', code: CODE }).then(function (r) {
      if (!r || !r.ok) throw serverError((r && r.error ? r.error : 'A link nem érvényes.') + ' Kérj új linket a vásárlótól.');
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
      $('send').disabled = false;
      message('msg', '<div class="error">' + esc(error && error.fromServer ? error.message : 'Nincs kapcsolat a szerverrel. Ellenőrizd az internetet, és próbáld újra a Küldés gombbal.') + '</div>');
    });
  }

  function done(sections) {
    var html = top() + '<h1>Köszönjük!</h1>' +
      '<div class="success">Az adatok elmentek a vásárlónak. Az oldalt bezárhatod.</div>' +
      '<p>Ezen az eszközön nem tároltunk semmit.</p>';
    if (state.route === 'file') {
      html += '<p>Ha az elemzés megosztását csak ehhez kapcsoltad be, a Beállításokban visszakapcsolhatod: ' + current().path + '.</p>';
    }
    if (DEMO) {
      html += '<details><summary>Ezt küldtük volna (próbaüzem)</summary><pre class="code">' + esc(JSON.stringify(sections, null, 2)) + '</pre></details>';
    }
    show(html);
    forget();
  }

  var STEPS = { welcome: welcome, kind: kind, data: data, details: details, review: review };

  var detected = P.detectOs(navigator.userAgent, navigator.maxTouchPoints || 0);
  var restored = restore();
  if (detected) state.detectedOs = detected.version;
  if (!state.osFamily) state.osFamily = detected ? familyOf(detected.major) : 'latest';
  if (detected && !state.vals.os) state.vals.os = detected.version;
  if (restored) STEPS[state.step](); else welcome();
})();
