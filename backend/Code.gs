// iPad audit fogadó. Google Táblához kötött Apps Script.
// Meghívó nélkül semmit nem fogad el és emailt sem küld.

var BACKEND_VERSION = "2026.11.13.1";
var SHEET_NAME = "Meghívók";
var INVITE_HOURS = 72;
var MAX_BODY = 60000;
var MAX_STEPS = 40;
var MAX_STEP_SIZE = 4000;
var DAILY_MAILS = 20;
var SESSION_SECONDS = 21600; // A CacheService felső korlátja.
var COLS = { code: 1, label: 2, expires: 3, status: 4, used: 5 };
var CODE_DIGITS = 9;
var MAX_FAILS_PER_HOUR = 30;
var SITE_URL = "https://apple.audit.kokocloud.space/"; // Az eladói oldal címe, a meghívó linkje ebből készül.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("iPad audit")
    .addItem("Új meghívó", "newInvite")
    .addToUi();
}

function sheet_() {
  var book = SpreadsheetApp.getActive();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Kód",
      "Címke",
      "Lejárat",
      "Állapot",
      "Utolsó esemény",
      "Link",
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function randomCode_(length) {
  var alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid(),
  );
  var text = "";
  for (var i = 0; i < length; i++) {
    text += alphabet.charAt((digest[i] + 128) % alphabet.length);
  }
  return text;
}

// Csak számjegyekből álló kód. Az első számjegy nem 0, így a Tábla számként tárolva sem veszít belőle.
function randomDigits_(length) {
  var text = "";
  while (text.length < length) {
    var digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid(),
    );
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
  return String(code).replace(/(\d{3})(?=\d)/g, "$1 ");
}

// A teljes, előtöltött link: az eladónak nem kell beírnia a kódot, a #kód előtölti a mezőt.
function inviteLink_(code) {
  return SITE_URL + "#" + code;
}

// A vásárló ezt az üzenetet küldi az eladónak. Minden, ami kell, benne van: a link és a kód.
function inviteMessage_(code) {
  return (
    "Az eszközöd állapotának ellenőrzéséhez nyisd meg ezt a linket:\n" +
    inviteLink_(code) +
    "\n\n" +
    "A meghívókód:\n" +
    groupCode_(code) +
    "\n\nA kód a linkben már benne van, nem kell beírnod.\n\n" +
    "A kód " +
    INVITE_HOURS +
    " óráig érvényes, és egy USB-riporthoz, valamint egy webes tesztriporthoz használható."
  );
}

function inviteDialogHtml_(code) {
  return (
    '<div style="font:14px/1.5 Arial,sans-serif;color:#202124">' +
    '<p style="margin:0 0 12px">Meghívókód:<br><b style="font-size:18px">' +
    esc_(groupCode_(code)) +
    "</b></p>" +
    '<p style="margin:0 0 16px">Link: <a href="' +
    esc_(inviteLink_(code)) +
    '" target="_blank" rel="noopener" style="color:#1a73e8;overflow-wrap:anywhere">' +
    esc_(inviteLink_(code)) +
    "</a></p>" +
    '<label for="m" style="display:block;font-weight:600;margin-bottom:6px">Eladónak küldhető üzenet</label>' +
    '<textarea id="m" rows="8" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid #dadce0;border-radius:4px;font:14px/1.5 Arial,sans-serif" readonly>' +
    esc_(inviteMessage_(code)) +
    "</textarea>" +
    '<p style="margin:12px 0 0"><button type="button" onclick="copyIt()" style="padding:8px 14px;border:0;border-radius:4px;background:#1a73e8;color:#fff;cursor:pointer">Üzenet másolása</button> <span id="s" role="status"></span></p></div>' +
    '<script>function copyIt(){var t=document.getElementById("m");t.focus();t.select();var ok=false;' +
    'try{ok=document.execCommand("copy");}catch(e){}' +
    'document.getElementById("s").textContent=ok?"Kimásolva.":"Jelöld ki a szöveget, és másold ki kézzel.";}</script>'
  );
}

function newInvite() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt(
    "Új meghívó",
    "Kinek szól? (pl. Jófogás, Air 2)",
    ui.ButtonSet.OK_CANCEL,
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  var code = randomDigits_(CODE_DIGITS);
  var expires = new Date(Date.now() + INVITE_HOURS * 3600 * 1000);
  var sheet = sheet_();
  if (!sheet.getRange(1, 6).getValue()) sheet.getRange(1, 6).setValue("Link");
  sheet.appendRow([
    code,
    answer.getResponseText().slice(0, 80),
    expires,
    "új",
    "",
    inviteLink_(code),
  ]);
  ui.showModalDialog(
    HtmlService.createHtmlOutput(inviteDialogHtml_(code))
      .setWidth(520)
      .setHeight(440),
    "Meghívó kész",
  );
}

