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

