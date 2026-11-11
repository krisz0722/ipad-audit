// Az eladói varázsló kiolvasóinak tesztje. Futtatás: node --test tests/seller_parse.test.js
// A minták kitalált, szintetikus adatok. A valódi iPad fájl és a valódi Mac kimenet formátumát
// egy valódi eszközön külön ellenőrizni kell.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const P = require('../web/parse.js');

test('sha256Hex egyezik a Node crypto eredményével', () => {
  const inputs = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(200), 'árvíztűrő tükörfúrógép'];
  inputs.forEach((text) => {
    assert.strictEqual(P.sha256Hex(text), crypto.createHash('sha256').update(text).digest('hex'), 'hiba: ' + text.length);
  });
});

test('fingerprint 16 hex karakter, a kódtól függ, üres sorozatszámra üres', () => {
  const a = P.fingerprint('ABCDEFGHJKMN', 'C02XYZ123456');
  const b = P.fingerprint('NMKJHGFEDCBA', 'C02XYZ123456');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notStrictEqual(a, b);
  assert.strictEqual(P.fingerprint('ABCDEFGHJKMN', ''), '');
});

test('normalizeSerial', () => {
  assert.strictEqual(P.normalizeSerial(' c02-xyz 123456 '), 'C02XYZ123456');
  assert.strictEqual(P.normalizeSerial('123'), '');
  assert.strictEqual(P.normalizeSerial('A'.repeat(15)), '');
});

test('storageLabel kerekít a szokásos méretre', () => {
  assert.strictEqual(P.storageLabel(494.4e9), '512 GB');
  assert.strictEqual(P.storageLabel(245e9), '256 GB');
  assert.strictEqual(P.storageLabel(994e9), '1 TB');
  assert.strictEqual(P.storageLabel(0), '');
});

test('parseIpadFile: JSON sorok, a tervezett ciklusszám kimarad', () => {
  const text = [
    '{"bug_type":"211","os_version":"iPad OS 17.4.1 (21E236)","timestamp":"2025-03-01 10:00:00.00 +0100"}',
    '{"message":{"Last_Value_CycleCount":312,"DesignCycleCount9C":1000,"Max_Value_CycleCount":900,"Last_Value_MaximumCapacityPercent":88},"name":"x"}',
    '{"message":{"Last_Value_CycleCount":311}}'
  ].join('\n');
  const r = P.parseIpadFile(text);
  assert.strictEqual(r.cycles, 312);
  assert.strictEqual(r.capacity, 88);
  assert.strictEqual(r.os, 'iPad OS 17.4.1 (21E236)');
  assert.match(r.fileDate, /^2025-03-01/);
});

test('parseIpadFile: régi, soronkénti formátum', () => {
  const r = P.parseIpadFile('batterycyclecount\n    455\nMaximumCapacityPercent\n 91\n');
  assert.strictEqual(r.cycles, 455);
  assert.strictEqual(r.capacity, 91);
});

test('parseIpadFile: nincs találat', () => {
  const r = P.parseIpadFile('{"bug_type":"211"}\n{"message":{"Foo":1}}');
  assert.strictEqual(r.cycles, null);
  assert.strictEqual(r.capacity, null);
});

const MAC_SAMPLE = [
  '14.5',
  '\t\t\t<key>activation_lock_status</key>',
  '\t\t\t<string>activation_lock_disabled</string>',
  '\t\t\t<key>chip_type</key>',
  '\t\t\t<string>Apple M1</string>',
  '\t\t\t<key>machine_model</key>',
  '\t\t\t<string>MacBookAir10,1</string>',
  '\t\t\t<key>machine_name</key>',
  '\t\t\t<string>MacBook Air</string>',
  '\t\t\t<key>physical_memory</key>',
  '\t\t\t<string>8 GB</string>',
  '\t\t\t<key>serial_number</key>',
  '\t\t\t<string>C02XYZ123456</string>',
  '\t\t\t<key>platform_UUID</key>',
  '\t\t\t<string>11111111-2222-3333-4444-555555555555</string>',
  '\t\t\t<key>sppower_battery_cycle_count</key>',
  '\t\t\t<integer>212</integer>',
  '\t\t\t<key>sppower_battery_health</key>',
  '\t\t\t<string>Good</string>',
  '\t\t\t<key>sppower_battery_health_maximum_capacity</key>',
  '\t\t\t<string>91%</string>',
  'Enrolled via DEP: No',
  'MDM enrollment: No',
  '/dev/disk3s5  482797652  200000000  280000000    42%  1000  2000  1%   /System/Volumes/Data'
].join('\n');

