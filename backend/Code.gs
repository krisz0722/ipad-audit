// iPad audit fogadó. Google Táblához kötött Apps Script.
// Meghívó nélkül semmit nem fogad el és emailt sem küld.

var BACKEND_VERSION = "2026.11.14.2";
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
var AUDIT_COLUMNS = { sid: 7, kind: 8, emailRequested: 9, state: 10, mail: 11 };
var AUDIT_STEPS = [
  "usb",
  "start",
  "details",
  "touch",
  "motion",
  "audio",
  "rear",
  "front",
  "display",
  "buttons",
  "keyboard",
  "pointer",
  "review",
  "skip",
  "error",
  "finish",
  "cancel",
];

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
    " óráig érvényes, és egy teljes állapotellenőrzéshez használható. Az eredményeket lépésenként mentjük; a végén egy összesített riport készül. Emailt csak akkor kapsz, ha az elején kéred."
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

function auditError_(message) {
  var error = new Error(message);
  error.audit = true;
  throw error;
}

function auditCode_(body, allowEmptySid) {
  var code = String(body.code || "")
    .toUpperCase()
    .replace(/[\s-]/g, "");
  if (
    !/^(?:[0-9]{9}|[0-9A-Z]{12})$/.test(code) ||
    (!allowEmptySid && !/^[0-9A-F]{32}$/.test(body.sid || "")) ||
    (allowEmptySid && body.sid && !/^[0-9A-F]{32}$/.test(body.sid))
  )
    auditError_("Hibás meghívó vagy tesztazonosító.");
  return code;
}

function auditSession_(body, allowCodeOnly) {
  var code = auditCode_(body, allowCodeOnly);
  var cache = CacheService.getScriptCache();
  var failKey =
    "fails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd-HH");
  var fails = Number(cache.get(failKey) || 0);
  if (!body.sid && allowCodeOnly && fails >= MAX_FAILS_PER_HOUR)
    auditError_("Túl sok hibás próbálkozás, próbáld újra egy óra múlva.");
  var sheet = sheet_();
  var invite = findInvite_(sheet, code);
  if (!invite) {
    if (!body.sid && allowCodeOnly) cache.put(failKey, String(fails + 1), 3600);
    auditError_("A teszt session nem érvényes.");
  }
  var inviteSid = String(invite.values[AUDIT_COLUMNS.sid - 1] || "");
  var sid = body.sid ? String(body.sid) : allowCodeOnly ? inviteSid : "";
  if (!inviteSid || inviteSid !== sid)
    auditError_("A teszt session nem érvényes.");
  if (new Date(invite.values[COLS.expires - 1]).getTime() < Date.now())
    auditError_("A meghívókód lejárt.");
  return { sheet: sheet, invite: invite, code: code, sid: sid };
}

