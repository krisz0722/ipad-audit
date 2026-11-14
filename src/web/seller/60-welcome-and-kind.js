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
    ? '<details class="example"><summary>Példa záró riport megtekintése (kitalált adatokkal)</summary>' +
      '<p class="muted">A teszt lezárásakor hasonló formátumú összefoglalót kapsz.</p>' +
      sectionsHtml(P.buildSections(window.SellerExample.data)) +
      "</details>"
    : "";
  show(
    top() +
      "<h1>Az eszköz állapotának ellenőrzése</h1>" +
      (DEMO ? demoPanel() : "") +
      '<p class="lead">Az ellenőrzés segít tisztázni az eszköz műszaki állapotát (különösen az akkumulátor valós kopását). Nem kötelező, bármikor megszakíthatod, és a program nyílt forráskódú.</p>' +
      '<div class="card"><h3>Hogyan működik?</h3><ol class="steps">' +
      "<li><b>Akkumulátor kiolvasása:</b> iPad és iPhone esetén USB-kábellel a számítógépen, Mac esetén egyetlen Terminál-paranccsal.</li>" +
      "<li><b>Webes hardverteszt:</b> Magán az eladandó eszközön gyorsan ellenőrizzük az érintést, mozgásérzékelőt, hangszórót és kamerákat.</li>" +
      "<li><b>Közös riport:</b> A végén te és a vevő is ugyanazt a tiszta, hitelesített riportot látjátok.</li>" +
      "</ol></div>" +
      '<div class="note"><b>Biztonság és adatvédelem:</b><ul class="marks yes">' +
      "<li><b>Csak technikai adatokat mér:</b> akkumulátor ciklusszám és kapacitás, hardver állapot.</li>" +
      "<li><b>Személyes adathoz soha nem fér hozzá:</b> jelszavak, fotók, üzenetek, Apple-fiók érintetlenek maradnak.</li>" +
      '<li><b>Nyílt forráskódú:</b> a program és a weboldal kódja nyilvánosan ellenőrizhető a <a href="https://github.com/krisz0722/ipad-audit" target="_blank" rel="noopener">GitHubon</a> és <a href="https://gitlab.com/krisz0722/ipad-audit" target="_blank" rel="noopener">GitLaben</a>.</li>' +
      "</ul></div>" +
      example +
      (CODE && !DEMO
        ? ""
        : "<h2>Meghívókód</h2>" +
          "<p>Írd be a vásárlótól kapott 9 számjegyű kódot:</p>" +
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
      "<p>A rész-eredményeket lépésenként a vásárló private Sheetjébe mentjük. A záró riport a végén készül el.</p>" +
      '<label class="check"><input type="checkbox" id="audit-email-wanted"> Kérek másolatot emailben az összesített riportról</label>' +
      '<label class="field" id="audit-email-field" for="audit-email" hidden>Emailcím<input type="email" id="audit-email" maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="sajat@email.hu"></label>' +
      '<p class="muted">Az emailcímet nem mentjük a Sheetbe, csak az egyszeri küldéshez használjuk a végén.</p>' +
      '<label class="check"><input type="checkbox" id="audit-consent"> Beleegyezem a teszt lépéseinek és eredményeinek mentésébe a vásárló private Sheetjében.</label>' +
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
      "<p>Válaszd ki az eladandó eszközt:</p>" +
      choice(
        "k-ios",
        "iPad vagy iPhone",
        "Gyors USB-kiolvasás számítógépen, majd webes teszt az eszközön.",
        state.kind === "ios"
      ) +
      choice(
        "k-mac",
        "Mac",
        "MacBook, iMac vagy Mac mini. Egyetlen csak olvasó Terminál-parancs.",
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
