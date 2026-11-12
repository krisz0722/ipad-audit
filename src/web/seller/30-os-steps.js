/* ---------- rendszerverzió szerinti lépések ---------- */

// Az iOS 9 menünevei egy valódi, magyar nyelvű iPad mini fényképeiről vannak leolvasva. A többi rendszeré az Apple magyar
// oldalairól és magyar útmutatókból származik, valódi eszközön még ellenőrizendő.
var OS_LABELS = {
  legacy: "iOS 9 vagy 10",
  mid: "iOS 11 vagy 12",
  modern: "iPadOS 13 vagy 14",
  latest: "iPadOS 15 vagy újabb"
};
var OS_ORDER = ["legacy", "mid", "modern", "latest"];
var OS_STEPS = {
  legacy: {
    paste: true,
    batteryScreen: false,
    path: "<b>Beállítások &gt; Adatvédelem</b>, majd a lista legalján a <b>Diagn. és használat</b> sor",
    list: "Koppints a <b>Diag. és használati adatok</b> sorra. A lista betűrendben van, keresd a <b>log-aggregated-...</b> kezdetű bejegyzést (az l betűnél), és válaszd a legfrissebb dátumút.",
    model:
      "Beállítások &gt; Általános &gt; Névjegy &gt; Modell. Itt egy kódot látsz (például MD328HC/A), azt is beírhatod.",
    version: "Beállítások &gt; Általános &gt; Névjegy &gt; Verzió.",
    signout:
      "Beállítások &gt; iCloud, legalul Kijelentkezés (Sign Out). iOS 10.3 vagy újabb rendszeren legfelül a neved, lent Kijelentkezés."
  },
  mid: {
    paste: true,
    batteryScreen: true,
    path: "<b>Beállítások &gt; Adatvédelem &gt; Elemzés</b> (Analytics)",
    list: "Koppints az <b>Elemzési adatok</b> (Analytics Data) pontra, és keresd meg a legfrissebb <b>log-aggregated-...</b> nevű bejegyzést.",
    model: "Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév vagy Modell.",
    version: "Beállítások &gt; Általános &gt; Névjegy &gt; Verzió.",
    signout: "Beállítások, legfelül a neved, lent Kijelentkezés."
  },
  modern: {
    paste: false,
    batteryScreen: true,
    path: "<b>Beállítások &gt; Adatvédelem &gt; Elemzések és fejlesztések</b>",
    list: "Koppints az <b>Elemzési adatok</b> pontra, és keresd meg a legfrissebb <b>Analytics-...</b> kezdetű fájlt.",
    model: "Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév.",
    version: "Beállítások &gt; Általános &gt; Névjegy &gt; Szoftververzió.",
    signout: "Beállítások, legfelül a neved, lent Kijelentkezés."
  },
  latest: {
    paste: false,
    batteryScreen: true,
    path: "<b>Beállítások &gt; Adatvédelem és biztonság &gt; Elemzések és fejlesztések</b>",
    list: "Koppints az <b>Elemzési adatok</b> pontra, és keresd meg a legfrissebb <b>Analytics-...</b> kezdetű fájlt.",
    model: "Beállítások &gt; Általános &gt; Névjegy &gt; Típusnév.",
    version: "Beállítások &gt; Általános &gt; Névjegy &gt; Szoftververzió.",
    signout: "Beállítások, legfelül a neved, lent Kijelentkezés."
  }
};

function familyOf(major) {
  if (major <= 10) return "legacy";
  if (major <= 12) return "mid";
  if (major <= 14) return "modern";
  return "latest";
}
function current() {
  return OS_STEPS[state.osFamily] || OS_STEPS.latest;
}
// Az akku-ág első képernyője az USB-s kérdés után: Beállítások (ha az adott rendszer mutatja), különben a napló.
function afterUsb() {
  return current().batteryScreen ? "screen_ask" : "log_ask";
}

function osSelect() {
  var options = "";
  for (var i = 0; i < OS_ORDER.length; i++) {
    options +=
      '<option value="' +
      OS_ORDER[i] +
      '"' +
      (state.osFamily === OS_ORDER[i] ? " selected" : "") +
      ">" +
      OS_LABELS[OS_ORDER[i]] +
      "</option>";
  }
  var note = state.detectedOs
    ? "Automatikusan felismertük: " +
      esc(state.detectedOs) +
      ". Ha nem ez a helyes, válaszd ki a megfelelőt."
    : "Nem sikerült automatikusan felismerni. Válaszd ki a rendszerverziót (Beállítások &gt; Általános &gt; Névjegy).";
  return (
    '<div class="card"><label class="field">Rendszerverzió<select id="osfam">' +
    options +
    "</select><small>" +
    note +
    "</small></label></div>"
  );
}
function bindOsSelect() {
  var select = $("osfam");
  if (!select) return;
  select.addEventListener("change", function () {
    state.osFamily = this.value;
    if (state.step === "screen_ask" && !current().batteryScreen)
      replace("log_ask");
    else render();
  });
}
