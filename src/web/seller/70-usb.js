/* ---- akku, iPad és iPhone: USB ---- */

function macDownloadCommand() {
  var base = TOOL_BASE;
  return (
    'cd ~/Downloads && curl -fsSL -o ipad-audit-reader.tar.gz "' +
    base +
    'ipad-audit-reader-macos-$(uname -m).tar.gz" && tar -xzf ipad-audit-reader.tar.gz && ./ipad-audit-reader'
  );
}

SCREENS.usb_get = function () {
  var os = computerOs();
  var groups = os && TOOL_FILES[os] ? [os] : ["windows", "mac", "linux"];
  var base = TOOL_BASE;
  var buttons = "";
  for (var g = 0; g < groups.length; g++) {
    var files = TOOL_FILES[groups[g]];
    for (var i = 0; i < files.length; i++) {
      buttons +=
        '<p><a class="btn dl-link" href="' +
        esc(base + files[i][0]) +
        '" download>' +
        esc(files[i][1]) +
        "</a></p>";
    }
  }
  var notes = "";
  if (os === "windows" || !os) {
    notes +=
      '<div class="note"><b>Windows:</b> kattints a letöltött fájlra. Ha a rendszer figyelmeztet, válaszd a <b>További információ</b>, majd a <b>Futtatás mindenképpen</b> lehetőséget (Apple USB driver szükséges: iTunes vagy Apple Devices app).</div>';
  }
  if (os === "mac" || !os) {
    notes +=
      '<div class="note"><b>Mac:</b> a leggyorsabb, ha a Terminálból indítod ezzel az egy paranccsal:' +
      '<pre class="code" id="mac-cmd">' +
      esc(macDownloadCommand()) +
      "</pre>" +
      '<button type="button" class="btn small" id="copy-mac">Parancs másolása</button><span class="muted" id="copied-mac"></span></div>';
  }
  if (os === "linux" || !os) {
    notes +=
      '<div class="note"><b>Linux (Ubuntu, Debian, Mint):</b> a letöltött <b>.deb</b> csomagra kattints duplán a letöltések között, majd kattints a <b>Telepítés</b> gombra. Ezután az <b>iPad Audit</b> ikonnal egy kattintással elindíthatod.</div>';
  }
  var codeAlert = CODE
    ? '<div class="code-alert" id="code-alert-box">' +
      '<span class="code-alert-title">⚠️ FONTOS: Ezt a kódot add meg az USB programban:</span>' +
      '<div class="code-alert-digits">' +
      esc(formatCode(CODE)) +
      "</div>" +
      '<div><button type="button" class="btn small secondary" id="copy-usb-code">Kód másolása</button><span class="muted" id="copied-usb-code"></span></div>' +
      '<p class="code-alert-sub">A letöltött kiolvasó program indításkor ezt a 9 számjegyű kódot fogja kérni.</p>' +
      "</div>"
    : "";
  var info =
    '<p class="lead">Az iPad és iPhone akkumulátorának pontos adatait a böngésző nem éri el, ezért az első lépést a számítógépeden, USB-kábellel végezzük.</p>' +
    '<div class="note"><b>Biztonságos és nyílt forráskódú:</b> a program csak olvas, semmit nem módosít az eszközön, és személyes adatokhoz nem fér hozzá. A kód nyilvánosan ellenőrizhető a ' +
    '<a href="https://github.com/krisz0722/ipad-audit" target="_blank" rel="noopener">GitHubon</a> és ' +
    '<a href="https://gitlab.com/krisz0722/ipad-audit" target="_blank" rel="noopener">GitLaben</a>.</div>';
  show(
    top() +
      progress(2) +
      "<h1>A kiolvasó program letöltése</h1>" +
      info +
      codeAlert +
      "<h2>Töltsd le a programot a számítógépedre:</h2>" +
      buttons +
      notes +
      foot("u-next", "Letöltöttem, tovább")
  );
  var dlLinks = app.querySelectorAll(".dl-link");
  for (var d = 0; d < dlLinks.length; d++) {
    dlLinks[d].addEventListener("click", function () {
      if (CODE) {
        window.alert(
          "FONTOS!\n\n" +
          "Ezt a kódot add meg az USB programban indításkor:\n\n" +
          formatCode(CODE) + "\n\n" +
          "A letöltött kiolvasó program indításkor ezt a 9 számjegyű kódot fogja kérni a számítógépen."
        );
      }
    });
  }
  on("copy-usb-code", function () {
    copyText(CODE, function (ok) {
      message("copied-usb-code", ok ? " Kimásolva." : " Másold ki: " + esc(CODE));
    });
  });
  on("u-next", function () {
    go("usb_run");
  });
  on("copy-mac", function () {
    copyText(macDownloadCommand(), function (ok) {
      message(
        "copied-mac",
        ok
          ? " Kimásolva."
          : " Nem sikerült. Jelöld ki a parancsot, és másold ki kézzel."
      );
    });
  });
};

