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
        '<p><a class="btn" href="' +
        esc(base + files[i][0]) +
        '" download>' +
        esc(files[i][1]) +
        "</a></p>";
    }
  }
  var notes = "";
  if (os === "windows" || !os) {
    notes +=
      '<div class="note"><b>Windows:</b> az Apple USB-illesztőprogramja is kell hozzá (iTunes vagy Apple Devices alkalmazás). Ha a Windows figyelmeztet ("A Windows megvédte a számítógépet"), kattints a <b>További információ</b>, majd a <b>Futtatás mindenképpen</b> gombra. A program nyílt forráskódú, a letöltés mellett ott az ellenőrző összege.</div>';
  }
  if (os === "mac" || !os) {
    notes +=
      '<div class="note"><b>Mac:</b> a böngészővel letöltött programot a macOS blokkolhatja. Ilyenkor a Terminálból töltsd le, ott nincs blokk.' +
      '<pre class="code" id="mac-cmd">' +
      esc(macDownloadCommand()) +
      "</pre>" +
      '<button type="button" class="btn small" id="copy-mac">Parancs másolása</button><span class="muted" id="copied-mac"></span></div>';
  }
  var trust =
    '<div class="note"><b>Miért megbízható ez a program?</b><ul class="marks yes">' +
    "<li><b>Nyílt forráskód.</b> A program teljes kódja nyilvános, bárki elolvashatja: " +
    '<a href="https://github.com/krisz0722/ipad-audit/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">a GitHubon</a> és ' +
    '<a href="https://gitlab.com/krisz0722/ipad-audit/-/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">a GitLabon</a>.</li>' +
    "<li><b>Csak olvas.</b> Semmit nem módosít az eszközön.</li>" +
    "<li><b>Előzetes beleegyezés.</b> A program a kiolvasás előtt kéri a meghívókódot és a beleegyezésedet. Utána a kiolvasott adatokat automatikusan elküldeti a vásárlónak emailben, majd megnyitja az oldalt a visszaigazolással.</li>" +
    '<li><b>Ellenőrizhető letöltés.</b> A fájlt a GitHub építi a nyilvános kódból (<a href="https://github.com/krisz0722/ipad-audit/actions" target="_blank" rel="noopener">a build naplója</a>), ' +
    'a <a href="https://github.com/krisz0722/ipad-audit/releases/latest" target="_blank" rel="noopener">kiadás oldalán</a> minden fájl mellett ott az ellenőrző összeg (.sha256).</li>' +
    "</ul></div>";
  show(
    top() +
      progress(2) +
      "<h1>A kiolvasó program letöltése</h1>" +
      trust +
      '<p class="lead">Töltsd le a számítógépedre a megfelelő fájlt:</p>' +
      buttons +
      notes +
      foot("u-next", "Letöltöttem, tovább")
  );
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
      ? "Kattints duplán a letöltött fájlra (a mappás változatnál előbb csomagold ki, és az <b>ipad-audit-reader.exe</b> fájlt indítsd)."
      : os === "mac"
        ? "Ha a Terminál-parancsot használtad, a program már fut. Különben nyisd meg a Terminált, és indítsd a letöltött programot."
        : "Csomagold ki a letöltött fájlt, és indítsd el a programot egy terminálból.";
  show(
    top() +
      progress(2) +
      "<h1>Csatlakoztatás és futtatás</h1>" +
      '<ol class="steps">' +
      "<li>Kösd az eszközt USB-kábellel a számítógéphez, oldd fel, és ha megkérdezi, koppints a <b>Megbízom</b> gombra.</li>" +
      "<li>" +
      runStep +
      "</li>" +
      "<li>A programban add meg a meghívókódot, és hagyd jóvá az automatikus USB-riportküldést. A kiolvasás után az első email elmegy, a program pedig megnyitja az oldalt. A webes teszteket az eladandó eszközön folytasd.</li>" +
      "</ol>" +
      '<div class="note">A programot hagyd futni, amíg az oldalon dolgozol.</div>' +
      foot()
  );
};

SCREENS.usb_result = function () {
  show(
    top() +
      progress(2) +
      "<h1>Kiolvasott adatok</h1>" +
      (usbDelivery.sent
        ? '<div class="success">A szerver elküldte a USB-riportot a vásárlónak.</div>'
        : '<div class="note warn">A USB-email küldése nincs visszaigazolva. Ellenőrizd a program üzenetét.</div>') +
      '<div id="result"></div>' +
      foot()
  );
  applyUsbText(localUsbBlock || (DEMO ? demoSample("usb") : ""));
};

function publicSellerAddress() {
  return (
    "https://apple.audit.kokocloud.space/" +
    (DEMO ? "#DEMO" : CODE ? "#" + CODE : "")
  );
}

SCREENS.web_intro = function () {
  show(
    top() +
      progress(2) +
      "<h1>USB-kiolvasás, majd webes tesztek</h1>" +
      '<ol class="steps"><li>A számítógépen letöltöd és lefuttatod a kiolvasót. A program a beleegyezésed után automatikusan elküldi a USB-riportot.</li><li>Ezután az eladandó iPaden vagy iPhone-on visszatérsz erre az oldalra, és elvégzed a webes teszteket.</li><li>A tesztek végén egy külön webes riportot küldesz.</li></ol>' +
      choice(
        "web-download",
        "A kiolvasó letöltése",
        "A számítógépen futtatod, USB-kábellel.",
        false
      ) +
      choice(
        "web-start",
        "A USB-kiolvasó már lefutott, folytatom",
        "A webes tesztek következnek ezen az eszközön.",
        false
      ) +
      foot()
  );
  on("web-download", function () {
    go("usb_switch");
  });
  on("web-start", function () {
    go("details");
  });
};

SCREENS.usb_web_continue = function () {
  show(
    top() +
      "<h1>Folytasd az eladandó eszközön</h1>" +
      "<p>Az iPad vagy iPhone webes tesztjeit azon az eszközön kell elvégezni. Térj vissza az ott megnyitott oldalra, és válaszd a folytatást.</p>" +
      '<p><a href="' +
      esc(publicSellerAddress()) +
      '">A webes tesztek oldala, a meghívóddal</a></p>' +
      '<p class="muted">A számítógép kameráját vagy kijelzőjét nem teszteljük az iPad helyett. A webes tesztek végén külön email készül.</p>' +
      foot()
  );
};

SCREENS.usb_switch = function () {
  show(
    top() +
      progress(2) +
      "<h1>Nyisd meg az oldalt a számítógépeden</h1>" +
      '<p class="lead">Az USB-s kiolvasáshoz a számítógépen kell dolgoznod, ahová az eszközt rákötöd. Nyisd meg ott ezt a címet (küldd el magadnak például emailben):</p>' +
      '<pre class="code" id="addr">' +
      esc(publicSellerAddress()) +
      "</pre>" +
      '<button type="button" class="btn small" id="copy-addr">Cím másolása</button><span class="muted" id="copied-addr"></span>' +
      '<div class="note">A meghívókód a címben benne van. A számítógépen töltsd le és futtasd a kiolvasót. Az automatikus USB-email után ezen az eszközön térj vissza, és folytasd a webes tesztekkel.</div>' +
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