test('parseMacOutput kiolvassa a felsorolt mezőket', () => {
  const r = P.parseMacOutput(MAC_SAMPLE);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.model, 'MacBook Air');
  assert.strictEqual(r.modelId, 'MacBookAir10,1');
  assert.strictEqual(r.chip, 'Apple M1');
  assert.strictEqual(r.memory, '8 GB');
  assert.strictEqual(r.os, '14.5');
  assert.strictEqual(r.serial, 'C02XYZ123456');
  assert.strictEqual(r.activationLock, 'Disabled');
  assert.strictEqual(r.cycles, 212);
  assert.strictEqual(r.capacity, 91);
  assert.strictEqual(r.condition, 'Good');
  assert.strictEqual(r.dep, false);
  assert.strictEqual(r.mdm, false);
  assert.strictEqual(r.storage, '512 GB');
});

test('parseMacOutput nem ad vissza nem felsorolt adatot (UUID)', () => {
  const r = P.parseMacOutput(MAC_SAMPLE);
  assert.ok(!JSON.stringify(r).includes('11111111-2222'));
});

test('parseMacOutput érvénytelen szövegre nem valid', () => {
  assert.strictEqual(P.parseMacOutput('hello world').valid, false);
  assert.strictEqual(P.parseMacOutput('').valid, false);
});

function sampleData(extra) {
  return Object.assign({
    kind: 'mac', model: 'MacBook Air', modelId: 'MacBookAir10,1', chip: 'Apple M1', memory: '8 GB', storage: '512 GB', os: '14.5',
    fingerprint: 'abcdef0123456789', serialTail: '3456', serialRaw: '', cycles: 212, capacity: 91, condition: 'Good',
    fileDate: '', apple: 'yes', activationLock: 'Disabled', dep: false, mdm: false, sources: { model: 'parancsból', cycles: 'beírta' }
  }, extra || {});
}

test('buildSections: a nyers sorozatszám csak megosztáskor kerül bele', () => {
  const without = JSON.stringify(P.buildSections(sampleData()));
  assert.ok(!without.includes('C02XYZ123456'));
  const shared = JSON.stringify(P.buildSections(sampleData({ serialRaw: 'C02XYZ123456' })));
  assert.ok(shared.includes('C02XYZ123456'));
});

test('buildSections: hiányzó érték nodata, minden sor szöveges és van tag', () => {
  const sections = P.buildSections(sampleData({ cycles: null, capacity: null }));
  const battery = sections[2].rows;
  assert.strictEqual(battery[0].status, 'nodata');
  assert.strictEqual(battery[0].value, 'nem adta meg');
  sections.forEach((s) => s.rows.forEach((r) => {
    assert.strictEqual(typeof r.label, 'string');
    assert.strictEqual(typeof r.value, 'string');
    assert.strictEqual(typeof r.tag, 'string');
  }));
});

test('buildSections: zárak státusza', () => {
  const locks = P.buildSections(sampleData({ apple: 'no', activationLock: 'Enabled', mdm: true }))[3].rows;
  assert.strictEqual(locks[0].status, 'bad');
  assert.strictEqual(locks[1].status, 'bad');
  assert.strictEqual(locks[2].status, 'bad');
});

test('detectOs: iOS 9.3.5 iPad', () => {
  const ua = 'Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13G36 Safari/601.1';
  const r = P.detectOs(ua, 5);
  assert.strictEqual(r.version, '9.3.5');
  assert.strictEqual(r.major, 9);
  assert.strictEqual(r.name, 'iOS');
  assert.strictEqual(r.device, 'iPad');
});

