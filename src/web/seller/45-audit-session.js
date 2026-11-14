/* ---------- session, lépésmentés és egyszeri összesített riport ---------- */

var auditEmail = "";
var auditPending = null;
var auditFinishing = false;
var auditLastScreen = "";

function auditNotice(text) {
  var node = $("audit-status");
  if (node) node.textContent = text;
}

function auditCall(payload) {
  return send(null, null, payload);
}

function auditFlush() {
  while (state.auditQueue.length && state.auditQueue[0].step === "buttons") {
    state.auditQueue.shift();
  }
  if (
    DEMO ||
    !state.auditActive ||
    !state.auditConsent ||
    !state.auditQueue.length
  )
    return Promise.resolve();
  if (auditPending) return auditPending;
  var event = state.auditQueue[0];
  if (event.step === "finish" && !auditFinishing) return Promise.resolve();
  var payload = {
    action: "audit_event",
    code: CODE,
    sid: state.auditSid,
    seq: event.seq,
    step: event.step,
    status: event.status,
    sections: event.sections
  };
  if (event.step === "finish" && (state.auditEmailRequested || auditEmail))
    payload.emailRequested = true;
  auditPending = auditCall(payload).then(
    function () {
      state.auditQueue.shift();
      save();
      auditPending = null;
      auditNotice("");
      return auditFlush();
    },
    function (error) {
      auditPending = null;
      if (error && error.message === "Hibás tesztlépés.") {
        state.auditQueue.shift();
        save();
        return auditFlush();
      }
      auditNotice(
        "A lépésmentésre várunk. A program újrapróbálja; az oldalt még ne zárd be."
      );
      throw error;
    }
  );
  return auditPending;
}

function auditRecord(step, status, sections) {
  if (DEMO || !state.auditActive || !state.auditConsent || state.sent) return;
  for (var index = 0; index < state.auditQueue.length; index++) {
    if (state.auditQueue[index].step === "finish") return;
  }
  if (state.auditSeq >= 200) {
    auditNotice(
      "Elérted a teszt lépéskorlátját. Az eddig mentett eredmények megmaradtak."
    );
    return;
  }
  state.auditSeq++;
  state.auditQueue.push({
    seq: state.auditSeq,
    step: step,
    status: status,
    sections: sections || []
  });
  save();
  auditFlush().catch(function () {});
}

function auditHardware(name, status) {
  if (name === "buttons") return;
  var step =
    name === "camera_rear" ? "rear" : name === "camera_front" ? "front" : name;
  auditRecord(step, status, webSections(collect()));
}

function auditScreen(name) {
  if (name === auditLastScreen) return;
  auditLastScreen = name;
  var steps = {
    details: "details",
    mac_run: "start",
    mac_manual: "details",
    mac_result: "details",
    hw_intro: "start",
    hw_touch: "touch",
    hw_motion: "motion",
    hw_audio: "audio",
    hw_camera_rear: "rear",
    hw_camera_front: "front",
    hw_display: "display",
    hw_keyboard: "keyboard",
    hw_pointer: "pointer",
    review: "review"
  };
  if (steps[name]) auditRecord(steps[name], "started", webSections(collect()));
}

function auditNewSid() {
  var crypto = window.crypto || window.msCrypto;
  if (!crypto || !crypto.getRandomValues)
    throw new Error("A böngésző nem támogatja a biztonságos tesztindítást.");
  var bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  var value = "";
  for (var index = 0; index < bytes.length; index++)
    value += ("0" + bytes[index].toString(16)).slice(-2);
  return value.toUpperCase();
}

