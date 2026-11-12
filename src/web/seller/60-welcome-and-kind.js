/* ---------- képernyők ---------- */

// A riport szakaszainak táblázata. Az előnézet és a nyitóoldali példa is ezt használja, ezért a kettő nem térhet el.
function sectionsHtml(sections) {
  var html = "";
  for (var s = 0; s < sections.length; s++) {
    html +=
      "<h2>" +
      esc(sections[s].title) +
      '</h2><div class="tablewrap"><table><thead><tr><th>Adat</th><th>Érték</th><th>Forrás</th></tr></thead><tbody>';
    for (var r = 0; r < sections[s].rows.length; r++) {
      var row = sections[s].rows[r];
      html +=
        "<tr><td>" +
        esc(row.label) +
        "</td><td>" +
        esc(row.value) +
        "</td><td>" +
        esc(row.tag) +
        "</td></tr>";
    }
    html += "</tbody></table></div>";
  }
  return html;
}

function begin() {
  var typed = $("code") ? $("code").value : "";
  var text = String(typed)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (text === "DEMO") {
    DEMO = true;
    CODE = "";
    go("kind");
    return;
  }
  if (!CODE_PATTERN.test(text)) {
    message(
      "msg",
      '<div class="error">A meghívókód 9 számjegyből áll. Ellenőrizd, hogy pontosan úgy írtad-e be, ahogy kaptad.</div>'
    );
    return;
  }
  DEMO = false;
  CODE = text;
  go("kind");
}

