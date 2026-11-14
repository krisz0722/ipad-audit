// A backend/Code.gs tesztje: az Apps Script szolgáltatásokat egyszerű hamis változatok helyettesítik, a valódi Code.gs fut.
const test = require("node:test");
const assert = require("node:assert");
const { makeBackend } = require("./helpers/backend.js");

const SECTIONS = [
  {
    title: "Eszköz",
    rows: [
      { label: "Modell", value: "iPad mini", status: "ok", tag: "USB-ből" },
    ],
  },
];

test("a deployment check jogosultságot ellenőriz, nem készít meghívót és nem küld emailt", () => {
  const backend = makeBackend();
  const result = backend.context.checkDeployment();
  assert.strictEqual(result.version, "2026.11.14.1");
  assert.strictEqual(result.invitationSheetAvailable, true);
  assert.strictEqual(result.recipientAvailable, true);
  assert.strictEqual(result.remainingMailQuota, 100);
  assert.strictEqual(backend.rows.length, 1);
  assert.strictEqual(backend.mails.length, 0);
});

const AUDIT_SID = "0123456789ABCDEF0123456789ABCDEF";

function beginAudit(backend, emailRequested = false) {
  backend.invite("123456789");
  const result = backend.call({
    action: "audit_begin",
    code: "123456789",
    sid: AUDIT_SID,
    kind: "ios",
    emailRequested,
    consent: true,
  });
  assert.strictEqual(result.ok, true, result.error);
}

test("audit: a USB- és webes eredmény a Sheetbe kerül email nélkül", () => {
  const backend = makeBackend();
  beginAudit(backend);
  for (const [seq, step] of [
    [1, "usb"],
    [2, "start"],
    [3, "finish"],
  ]) {
    const payload = {
      action: "audit_event",
      code: "123456789",
      sid: AUDIT_SID,
      seq,
      step,
      status: "ok",
      sections: step === "start" ? [] : SECTIONS,
    };
    assert.strictEqual(backend.call(payload).ok, true);
    assert.strictEqual(backend.call(payload).duplicate, true);
  }
  const status = backend.call({
    action: "audit_status",
    code: "123456789",
    sid: AUDIT_SID,
    after: 1,
  });
  assert.strictEqual(status.state, "completed");
  assert.strictEqual(status.sections.length, 2);
  assert.deepStrictEqual(
    status.events.map((event) => event.seq),
    [2, 3],
  );
  assert.strictEqual(backend.eventRows.length, 4);
  assert.strictEqual(backend.rows[1][3], "teszt kész");
  assert.strictEqual(backend.mails.length, 0);
});

test("audit: az akkumulátor-terhelésteszt mintái az Akku mérés munkalapra, az összefoglaló az összesített riportba kerül", () => {
  const backend = makeBackend();
  beginAudit(backend);
  const batterySection = {
    title: "Akkumulátor terhelésteszt",
    rows: [
      {
        label: "Töltöttség változása",
        value: "69% -> 67% (merülés: 2%, 0.40%/perc)",
        status: "ok",
        tag: "USB terhelésteszt",
      },
    ],
  };
  assert.strictEqual(
    backend.call({
      action: "audit_battery",
      code: "123456789",
      sid: AUDIT_SID,
      samples: [
        {
          sec: 0,
          level: 69,
          voltageMv: 3973,
          tempC: 37.2,
          cycles: 90,
          charging: true,
          currentMa: -332,
        },
      ],
      section: batterySection,
    }).ok,
    false,
  );
  assert.strictEqual(
    backend.call({
      action: "audit_event",
      code: "123456789",
      sid: AUDIT_SID,
      seq: 1,
      step: "usb",
      status: "ok",
      sections: SECTIONS,
    }).ok,
    true,
  );
  const firstBatch = backend.call({
    action: "audit_battery",
    code: "123456789",
    sid: AUDIT_SID,
    samples: [
      {
        sec: 0,
        level: 69,
        voltageMv: 3973,
        tempC: 37.2,
        cycles: 90,
        charging: true,
        currentMa: -332,
      },
      {
        sec: 1,
        level: 69,
        voltageMv: 3984,
        tempC: 37.3,
        cycles: 90,
        charging: true,
        currentMa: -178,
      },
    ],
    section: batterySection,
  });
  assert.strictEqual(firstBatch.ok, true);
  assert.strictEqual(firstBatch.saved, 2);
  const secondBatch = backend.call({
    action: "audit_battery",
    code: "123456789",
    sid: AUDIT_SID,
    samples: [
      {
        sec: 1,
        level: 69,
        voltageMv: 3984,
        tempC: 37.3,
        cycles: 90,
        charging: true,
        currentMa: -178,
      },
      {
        sec: 2,
        level: 67,
        voltageMv: 3988,
        tempC: 37.9,
        cycles: 90,
        charging: true,
        currentMa: -137,
      },
    ],
    section: batterySection,
  });
  assert.strictEqual(secondBatch.ok, true);
  assert.strictEqual(secondBatch.saved, 1);
  assert.strictEqual(backend.batteryRows.length, 4);
  assert.strictEqual(
    backend.call({
      action: "audit_battery",
      code: "123456789",
      sid: AUDIT_SID,
      samples: [{ sec: 3, level: 150 }],
      section: batterySection,
    }).ok,
    false,
  );
  const status = backend.call({
    action: "audit_status",
    code: "123456789",
    sid: AUDIT_SID,
  });
  assert.strictEqual(status.seq, 1);
  assert.deepStrictEqual(
    status.sections.map((section) => section.title),
    ["Eszköz", "Akkumulátor terhelésteszt"],
  );
});

