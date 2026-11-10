// A backend/Code.gs tesztje: az Apps Script szolgáltatásokat egyszerű hamis változatok helyettesítik,
// a valódi Code.gs fut. Így a meghívó, az átadás (handoff) és a folytatás (resume) üzembe helyezés előtt kipróbálható.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function makeBackend() {
  const rows = [['Kód', 'Címke', 'Lejárat', 'Állapot', 'Utolsó esemény']];
  const cache = new Map();
  const props = new Map();
  const mails = [];
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    appendRow: (row) => { rows.push(row); },
    setFrozenRows: () => {},
    getRange: (row, col) => ({
      getValue: () => rows[row - 1][col - 1],
      setValue: (value) => { rows[row - 1][col - 1] = value; }
    })
  };
  const out = (text) => ({ text, setMimeType() { return this; } });
  const context = {
    SpreadsheetApp: { getActive: () => ({ getSheetByName: () => sheet }), getUi: () => ({}) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => { cache.set(k, String(v)); } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { props.set(k, String(v)); } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => out(text) },
    MailApp: { sendEmail: (mail) => { mails.push(mail); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.test' }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (_alg, text) => Array.from(crypto.createHash('sha256').update(text).digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (date) => date.toISOString().slice(0, 13)
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), context);
  function call(body) {
    return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  }
  function invite(code, status, hoursLeft) {
    rows.push([code, 'próba', new Date(Date.now() + (hoursLeft === undefined ? 72 : hoursLeft) * 3600 * 1000), status || 'új', '']);
  }
  return { call, invite, rows, mails };
}

const HANDOFF = { v: 1, kind: 'ios', osFamily: 'legacy', vals: { model: 'iPad mini', cycles: '245' }, hw: { motion: { status: 'ok', detail: 'mért mozgás' } } };

test('átadás és folytatás: az iPad feltölt, a számítógép a kóddal visszakapja, egy riport megy el', () => {
  const b = makeBackend();
  b.invite('123456789');
  const started = b.call({ action: 'start', code: '123 456 789' });
  assert.ok(started.ok);
  assert.ok(b.call({ action: 'handoff', sid: started.sid, data: HANDOFF }).ok);

  const resumed = b.call({ action: 'resume', code: '123-456-789' });
  assert.ok(resumed.ok && resumed.found);
  assert.strictEqual(resumed.sid, started.sid);
  assert.deepStrictEqual(resumed.data, HANDOFF);

  const sections = [{ title: 'Eszköz', rows: [{ label: 'Modell', value: 'iPad mini', status: 'ok', tag: 'USB-ből' }] }];
  assert.ok(b.call({ action: 'finish', sid: resumed.sid, serial: 'ABCD1234', sections }).ok);
  assert.strictEqual(b.mails.length, 1);
  assert.strictEqual(b.call({ action: 'finish', sid: resumed.sid, serial: 'X', sections }).ok, false);
  const after = b.call({ action: 'resume', code: '123456789' });
  assert.strictEqual(after.ok, false);
  assert.strictEqual(after.code, 'bad_code');
});

test('folytatás új meghívónál nem használja el a meghívót', () => {
  const b = makeBackend();
  b.invite('222333444');
  assert.deepStrictEqual(b.call({ action: 'resume', code: '222333444' }), { ok: true, found: false });
  assert.strictEqual(b.rows[1][3], 'új');
  assert.ok(b.call({ action: 'start', code: '222333444' }).ok);
});

test('folytatás: ismeretlen és lejárt kód kódhibát jelez, a próbálkozások korlátozottak', () => {
  const b = makeBackend();
  b.invite('333444555', 'új', -1);
  const expired = b.call({ action: 'resume', code: '333444555' });
  assert.strictEqual(expired.ok, false);
  assert.strictEqual(expired.code, 'bad_code');
  let last;
  for (let i = 0; i < 40; i++) last = b.call({ action: 'resume', code: '999999999' });
  assert.strictEqual(last.ok, false);
  assert.match(last.error, /Túl sok/);
});

test('folytatás: folyamatban lévő meghívó átadás nélkül kódhibát ad', () => {
  const b = makeBackend();
  b.invite('444555666');
  assert.ok(b.call({ action: 'start', code: '444555666' }).ok);
  const r = b.call({ action: 'resume', code: '444555666' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'bad_code');
});

test('átadás: érvénytelen session, nem objektum és túl nagy adat elutasítva', () => {
  const b = makeBackend();
  b.invite('555666777');
  const { sid } = b.call({ action: 'start', code: '555666777' });
  assert.strictEqual(b.call({ action: 'handoff', sid: 'NEMLETEZIK1', data: HANDOFF }).ok, false);
  assert.strictEqual(b.call({ action: 'handoff', sid, data: 'szöveg' }).ok, false);
  assert.strictEqual(b.call({ action: 'handoff', sid, data: [1, 2] }).ok, false);
  assert.strictEqual(b.call({ action: 'handoff', sid, data: { big: 'x'.repeat(21000) } }).ok, false);
  assert.ok(b.call({ action: 'handoff', sid, data: HANDOFF }).ok);
});

test('az átadott adatot a szerver nem módosítja és nem tárol másik helyen, mint a session', () => {
  const b = makeBackend();
  b.invite('666777888');
  const { sid } = b.call({ action: 'start', code: '666777888' });
  b.call({ action: 'handoff', sid, data: HANDOFF });
  const sheetText = JSON.stringify(b.rows);
  assert.ok(sheetText.indexOf('mért mozgás') < 0, 'a Táblába nem kerül átadott adat');
});
