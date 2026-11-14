/* ---- hardverteszt: az oldal maga méri, mit érzékel az eszköz ---- */

var HW_FLOW = {
  ios: [
    "touch",
    "motion",
    "audio",
    "camera_rear",
    "camera_front",
    "display",
    "buttons"
  ],
  mac: ["keyboard", "pointer", "audio", "camera_front", "display"]
};
var HW_TITLES = {
  touch: "Érintőképernyő",
  motion: "Mozgásérzékelők",
  audio: "Hangszóró és mikrofon",
  camera_rear: "Hátlapi kamera",
  camera_front: "Előlapi kamera",
  display: "Kijelző színei",
  buttons: "Fizikai gombok",
  keyboard: "Billentyűzet",
  pointer: "Egér és trackpad"
};

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}
function hwList() {
  return HW_FLOW[state.kind === "mac" ? "mac" : "ios"];
}
// Számítógépről az iPad hardverét nem lehet böngészőből tesztelni.
function hwStart() {
  return state.kind === "ios" && ON_COMPUTER ? "review" : "hw_intro";
}
// Az eszközön lefutott böngészős rész után, ha USB-s adat még nincs, jön a "mi maradt" képernyő.
function afterHw() {
  return "review";
}
function hwNext() {
  var list = hwList();
  for (var i = 0; i < list.length; i++) {
    if (!state.hw[list[i]]) {
      go("hw_" + list[i]);
      return;
    }
  }
  go(afterHw());
}
function clearHwActions() {
  var actions = $("hw-actions");
  if (actions && actions.parentNode) {
    actions.parentNode.removeChild(actions);
  }
}
function hwDone(name, status, detail) {
  state.hw[name] = { status: status, detail: detail || "" };
  save();
  auditHardware(name, status);
}
function hwResult(name) {
  var r = state.hw[name];
  var icon = r.status === "ok" ? "✅ " : r.status === "bad" ? "❌ " : "❔ ";
  var cls =
    r.status === "ok" ? "success" : r.status === "bad" ? "error" : "note";
  var text =
    r.status === "unavailable"
      ? r.detail || "ezen a rendszeren a böngészőből nem ellenőrizhető"
      : r.status === "skipped"
        ? "kihagyva" + (r.detail ? ": " + r.detail : "")
        : r.detail || (r.status === "ok" ? "rendben" : "hibás");
  clearHwActions();
  message(
    "result",
    '<div class="' +
      cls +
      '">' +
      icon +
      esc(text) +
      '</div><button type="button" class="btn" id="hw-next">Tovább</button>'
  );
  on("hw-next", hwNext);
}
function hwScreen(name, lead, extra, supported, unavailableText, pre) {
  var alreadyDone = Boolean(state.hw[name]);
  show(
    top() +
      progress(4) +
      "<h1>" +
      HW_TITLES[name] +
      '</h1><p class="lead">' +
      lead +
      "</p>" +
      (pre || "") +
      (supported && !alreadyDone
        ? '<div id="hw-actions"><button type="button" class="btn" id="hw-start">Indítás</button><p><button type="button" class="link" id="hw-skip">Kihagyom</button></p></div>'
        : "") +
      (extra || "") +
      '<div id="result"></div>' +
      foot()
  );
  if (alreadyDone) {
    hwResult(name);
    return false;
  }
  if (!supported) {
    hwDone(name, "unavailable", unavailableText);
    hwResult(name);
    return false;
  }
  on("hw-skip", function () {
    hwDone(name, "skipped");
    hwNext();
  });
  on("hw-start", function () {
    var actions = $("hw-actions");
    if (actions) actions.style.display = "none";
  });
  return true;
}

SCREENS.hw_intro = function () {
  var list = hwList(),
    items = "";
  for (var i = 0; i < list.length; i++)
    items += "<li>" + HW_TITLES[list[i]] + "</li>";
  show(
    top() +
      progress(4) +
      "<h1>Hardverteszt</h1>" +
      '<p class="lead">Kötelező ellenőrzés a vásárló felé: az oldal közvetlenül a beépített érzékelőket, a kamerákat, a kijelzőt és a fizikai gombokat teszteli az eszköz állapotának igazolásához.</p>' +
      '<ul class="marks yes">' +
      items +
      "</ul>" +
      choice(
        "hw-go",
        "Hardverteszt elvégzése",
        "Kb. 2-3 perc az összes beépített komponens ellenőrzése.",
        false
      ) +
      choice(
        "hw-no",
        "Kihagyom a hardvertesztet",
        'Figyelem: a vásárló látni fogja a riportban, hogy a tesztet nem végezted el.',
        false
      ) +
      foot()
  );
  on("hw-go", function () {
    state.hwSkipped = false;
    hwNext();
  });
  on("hw-no", function () {
    state.hwSkipped = true;
    auditRecord("skip", "skipped", webSections(collect()));
    go(afterHw());
  });
};