test("audit: másik session nem olvashat, és a hiányzó lépés nem menthető", () => {
  const backend = makeBackend();
  beginAudit(backend);
  assert.strictEqual(
    backend.call({
      action: "audit_status",
      code: "123456789",
      sid: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    }).ok,
    false,
  );
  assert.strictEqual(
    backend.call({
      action: "audit_event",
      code: "123456789",
      sid: AUDIT_SID,
      seq: 2,
      step: "usb",
      status: "ok",
      sections: SECTIONS,
    }).ok,
    false,
  );
  assert.strictEqual(
    backend.call({
      action: "audit_event",
      code: "123456789",
      sid: AUDIT_SID,
      seq: 1,
      step: "finish",
      status: "ok",
      sections: SECTIONS,
    }).ok,
    false,
  );
  assert.strictEqual(backend.eventRows.length, 1);
});

function completeAudit(backend, emailRequested = true) {
  beginAudit(backend, emailRequested);
  for (const [seq, step, title] of [
    [1, "usb", "USB-adatok"],
    [2, "finish", "Webes tesztek"],
  ]) {
    const result = backend.call({
      action: "audit_event",
      code: "123456789",
      sid: AUDIT_SID,
      seq,
      step,
      status: "ok",
      sections: [{ title, rows: SECTIONS[0].rows }],
    });
    assert.strictEqual(result.ok, true, result.error);
  }
}

test("audit: egy összesített email csak az eladónak megy, címmentés nélkül", () => {
  const backend = makeBackend();
  completeAudit(backend);
  const payload = {
    action: "audit_email",
    code: "123456789",
    sid: AUDIT_SID,
    email: "seller@example.test",
  };
  assert.strictEqual(backend.mails.length, 0);
  assert.strictEqual(backend.call(payload).emailSent, true);
  assert.strictEqual(backend.call(payload).duplicate, true);
  assert.strictEqual(backend.mails.length, 1);
  assert.strictEqual(backend.mails[0].to, "seller@example.test");
  assert.strictEqual(backend.mails[0].bcc, undefined);
  assert.strictEqual(backend.mails[0].cc, undefined);
  assert.match(backend.mails[0].body, /USB-adatok/);
  assert.match(backend.mails[0].body, /Webes tesztek/);
  assert.match(backend.mails[0].body, /A teszt menete/);
  assert.doesNotMatch(
    JSON.stringify({
      rows: backend.rows,
      events: backend.eventRows,
      cache: Array.from(backend.cache),
      props: Array.from(backend.props),
    }),
    /seller@example\.test/,
  );
});

test("audit: kérés nélkül, teszt közben vagy hibás címre nem küld emailt", () => {
  const backend = makeBackend();
  beginAudit(backend, true);
  const payload = {
    action: "audit_email",
    code: "123456789",
    sid: AUDIT_SID,
    email: "seller@example.test",
  };
  assert.strictEqual(backend.call(payload).ok, false);
  const declined = makeBackend();
  completeAudit(declined, false);
  assert.strictEqual(declined.call(payload).ok, false);
  const completed = makeBackend();
  completeAudit(completed);
  for (const email of [
    "",
    "invalid",
    "seller@example.test,other@example.test",
    "seller@example.test\r\nBcc: other@example.test",
  ])
    assert.strictEqual(completed.call({ ...payload, email }).ok, false);
  assert.strictEqual(
    backend.mails.length + declined.mails.length + completed.mails.length,
    0,
  );
});

