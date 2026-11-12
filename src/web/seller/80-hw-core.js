/* ---- hardverteszt: az oldal maga méri, mit érzékel az eszköz ---- */

var HW_FLOW = {
  ios: ["touch", "motion", "audio", "camera_rear", "camera_front", "display"],
  mac: ["keyboard", "pointer", "audio", "camera_front", "display"]
};
var HW_TITLES = {
  touch: "Érintőképernyő",
  motion: "Mozgásérzékelők",
  audio: "Hangszóró és mikrofon",
  camera_rear: "Hátlapi kamera",
  camera_front: "Előlapi kamera",
  display: "Kijelző színei",
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
function hwDone(name, status, detail) {
  state.hw[name] = { status: status, detail: detail || "" };
  save();
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
  show(
    top() +
      progress(4) +
      "<h1>" +
      HW_TITLES[name] +
      '</h1><p class="lead">' +
      lead +
      "</p>" +
      (pre || "") +
      (supported
        ? '<button type="button" class="btn" id="hw-start">Indítás</button><p><button type="button" class="link" id="hw-skip">Kihagyom</button></p>'
        : "") +
      (extra || "") +
      '<div id="result"></div>' +
      foot()
  );
  if (!supported) {
    hwDone(name, "unavailable", unavailableText);
    hwResult(name);
    return false;
  }
  on("hw-skip", function () {
    hwDone(name, "skipped");
    hwNext();
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
      '<p class="lead">Néhány rövid teszt, kb. 3 percig. Az oldal <b>maga méri</b>, mit érzékel az eszköz: hány mezőt érzett az érintőképernyő, mekkora mozgást mért az érzékelő, meghallotta-e a mikrofon a hangjelzést. Nem a te válaszod számít. Ami ezen a rendszeren nem mérhető, azt a riport külön jelzi.</p>' +
      '<ul class="marks yes">' +
      items +
      "</ul>" +
      choice(
        "hw-go",
        "Elkezdem",
        "Kb. 3 perc. Ne vegyél fel hívást közben.",
        false
      ) +
      choice(
        "hw-no",
        "Kihagyom a hardvertesztet",
        'A riportban "nem tesztelt" jelzést kap.',
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
    go(afterHw());
  });
};