function auditEventsSheet_() {
  var book = SpreadsheetApp.getActive();
  var sheet = book.getSheetByName("Tesztlépések");
  if (!sheet) {
    sheet = book.insertSheet("Tesztlépések");
    sheet.appendRow([
      "Session",
      "Meghívó",
      "Sorszám",
      "Lépés",
      "Eredmény",
      "Riportadatok",
      "Időpont",
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function auditEvents_(session) {
  return auditEventsSheet_()
    .getDataRange()
    .getValues()
    .slice(1)
    .filter(function (row) {
      return row[0] === session.sid && String(row[1]) === session.code;
    });
}

function auditSections_(value) {
  if (!Array.isArray(value) || value.length > 12)
    auditError_("Hibás riportadatok.");
  var sections = value.map(function (section) {
    if (
      !section ||
      typeof section.title !== "string" ||
      section.title.length > 100 ||
      !Array.isArray(section.rows) ||
      section.rows.length > 60
    )
      auditError_("Hibás riportadatok.");
    return {
      title: section.title,
      rows: section.rows.map(function (row) {
        if (
          !row ||
          typeof row.label !== "string" ||
          row.label.length > 100 ||
          typeof row.value !== "string" ||
          row.value.length > 1000 ||
          typeof row.tag !== "string" ||
          row.tag.length > 100 ||
          ["ok", "warn", "bad", "info", "nodata"].indexOf(row.status) < 0
        )
          auditError_("Hibás riportadatok.");
        return {
          label: row.label,
          value: row.value,
          status: row.status,
          tag: row.tag,
        };
      }),
    };
  });
  if (JSON.stringify(sections).length > 45000)
    auditError_("Túl nagy riportadat.");
  return sections;
}

function auditBegin_(body) {
  var code = auditCode_(body);
  if (
    body.consent !== true ||
    (body.kind !== "ios" && body.kind !== "mac") ||
    typeof body.emailRequested !== "boolean"
  )
    auditError_("A teszt indításához beleegyezés szükséges.");
  var cache = CacheService.getScriptCache();
  var failKey =
    "fails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd-HH");
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS_PER_HOUR)
    auditError_("Túl sok hibás próbálkozás, próbáld újra egy óra múlva.");
  var sheet = sheet_();
  var invite = findInvite_(sheet, code);
  if (!invite) {
    cache.put(failKey, String(fails + 1), 3600);
    auditError_("A meghívókód nem érvényes.");
  }
  if (new Date(invite.values[COLS.expires - 1]).getTime() < Date.now())
    auditError_("A meghívókód lejárt.");
  if (invite.values[AUDIT_COLUMNS.sid - 1] === body.sid)
    return json_({ ok: true, sid: body.sid, duplicate: true });
  if (invite.values[COLS.status - 1] !== "új")
    auditError_("Ezt a meghívót már másik teszthez használják.");
  [
    "Session",
    "Eszközfajta",
    "Eladói emailt kér",
    "Tesztállapot",
    "Emailállapot",
  ].forEach(function (name, index) {
    sheet.getRange(1, index + 7).setValue(name);
  });
  sheet.getRange(invite.row, AUDIT_COLUMNS.sid).setValue(body.sid);
  sheet.getRange(invite.row, AUDIT_COLUMNS.kind).setValue(body.kind);
  sheet
    .getRange(invite.row, AUDIT_COLUMNS.emailRequested)
    .setValue(body.emailRequested);
  sheet.getRange(invite.row, AUDIT_COLUMNS.state).setValue("running");
  sheet.getRange(invite.row, AUDIT_COLUMNS.mail).setValue("not_sent");
  sheet.getRange(invite.row, COLS.status).setValue("teszt folyamatban");
  sheet.getRange(invite.row, COLS.used).setValue(new Date());
  return json_({ ok: true, sid: body.sid });
}

function auditEvent_(body) {
  var session = auditSession_(body);
  if (
    AUDIT_STEPS.indexOf(body.step) < 0 ||
    ["started", "ok", "warn", "bad", "skipped", "unavailable", "error"].indexOf(
      body.status,
    ) < 0 ||
    typeof body.seq !== "number" ||
    body.seq % 1 !== 0 ||
    body.seq < 1 ||
    body.seq > 200
  )
    auditError_("Hibás tesztlépés.");
  var sections = auditSections_(body.sections || []);
  var events = auditEvents_(session);
  var previous = events.filter(function (row) {
    return Number(row[2]) === body.seq;
  })[0];
  if (previous) {
    if (
      previous[3] !== body.step ||
      previous[4] !== body.status ||
      previous[5] !== JSON.stringify(sections)
    )
      auditError_("A tesztlépés sorszáma már más adathoz tartozik.");
    return json_({ ok: true, duplicate: true, seq: body.seq });
  }
  if (session.invite.values[AUDIT_COLUMNS.state - 1] !== "running")
    auditError_("A teszt már lezárult.");
  if (body.seq !== events.length + 1)
    auditError_("Hiányzó tesztlépés; próbáld újra a korábbi kérést.");
  if ((body.step === "usb" || body.step === "finish") && !sections.length)
    auditError_("Hiányzó riportadatok.");
  if (
    body.step === "usb" &&
    events.some(function (row) {
      return row[3] === "usb";
    })
  )
    auditError_("A USB-adatok már elmentve.");
  if (
    body.step === "finish" &&
    session.invite.values[AUDIT_COLUMNS.kind - 1] === "ios" &&
    !events.some(function (row) {
      return row[3] === "usb";
    })
  )
    auditError_("A végső riporthoz előbb USB-kiolvasás szükséges.");
  auditEventsSheet_().appendRow([
    session.sid,
    session.code,
    body.seq,
    body.step,
    body.status,
    JSON.stringify(sections),
    new Date(),
  ]);
  if (body.step === "finish" || body.step === "cancel") {
    if (body.step === "finish" && body.emailRequested === true) {
      session.sheet
        .getRange(session.invite.row, AUDIT_COLUMNS.emailRequested)
        .setValue(true);
    }
    session.sheet
      .getRange(session.invite.row, AUDIT_COLUMNS.state)
      .setValue(body.step === "finish" ? "completed" : "interrupted");
    session.sheet
      .getRange(session.invite.row, COLS.status)
      .setValue(body.step === "finish" ? "teszt kész" : "teszt megszakadt");
  }
  session.sheet.getRange(session.invite.row, COLS.used).setValue(new Date());
  return json_({ ok: true, seq: body.seq, saved: true });
}

function auditStatus_(body) {
  var session = auditSession_(body, true);
  var after = body.after === undefined ? 0 : body.after;
  if (typeof after !== "number" || after % 1 !== 0 || after < 0)
    auditError_("Hibás sorszám.");
  var events = auditEvents_(session);
  var usbSections = [];
  var webSections = [];
  events.forEach(function (row) {
    var sections = JSON.parse(row[5]);
    if (row[3] === "usb") usbSections = sections;
    else if (sections.length) webSections = sections;
  });
  return json_({
    ok: true,
    sid: session.sid,
    state: session.invite.values[AUDIT_COLUMNS.state - 1],
    emailRequested:
      session.invite.values[AUDIT_COLUMNS.emailRequested - 1] === true,
    mailState: session.invite.values[AUDIT_COLUMNS.mail - 1],
    seq: events.length,
    sections: usbSections.concat(webSections),
    events: events
      .filter(function (row) {
        return Number(row[2]) > after;
      })
      .map(function (row) {
        return { seq: row[2], step: row[3], status: row[4], time: row[6] };
      }),
  });
}

function auditEmail_(body) {
  var session = auditSession_(body);
  if (
    ["completed", "interrupted"].indexOf(
      session.invite.values[AUDIT_COLUMNS.state - 1],
    ) < 0
  )
    auditError_("A teszt még nem ért véget.");
  if (session.invite.values[AUDIT_COLUMNS.emailRequested - 1] !== true)
    auditError_("Az eladó nem kért emailriportot.");
  if (typeof body.email !== "string") auditError_("Hibás emailcím.");
  var email = body.email.trim();
  if (
    !email ||
    email.length > 254 ||
    /[^\x21-\x7e]/.test(email) ||
    !/^[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+\.[^\s@,;<>:"\\]+$/.test(email)
  )
    auditError_("Hibás emailcím.");
  var mailState = session.invite.values[AUDIT_COLUMNS.mail - 1];
  if (mailState === "sent")
    return json_({ ok: true, duplicate: true, emailSent: true });
  if (mailState === "sending")
    auditError_(
      "Az emailküldés eredménye bizonytalan. Ellenőrizd a postaládát; nem küldjük újra automatikusan.",
    );
  var props = PropertiesService.getScriptProperties();
  var dayKey =
    "mails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd");
  var count = Number(props.getProperty(dayKey) || 0);
  if (count >= DAILY_MAILS || MailApp.getRemainingDailyQuota() < 1)
    auditError_(
      "Elérte a napi emailkeretet. Az eredmények a Sheetben megmaradtak.",
    );
  var state = JSON.parse(
    auditStatus_({ code: session.code, sid: session.sid }).getContent(),
  );
  var content = render_(state.sections);
  var log = {
    title: "A teszt menete",
    rows: state.events.map(function (event) {
      return {
        label: event.step,
        value: event.status,
        status: "info",
        tag: String(event.time),
      };
    }),
  };
  var logContent = render_([log]);
  var label = String(session.invite.values[COLS.label - 1] || "")
    .replace(/[\r\n]/g, " ")
    .slice(0, 80);
  session.sheet
    .getRange(session.invite.row, AUDIT_COLUMNS.mail)
    .setValue("sending");
  props.setProperty(dayKey, String(count + 1));
  try {
    MailApp.sendEmail({
      to: email,
      subject:
        "iPad audit " +
        (state.state === "completed"
          ? "összesített riport: "
          : "befejezetlen riport: ") +
        label,
      body: content.text + logContent.text,
      htmlBody: content.html + logContent.html,
    });
    session.sheet
      .getRange(session.invite.row, AUDIT_COLUMNS.mail)
      .setValue("sent");
    return json_({ ok: true, emailSent: true });
  } catch (error) {
    auditError_(
      "Az emailküldés eredménye bizonytalan. Ellenőrizd a postaládát; nem küldjük újra automatikusan.",
    );
  }
}

function auditLink_(body) {
  var session = auditSession_(body);
  if (session.invite.values[AUDIT_COLUMNS.state - 1] !== "running")
    auditError_("A teszt már lezárult.");
  var events = auditEvents_(session);
  if (
    !events.some(function (row) {
      return row[3] === "usb";
    })
  )
    auditError_("A link küldéséhez előbb USB-kiolvasás szükséges.");
  if (typeof body.email !== "string") auditError_("Hibás emailcím.");
  var email = body.email.trim();
  if (
    !email ||
    email.length > 254 ||
    /[^\x21-\x7e]/.test(email) ||
    !/^[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+\.[^\s@,;<>:"\\]+$/.test(email)
  )
    auditError_("Hibás emailcím.");
  var mailState = session.invite.values[AUDIT_COLUMNS.mail - 1];
  if (mailState === "sent" || mailState === "link_sent")
    return json_({ ok: true, duplicate: true, linkSent: true });
  if (mailState === "sending")
    auditError_(
      "Az emailküldés eredménye bizonytalan. Ellenőrizd a postaládát; nem küldjük újra automatikusan.",
    );
  var props = PropertiesService.getScriptProperties();
  var dayKey =
    "mails:" + Utilities.formatDate(new Date(), "Etc/UTC", "yyyy-MM-dd");
  var count = Number(props.getProperty(dayKey) || 0);
  if (count >= DAILY_MAILS || MailApp.getRemainingDailyQuota() < 1)
    auditError_(
      "Elérte a napi emailkeretet. Az oldalt a megadott címen nyithatod meg.",
    );
  var link = SITE_URL + "#" + session.code + "." + session.sid;
  var label = String(session.invite.values[COLS.label - 1] || "")
    .replace(/[\r\n]/g, " ")
    .slice(0, 80);
  var text =
    "Az iPad / iPhone állapot-ellenőrzés folytatása ezen az eszközön:\n\n" +
    link +
    "\n\nMeghívókód: " +
    groupCode_(session.code) +
    "\n\nA webes hardverteszteket ezen az eszközön végezd el. Az eredményeket folyamatosan mentjük a Google Sheetbe. A teszt legvégén az összesített riportot is elküldjük.\n";
  var html =
    '<div style="font:14px/1.5 Arial,sans-serif;color:#202124">' +
    '<h2 style="color:#1a73e8;margin:0 0 16px">iPad audit: folytasd az eladandó eszközön</h2>' +
    "<p>A számítógépes USB-kiolvasás és az akkumulátor-terhelésteszt befejeződött. Az eladandó iPaden vagy iPhone-on koppints az alábbi linkre a tesztek folytatásához:</p>" +
    '<p style="margin:20px 0"><a href="' +
    esc_(link) +
    '" style="background:#1a73e8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block">Webes tesztek megnyitása</a></p>' +
    '<p style="color:#5f6368;font-size:12px">Ha a gomb nem kattintható, másold ezt a linket a Safariba:<br><a href="' +
    esc_(link) +
    '" style="color:#1a73e8">' +
    esc_(link) +
    "</a></p>" +
    '<p style="color:#5f6368;font-size:12px">Meghívókód: <b>' +
    esc_(groupCode_(session.code)) +
    "</b></p>" +
    "</div>";
  props.setProperty(dayKey, String(count + 1));
  try {
    MailApp.sendEmail({
      to: email,
      subject: "iPad audit folytatása: " + (label || session.code),
      body: text,
      htmlBody: html,
    });
    session.sheet
      .getRange(session.invite.row, AUDIT_COLUMNS.mail)
      .setValue("link_sent");
    session.sheet
      .getRange(session.invite.row, AUDIT_COLUMNS.emailRequested)
      .setValue(true);
    return json_({ ok: true, linkSent: true });
  } catch (error) {
    auditError_("Az emailküldés nem sikerült.");
  }
}

function auditBatterySheet_() {
  var book = SpreadsheetApp.getActive();
  var sheet = book.getSheetByName("Akku mérés");
  if (!sheet) {
    sheet = book.insertSheet("Akku mérés");
    sheet.appendRow([
      "Session",
      "Meghívó",
      "Másodperc",
      "Töltöttség (%)",
      "Feszültség (mV)",
      "Hőmérséklet (°C)",
      "Ciklus",
      "Töltés",
      "Áram (mA)",
      "Időpont",
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function auditBatterySample_(sample) {
  if (!sample || typeof sample !== "object")
    auditError_("Hibás akkumulátormérési adatok.");
  var sec = sample.sec;
  if (typeof sec !== "number" || sec % 1 !== 0 || sec < 0 || sec > 3600)
    auditError_("Hibás akkumulátormérési adatok.");
  var level = sample.level === undefined ? null : sample.level;
  if (
    level !== null &&
    (typeof level !== "number" || level % 1 !== 0 || level < 0 || level > 100)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var voltageMv = sample.voltageMv === undefined ? null : sample.voltageMv;
  if (
    voltageMv !== null &&
    (typeof voltageMv !== "number" ||
      voltageMv % 1 !== 0 ||
      voltageMv < 2000 ||
      voltageMv > 6000)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var tempC = sample.tempC === undefined ? null : sample.tempC;
  if (
    tempC !== null &&
    (typeof tempC !== "number" ||
      !isFinite(tempC) ||
      tempC < -20 ||
      tempC > 100)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var cycles = sample.cycles === undefined ? null : sample.cycles;
  if (
    cycles !== null &&
    (typeof cycles !== "number" ||
      cycles % 1 !== 0 ||
      cycles < 0 ||
      cycles > 10000)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var charging = sample.charging === undefined ? null : sample.charging;
  if (charging !== null && typeof charging !== "boolean")
    auditError_("Hibás akkumulátormérési adatok.");
  var currentMa = sample.currentMa === undefined ? null : sample.currentMa;
  if (
    currentMa !== null &&
    (typeof currentMa !== "number" ||
      currentMa % 1 !== 0 ||
      currentMa < -10000 ||
      currentMa > 10000)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  return {
    sec: sec,
    level: level,
    voltageMv: voltageMv,
    tempC: tempC,
    cycles: cycles,
    charging: charging,
    currentMa: currentMa,
  };
}

function auditBattery_(body) {
  var session = auditSession_(body);
  if (session.invite.values[AUDIT_COLUMNS.state - 1] !== "running")
    auditError_("A teszt már lezárult.");
  if (
    !Array.isArray(body.samples) ||
    !body.samples.length ||
    body.samples.length > 120
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var samples = body.samples.map(auditBatterySample_);
  var section = auditSections_([body.section])[0];
  var eventsSheet = auditEventsSheet_();
  var allEvents = eventsSheet.getDataRange().getValues();
  var usbRow = 0;
  var usbSections = [];
  for (var index = 1; index < allEvents.length; index++) {
    if (
      allEvents[index][0] === session.sid &&
      String(allEvents[index][1]) === session.code &&
      allEvents[index][3] === "usb"
    ) {
      usbRow = index + 1;
      usbSections = JSON.parse(allEvents[index][5]).filter(function (item) {
        return item.title !== section.title;
      });
      break;
    }
  }
  if (!usbRow)
    auditError_("Az akkumulátorméréshez előbb USB-kiolvasás szükséges.");
  var batterySheet = auditBatterySheet_();
  var existing = batterySheet
    .getDataRange()
    .getValues()
    .slice(1)
    .filter(function (row) {
      return row[0] === session.sid && String(row[1]) === session.code;
    });
  var seen = {};
  existing.forEach(function (row) {
    seen[Number(row[2])] = true;
  });
  var saved = 0;
  samples.forEach(function (sample) {
    if (seen[sample.sec]) return;
    seen[sample.sec] = true;
    saved++;
    batterySheet.appendRow([
      session.sid,
      session.code,
      sample.sec,
      sample.level === null ? "" : sample.level,
      sample.voltageMv === null ? "" : sample.voltageMv,
      sample.tempC === null ? "" : sample.tempC,
      sample.cycles === null ? "" : sample.cycles,
      sample.charging === null ? "" : sample.charging ? "igen" : "nem",
      sample.currentMa === null ? "" : sample.currentMa,
      new Date(),
    ]);
  });
  usbSections.push(section);
  eventsSheet.getRange(usbRow, 6).setValue(JSON.stringify(usbSections));
  session.sheet.getRange(session.invite.row, COLS.used).setValue(new Date());
  return json_({ ok: true, saved: saved });
}

function auditBatterySheet_() {
  var book = SpreadsheetApp.getActive();
  var sheet = book.getSheetByName("Akku mérés");
  if (!sheet) {
    sheet = book.insertSheet("Akku mérés");
    sheet.appendRow([
      "Session",
      "Meghívó",
      "Másodperc",
      "Töltöttség (%)",
      "Feszültség (mV)",
      "Hőmérséklet (°C)",
      "Ciklus",
      "Töltés",
      "Áram (mA)",
      "Időpont",
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function auditBatterySample_(sample) {
  if (!sample || typeof sample !== "object")
    auditError_("Hibás akkumulátormérési adatok.");
  var sec = sample.sec;
  if (typeof sec !== "number" || sec % 1 !== 0 || sec < 0 || sec > 3600)
    auditError_("Hibás akkumulátormérési adatok.");
  var level = sample.level === undefined ? null : sample.level;
  if (
    level !== null &&
    (typeof level !== "number" || level % 1 !== 0 || level < 0 || level > 100)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var voltageMv = sample.voltageMv === undefined ? null : sample.voltageMv;
  if (
    voltageMv !== null &&
    (typeof voltageMv !== "number" ||
      voltageMv % 1 !== 0 ||
      voltageMv < 2000 ||
      voltageMv > 6000)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var tempC = sample.tempC === undefined ? null : sample.tempC;
  if (
    tempC !== null &&
    (typeof tempC !== "number" ||
      !isFinite(tempC) ||
      tempC < -20 ||
      tempC > 100)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var cycles = sample.cycles === undefined ? null : sample.cycles;
  if (
    cycles !== null &&
    (typeof cycles !== "number" ||
      cycles % 1 !== 0 ||
      cycles < 0 ||
      cycles > 10000)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var charging = sample.charging === undefined ? null : sample.charging;
  if (charging !== null && typeof charging !== "boolean")
    auditError_("Hibás akkumulátormérési adatok.");
  var currentMa = sample.currentMa === undefined ? null : sample.currentMa;
  if (
    currentMa !== null &&
    (typeof currentMa !== "number" ||
      currentMa % 1 !== 0 ||
      currentMa < -10000 ||
      currentMa > 10000)
  )
    auditError_("Hibás akkumulátormérési adatok.");
  return {
    sec: sec,
    level: level,
    voltageMv: voltageMv,
    tempC: tempC,
    cycles: cycles,
    charging: charging,
    currentMa: currentMa,
  };
}

function auditBattery_(body) {
  var session = auditSession_(body);
  if (session.invite.values[AUDIT_COLUMNS.state - 1] !== "running")
    auditError_("A teszt már lezárult.");
  if (
    !Array.isArray(body.samples) ||
    !body.samples.length ||
    body.samples.length > 120
  )
    auditError_("Hibás akkumulátormérési adatok.");
  var samples = body.samples.map(auditBatterySample_);
  var section = auditSections_([body.section])[0];
  var eventsSheet = auditEventsSheet_();
  var allEvents = eventsSheet.getDataRange().getValues();
  var usbRow = 0;
  var usbSections = [];
  for (var index = 1; index < allEvents.length; index++) {
    if (
      allEvents[index][0] === session.sid &&
      String(allEvents[index][1]) === session.code &&
      allEvents[index][3] === "usb"
    ) {
      usbRow = index + 1;
      usbSections = JSON.parse(allEvents[index][5]).filter(function (item) {
        return item.title !== section.title;
      });
      break;
    }
  }
  if (!usbRow)
    auditError_("Az akkumulátorméréshez előbb USB-kiolvasás szükséges.");
  var batterySheet = auditBatterySheet_();
  var existing = batterySheet
    .getDataRange()
    .getValues()
    .slice(1)
    .filter(function (row) {
      return row[0] === session.sid && String(row[1]) === session.code;
    });
  var seen = {};
  existing.forEach(function (row) {
    seen[Number(row[2])] = true;
  });
  var saved = 0;
  samples.forEach(function (sample) {
    if (seen[sample.sec]) return;
    seen[sample.sec] = true;
    saved++;
    batterySheet.appendRow([
      session.sid,
      session.code,
      sample.sec,
      sample.level === null ? "" : sample.level,
      sample.voltageMv === null ? "" : sample.voltageMv,
      sample.tempC === null ? "" : sample.tempC,
      sample.cycles === null ? "" : sample.cycles,
      sample.charging === null ? "" : sample.charging ? "igen" : "nem",
      sample.currentMa === null ? "" : sample.currentMa,
      new Date(),
    ]);
  });
  usbSections.push(section);
  eventsSheet.getRange(usbRow, 6).setValue(JSON.stringify(usbSections));
  session.sheet.getRange(session.invite.row, COLS.used).setValue(new Date());
  return json_({ ok: true, saved: saved });
}

function auditDispatch_(body) {
  try {
    if (body.action === "audit_begin") return auditBegin_(body);
    if (body.action === "audit_event") return auditEvent_(body);
    if (body.action === "audit_battery") return auditBattery_(body);
    if (body.action === "audit_status") return auditStatus_(body);
    if (body.action === "audit_link") return auditLink_(body);
    if (body.action === "audit_email") return auditEmail_(body);
    return fail_("Ismeretlen tesztművelet.");
  } catch (error) {
    return fail_(
      error.audit
        ? error.message
        : "A teszt mentése nem sikerült. Próbáld újra.",
    );
  }
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
    if (typeof body.action === "string" && body.action.indexOf("audit_") === 0)
      return auditDispatch_(body);
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