SCREENS.usb_run = function () {
  var os = computerOs();
  var runStep =
    os === "windows"
      ? "Kattints duplán a letöltött <b>ipad-audit-reader.exe</b> fájlra."
      : os === "mac"
        ? "Ha a Terminál-parancsot használtad, a program már fut. Különben nyisd meg a Terminált, és indítsd el a letöltött fájlt."
        : os === "linux"
          ? "Indítsd el az <b>iPad Audit</b> ikont az alkalmazásaid közül (vagy terminálból a letöltött fájlt)."
          : "Indítsd el a letöltött programot.";
  show(
    top() +
      progress(2) +
      "<h1>Csatlakoztatás és indítás</h1>" +
      '<p class="lead">Futtasd a kiolvasót a számítógépen. Ha végzett, a teszt magán az eszközön folytatódik.</p>' +
      '<ol class="steps">' +
      "<li><b>Csatlakoztatás:</b> Kösd az eszközt USB-kábellel a számítógéphez, oldd fel, és koppints a <b>Megbízom</b> gombra.</li>" +
      "<li><b>Indítás:</b> " +
      runStep +
      "</li>" +
      "<li><b>Kiolvasás:</b> Indításkor add meg a fenti 9 jegyű kódot (" +
      (CODE ? '<b>' + esc(formatCode(CODE)) + '</b>' : 'a vásárlótól kapott kódot') +
      "), és hagyd jóvá a mérést. (Opcionálisan 5 perces terhelésteszt is futtatható).</li>" +
      "<li><b>Folytatás az eszközön:</b> A program kiírja a webes folytatólinket. Nyisd meg ezt a linket az iPaden vagy iPhone-on a hardvertesztekhez.</li>" +
      "</ol>" +
      '<div class="note"><b>Fontos:</b> A számítógépen futó ablakot hagyd nyitva a folyamat végéig, mert a webes tesztek lezárása után ez készíti el a végső riportot.</div>' +
      foot()
  );
};

SCREENS.usb_result = function () {
  show(
    top() +
      progress(2) +
      "<h1>Kiolvasott adatok</h1>" +
      (usbDelivery.sent
        ? '<div class="success">A szerver visszaigazolta az USB-adatok mentését.</div>'
        : '<div class="note warn">Ellenőrizd a readerben, hogy a szerver visszaigazolta-e az USB-adatok mentését.</div>') +
      '<div id="result"></div>' +
      foot()
  );
  applyUsbText(localUsbBlock || (DEMO ? demoSample("usb") : ""));
};

function publicSellerAddress() {
  return pageAddress();
}

SCREENS.web_intro = function () {
  show(
    top() +
      progress(2) +
      "<h1>Webes tesztek indítása</h1>" +
      '<p class="lead">Az USB-mérés megtörtént. Most magán az eszközön teszteljük az érintőképernyőt, mozgásérzékelőt, hangszórót, kamerákat és a kijelzőt. Kb. 2-3 percet vesz igénybe, és nem kötelező.</p>' +
      '<div class="note">A teszt nem készít fotót, nem rögzít hangot és nem fér hozzá személyes adathoz. A rész-eredmények a vásárló private Sheetjébe mentődnek. A számítógépen futó programot hagyd nyitva a végéig.</div>' +
      '<label class="check"><input type="checkbox" id="audit-consent"' +
      (state.auditConsent ? " checked" : "") +
      '> Beleegyezem a webes teszt lépéseinek, rész-eredményeinek és hibajelzéseinek folyamatos mentésébe a vásárló private Sheetjében.</label><div id="msg"></div>' +
      foot("web-start", "Webes tesztek indítása")
  );
  on("web-start", function () {
    auditOpen("details", false);
  });
};

SCREENS.usb_web_continue = function () {
  show(
    top() +
      "<h1>Folytasd az eladandó eszközön</h1>" +
      "<p>Az iPad vagy iPhone webes tesztjeit magán az eszközön kell elvégezni.</p>" +
      "<p>Nyisd meg a reader által kiírt teljes folytatólinket az iPaden vagy iPhone-on (a kód és a munkamenet benne van, nem kell külön beírni):</p>" +
      '<p><a href="' +
      esc(publicSellerAddress()) +
      '">Webes tesztek megnyitása</a></p>' +
      foot()
  );
};

SCREENS.usb_switch = function () {
  show(
    top() +
      progress(2) +
      "<h1>Nyisd meg a számítógépeden</h1>" +
      '<p class="lead">Az akkumulátor USB-s kiolvasásához számítógép szükséges. Nyisd meg ott ezt a címet:</p>' +
      '<pre class="code" id="addr">' +
      esc(publicSellerAddress()) +
      "</pre>" +
      '<button type="button" class="btn small" id="copy-addr">Cím másolása</button><span class="muted" id="copied-addr"></span>' +
      '<div class="note">A meghívókódot a cím tartalmazza. A számítógépen futtasd a kiolvasót, majd a kapott folytatólinkkel térj vissza ide.</div>' +
      foot()
  );
  on("copy-addr", function () {
    copyText(publicSellerAddress(), function (ok) {
      message(
        "copied-addr",
        ok
          ? " Kimásolva."
          : " Nem sikerült. Jelöld ki a címet, és másold ki kézzel."
      );
    });
  });
};