function checkDeployment() {
  var book = SpreadsheetApp.getActive();
  var result = {
    version: BACKEND_VERSION,
    invitationSheetAvailable: Boolean(book && book.getSheetByName(SHEET_NAME)),
    recipientAvailable: Boolean(Session.getEffectiveUser().getEmail()),
    remainingMailQuota: MailApp.getRemainingDailyQuota(),
  };
  console.log(JSON.stringify(result));
  return result;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function fail_(message) {
  return json_({ ok: false, error: message });
}

function findInvite_(sheet, code) {
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (
      String(values[i][COLS.code - 1])
        .trim()
        .toUpperCase() === code
    )
      return { row: i + 1, values: values[i] };
  }
  return null;
}

function loadSession_(sid) {
  if (!/^[0-9A-Z]{10}$/.test(sid || "")) return null;
  var text = CacheService.getScriptCache().get("s:" + sid);
  return text ? JSON.parse(text) : null;
}

function saveSession_(sid, session) {
  CacheService.getScriptCache().put(
    "s:" + sid,
    JSON.stringify(session),
    SESSION_SECONDS,
  );
}

function start_(body) {
  var code = String(body.code || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
  var cache = CacheService.getScriptCache();
  var failKey =
    "fails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd-HH");
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS_PER_HOUR)
    return fail_("Túl sok hibás próbálkozás, próbáld újra egy óra múlva.");
  function bad(message) {
    cache.put(failKey, String(fails + 1), 3600);
    return fail_(message);
  }
  var sheet = sheet_();
  var invite = findInvite_(sheet, code);
  if (!invite) return bad("A meghívókód nem érvényes.");
  if (invite.values[COLS.status - 1] !== "új")
    return bad("Ezt a meghívókódot már felhasználták.");
  if (new Date(invite.values[COLS.expires - 1]).getTime() < Date.now())
    return bad("A meghívókód lejárt.");
  var sid = randomCode_(10);
  saveSession_(sid, {
    row: invite.row,
    label: invite.values[COLS.label - 1],
    steps: {},
    mailed: false,
  });
  sheet.getRange(invite.row, COLS.status).setValue("folyamatban");
  sheet.getRange(invite.row, COLS.used).setValue(new Date());
  return json_({ ok: true, sid: sid });
}

function step_(body) {
  var session = loadSession_(body.sid);
  if (!session || session.mailed) return fail_("A session nem érvényes.");
  var name = String(body.name || "");
  if (!/^[a-z_]{1,24}$/.test(name)) return fail_("Hibás lépés.");
  var data = JSON.stringify(body.data === undefined ? {} : body.data);
  if (data.length > MAX_STEP_SIZE) return fail_("Túl nagy adat.");
  if (session.steps[name]) return json_({ ok: true, duplicate: true });
  if (Object.keys(session.steps).length >= MAX_STEPS)
    return fail_("Túl sok lépés.");
  session.steps[name] = JSON.parse(data);
  saveSession_(body.sid, session);
  return json_({ ok: true });
}

function esc_(value) {
  return String(value).replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c];
  });
}

var ICONS = { ok: "✅", warn: "⚠️", bad: "❌", info: "ℹ️", nodata: "❔" };

function render_(sections) {
  var html = "",
    text = "";
  sections.forEach(function (section) {
    html +=
      "<h3>" +
      esc_(section.title) +
      '</h3><table cellpadding="5" style="border-collapse:collapse">';
    text += "\n" + section.title + "\n";
    (section.rows || []).forEach(function (row) {
      var icon = ICONS[row.status] || "";
      html +=
        '<tr style="border-bottom:1px solid #ddd"><td>' +
        esc_(row.label) +
        "</td><td>" +
        icon +
        "</td><td>" +
        esc_(row.value) +
        '</td><td style="color:#777">' +
        esc_(row.tag) +
        "</td></tr>";
      text += "  " + row.label + ": " + row.value + " [" + row.tag + "]\n";
    });
    html += "</table>";
  });
  return { html: html, text: text };
}

function finish_(body) {
  var session = loadSession_(body.sid);
  if (!session) return fail_("A session nem érvényes.");
  if (session.mailed) return fail_("A riportot már elküldték.");
  if (!Array.isArray(body.sections)) return fail_("Hibás riport.");

  var props = PropertiesService.getScriptProperties();
  var dayKey =
    "mails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd");
  var sent = Number(props.getProperty(dayKey) || 0);
  if (sent >= DAILY_MAILS)
    return fail_("Elérte a napi riportkeretet, próbáld holnap.");

  var serial = String(body.serial || "ismeretlen")
    .replace(/[^0-9A-Za-z-]/g, "")
    .slice(0, 20);
  var label = String(session.label || "")
    .replace(/[\r\n]/g, " ")
    .slice(0, 80);
  var content = render_(body.sections);
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: "iPad audit: " + label + " / " + serial,
    body: content.text,
    htmlBody: content.html,
  });
  props.setProperty(dayKey, String(sent + 1));
  session.mailed = true;
  saveSession_(body.sid, session);
  var sheet = sheet_();
  sheet.getRange(session.row, COLS.status).setValue("riport elküldve");
  sheet.getRange(session.row, COLS.used).setValue(new Date());
  return json_({ ok: true });
}