test('detectOs: iPhone és Chrome iOS-en', () => {
  assert.strictEqual(P.detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', 5).version, '17.4');
  assert.strictEqual(P.detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1', 5).major, 16);
});

test('detectOs: iPadOS asztali módban és Mac', () => {
  const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const r = P.detectOs(desktop, 5);
  assert.strictEqual(r.name, 'iPadOS');
  assert.strictEqual(r.major, 17);
  assert.strictEqual(P.detectOs(desktop, 0), null);
  assert.strictEqual(P.detectOs('', 0), null);
});

test('buildSections: az átvételkor mérendő akku külön jelölést kap', () => {
  const deferred = P.buildSections(sampleData({ cycles: null, capacity: null, batteryDefer: true }))[2].rows;
  assert.match(deferred[0].value, /USB-s méréssel pótlandó/);
  assert.strictEqual(deferred[0].status, 'info');
  const plain = P.buildSections(sampleData({ cycles: null, capacity: null }))[2].rows;
  assert.strictEqual(plain[0].value, 'nem adta meg');
  const measured = P.buildSections(sampleData({ cycles: 244, capacity: 85, batteryDefer: true }))[2].rows;
  assert.strictEqual(measured[0].value, '244');
});

const section = (sections, title) => sections.find((s) => s.title === title);

test('összegzés: az akku forrása szerint ok vagy warn', () => {
  const system = section(P.buildSections(sampleData({ sources: { cycles: 'naplóból', capacity: 'naplóból' } })), 'Összegzés a vevőnek').rows;
  assert.strictEqual(system[0].label, 'Akkumulátor');
  assert.strictEqual(system[0].status, 'ok');
  const typed = section(P.buildSections(sampleData({ sources: { cycles: 'beírta', capacity: 'naplóból' } })), 'Összegzés a vevőnek').rows;
  assert.strictEqual(typed[0].status, 'warn');
  const deferred = section(P.buildSections(sampleData({ cycles: null, capacity: null, batteryDefer: true })), 'Összegzés a vevőnek').rows;
  assert.match(deferred[0].value, /USB-s méréssel pótlandó/);
  assert.strictEqual(deferred[0].status, 'warn');
});

test('összegzés: a modell ellenőrzése a sorozatszámtól függ', () => {
  const shared = section(P.buildSections(sampleData({ serialRaw: 'C02XYZ123456' })), 'Összegzés a vevőnek').rows;
  assert.match(shared[1].value, /checkcoverage\.apple\.com/);
  const hidden = section(P.buildSections(sampleData()), 'Összegzés a vevőnek').rows;
  assert.strictEqual(hidden[1].status, 'warn');
  const none = section(P.buildSections(sampleData({ fingerprint: '', serialTail: '' })), 'Összegzés a vevőnek').rows;
  assert.match(none[1].value, /nincs sorozatszám/);
});

test('összegzés: zárak és felügyelet', () => {
  const rows = section(P.buildSections(sampleData({ activationLock: 'Enabled', mdm: true })), 'Összegzés a vevőnek').rows;
  const lock = rows.find((r) => r.label === 'Aktiválási zár');
  assert.strictEqual(lock.status, 'bad');
  assert.strictEqual(rows.find((r) => r.label === 'Céges felügyelet').status, 'bad');
  const ios = section(P.buildSections(sampleData({ kind: 'ios', activationLock: '', apple: 'yes' })), 'Összegzés a vevőnek').rows;
  const apple = ios.find((r) => r.label === 'Apple-fiók zár');
  assert.strictEqual(apple.status, 'info');
  assert.match(apple.value, /nem olvasható ki/);
});

test('sorozatszám sorok: megosztáskor a nyers érték, különben lenyomat és vége', () => {
  const shared = section(P.buildSections(sampleData({ serialRaw: 'C02XYZ123456' })), 'Eszköz').rows.map((r) => r.label);
  assert.ok(shared.includes('Sorozatszám'));
  assert.ok(!shared.includes('Sorozatszám lenyomat'));
  const hidden = section(P.buildSections(sampleData()), 'Eszköz').rows.map((r) => r.label);
  assert.ok(hidden.includes('Sorozatszám lenyomat'));
  assert.ok(hidden.includes('Sorozatszám vége'));
  assert.ok(!hidden.includes('Sorozatszám'));
});

const USB_SAMPLE = [
  'iPad akku-kiolvasó. Csak olvas, semmit nem küld el.',
  'IPAD-AUDIT-USB 1',
  'model: iPad2,5',
  'model_name: iPad mini 1',
  'os: 9.3.5',
  'serial: DMPS00000FAK',
  'storage_gb: 16',
  'cycles: 244',
  'design_capacity: 4490',
  'max_capacity: 3802',
  'capacity_percent: 84.7',
  'activation_lock: off',
  'END',
  'UniqueDeviceID: a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
].join('\n');

test('parseUsbOutput kiolvassa a blokkot és a körülötte lévő szöveget figyelmen kívül hagyja', () => {
  const r = P.parseUsbOutput(USB_SAMPLE);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.model, 'iPad2,5');
  assert.strictEqual(r.modelName, 'iPad mini 1');
  assert.strictEqual(r.os, '9.3.5');
  assert.strictEqual(r.serial, 'DMPS00000FAK');
  assert.strictEqual(r.storage, '16 GB');
  assert.strictEqual(r.cycles, 244);
  assert.strictEqual(r.capacity, 85);
  assert.strictEqual(r.activationLock, 'Disabled');
  assert.ok(!JSON.stringify(r).includes('a1b2c3d4'));
});

test('parseUsbOutput érvénytelen vagy üres szövegre nem valid, hibás értéket eldob', () => {
  assert.strictEqual(P.parseUsbOutput('hello').valid, false);
  assert.strictEqual(P.parseUsbOutput('').valid, false);
  const bad = P.parseUsbOutput('IPAD-AUDIT-USB 1\ncycles: 99999\ncapacity_percent: 5\nos: <script>\nEND');
  assert.strictEqual(bad.cycles, null);
  assert.strictEqual(bad.capacity, null);
  assert.strictEqual(bad.os, '');
});

test('USB-ből jövő adat: az akku ok, az iPad zárja is megjelenik', () => {
  const data = sampleData({ kind: 'ios', activationLock: 'Disabled', sources: { cycles: 'USB-ből', capacity: 'USB-ből', activationLock: 'USB-ből' } });
  const sections = P.buildSections(data);
  assert.strictEqual(section(sections, 'Összegzés a vevőnek').rows[0].status, 'ok');
  const lock = section(sections, 'Zárak és felügyelet').rows.find((r) => r.label === 'Aktiválási zár');
  assert.strictEqual(lock.status, 'ok');
  assert.strictEqual(lock.tag, 'USB-ből');
  const summaryLock = section(sections, 'Összegzés a vevőnek').rows.find((r) => r.label === 'Aktiválási zár');
  assert.match(summaryLock.value, /az eszközből kiolvasva/);
});

test('touchTracker: minden mező és két ujjas érintés kell', () => {
  const t = P.touchTracker(4);
  t.hit(0, 1); t.hit(1, 1); t.hit(2, 1); t.hit(3, 1);
  assert.strictEqual(t.state().cells, 4);
  assert.strictEqual(t.state().complete, false);
  t.hit(0, 2);
  assert.strictEqual(t.state().complete, true);
});

test('touchTracker: ugyanazt a mezőt nem számolja kétszer, érvénytelen indexet eldob', () => {
  const t = P.touchTracker(3);
  t.hit(1, 1); t.hit(1, 1); t.hit(-1, 1); t.hit(9, 1);
  assert.strictEqual(t.state().cells, 1);
});

test('motionTracker: kell mozgás és forgás is, mért érték alapján', () => {
  const still = P.motionTracker();
  still.feed({ x: 0.1, y: 0.2, z: -9.8 }, { alpha: 1, beta: 1, gamma: 1 });
  assert.strictEqual(still.state().complete, false);
  assert.strictEqual(still.state().events, 1);
  const moved = P.motionTracker();
  moved.feed({ x: -6, y: -5, z: 0 }, { alpha: 10, beta: 0, gamma: 0 });
  moved.feed({ x: 6, y: 5, z: 0 }, { alpha: 0, beta: 55, gamma: 0 });
  assert.strictEqual(moved.state().complete, true);
  const noSensor = P.motionTracker();
  assert.strictEqual(noSensor.state().events, 0);
});

test('toneVerdict: csak akkor jó, ha minden hangot meghallott', () => {
  assert.deepStrictEqual(P.toneVerdict([700, 950], [true, true]), { heard: 2, total: 2, ok: true });
  assert.strictEqual(P.toneVerdict([700, 950], [true, false]).ok, false);
  assert.strictEqual(P.toneVerdict([], []).ok, false);
});

test('frameStats és frameLooksReal: fekete, fehér és egyszínű kép nem valódi', () => {
  const size = 64 * 48 * 4;
  const black = new Uint8ClampedArray(size).fill(0);
  const white = new Uint8ClampedArray(size).fill(255);
  const flat = new Uint8ClampedArray(size).fill(128);
  const real = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i += 4) { const v = (i / 4) % 7 * 36; real[i] = v; real[i + 1] = 255 - v; real[i + 2] = (v * 3) % 255; real[i + 3] = 255; }
  assert.strictEqual(P.frameLooksReal(P.frameStats(black)), false);
  assert.strictEqual(P.frameLooksReal(P.frameStats(white)), false);
  assert.strictEqual(P.frameLooksReal(P.frameStats(flat)), false);
  assert.strictEqual(P.frameLooksReal(P.frameStats(real)), true);
});

