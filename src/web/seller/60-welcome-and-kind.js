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
  var typed = $("code") ? $("code").value : CODE;
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
  if ((!ON_COMPUTER || LINK_SID) && !localUsbBlock) {
    pickKind("ios");
    return;
  }
  go("kind");
}

SCREENS.welcome = function () {
  var example = window.SellerExample
    ? '<details class="example"><summary>Példa: ilyen riportot kapsz a végén (kitalált adatokkal)</summary>' +
      '<p class="muted">Ez egy kitalált példa. A saját eredményeidet a teszt végén ugyanilyen táblázatban ellenőrizheted.</p>' +
      sectionsHtml(P.buildSections(window.SellerExample.data)) +
      "</details>"
    : "";
  show(
    top() +
      "<h1>Az eszközöd állapotának ellenőrzése</h1>" +
      (DEMO ? demoPanel() : "") +
      '<p class="lead">Először a számítógépeden lefuttatod az USB-kiolvasót, majd az eladandó iPaden vagy iPhone-on elvégzed a webes teszteket. A beleegyezésed után a lépéseket és az eredményeket a vásárló private Sheetjébe mentjük. Az elején egyszer kérhetsz emailt: a végén egy összesített riportot kapsz. A számítógépes programot addig hagyd nyitva.</p>' +
      "<h2>Miért kérjük ezt?</h2>" +
      "<p>Egy használt eszköznél az akkumulátor kopását kívülről nem lehet megítélni. Ha mindketten ugyanazokat a számokat látjuk, az átvételnél nem lesz félreértés, és ez neked is megkönnyíti az eladást.</p>" +
      "<h2>Mit olvasunk ki, és mit nem?</h2>" +
      '<div class="grid2">' +
      '<div class="card"><h3>Ezt kérjük</h3><ul class="marks yes">' +
      "<li>az akkumulátor ciklusszáma és maximális kapacitása</li>" +
      "<li>az eszköz típusa, tárhelye és rendszerverziója</li>" +
      "<li>hogy ki van-e jelentkezve az Apple-fiókodból</li>" +
      "<li>a sorozatszám az USB-adatokkal együtt; a Mac webes riportjánál a megosztás választható</li>" +
      "</ul></div>" +
      '<div class="card"><h3>Ezt soha nem kérjük</h3><ul class="marks no">' +
      "<li>jelszavak, Apple-fiók, az eszközön tárolt emailcímek, telefonszám</li>" +
      "<li>fotók, üzenetek, névjegyek, fájlok</li>" +
      "<li>telepített alkalmazások, böngészési adatok</li>" +
      "<li>IMEI, eszköznév, helyadat, Wi-Fi hálózatok</li>" +
      "</ul></div>" +
      "</div>" +
      example +
      "<h2>Hogyan védjük az adataidat?</h2>" +
      '<ul class="plain">' +
      "<li><b>Te döntesz.</b> Az induláskor kérünk beleegyezést a kiolvasáshoz és a tesztadatok folyamatos mentéséhez. A végén ellenőrzöd és lezárod az összesített riportot.</li>" +
      "<li><b>Nem módosítunk semmit.</b> Az oldal nem telepít programot, és nem változtat az eszközödön.</li>" +
      "<li><b>Opcionális emailriport.</b> Az elején megadott címedre a végén egyetlen összesített riportot küldünk, ha kéred. A vásárló a Sheetben látja az eredményeket, külön emailt nem kap. Az emailcímet csak a küldésig tartjuk memóriában, a Sheetbe és a mentett tesztadatokba nem kerül.</li>" +
      '<li><b>Nyílt forráskód.</b> Az oldal teljes kódja nyilvános, bárki ellenőrizheti, mit csinál: <a href="https://gitlab.com/krisz0722/ipad-audit/-/tree/main/web" target="_blank" rel="noopener">forráskód megtekintése</a>.</li>' +
      "<li><b>Bármikor megszakíthatod.</b> Az addig visszaigazolt rész-eredmények a vásárló private Sheetjében megmaradnak. Ha a követés megszakad és kértél emailt, befejezetlen riportot kapsz.</li>" +
      "</ul>" +
      '<div class="note"><b>Fontos:</b> iPadnél és iPhone-nál a kiolvasó a számítógépen fut USB-kábellel, a webes teszteket viszont az eladandó eszközön végzed. Macnél azon a Macen nyisd meg az oldalt, amelyet eladsz.</div>' +
      (CODE && !DEMO
        ? ""
        : "<h2>Meghívókód</h2>" +
          "<p>Írd be a vásárlótól kapott 9 számjegyű kódot. A szóköz és a kötőjel nem számít.</p>" +
          '<label class="field">Meghívókód<input type="text" id="code" value="' +
          esc(DEMO ? "DEMO" : CODE) +
          '" placeholder="Például: 123 456 789" maxlength="24" inputmode="numeric" autocomplete="off" spellcheck="false"></label>') +
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
  if (!$("code")) return;
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
    go(DEMO || state.auditActive ? "mac_run" : "audit_start");
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

SCREENS.audit_start = function () {
  show(
    top() +
      "<h1>A teszt indítása</h1>" +
      "<p>A teszt lépéseit, rész-eredményeit és hibajelzéseit a vásárló private Sheetjébe mentjük. Az összesített riport a végén készül el.</p>" +
      '<label class="check"><input type="checkbox" id="audit-email-wanted"> Szeretnéd a végén emailben megkapni az összesített riportot?</label>' +
      '<label class="field" id="audit-email-field" for="audit-email" hidden>Emailcím<input type="email" id="audit-email" maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
      '<p class="muted">A cím csak ennek a böngészőlapnak a memóriájában marad a küldésig; nem kerül a Sheetbe vagy a mentett tesztadatokba.</p>' +
      '<label class="check"><input type="checkbox" id="audit-consent"> Beleegyezem a teszt lépéseinek és eredményeinek folyamatos mentésébe a vásárló private Sheetjében.</label>' +
      '<div id="msg"></div><button type="button" class="btn" id="audit-next">Teszt indítása</button>' +
      foot()
  );
  $("audit-email-wanted").addEventListener("change", function () {
    $("audit-email-field").hidden = !this.checked;
    if (!this.checked) $("audit-email").value = "";
  });
  on("audit-next", function () {
    auditOpen("mac_run", true);
  });
};

SCREENS.kind = function () {
  show(
    top() +
      progress(1) +
      "<h1>Milyen eszközt adsz el?</h1>" +
      "<p>Ettől függ, hogyan olvassuk ki az akkumulátor adatait.</p>" +
      choice(
        "k-ios",
        "iPad vagy iPhone",
        "USB-kiolvasás a számítógépen, majd webes tesztek ezen az eszközön.",
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
