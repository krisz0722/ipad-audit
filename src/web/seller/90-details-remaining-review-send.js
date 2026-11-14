/* ---- az eszköz adatai, előnézet, küldés ---- */

SCREENS.details = function () {
  var v = state.vals,
    mac = state.kind === "mac",
    cur = current();
  var seen = "",
    known = "",
    rows = [
      ["Modell", v.model],
      ["Tárhely", v.storage],
      ["Rendszerverzió", v.os],
      ["Sorozatszám", v.serial]
    ],
    list = "";
  for (var r = 0; r < rows.length; r++) {
    if (rows[r][1])
      list += "<dt>" + rows[r][0] + "</dt><dd>" + esc(rows[r][1]) + "</dd>";
  }
  if (list) known = '<div class="result"><dl>' + list + "</dl></div>";
  if (!mac && DEVICE && state.route !== "usb") {
    var scr = window.screen
      ? window.screen.width + "×" + window.screen.height
      : "";
    seen =
      '<div class="note"><b>A böngészőből már kiolvastuk:</b> ' +
      esc(DEVICE.device) +
      ", " +
      esc(DEVICE.name) +
      " " +
      esc(DEVICE.version) +
      (scr ? ", kijelző " + esc(scr) : "") +
      "." +
      "<br>A pontos modellt, a tárhelyet és a sorozatszámot a böngésző nem látja. Ezeket nem kell beírnod: az USB-s program külön riportban küldi el.</div>";
  }
  show(
    top() +
      progress(3) +
      "<h1>Az eszköz adatai</h1>" +
      '<p class="lead">Ezek segítenek a vásárlónak összevetni az eszközt a hirdetéssel. Amit az oldal ki tudott olvasni, azt itt látod.</p>' +
      seen +
      known +
      (v.serial
        ? '<div class="note">A sorozatszámot elküldjük a vásárlónak, hogy az Apple lefedettség-ellenőrzőjén megnézhesse a modellt. Ha ezt nem szeretnéd, vedd ki a pipát: akkor <b>csak egy lenyomatot</b> küldünk, egy kódot, amiből a sorozatszám nem fejthető vissza, és az utolsó 4 karakterét.</div>' +
          '<label class="check"><input type="checkbox" id="share"' +
          (state.shareSerial ? " checked" : "") +
          "> A sorozatszámot elküldöm a vásárlónak, hogy ellenőrizhesse az Apple-nél a modellt.</label>"
        : "") +
      "<h2>Ki vagy jelentkezve az Apple-fiókodból?</h2>" +
      '<p class="muted">Ha az eszköz még a te Apple-fiókodhoz van kötve (Aktiválási zár), az új tulajdonos nem tudja használni. Kijelentkezés: ' +
      (mac
        ? "Apple menü &gt; Rendszerbeállítások, legfelül a neved, majd Kijelentkezés."
        : cur.signout) +
      "</p>" +
      '<label class="radio"><input type="radio" name="apple" value="yes"' +
      (state.apple === "yes" ? " checked" : "") +
      "> Kijelentkeztem, és a Keresés funkció ki van kapcsolva</label>" +
      '<label class="radio"><input type="radio" name="apple" value="no"' +
      (state.apple === "no" ? " checked" : "") +
      "> Még nem jelentkeztem ki</label>" +
      '<label class="radio"><input type="radio" name="apple" value="unsure"' +
      (state.apple === "unsure" ? " checked" : "") +
      "> Nem vagyok biztos benne</label>" +
      '<div id="msg"></div>' +
      foot("next", "Tovább")
  );
  if ($("share"))
    $("share").addEventListener("change", function () {
      state.shareSerial = this.checked;
    });
  var radios = app.querySelectorAll("input[name=apple]");
  for (var i = 0; i < radios.length; i++)
    radios[i].addEventListener("change", function () {
      state.apple = this.value;
    });
  on("next", function () {
    if (state.vals.serial.trim() && !P.normalizeSerial(state.vals.serial)) {
      message(
        "msg",
        '<div class="error">A sorozatszám 8 és 14 karakter hosszú, betűkből és számokból áll.</div>'
      );
      return;
    }
    if (!state.apple) {
      message(
        "msg",
        '<div class="error">Válaszd ki, hogy ki vagy-e jelentkezve az Apple-fiókodból.</div>'
      );
      return;
    }
    go(hwStart());
  });
};