test('hardverteszt a riportban: mért és bemondás jelölés, hiányzó teszt, összegzés', () => {
  const hw = {
    touch: { status: 'ok', detail: 'mind a 96 mező érzékelt, két ujjal is' },
    motion: { status: 'bad', detail: 'nem érkezett mozgásadat' },
    audio: { status: 'unavailable', detail: 'iOS 11 vagy újabb kell' },
    display: { status: 'ok', detail: 'nem látott hibát' }
  };
  const sections = P.buildSections(sampleData({ kind: 'ios', hw }));
  const rows = section(sections, 'Hardverteszt').rows;
  const byLabel = (label) => rows.find((r) => r.label === label);
  assert.strictEqual(byLabel('Érintőképernyő').status, 'ok');
  assert.strictEqual(byLabel('Érintőképernyő').tag, 'mért');
  assert.strictEqual(byLabel('Mozgásérzékelők').status, 'bad');
  assert.strictEqual(byLabel('Hangszóró és mikrofon').status, 'nodata');
  assert.strictEqual(byLabel('Kijelző színei').tag, 'bemondás');
  assert.strictEqual(byLabel('Hátlapi kamera').value, 'nem tesztelt');
  const summary = section(sections, 'Összegzés a vevőnek').rows.find((r) => r.label === 'Hardver (mért tesztek)');
  assert.strictEqual(summary.status, 'bad');
  assert.match(summary.value, /1 rendben, 1 hibás, 3 nem tesztelt/);
});