test("audit: bizonytalan emailküldés után nincs automatikus duplikálás", () => {
  const backend = makeBackend();
  completeAudit(backend);
  let attempts = 0;
  backend.context.MailApp.sendEmail = () => {
    attempts++;
    throw new Error("interrupted");
  };
  const payload = {
    action: "audit_email",
    code: "123456789",
    sid: AUDIT_SID,
    email: "seller@example.test",
  };
  assert.strictEqual(backend.call(payload).ok, false);
  assert.strictEqual(backend.call(payload).ok, false);
  assert.strictEqual(attempts, 1);
});

test("a report: ugyanaz a meghívó külön USB és webes emailt enged, retry nem duplikál", () => {
  const backend = makeBackend();
  backend.invite("123456789");
  for (const kind of ["usb", "web"]) {
    const payload = {
      action: "report",
      code: "123456789",
      kind,
      serial: "DMPS00000FAK",
      sections: SECTIONS,
    };
    assert.strictEqual(backend.call(payload).ok, true);
    assert.strictEqual(backend.call(payload).duplicate, true);
  }
  assert.strictEqual(backend.mails.length, 2);
  assert.match(backend.mails[0].subject, /USB/);
  assert.match(backend.mails[1].subject, /webes teszt/);
  assert.strictEqual(backend.rows[1][3], "riportok elküldve");
});

test("a report: az opcionális saját másolat ugyanaz az email, a cím nem tárolódik", () => {
  const backend = makeBackend();
  backend.invite("123456789");
  for (const kind of ["usb", "web"]) {
    const payload = {
      action: "report",
      code: "123456789",
      kind,
      serial: "DMPS00000FAK",
      sections: SECTIONS,
      copyEmail: " seller+audit@example.test ",
    };
    const result = backend.call(payload);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.copySent, true);
    assert.strictEqual(backend.call(payload).duplicate, true);
    assert.ok(!JSON.stringify(result).includes("seller+audit@example.test"));
  }
  assert.strictEqual(backend.mails.length, 2);
  for (const mail of backend.mails) {
    assert.strictEqual(mail.to, "owner@example.test");
    assert.strictEqual(mail.bcc, "seller+audit@example.test");
    assert.ok(mail.body.startsWith(backend.context.render_(SECTIONS).text));
    assert.ok(mail.htmlBody.startsWith(backend.context.render_(SECTIONS).html));
  }
  assert.match(
    backend.mails[0].body,
    /https:\/\/apple\.audit\.kokocloud\.space\/#123456789/,
  );
  assert.ok(
    backend.mails[0].htmlBody.includes(
      'href="https://apple.audit.kokocloud.space/#123456789"',
    ),
  );
  assert.strictEqual(
    backend.mails[1].htmlBody,
    backend.context.render_(SECTIONS).html,
  );
  const stored = JSON.stringify({
    rows: backend.rows,
    props: Array.from(backend.props),
    cache: Array.from(backend.cache),
  });
  assert.ok(!stored.includes("seller+audit@example.test"));
  assert.ok(Array.from(backend.props.values()).includes("4"));
});