/* ---- mi maradt: az USB-s program ajánlata ---- */

function toUsb() {
  go(ON_COMPUTER ? "usb_get" : "usb_switch");
}

SCREENS.remaining = function () {
  var v = state.vals,
    open = [];
  if (v.cycles === "" && v.capacity === "")
    open.push(
      "<li><b>Akkumulátor:</b> nincs adat. A program az eszközből olvassa ki a ciklusszámot és a kapacitást.</li>"
    );
  else
    open.push(
      "<li><b>Akkumulátor:</b> amit megadtál vagy a naplóból olvastunk. A program az eszközből méri meg pontosan.</li>"
    );
  open.push(
    "<li><b>Aktiválási zár:</b> jelenleg csak a te válaszod. A program az eszközből olvassa ki.</li>"
  );
  open.push(
    "<li><b>Modell és sorozatszám:</b> jelenleg amit beírtál. A program az eszközből olvassa ki.</li>"
  );
  var missing = [],
    list = hwList();
  for (var i = 0; i < list.length; i++) {
    var r = state.hw[list[i]];
    if (!r || r.status === "skipped" || r.status === "unavailable")
      missing.push(HW_TITLES[list[i]]);
  }
  if (missing.length)
    open.push(
      "<li><b>Böngészőből nem mérhető volt:</b> " +
        esc(missing.join(", ")) +
        ".</li>"
    );
  show(
    top() +
      progress(4) +
      "<h1>Ez még nincs ellenőrizve</h1>" +
      '<p class="lead">A böngészőben mindent megnéztünk, amit lehetett. Az alábbiakat egy böngésző nem tudja megmérni:</p>' +
      '<ul class="marks open">' +
      open.join("") +
      "</ul>" +
      "<p>Ahhoz, hogy a hardver is tesztelve legyen, egy audit programot kellene telepíteni a számítógépedre, és USB-kábellel rákötni az eszközt. Mielőtt bármit letöltenél, részletesen leírjuk, mit csinál. Te döntesz.</p>" +
      choice(
        "r-yes",
        "Igen, megnézem, mit csinál a program",
        "Még nem töltesz le semmit, előbb elolvasod a részleteket.",
        false
      ) +
      choice(
        "r-no",
        "Nem, így küldöm",
        'Ezek a riportban "nem ellenőrzött" jelzést kapnak. Ez rendben van, a vásárló látni fogja, mi mért és mi bemondás.',
        false
      ) +
      foot()
  );
  on("r-yes", function () {
    go("usb_about");
  });
  on("r-no", function () {
    go("review");
  });
};