test('hardverteszt: Macnél csak a hang, az előlapi kamera és a kijelző szerepel', () => {
  const rows = section(P.buildSections(sampleData({ kind: 'mac' })), 'Hardverteszt').rows.map((r) => r.label);
  assert.deepStrictEqual(rows, ['Hangszóró és mikrofon', 'Előlapi kamera', 'Kijelző színei']);
});

test('hardverteszt: ha minden mért teszt rendben, az összegzés ok', () => {
  const ok = (detail) => ({ status: 'ok', detail });
  const hw = { touch: ok('x'), motion: ok('x'), audio: ok('x'), camera_rear: ok('x'), camera_front: ok('x') };
  const summary = section(P.buildSections(sampleData({ kind: 'ios', hw })), 'Összegzés a vevőnek').rows.find((r) => r.label === 'Hardver (mért tesztek)');
  assert.strictEqual(summary.status, 'ok');
  assert.match(summary.value, /^5 rendben$/);
});

test('iPaden USB nélkül a modell, tárhely és sorozatszám nem "nem adta meg", hanem USB nélkül nem olvasható ki', () => {
  const sections = P.buildSections({ kind: 'ios', hw: {}, sources: {}, cycles: null, capacity: null, os: '9.3.5', fingerprint: '', serialTail: '', apple: 'yes' });
  const device = sections.find((s) => s.title === 'Eszköz').rows;
  const byLabel = (label) => device.find((r) => r.label === label);
  assert.strictEqual(byLabel('Modell').value, 'USB nélkül nem olvasható ki');
  assert.strictEqual(byLabel('Tárhely').value, 'USB nélkül nem olvasható ki');
  assert.strictEqual(byLabel('Sorozatszám vége').value, 'USB nélkül nem olvasható ki');
  assert.strictEqual(byLabel('Rendszerverzió').value, '9.3.5');
});
