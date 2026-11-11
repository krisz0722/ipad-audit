// A backend/Code.gs tesztje: az Apps Script szolgáltatásokat egyszerű hamis változatok helyettesítik, a valódi Code.gs fut.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function makeBackend(label) {
  const rows = [['Kód', 'Címke', 'Lejárat', 'Állapot', 'Utolsó esemény']];
  const cache = new Map();
  const props = new Map();
  const mails = [];
  const dialogs = [];
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
  const ui = {
    Button: { OK: 'OK' }, ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
    prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => label || 'Jófogás' }),
    showModalDialog: (html, title) => { dialogs.push({ html: html.html, title }); }
  };
  const context = {
    SpreadsheetApp: { getActive: () => ({ getSheetByName: () => sheet }), getUi: () => ui },
    HtmlService: { createHtmlOutput: (html) => ({ html, setWidth() { return this; }, setHeight() { return this; } }) },
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
  const call = (body) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const invite = (code, status, hoursLeft) => {
    rows.push([code, 'próba', new Date(Date.now() + (hoursLeft === undefined ? 72 : hoursLeft) * 3600 * 1000), status || 'új', '']);
  };
  return { call, invite, rows, mails, dialogs, context };
}

const SECTIONS = [{ title: 'Eszköz', rows: [{ label: 'Modell', value: 'iPad mini', status: 'ok', tag: 'USB-ből' }] }];

test('a kód 9 számjegy, az első nem nulla', () => {
  const b = makeBackend();
  for (let i = 0; i < 300; i++) {
    const code = b.context.randomDigits_(9);
    assert.match(code, /^[1-9][0-9]{8}$/);
  }
});

test('az Új meghívó teljes, előtöltött linket és másolható üzenetet ad, a Táblába is beírja', () => {
  const b = makeBackend('Air 2');
  b.context.newInvite();
  assert.strictEqual(b.rows.length, 2);
  const row = b.rows[1];
  const code = String(row[0]);
  assert.match(code, /^[1-9][0-9]{8}$/);
  assert.strictEqual(row[3], 'új');
  assert.strictEqual(row[5], 'https://apple.audit.kokocloud.space/#' + code, 'a link a Link oszlopba kerül');
  assert.strictEqual(b.rows[0][5], 'Link', 'a hiányzó fejléc pótlódik');
  assert.strictEqual(b.dialogs.length, 1);
  const html = b.dialogs[0].html;
  assert.ok(html.indexOf('https://apple.audit.kokocloud.space/#' + code) >= 0);
  assert.ok(html.indexOf('Másolás') >= 0);
  assert.ok(html.indexOf(code.slice(0, 3) + ' ' + code.slice(3, 6) + ' ' + code.slice(6)) >= 0, 'a kód három számjegyes csoportokban is látszik');
  assert.ok(html.indexOf('72 óráig érvényes') >= 0);
});

test('az üzenet nem kér semmit az eladótól, csak a linket és a kódot adja', () => {
  const b = makeBackend();
  const message = b.context.inviteMessage_('123456789');
  assert.match(message, /https:\/\/apple\.audit\.kokocloud\.space\/#123456789/);
  assert.match(message, /123 456 789/);
  assert.ok(!/majd küld|útmutató/.test(message));
});

test('a start: érvényes kód munkamenetet ad, a második próba már felhasznált', () => {
  const b = makeBackend();
  b.invite('123456789');
  const started = b.call({ action: 'start', code: '123 456-789' });
  assert.ok(started.ok && started.sid);
  assert.strictEqual(b.rows[1][3], 'folyamatban');
  const again = b.call({ action: 'start', code: '123456789' });
  assert.strictEqual(again.ok, false);
  assert.match(again.error, /már felhasználták/);
});

test('a start: ismeretlen és lejárt kód elutasítva', () => {
  const b = makeBackend();
  b.invite('222333444', 'új', -1);
  assert.match(b.call({ action: 'start', code: '222333444' }).error, /lejárt/);
  assert.match(b.call({ action: 'start', code: '999999999' }).error, /nem érvényes/);
});

test('a start: óránként legfeljebb 30 hibás próba, utána minden kérés elutasítva', () => {
  const b = makeBackend();
  b.invite('123456789');
  for (let i = 0; i < 30; i++) b.call({ action: 'start', code: '999999999' });
  const blocked = b.call({ action: 'start', code: '123456789' });
  assert.strictEqual(blocked.ok, false);
  assert.match(blocked.error, /Túl sok hibás próbálkozás/);
});

test('a finish: egy email megy el, a tárgyban a sorozatszám lenyomata áll, második küldés elutasítva', () => {
  const b = makeBackend();
  b.invite('123456789');
  const { sid } = b.call({ action: 'start', code: '123456789' });
  assert.ok(b.call({ action: 'finish', sid, serial: 'ABCD1234EF56', sections: SECTIONS }).ok);
  assert.strictEqual(b.mails.length, 1);
  assert.strictEqual(b.mails[0].to, 'owner@example.test');
  assert.match(b.mails[0].subject, /^iPad audit: próba \/ ABCD1234EF56$/);
  assert.ok(b.mails[0].body.indexOf('Modell: iPad mini [USB-ből]') >= 0);
  assert.strictEqual(b.rows[1][3], 'riport elküldve');
  const second = b.call({ action: 'finish', sid, serial: 'X', sections: SECTIONS });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(b.mails.length, 1);
});

test('a finish: érvénytelen munkamenet és hibás riport elutasítva', () => {
  const b = makeBackend();
  b.invite('123456789');
  assert.strictEqual(b.call({ action: 'finish', sid: 'NEMLETEZIK1', serial: 'X', sections: SECTIONS }).ok, false);
  const { sid } = b.call({ action: 'start', code: '123456789' });
  assert.strictEqual(b.call({ action: 'finish', sid, serial: 'X', sections: 'nem lista' }).ok, false);
  assert.strictEqual(b.mails.length, 0);
});

test('a finish: a napi riportkeret 20 email, a 21. elutasítva', () => {
  const b = makeBackend();
  const results = [];
  for (let i = 0; i < 21; i++) {
    const code = String(100000001 + i);
    b.invite(code);
    const { sid } = b.call({ action: 'start', code });
    results.push(b.call({ action: 'finish', sid, serial: 'X', sections: SECTIONS }));
  }
  assert.strictEqual(results.filter((r) => r.ok).length, 20);
  assert.strictEqual(results[20].ok, false);
  assert.match(results[20].error, /napi riportkeretet/);
  assert.strictEqual(b.mails.length, 20);
});

test('a szerver nem tárol átadott eredményt: a handoff és a resume ismeretlen művelet', () => {
  const b = makeBackend();
  b.invite('123456789');
  const { sid } = b.call({ action: 'start', code: '123456789' });
  assert.strictEqual(b.call({ action: 'handoff', sid, data: { x: 1 } }).error, 'Ismeretlen művelet.');
  assert.strictEqual(b.call({ action: 'resume', code: '123456789' }).error, 'Ismeretlen művelet.');
});