SCREENS.usb_about = function () {
  show(
    top() +
      progress(4) +
      "<h1>Mit csinál a program, és mit kapsz belőle?</h1>" +
      '<div class="note"><b>Fontos:</b> a programot egy számítógépen használod, és ott ugyanezzel a kóddal újrakezded az oldalt. Az eddigi böngészős tesztek eredménye nem megy át. A riport a számítógépről megy el, az USB-ből kiolvasott adatokkal.</div>' +
      "<h2>Mit csinál</h2>" +
      '<ol class="steps"><li>Letöltöd a számítógépedre (nyílt forráskódú, a letöltés előtt megnézheted a kódját és az ellenőrző összegét).</li>' +
      "<li>Rákötöd az eszközt USB-kábellel, és az eszközön megerősíted a <b>Megbízom</b> kérdést.</li>" +
      "<li>A program lefut és megnyit egy helyi weboldalt, ahol a meghívókód megadása után folytatod.</li></ol>" +
      "<h2>Mit olvas ki</h2>" +
      '<ul class="marks yes"><li>modell, hardverplatform, rendszerverzió, tárhely</li><li>az akkumulátor ciklusszáma és kapacitása</li><li>az Aktiválási zár állapota, ha kiolvasható</li><li>a sorozatszám (az előnézetben ugyanúgy kikapcsolhatod, mint eddig)</li></ul>' +
      "<h2>Amit nem olvas ki, és nem is tud</h2>" +
      '<ul class="marks no"><li>fotók, üzenetek, névjegyek, fájlok, alkalmazások</li><li>Apple-fiók, jelszavak, helyadat, Wi-Fi hálózatok</li><li>eszköznév, IMEI, UDID</li></ul>' +
      '<p class="muted">A program csak olvas, semmit nem módosít az eszközön. A helyi oldalon az előnézetben látod, mi megy tovább, és csak a Küldés gomb után kerül az internetre.</p>' +
      "<h2>Mit kapsz belőle te</h2>" +
      "<p>A program a te képernyődön is kiírja, mit talált: az akkumulátor valódi kopását és az Aktiválási zár állapotát. Ha az akku gyengébb, mint gondoltad, előbb tudod meg te, mint a vásárló.</p>" +
      choice(
        "a-go",
        "Rendben, letöltöm a programot",
        "A következő lépésben megkapod a letöltést.",
        false
      ) +
      choice(
        "a-no",
        "Mégsem, így küldöm",
        'A hardveres részek "nem ellenőrzött" jelzést kapnak a riportban.',
        false
      ) +
      foot()
  );
  on("a-go", toUsb);
  on("a-no", function () {
    go("review");
  });
};

SCREENS.review = function () {
  var d = collect();
  var sections = webSections(d);
  var html =
    top() +
    progress(5) +
    "<h1>Ellenőrizd a riportot</h1>" +
    '<p class="lead">A rész-eredményeket már mentettük. A befejezéssel ezeket az adatokat a korábbi USB-adatokkal együtt összesítjük.</p>';
  if (state.kind === "mac" && d.cycles === null && d.capacity === null) {
    html +=
      '<div class="note warn">Nem adtál meg akkumulátor adatot. A vásárló ezt hiányként fogja látni.</div>';
  }
  html += sectionsHtml(sections);
  html +=
    (DEMO
      ? '<div class="note">Próbaüzemben a Küldés gomb nem küld el semmit.</div>'
      : "") +
    '<label class="field" for="review-email">Opcionális emailcím az összesített riporthoz (nem kötelező, a Google Sheetbe elmentett riportot egyszer küldjük el ide)<input type="email" id="review-email" value="' +
    esc(auditEmail) +
    '" placeholder="Nem kötelező (pl. nev@pelda.hu)" maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
    '<label class="check"><input type="checkbox" id="consent"> Ellenőriztem az eredményeket, lezárom a tesztet, és kérem az összesített riport mentését.</label>' +
    '<div id="msg"></div>' +
    '<div class="nav"><button type="button" class="btn secondary" id="back">Vissza</button>' +
    '<button type="button" class="btn" id="send" disabled>Teszt befejezése</button></div>';
  show(html);
  $("consent").addEventListener("change", function () {
    $("send").disabled = !this.checked;
  });
  on("send", function () {
    send(sections, d);
  });
};

function post(payload) {
  var body = JSON.stringify(payload);
  if (window.fetch) {
    return fetch(window.BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: body
    }).then(function (response) {
      return response.json();
    });
  }
  // A régi Safarinak (iOS 9, 10) nincs fetch-e.
  return new Promise(function (resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open("POST", window.BACKEND_URL);
    xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");
    xhr.onload = function () {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (e) {
        reject(e);
      }
    };
    xhr.onerror = function () {
      reject(new TypeError("network"));
    };
    xhr.send(body);
  });
}
function serverError(text) {
  var e = new Error(text);
  e.fromServer = true;
  return e;
}