function auditOpen(next, create) {
  if (DEMO) {
    go(next);
    return;
  }
  if (!$("audit-consent") || !$("audit-consent").checked) {
    message(
      "msg",
      '<div class="error">A tesztadatok lépésenkénti mentéséhez előbb add meg a beleegyezésed.</div>'
    );
    return;
  }
  if (!create && state.auditSid && !/^[0-9A-F]{32}$/.test(state.auditSid)) {
    message(
      "msg",
      '<div class="error">A reader végén megjelenő teljes folytatólinket nyisd meg ezen az eszközön.</div>'
    );
    return;
  }
  if (!create && !state.auditSource) state.auditSource = "reader";
  if (create) {
    var wanted = $("audit-email-wanted").checked;
    auditEmail = wanted ? $("audit-email").value.replace(/^\s+|\s+$/g, "") : "";
    if (
      wanted &&
      (!auditEmail ||
        auditEmail.length > 254 ||
        /[^\x21-\x7e]/.test(auditEmail) ||
        !/^[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+\.[^\s@,;<>:"\\]+$/.test(auditEmail))
    ) {
      message(
        "msg",
        '<div class="error">Adj meg egy érvényes emailcímet, vagy kapcsold ki az emailriport kérését.</div>'
      );
      return;
    }
    try {
      if (!state.auditSid) state.auditSid = auditNewSid();
    } catch (error) {
      message("msg", '<div class="error">' + esc(error.message) + "</div>");
      return;
    }
    state.auditSource = "browser";
    state.auditEmailRequested = wanted;
  }
  state.auditConsent = true;
  var opening = create
    ? auditCall({
        action: "audit_begin",
        code: CODE,
        sid: state.auditSid,
        kind: "mac",
        consent: true,
        emailRequested: state.auditEmailRequested
      })
    : Promise.resolve();
  opening
    .then(function () {
      return auditCall({
        action: "audit_status",
        code: CODE,
        sid: state.auditSid,
        after: 0
      });
    })
    .then(function (result) {
      if (result.sid && /^[0-9A-F]{32}$/.test(result.sid))
        state.auditSid = result.sid;
      state.auditEmailRequested = result.emailRequested;
      state.auditQueue = state.auditQueue.filter(function (event) {
        return event.step !== "buttons" && event.seq > result.seq;
      });
      state.auditSeq = Math.max(state.auditSeq, result.seq);
      if (result.sections && result.sections.length) {
        for (var sIdx = 0; sIdx < result.sections.length; sIdx++) {
          if (result.sections[sIdx].title === "Fizikai gombok (USB)") {
            var rows = result.sections[sIdx].rows || [];
            if (rows.length && rows[0].status === "ok") {
              state.hw.buttons = {
                status: "ok",
                detail: rows[0].value || "USB-n ellenőrizve"
              };
              save();
            } else if (rows.length && rows[0].status === "bad") {
              state.hw.buttons = {
                status: "bad",
                detail: rows[0].value || "hibás"
              };
              save();
            }
            break;
          }
        }
      }
      if (result.state !== "running") {
        done(
          result.sections,
          result.mailState === "sent"
            ? "sent"
            : result.emailRequested
              ? "reader"
              : ""
        );
        return;
      }
      state.auditActive = true;
      auditRecord("start", "started", []);
      go(next);
    })
    .catch(function (error) {
      message(
        "msg",
        '<div class="error">' +
          esc(
            error.fromServer
              ? error.message
              : "A tesztindítás nem érte el a szervert. Próbáld újra."
          ) +
          "</div>"
      );
    });
}

function auditComplete(sections) {
  auditFinishing = true;
  auditRecord("finish", "ok", sections);
  return auditFlush()
    .then(function () {
      return auditCall({
        action: "audit_status",
        code: CODE,
        sid: state.auditSid
      });
    })
    .then(function (result) {
      if (result.state !== "completed")
        throw serverError("A végső riport mentése még nem igazolt.");
      if (auditEmail) {
        return auditCall({
          action: "audit_email",
          code: CODE,
          sid: state.auditSid,
          email: auditEmail
        }).then(function (mail) {
          if (!mail.emailSent)
            throw serverError("Az email küldése nem igazolt.");
          auditEmail = "";
          return { sections: result.sections, copyStatus: "sent" };
        });
      }
      var emailWanted = Boolean(
        state.auditEmailRequested || result.emailRequested
      );
      return {
        sections: result.sections,
        copyStatus: emailWanted
          ? state.auditSource === "browser"
            ? "missing"
            : "reader"
          : ""
      };
    });
}

setInterval(function () {
  if (state.auditActive && !state.sent) auditFlush().catch(function () {});
}, 5000);

window.addEventListener("error", function () {
  auditRecord("error", "error", []);
});
