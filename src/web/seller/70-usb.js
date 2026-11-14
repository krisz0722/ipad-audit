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
  var why =
    "<h2>Miért kell ez a program a számítógépre?</h2>" +
    "<p>Az iPad és az iPhone böngészője biztonsági okokból nem fér hozzá az akkumulátor valódi töltési ciklusaihoz, a gyári és jelenlegi kapacitáshoz, a sorozatszámhoz és az Aktiválási zár állapotához. Ezeket az adatokat kizárólag USB-kábelen, az Apple diagnosztikai protokollján keresztül lehet pontosan kiolvasni.</p>" +
    '<div class="grid2">' +
    '<div class="card"><h3>Mit olvas ki az USB-n?</h3><ul class="marks yes">' +
    "<li>modell, hardverplatform, rendszerverzió, tárhely</li>" +
    "<li>akkumulátor töltési ciklusszáma és tényleges kapacitása (mAh és %)</li>" +
    "<li>Aktiválási zár (Find My) állapota, ha kiolvasható</li>" +
    "<li>sorozatszám (az Apple lefedettség ellenőrzéséhez)</li>" +
    "<li>opcionális 5 perces akkumulátor-terhelésteszt közbeni hardverjelek</li>" +
    "</ul></div>" +
    '<div class="card"><h3>Mit nem olvas ki soha?</h3><ul class="marks no">' +
    "<li>fotók, üzenetek, névjegyek, fájlok, alkalmazások</li>" +
    "<li>Apple-fiók, jelszavak, emailcímek, telefonszám</li>" +
    "<li>helyadat, Wi-Fi hálózatok, böngészési előzmények</li>" +
    "<li>eszköznév, IMEI, UDID, MAC-cím</li>" +
    "</ul></div>" +
    "</div>";
  var trust =
    '<div class="note"><b>Miért megbízható, és mit kapsz belőle te?</b><ul class="marks yes">' +
    "<li><b>Előbb te látod az eredményt.</b> A program a saját képernyődön is azonnal kiírja az akkumulátor valódi kopását és az Aktiválási zár állapotát, így nem az átvételnél ér meglepetés.</li>" +
    "<li><b>Csak olvas, nem módosít.</b> Semmit nem telepít az iPadre vagy iPhone-ra, és semmit nem változtat rajta.</li>" +
    "<li><b>Előzetes beleegyezés és saját riport.</b> A kiolvasás előtt kéri a meghívókódot és a jóváhagyásodat. Ha kéred, a folyamat végén saját magadnak is küldhetsz egy összesített emailriportot.</li>" +
    "<li><b>Nyílt forráskód és ellenőrizhető letöltés.</b> A program teljes kódja nyilvános (" +
    '<a href="https://github.com/krisz0722/ipad-audit/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">GitHub</a>, ' +
    '<a href="https://gitlab.com/krisz0722/ipad-audit/-/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">GitLab</a>), ' +
    'a fájlt a GitHub építi automatikusan (<a href="https://github.com/krisz0722/ipad-audit/actions" target="_blank" rel="noopener">build napló</a>), ' +
    'a <a href="https://github.com/krisz0722/ipad-audit/releases/latest" target="_blank" rel="noopener">kiadás oldalán</a> pedig minden fájl mellett ott az ellenőrző összeg (.sha256).</li>' +
    "</ul></div>";
  show(
    top() +
      progress(2) +
      "<h1>A kiolvasó program letöltése</h1>" +
      '<p class="lead">Az ellenőrzés két részből áll: először itt a számítógépen USB-kábellel kiolvassuk az akkumulátor és a hardver alapadatait, majd a program átirányít az iPadre vagy iPhone-ra a rövid böngészős tesztekhez.</p>' +
      why +
      trust +
      "<h2>1. lépés: Töltsd le a számítógépedre a megfelelő fájlt</h2>" +
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
      '<p class="lead">Most futtasd le a kiolvasót a számítógépen. Ha végzett, a folyamat automatikusan az iPaden vagy iPhone-on folytatódik.</p>' +
      '<ol class="steps">' +
      "<li><b>Csatlakoztatás:</b> Kösd az iPadet vagy iPhone-t USB-kábellel a számítógéphez, oldd fel a képernyőzárat, és ha az eszköz megkérdezi, koppints a <b>Megbízom</b> gombra.</li>" +
      "<li><b>Indítás:</b> " +
      runStep +
      "</li>" +
      "<li><b>Kiolvasás és opcionális akkuteszt:</b> A programban add meg a meghívókódot (" +
      esc(CODE || "a 9 jegyű kódot") +
      "), és hagyd jóvá a mentést. Ha a végén saját magadnak is kérsz összesített emailriportot, itt adhatod meg az emailcímedet. A gyors USB-kiolvasás után a program felajánlja az opcionális 5 perces akkumulátor-terheléstesztet is.</li>" +
      "<li><b>Átlépés az iPadre vagy iPhone-ra:</b> A számítógépes mérés végén a program megpróbálja automatikusan megnyitni a Safarit az eladandó eszközön, és kiírja a folytatólinket is. Nyisd meg ezt a linket az iPaden vagy iPhone-on, és ott végezd el a rövid webes hardverteszteket.</li>" +
      "</ol>" +
      '<div class="note"><b>Fontos:</b> A számítógépen itt végeztél, ezen a böngészőlapon már nem kell tovább lépned. A futó kiolvasó programot (terminálablakot) viszont hagyd nyitva addig, amíg az iPaden be nem fejezed a webes teszteket: a program követi a lépéseket, és a végén ez küldi el a kért összesített emailt.</div>' +
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
      '<p class="lead">A számítógépes USB-mérés után most itt, magán az iPaden vagy iPhone-on ellenőrizzük azokat a részeket, amelyeket csak kézben tartva lehet kipróbálni.</p>' +
      "<h2>Mi következik ezen az eszközön, és miért?</h2>" +
      '<ul class="marks yes">' +
      "<li><b>Apple-fiók kijelentkezési állapota:</b> visszajelzed, hogy kijelentkeztél-e már az iCloudból.</li>" +
      "<li><b>Érintőképernyő és kétujjas érzékelés:</b> végighúzod az ujjad a képernyőn, hogy látszódjon, nincs-e érzéketlen sáv.</li>" +
      "<li><b>Mozgásérzékelő és giroszkóp:</b> megdöntöd és megforgatod az eszközt, hogy az oldal lemérje a szenzorok működését.</li>" +
      "<li><b>Hangszóró és mikrofon:</b> rövid hangjelzéseket játszunk le, és a mikrofon ellenőrzi, tisztán hallatszanak-e.</li>" +
      "<li><b>Előlapi és hátlapi kamera, kijelző:</b> ellenőrzi, hogy a kamerák valódi képet adnak-e (fotó nem készül és nem mentődik el), majd teljes képernyős színekkel megnézheted a kijelzőt.</li>" +
      "</ul>" +
      '<div class="note">A rész-eredményeket lépésenként mentjük a vásárló private Sheetjébe, a végén pedig a korábbi USB-adatokkal együtt látod a teljes összesített riportot. A számítógépen futó readert hagyd nyitva a teszt befejezéséig.</div>' +
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
      "<p>Az iPad vagy iPhone webes tesztjeit azon az eszközön kell elvégezni. Térj vissza az ott megnyitott oldalra, és válaszd a folytatást.</p>" +
      "<p>Az iPaden vagy iPhone-on a readerben megjelenő teljes folytatólinket nyisd meg. Az a meghívókódot és a teszt sessionazonosítóját is tartalmazza; egyiket sem kell külön beírnod.</p>" +
      '<p><a href="' +
      esc(publicSellerAddress()) +
      '">A webes tesztek oldala, a meghívóddal</a></p>' +
      '<p class="muted">A számítógép kameráját vagy kijelzőjét nem teszteljük az iPad helyett. Az eredményeket folyamatosan mentjük; email csak a teszt végén készül, ha az elején kérted.</p>' +
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
      '<div class="note">A meghívókód a címben benne van. A számítógépen töltsd le és futtasd a kiolvasót. Ezután a reader teljes folytatólinkjével térj vissza erre az eszközre. A readert hagyd nyitva a teszt végéig.</div>' +
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