test("a report: a hibás másolatcím nem küld és nem használja fel a meghívót", () => {
  const backend = makeBackend();
  backend.invite("123456789");
  for (const copyEmail of [
    null,
    ["seller@example.test"],
    "hibás",
    "seller@example.test,other@example.test",
    "seller@example.test\r\nBcc: other@example.test",
    "a".repeat(255) + "@example.test",
  ]) {
    const result = backend.call({
      action: "report",
      code: "123456789",
      kind: "usb",
      sections: SECTIONS,
      copyEmail,
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /emailcím/);
  }
  assert.strictEqual(backend.mails.length, 0);
  assert.strictEqual(backend.rows[1][3], "új");
  assert.strictEqual(backend.props.size, 0);
});

test("a report: a saját másolat külön címzettként számít a keretbe", () => {
  const backend = makeBackend();
  backend.invite("123456789");
  const dayKey = "mails:" + new Date().toISOString().slice(0, 13);
  backend.props.set(dayKey, "19");
  const payload = {
    action: "report",
    code: "123456789",
    kind: "usb",
    sections: SECTIONS,
  };
  assert.strictEqual(
    backend.call({ ...payload, copyEmail: "seller@example.test" }).ok,
    false,
  );
  assert.strictEqual(backend.mails.length, 0);
  assert.strictEqual(backend.props.get(dayKey), "19");
  assert.strictEqual(backend.call(payload).ok, true);
  assert.strictEqual(backend.mails[0].bcc, undefined);
  assert.strictEqual(backend.props.get(dayKey), "20");
});

test("a report: a MailApp címzettkerete és az azonos cím kezelése", () => {
  const backend = makeBackend();
  backend.invite("123456789");
  backend.context.MailApp.getRemainingDailyQuota = () => 1;
  const payload = {
    action: "report",
    code: "123456789",
    kind: "usb",
    sections: SECTIONS,
  };
  assert.strictEqual(
    backend.call({ ...payload, copyEmail: "seller@example.test" }).ok,
    false,
  );
  const result = backend.call({ ...payload, copyEmail: "OWNER@example.test" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.copySent, true);
  assert.strictEqual(backend.mails.length, 1);
  assert.strictEqual(backend.mails[0].bcc, undefined);
});

test("a report: lejárt, ismeretlen meghívó és hibás riport nem küld emailt", () => {
  const backend = makeBackend();
  backend.invite("123456789", "új", -1);
  for (const payload of [
    { code: "123456789", kind: "usb", sections: SECTIONS },
    { code: "999999999", kind: "usb", sections: SECTIONS },
    { code: "123456789", kind: "other", sections: SECTIONS },
    { code: "123456789", kind: "web", sections: [] },
  ])
    assert.strictEqual(
      backend.call({ action: "report", ...payload }).ok,
      false,
    );
  assert.strictEqual(backend.mails.length, 0);
});

test("a report: bizonytalan emailküldést retry sem ismétel meg", () => {
  const backend = makeBackend();
  backend.invite("123456789");
  let attempts = 0;
  backend.context.MailApp.sendEmail = () => {
    attempts++;
    throw new Error("mail service interrupted");
  };
  const payload = {
    action: "report",
    code: "123456789",
    kind: "usb",
    sections: SECTIONS,
  };
  assert.strictEqual(backend.call(payload).ok, false);
  assert.strictEqual(backend.call(payload).ok, false);
  assert.strictEqual(attempts, 1);
});

test("a report: a hibás meghívó-próbálgatás korlátozott", () => {
  const backend = makeBackend();
  backend.invite("123456789");
  for (let attempt = 0; attempt < 30; attempt++) {
    backend.call({
      action: "report",
      code: "999999999",
      kind: "usb",
      sections: SECTIONS,
    });
  }
  assert.match(
    backend.call({
      action: "report",
      code: "123456789",
      kind: "usb",
      sections: SECTIONS,
    }).error,
    /Túl sok hibás/,
  );
  assert.strictEqual(backend.mails.length, 0);
});

test("a kód 9 számjegy, az első nem nulla", () => {
  const b = makeBackend();
  for (let i = 0; i < 300; i++) {
    const code = b.context.randomDigits_(9);
    assert.match(code, /^[1-9][0-9]{8}$/);
  }
});

test("az Új meghívó teljes, előtöltött linket és másolható üzenetet ad, a Táblába is beírja", () => {
  const b = makeBackend("Air 2");
  b.context.newInvite();
  assert.strictEqual(b.rows.length, 2);
  const row = b.rows[1];
  const code = String(row[0]);
  assert.match(code, /^[1-9][0-9]{8}$/);
  assert.strictEqual(row[3], "új");
  assert.strictEqual(
    row[5],
    "https://apple.audit.kokocloud.space/#" + code,
    "a link a Link oszlopba kerül",
  );
  assert.strictEqual(b.rows[0][5], "Link", "a hiányzó fejléc pótlódik");
  assert.strictEqual(b.dialogs.length, 1);
  const html = b.dialogs[0].html;
  assert.ok(html.indexOf("https://apple.audit.kokocloud.space/#" + code) >= 0);
  assert.ok(
    html.includes('href="https://apple.audit.kokocloud.space/#' + code + '"'),
  );
  assert.ok(html.includes("Üzenet másolása"));
  assert.ok(html.includes('Meghívókód:<br><b style="font-size:18px">'));
  assert.ok(
    html.indexOf(
      code.slice(0, 3) + " " + code.slice(3, 6) + " " + code.slice(6),
    ) >= 0,
    "a kód három számjegyes csoportokban is látszik",
  );
  assert.ok(html.indexOf("72 óráig érvényes") >= 0);
});

test("az üzenet nem kér semmit az eladótól, csak a linket és a kódot adja", () => {
  const b = makeBackend();
  const message = b.context.inviteMessage_("123456789");
  assert.match(message, /https:\/\/apple\.audit\.kokocloud\.space\/#123456789/);
  assert.match(
    message,
    /linket:\nhttps:\/\/apple\.audit\.kokocloud\.space\/#123456789\n\n/,
  );
  assert.match(message, /A meghívókód:\n123 456 789\n\n/);
  assert.ok(!/majd küld|útmutató/.test(message));
});

test("a start: érvényes kód munkamenetet ad, a második próba már felhasznált", () => {
  const b = makeBackend();
  b.invite("123456789");
  const started = b.call({ action: "start", code: "123 456-789" });
  assert.ok(started.ok && started.sid);
  assert.strictEqual(b.rows[1][3], "folyamatban");
  const again = b.call({ action: "start", code: "123456789" });
  assert.strictEqual(again.ok, false);
  assert.match(again.error, /már felhasználták/);
});

test("a start: ismeretlen és lejárt kód elutasítva", () => {
  const b = makeBackend();
  b.invite("222333444", "új", -1);
  assert.match(b.call({ action: "start", code: "222333444" }).error, /lejárt/);
  assert.match(
    b.call({ action: "start", code: "999999999" }).error,
    /nem érvényes/,
  );
});

test("a start: óránként legfeljebb 30 hibás próba, utána minden kérés elutasítva", () => {
  const b = makeBackend();
  b.invite("123456789");
  for (let i = 0; i < 30; i++) b.call({ action: "start", code: "999999999" });
  const blocked = b.call({ action: "start", code: "123456789" });
  assert.strictEqual(blocked.ok, false);
  assert.match(blocked.error, /Túl sok hibás próbálkozás/);
});

test("a finish: egy email megy el, a tárgyban a sorozatszám lenyomata áll, második küldés elutasítva", () => {
  const b = makeBackend();
  b.invite("123456789");
  const { sid } = b.call({ action: "start", code: "123456789" });
  assert.ok(
    b.call({
      action: "finish",
      sid,
      serial: "ABCD1234EF56",
      sections: SECTIONS,
    }).ok,
  );
  assert.strictEqual(b.mails.length, 1);
  assert.strictEqual(b.mails[0].to, "owner@example.test");
  assert.match(b.mails[0].subject, /^iPad audit: próba \/ ABCD1234EF56$/);
  assert.ok(b.mails[0].body.indexOf("Modell: iPad mini [USB-ből]") >= 0);
  assert.strictEqual(b.rows[1][3], "riport elküldve");
  const second = b.call({
    action: "finish",
    sid,
    serial: "X",
    sections: SECTIONS,
  });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(b.mails.length, 1);
});

test("a finish: érvénytelen munkamenet és hibás riport elutasítva", () => {
  const b = makeBackend();
  b.invite("123456789");
  assert.strictEqual(
    b.call({
      action: "finish",
      sid: "NEMLETEZIK1",
      serial: "X",
      sections: SECTIONS,
    }).ok,
    false,
  );
  const { sid } = b.call({ action: "start", code: "123456789" });
  assert.strictEqual(
    b.call({ action: "finish", sid, serial: "X", sections: "nem lista" }).ok,
    false,
  );
  assert.strictEqual(b.mails.length, 0);
});

test("a finish: a napi riportkeret 20 email, a 21. elutasítva", () => {
  const b = makeBackend();
  const results = [];
  for (let i = 0; i < 21; i++) {
    const code = String(100000001 + i);
    b.invite(code);
    const { sid } = b.call({ action: "start", code });
    results.push(
      b.call({ action: "finish", sid, serial: "X", sections: SECTIONS }),
    );
  }
  assert.strictEqual(results.filter((r) => r.ok).length, 20);
  assert.strictEqual(results[20].ok, false);
  assert.match(results[20].error, /napi riportkeretet/);
  assert.strictEqual(b.mails.length, 20);
});

test("a szerver nem tárol átadott eredményt: a handoff és a resume ismeretlen művelet", () => {
  const b = makeBackend();
  b.invite("123456789");
  const { sid } = b.call({ action: "start", code: "123456789" });
  assert.strictEqual(
    b.call({ action: "handoff", sid, data: { x: 1 } }).error,
    "Ismeretlen művelet.",
  );
  assert.strictEqual(
    b.call({ action: "resume", code: "123456789" }).error,
    "Ismeretlen művelet.",
  );
});
