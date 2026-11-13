const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeAudit(options = {}) {
  const calls = [];
  const state = {
    auditSid: "A".repeat(32),
    auditSeq: 1,
    auditQueue: [],
    auditActive: true,
    auditConsent: true,
    auditEmailRequested: true,
    auditSource: "reader",
    sent: false,
    ...options,
  };
  let fail = false;
  const context = {
    state,
    CODE: "123456789",
    DEMO: false,
    Promise,
    window: { addEventListener() {} },
    setInterval() {},
    $: () => null,
    save() {},
    send(_sections, _data, payload) {
      calls.push(JSON.parse(JSON.stringify(payload)));
      if (fail) return Promise.reject(new Error("offline"));
      if (payload.action === "audit_status")
        return Promise.resolve({
          ok: true,
          state: "completed",
          sections: [{ title: "Összesített riport", rows: [] }],
        });
      return Promise.resolve({
        ok: true,
        saved: true,
        emailSent: payload.action === "audit_email",
      });
    },
    serverError: (message) => new Error(message),
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "..", "src/web/seller/45-audit-session.js"),
      "utf8",
    ),
    context,
  );
  return {
    context,
    state,
    calls,
    setFail: (value) => {
      fail = value;
    },
  };
}

test("audit web: induló beleegyezés előtt nincs lépésküldés", async () => {
  const audit = makeAudit({ auditConsent: false });
  audit.context.auditRecord("details", "started", []);
  await audit.context.auditFlush();
  assert.equal(audit.calls.length, 0);
  assert.equal(audit.state.auditQueue.length, 0);
});

test("audit web: offline lépés ugyanazzal a sorszámmal próbálható újra", async () => {
  const audit = makeAudit();
  audit.setFail(true);
  audit.context.auditRecord("details", "started", []);
  await assert.rejects(audit.context.auditFlush(), /offline/);
  assert.equal(audit.state.auditQueue.length, 1);
  audit.setFail(false);
  await audit.context.auditFlush();
  assert.deepEqual(
    audit.calls.map((call) => call.seq),
    [2, 2],
  );
  assert.equal(audit.state.auditQueue.length, 0);
});

test("audit web: a reader kezeli az emailt, a web nem kér címet és nem küld emailkérést", async () => {
  const audit = makeAudit();
  const result = await audit.context.auditComplete([
    { title: "Web", rows: [] },
  ]);
  assert.equal(result.copyStatus, "reader");
  assert.ok(
    audit.calls.some(
      (call) => call.action === "audit_event" && call.step === "finish",
    ),
  );
  assert.ok(!audit.calls.some((call) => call.action === "audit_email"));
});

test("audit web: a Mac emailcíme csak a végső kérésbe kerül, nem a mentett state-be", async () => {
  const audit = makeAudit({ auditSource: "browser" });
  audit.context.auditEmail = "seller@example.test";
  const result = await audit.context.auditComplete([
    { title: "Mac", rows: [] },
  ]);
  assert.equal(result.copyStatus, "sent");
  assert.doesNotMatch(JSON.stringify(audit.state), /seller@example\.test/);
  assert.ok(
    audit.calls
      .filter((call) => call.action !== "audit_email")
      .every((call) => !JSON.stringify(call).includes("seller@example.test")),
  );
  assert.equal(
    audit.calls.filter((call) => call.action === "audit_email").length,
    1,
  );
  assert.equal(audit.context.auditEmail, "");
});
