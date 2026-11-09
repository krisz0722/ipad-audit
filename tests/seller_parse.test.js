// Az eladói varázsló kiolvasóinak tesztje. Futtatás: node --test tests/seller_parse.test.js
// A minták kitalált, szintetikus adatok. A valódi iPad fájl és a valódi Mac kimenet formátumát
// egy valódi eszközön külön ellenőrizni kell.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const P = require('../web/seller/parse.js');

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
  const battery = sections[1].rows;
  assert.strictEqual(battery[0].status, 'nodata');
  assert.strictEqual(battery[0].value, 'nem adta meg');
  sections.forEach((s) => s.rows.forEach((r) => {
    assert.strictEqual(typeof r.label, 'string');
    assert.strictEqual(typeof r.value, 'string');
    assert.strictEqual(typeof r.tag, 'string');
  }));
});

test('buildSections: zárak státusza', () => {
  const locks = P.buildSections(sampleData({ apple: 'no', activationLock: 'Enabled', mdm: true }))[2].rows;
  assert.strictEqual(locks[0].status, 'bad');
  assert.strictEqual(locks[1].status, 'bad');
  assert.strictEqual(locks[2].status, 'bad');
});