function webSections(data) {
  if (data.kind === "mac") return P.buildSections(data);
  var sections = P.buildSections(data);
  var result = [
    {
      title: "Webes teszt",
      rows: [
        {
          label: "Rendszer",
          value: data.os || "nem olvasható ki",
          status: "info",
          tag: data.sources.os || "böngészőből"
        },
        {
          label: "Apple-fiók kijelentkezés",
          value:
            {
              yes: "az eladó szerint kijelentkezett",
              no: "még nincs kijelentkezve",
              unsure: "nem biztos benne"
            }[data.apple] || "nincs válasz",
          status: "info",
          tag: "az eladó válasza"
        }
      ]
    }
  ];
  for (var index = 0; index < sections.length; index++) {
    if (sections[index].title === "Hardverteszt") result.push(sections[index]);
  }
  return result;
}

function send(sections, d, request) {
  if (request) {
    if (DEMO || !state.auditConsent)
      return Promise.reject(
        serverError("A tesztmentéshez beleegyezés szükséges.")
      );
    if (!window.BACKEND_URL)
      return Promise.reject(serverError("Az oldal backendje nincs beállítva."));
    return post(request).then(function (response) {
      if (!response || !response.ok)
        throw serverError(
          response && response.error ? response.error : "A mentés nem sikerült."
        );
      return response;
    });
  }
  if (state.sending || state.sent) return;
  if (!$("consent") || !$("consent").checked) return;
  if ($("review-email")) {
    var enteredEmail = $("review-email").value.replace(/^\s+|\s+$/g, "");
    if (enteredEmail) {
      if (
        enteredEmail.length > 254 ||
        /[^\x21-\x7e]/.test(enteredEmail) ||
        !/^[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+\.[^\s@,;<>:"\\]+$/.test(enteredEmail)
      ) {
        message(
          "msg",
          '<div class="error">Adj meg egy érvényes emailcímet, vagy hagyd üresen a mezőt.</div>'
        );
        return;
      }
      auditEmail = enteredEmail;
      state.auditEmailRequested = true;
    }
  }
  if (DEMO) {
    done(sections);
    return;
  }
  if (!window.BACKEND_URL) {
    message(
      "msg",
      '<div class="error">Az oldal nincs beállítva, a küldés most nem lehetséges.</div>'
    );
    return;
  }
  state.sending = true;
  $("send").disabled = true;
  message("msg", '<p class="muted">Összesített riport mentése...</p>');
  auditComplete(sections)
    .then(function (r) {
      state.sending = false;
      done(r.sections, r.copyStatus);
    })
    .catch(function (error) {
      state.sending = false;
      if ($("send")) $("send").disabled = false;
      message(
        "msg",
        '<div class="error">' +
          esc(
            error && error.fromServer
              ? error.message
              : "Nincs kapcsolat a szerverrel. Az oldalt ne zárd be; próbáld újra a Teszt befejezése gombbal."
          ) +
          "</div>"
      );
    });
}

// Küldés után a Vissza nem hozza vissza az előnézetet: a render mindig a záró képernyőt mutatja, és semmi nem mentődik.
function done(sections, copyStatus) {
  state.sent = true;
  state.auditActive = false;
  state.demoSections = sections;
  state.copyStatus = copyStatus || "";
  localUsbBlock = "";
  go("done");
  forget();
}

SCREENS.done = function () {
  var html =
    top() +
    "<h1>Köszönjük!</h1>" +
    '<div class="success">Az összesített riportot elmentettük a private Sheetbe.</div>' +
    (state.copyStatus === "sent"
      ? "<p>Az összesített eladói email küldését a szerver visszaigazolta.</p>"
      : state.copyStatus === "reader"
        ? '<div class="note">A számítógépen futó reader most küldi az elején kért összesített emailt. A programot annak visszaigazolásáig hagyd nyitva.</div>'
        : state.copyStatus === "missing"
          ? '<div class="note warn">A böngészőlap újratöltése miatt az emailcím már nincs a memóriában, ezért email nem ment. A teljes riport a Sheetben megmaradt.</div>'
          : "") +
    "<p>Az átmeneti tesztadatokat töröltük. Az emailcímet nem mentjük el.</p>";
  if (state.demoSections) {
    html +=
      "<h2>" +
      (DEMO ? "A webes teszt próba riportja" : "Összesített riport") +
      "</h2>" +
      sectionsHtml(state.demoSections);
  }
  show(html);
};