function report_(body) {
  var code = String(body.code || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "");
  var kind = body.kind;
  if (
    !/^(?:[0-9]{9}|[0-9A-Z]{12})$/.test(code) ||
    (kind !== "usb" && kind !== "web")
  )
    return fail_("Hibás meghívó vagy riporttípus.");
  if (!Array.isArray(body.sections) || !body.sections.length)
    return fail_("Hibás riport.");
  if (body.copyEmail !== undefined && typeof body.copyEmail !== "string")
    return fail_("Hibás emailcím a saját másolathoz.");
  var copyEmail = (body.copyEmail || "").trim();
  if (
    copyEmail &&
    (copyEmail.length > 254 ||
      /[^\x21-\x7e]/.test(copyEmail) ||
      !/^[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+\.[^\s@,;<>:"\\]+$/.test(copyEmail))
  )
    return fail_("Hibás emailcím a saját másolathoz.");
  var cache = CacheService.getScriptCache();
  var failKey =
    "fails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd-HH");
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS_PER_HOUR)
    return fail_("Túl sok hibás próbálkozás, próbáld újra egy óra múlva.");
  var sheet = sheet_();
  var invite = findInvite_(sheet, code);
  if (!invite) {
    cache.put(failKey, String(fails + 1), 3600);
    return fail_("A meghívókód nem érvényes.");
  }
  if (new Date(invite.values[COLS.expires - 1]).getTime() < Date.now())
    return fail_("A meghívókód lejárt.");
  var props = PropertiesService.getScriptProperties();
  var key = "report:" + code + ":" + kind;
  var stored = props.getProperty(key);
  if (stored === "sent")
    return json_({ ok: true, duplicate: true, kind: kind });
  if (stored)
    return fail_(
      "A küldés eredménye bizonytalan. A vásárló ellenőrizze az emailt; nem küldjük újra automatikusan.",
    );
  if (
    invite.values[COLS.status - 1] !== "új" &&
    invite.values[COLS.status - 1] !== "részriport elküldve"
  )
    return fail_("Ezt a meghívókódot már felhasználták.");
  var dayKey =
    "mails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd");
  var sent = Number(props.getProperty(dayKey) || 0);
  var recipient = Session.getEffectiveUser().getEmail();
  var copyRecipient =
    copyEmail && copyEmail.toLowerCase() !== recipient.toLowerCase()
      ? copyEmail
      : "";
  var recipientCount = copyRecipient ? 2 : 1;
  if (
    sent + recipientCount > DAILY_MAILS ||
    MailApp.getRemainingDailyQuota() < recipientCount
  )
    return fail_("Elérte a napi riportkeretet, próbáld holnap.");
  var content;
  try {
    content = render_(body.sections);
  } catch (error) {
    return fail_("Hibás riport.");
  }
  if (kind === "usb") {
    var continuation = inviteLink_(code);
    content.text +=
      "\nWebes teszt folytatása az eladandó iPaden vagy iPhone-on:\n" +
      continuation +
      "\n";
    content.html +=
      '<p><a href="' +
      esc_(continuation) +
      '">Webes teszt folytatása az eladandó iPaden vagy iPhone-on</a></p>';
  }
  var label = String(invite.values[COLS.label - 1] || "")
    .replace(/[\r\n]/g, " ")
    .slice(0, 80);
  var serial = String(body.serial || "ismeretlen")
    .replace(/[^0-9A-Za-z-]/g, "")
    .slice(0, 20);
  props.setProperty(key, "sending");
  props.setProperty(dayKey, String(sent + recipientCount));
  try {
    var mail = {
      to: recipient,
      subject:
        "iPad audit " +
        (kind === "usb" ? "USB" : "webes teszt") +
        ": " +
        label +
        " / " +
        serial,
      body: content.text,
      htmlBody: content.html,
    };
    if (copyRecipient) mail.bcc = copyRecipient;
    MailApp.sendEmail(mail);
    props.setProperty(key, "sent");
    var other = props.getProperty(
      "report:" + code + ":" + (kind === "usb" ? "web" : "usb"),
    );
    sheet
      .getRange(invite.row, COLS.status)
      .setValue(other === "sent" ? "riportok elküldve" : "részriport elküldve");
    sheet.getRange(invite.row, COLS.used).setValue(new Date());
    return json_({ ok: true, kind: kind, copySent: Boolean(copyEmail) });
  } catch (error) {
    return fail_(
      "A küldés eredménye bizonytalan. A vásárló ellenőrizze az emailt; nem küldjük újra automatikusan.",
    );
  }
}

function doPost(e) {
  if (!e.postData || e.postData.contents.length > MAX_BODY)
    return fail_("Túl nagy kérés.");
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return fail_("Hibás kérés.");
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return fail_("Foglalt, próbáld újra.");
  try {
    if (body.action === "report") return report_(body);
    if (body.action === "start") return start_(body);
    if (body.action === "step") return step_(body);
    if (body.action === "finish") return finish_(body);
    return fail_("Ismeretlen művelet.");
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var session = loadSession_(e.parameter.s);
  if (!session) return fail_("A session nem érvényes.");
  return json_({ ok: true, steps: session.steps });
}
