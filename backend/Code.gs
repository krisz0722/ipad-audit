// iPad audit fogadó. Google Táblához kötött Apps Script.
// Meghívó nélkül semmit nem fogad el és emailt sem küld.

var SHEET_NAME = 'Meghívók';
var INVITE_HOURS = 72;
var MAX_BODY = 60000;
var MAX_STEPS = 40;
var MAX_STEP_SIZE = 4000;
var DAILY_MAILS = 20;
var SESSION_SECONDS = 21600; // A CacheService felső korlátja.
var COLS = { code: 1, label: 2, expires: 3, status: 4, used: 5 };
var CODE_DIGITS = 9;
var MAX_FAILS_PER_HOUR = 30;
var MAX_HANDOFF = 20000;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('iPad audit').addItem('Új meghívó', 'newInvite').addToUi();
}

function sheet_() {
  var book = SpreadsheetApp.getActive();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(['Kód', 'Címke', 'Lejárat', 'Állapot', 'Utolsó esemény']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function randomCode_(length) {
  var alphabet = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid());
  var text = '';
  for (var i = 0; i < length; i++) {
    text += alphabet.charAt((digest[i] + 128) % alphabet.length);
  }
  return text;
}

// Csak számjegyekből álló kód. Az első számjegy nem 0, így a Tábla számként tárolva sem veszít belőle.
function randomDigits_(length) {
  var text = '';
  while (text.length < length) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid());
    for (var i = 0; i < digest.length && text.length < length; i++) {
      var b = digest[i] & 255;
      if (b >= 250) continue;
      var d = b % 10;
      if (text.length === 0 && d === 0) continue;
      text += String(d);
    }
  }
  return text;
}

function groupCode_(code) {
  return String(code).replace(/(\d{3})(?=\d)/g, '$1 ');
}

function newInvite() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt('Új meghívó', 'Kinek szól? (pl. Jófogás, Air 2)', ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var code = randomDigits_(CODE_DIGITS);
  var expires = new Date(Date.now() + INVITE_HOURS * 3600 * 1000);
  sheet_().appendRow([code, answer.getResponseText().slice(0, 80), expires, 'új', '']);
  ui.alert('Meghívókód', groupCode_(code) + '\n\nEz egyszer használható, ' + INVITE_HOURS + ' óráig érvényes.', ui.ButtonSet.OK);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(message) {
  return json_({ ok: false, error: message });
}

function findInvite_(sheet, code) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][COLS.code - 1]).trim().toUpperCase() === code) return { row: i + 1, values: values[i] };
  }
  return null;
}

function loadSession_(sid) {
  if (!/^[0-9A-Z]{10}$/.test(sid || '')) return null;
  var text = CacheService.getScriptCache().get('s:' + sid);
  return text ? JSON.parse(text) : null;
}

function saveSession_(sid, session) {
  CacheService.getScriptCache().put('s:' + sid, JSON.stringify(session), SESSION_SECONDS);
}

function start_(body) {
  var code = String(body.code || '').trim().toUpperCase().replace(/[\s-]/g, '');
  var cache = CacheService.getScriptCache();
  var failKey = 'fails:' + Utilities.formatDate(new Date(), 'Etc/UTC', 'yyyy-MM-dd-HH');
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS_PER_HOUR) return fail_('Túl sok hibás próbálkozás, próbáld újra egy óra múlva.');
  function bad(message) {
    cache.put(failKey, String(fails + 1), 3600);
    return fail_(message);
  }
  var sheet = sheet_();
  var invite = findInvite_(sheet, code);
  if (!invite) return bad('A meghívókód nem érvényes.');
  if (invite.values[COLS.status - 1] !== 'új') return bad('Ezt a meghívókódot már felhasználták.');
  if (new Date(invite.values[COLS.expires - 1]).getTime() < Date.now()) return bad('A meghívókód lejárt.');
  var sid = randomCode_(10);
  saveSession_(sid, { row: invite.row, label: invite.values[COLS.label - 1], steps: {}, mailed: false });
  sheet.getRange(invite.row, COLS.status).setValue('folyamatban');
  sheet.getRange(invite.row, COLS.used).setValue(new Date());
  return json_({ ok: true, sid: sid });
}

function step_(body) {
  var session = loadSession_(body.sid);
  if (!session || session.mailed) return fail_('A session nem érvényes.');
  var name = String(body.name || '');
  if (!/^[a-z_]{1,24}$/.test(name)) return fail_('Hibás lépés.');
  var data = JSON.stringify(body.data === undefined ? {} : body.data);
  if (data.length > MAX_STEP_SIZE) return fail_('Túl nagy adat.');
  if (session.steps[name]) return json_({ ok: true, duplicate: true });
  if (Object.keys(session.steps).length >= MAX_STEPS) return fail_('Túl sok lépés.');
  session.steps[name] = JSON.parse(data);
  saveSession_(body.sid, session);
  return json_({ ok: true });
}