SCREENS.welcome = function () {
  var example = window.SellerExample
    ? '<details class="example"><summary>Példa: ilyen riportot kapsz a végén (kitalált adatokkal)</summary>' +
      '<p class="muted">Ez egy kitalált példa. A te riportod az előnézetben pontosan így fog kinézni, a te adataiddal, és csak a Küldés gomb után megy el.</p>' +
      sectionsHtml(P.buildSections(window.SellerExample.data)) +
      "</details>"
    : "";
  show(
    top() +
      "<h1>Az eszközöd állapotának ellenőrzése</h1>" +
      (DEMO ? demoPanel() : "") +
      '<p class="lead">Először letöltöd és a számítógépeden lefuttatod a USB-kiolvasót. A beleegyezésed után a kiolvasás végén az adatok emailben elmennek a vásárlónak. Utána az eladandó eszközön visszatérsz erre az oldalra, elvégzed a webes teszteket, és a végén külön tesztriportot küldesz. Összesen két email készül.</p>' +
      "<h2>Miért kérjük ezt?</h2>" +
      "<p>Egy használt eszköznél az akkumulátor kopását kívülről nem lehet megítélni. Ha mindketten ugyanazokat a számokat látjuk, az átvételnél nem lesz félreértés, és ez neked is megkönnyíti az eladást.</p>" +
      "<h2>Mit olvasunk ki, és mit nem?</h2>" +
      '<div class="grid2">' +
      '<div class="card"><h3>Ezt kérjük</h3><ul class="marks yes">' +
      "<li>az akkumulátor ciklusszáma és maximális kapacitása</li>" +
      "<li>az eszköz típusa, tárhelye és rendszerverziója</li>" +
      "<li>hogy ki van-e jelentkezve az Apple-fiókodból</li>" +
      "<li>a sorozatszám, hogy a vásárló az Apple-nél ellenőrizhesse a modellt (kikapcsolhatod)</li>" +
      "</ul></div>" +
      '<div class="card"><h3>Ezt soha nem kérjük</h3><ul class="marks no">' +
      "<li>jelszavak, Apple-fiók, e-mail cím, telefonszám</li>" +
      "<li>fotók, üzenetek, névjegyek, fájlok</li>" +
      "<li>telepített alkalmazások, böngészési adatok</li>" +
      "<li>IMEI, eszköznév, helyadat, Wi-Fi hálózatok</li>" +
      "</ul></div>" +
      "</div>" +
      example +
      "<h2>Hogyan védjük az adataidat?</h2>" +
      '<ul class="plain">' +
      "<li><b>Te döntesz.</b> A USB-riport automatikus küldéséhez a program a kiolvasás előtt kér beleegyezést. A webes tesztek riportját a végén külön jóváhagyod.</li>" +
      "<li><b>Nem módosítunk semmit.</b> Az oldal nem telepít programot, és nem változtat az eszközödön.</li>" +
      "<li><b>Egyetlen címzett.</b> A USB-adatok és a webes tesztek két külön emailben mennek el a vásárlónak. Az oldal átmenetileg megőrzi a folyamatot az adott böngészőfülben.</li>" +
      '<li><b>Nyílt forráskód.</b> Az oldal teljes kódja nyilvános, bárki ellenőrizheti, mit csinál: <a href="https://gitlab.com/krisz0722/ipad-audit/-/tree/main/web" target="_blank" rel="noopener">forráskód megtekintése</a>.</li>' +
      "<li><b>Bármikor kiléphetsz.</b> Ha meggondolod magad, zárd be az oldalt. Addig nem történik semmi.</li>" +
      "</ul>" +
      '<div class="note"><b>Fontos:</b> az oldalt megnyithatod az eladandó eszközön (a Beállításokból adod meg az adatokat), vagy egy számítógépen (iPad és iPhone esetén USB-kábellel olvassuk ki). Macnél azon a Macen nyisd meg, amelyet eladsz.</div>' +
      "<h2>Meghívókód</h2>" +
      "<p>Írd be a vásárlótól kapott 9 számjegyű kódot. A szóköz és a kötőjel nem számít.</p>" +
      '<label class="field">Meghívókód<input type="text" id="code" value="' +
      esc(DEMO ? "DEMO" : CODE) +
      '" placeholder="Például: 123 456 789" maxlength="24" inputmode="numeric" autocomplete="off" spellcheck="false"></label>' +
      '<div id="msg"></div>' +
      '<button type="button" class="btn" id="start">Rendben, kezdjük</button>'
  );
  on("start", begin);
  var demoButtons = app.querySelectorAll("[data-demo]");
  for (var d = 0; d < demoButtons.length; d++) {
    demoButtons[d].addEventListener("click", function () {
      jumpDemo(this.getAttribute("data-demo"));
    });
  }
  $("code").addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.keyCode === 13) begin();
  });
  $("code").addEventListener("input", function () {
    var digits = this.value.replace(/\D/g, "");
    if (digits.length === this.value.replace(/[\s-]/g, "").length)
      this.value = digits.replace(/(\d{3})(?=\d)/g, "$1 ");
  });
};

function pickKind(kind) {
  if (state.kind !== kind) {
    state.route = "";
    state.parsed = {};
    state.hw = {};
    state.hwSkipped = false;
  }
  state.kind = kind;
  if (kind === "mac") {
    go("mac_run");
    return;
  }
  if (localUsbBlock) {
    go("usb_result");
    return;
  }
  if (ON_COMPUTER) {
    go("usb_get");
    return;
  }
  go("web_intro");
}

SCREENS.kind = function () {
  show(
    top() +
      progress(1) +
      "<h1>Milyen eszközt adsz el?</h1>" +
      "<p>Ettől függ, hogyan olvassuk ki az akkumulátor adatait.</p>" +
      choice(
        "k-ios",
        "iPad vagy iPhone",
        "Az adatokat a Beállításokból olvassuk ki. Nem kell semmit telepítened.",
        state.kind === "ios"
      ) +
      choice(
        "k-mac",
        "Mac",
        "MacBook, iMac vagy Mac mini. Egy rövid, csak olvasó parancsot futtatsz a Terminálban.",
        state.kind === "mac"
      ) +
      foot()
  );
  on("k-ios", function () {
    pickKind("ios");
  });
  on("k-mac", function () {
    pickKind("mac");
  });
};