function normalizeCode_(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

// Az eszközön (iPad) elkészült eredmények átadása a számítógépnek. A sorozatszámot a kliens nem tölti fel.
// Az adat csak a session-ben él, legfeljebb SESSION_SECONDS ideig.
function handoff_(body) {
  var session = loadSession_(body.sid);
  if (!session || session.mailed) return fail_('A session nem érvényes.');
  var data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail_('Hibás adat.');
  var text = JSON.stringify(data);
  if (text.length > MAX_HANDOFF) return fail_('Túl nagy adat.');
  var code = normalizeCode_(sheet_().getRange(session.row, COLS.code).getValue());
  session.handoff = text;
  saveSession_(body.sid, session);
  CacheService.getScriptCache().put('h:' + code, body.sid, SESSION_SECONDS);
  return json_({ ok: true });
}

// A számítógép a meghívókóddal kéri vissza az átadott eredményeket. Új meghívónál nincs mit visszaadni,
// ez nem használja el a meghívót. A kódhibákra code: 'bad_code' jelzés jön, a kliens csak ezeknél áll meg.
function resume_(body) {
  var code = normalizeCode_(body.code);
  var cache = CacheService.getScriptCache();
  var failKey = 'fails:' + Utilities.formatDate(new Date(), 'Etc/UTC', 'yyyy-MM-dd-HH');
  var fails = Number(cache.get(failKey) || 0);
  function bad(message) {
    cache.put(failKey, String(fails + 1), 3600);
    return json_({ ok: false, error: message, code: 'bad_code' });
  }
  if (fails >= MAX_FAILS_PER_HOUR) return json_({ ok: false, error: 'Túl sok hibás próbálkozás, próbáld újra egy óra múlva.', code: 'bad_code' });
  var invite = findInvite_(sheet_(), code);
  if (!invite) return bad('A meghívókód nem érvényes.');
  var status = invite.values[COLS.status - 1];
  if (status === 'új') {
    if (new Date(invite.values[COLS.expires - 1]).getTime() < Date.now()) return bad('A meghívókód lejárt.');
    return json_({ ok: true, found: false });
  }
  if (status !== 'folyamatban') return bad('Ezt a meghívókódot már felhasználták.');
  var sid = cache.get('h:' + code);
  var session = sid ? loadSession_(sid) : null;
  if (!session || session.mailed || !session.handoff) {
    return bad('Ehhez a kódhoz nincs mentett folyamat (lejárt, vagy már elküldték). Új meghívókódra van szükséged.');
  }
  return json_({ ok: true, found: true, sid: sid, data: JSON.parse(session.handoff) });
}

function esc_(value) {
  return String(value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

var ICONS = { ok: '✅', warn: '⚠️', bad: '❌', info: 'ℹ️', nodata: '❔' };

function render_(sections) {
  var html = '', text = '';
  sections.forEach(function (section) {
    html += '<h3>' + esc_(section.title) + '</h3><table cellpadding="5" style="border-collapse:collapse">';
    text += '\n' + section.title + '\n';
    (section.rows || []).forEach(function (row) {
      var icon = ICONS[row.status] || '';
      html += '<tr style="border-bottom:1px solid #ddd"><td>' + esc_(row.label) + '</td><td>' + icon + '</td><td>' +
        esc_(row.value) + '</td><td style="color:#777">' + esc_(row.tag) + '</td></tr>';
      text += '  ' + row.label + ': ' + row.value + ' [' + row.tag + ']\n';
    });
    html += '</table>';
  });
  return { html: html, text: text };
}

function finish_(body) {
  var session = loadSession_(body.sid);
  if (!session) return fail_('A session nem érvényes.');
  if (session.mailed) return fail_('A riportot már elküldték.');
  if (!Array.isArray(body.sections)) return fail_('Hibás riport.');

  var props = PropertiesService.getScriptProperties();
  var dayKey = 'mails:' + Utilities.formatDate(new Date(), 'Etc/UTC', 'yyyy-MM-dd');
  var sent = Number(props.getProperty(dayKey) || 0);
  if (sent >= DAILY_MAILS) return fail_('Elérte a napi riportkeretet, próbáld holnap.');

  var serial = String(body.serial || 'ismeretlen').replace(/[^0-9A-Za-z-]/g, '').slice(0, 20);
  var label = String(session.label || '').replace(/[\r\n]/g, ' ').slice(0, 80);
  var content = render_(body.sections);
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'iPad audit: ' + label + ' / ' + serial,
    body: content.text,
    htmlBody: content.html
  });
  props.setProperty(dayKey, String(sent + 1));
  session.mailed = true;
  saveSession_(body.sid, session);
  var sheet = sheet_();
  sheet.getRange(session.row, COLS.status).setValue('riport elküldve');
  sheet.getRange(session.row, COLS.used).setValue(new Date());
  return json_({ ok: true });
}

function doPost(e) {
  if (!e.postData || e.postData.contents.length > MAX_BODY) return fail_('Túl nagy kérés.');
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return fail_('Hibás kérés.');
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_('Foglalt, próbáld újra.');
  try {
    if (body.action === 'start') return start_(body);
    if (body.action === 'step') return step_(body);
    if (body.action === 'finish') return finish_(body);
    if (body.action === 'handoff') return handoff_(body);
    if (body.action === 'resume') return resume_(body);
    return fail_('Ismeretlen művelet.');
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var session = loadSession_(e.parameter.s);
  if (!session) return fail_('A session nem érvényes.');
  return json_({ ok: true, steps: session.steps });
}
