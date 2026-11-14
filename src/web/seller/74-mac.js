/* ---- akku, Mac ---- */

SCREENS.mac_run = function () {
  show(
    top() +
      progress(2) +
      "<h1>A Mac adatai</h1>" +
      '<p class="lead">A Mac hardver- és akkumulátoradatait egyetlen biztonságos, csak olvasó paranccsal olvassuk ki a Terminálból. Nem kér jelszót, nem módosít semmit, és nem csatlakozik az internetre.</p>' +
      '<ol class="steps">' +
      "<li>Nyisd meg a <b>Terminált</b> (nyomd meg a <b>Cmd + Szóköz</b> billentyűt, írd be: <b>Terminal</b>, majd nyomj Entert).</li>" +
      "<li>Másold ki és futtasd az alábbi parancsot a Terminálban:" +
      '<pre class="code" id="cmd">' +
      esc(MAC_COMMAND) +
      "</pre>" +
      '<button type="button" class="btn small" id="copy">Parancs másolása</button><span class="muted" id="copied"></span></li>' +
      "<li>A futtatás után lépj tovább a kimenet beillesztéséhez.</li>" +
      "</ol>" +
      '<p><button type="button" class="link" id="to-manual">Inkább kézzel adom meg az adatokat</button></p>' +
      foot("m-next", "Lefuttattam, tovább")
  );
  on("copy", function () {
    copyText(MAC_COMMAND, function (ok) {
      message(
        "copied",
        ok
          ? " Kimásolva."
          : " Nem sikerült. Jelöld ki a parancsot, és másold ki kézzel."
      );
    });
  });
  on("to-manual", function () {
    go("mac_manual");
  });
  on("m-next", function () {
    go("mac_paste");
  });
};

SCREENS.mac_paste = function () {
  show(
    top() +
      progress(2) +
      "<h1>A Terminál szövegének beillesztése</h1>" +
      '<ol class="steps">' +
      "<li>Jelöld ki a Terminál teljes szövegét (<b>Cmd + A</b>), és másold ki (<b>Cmd + C</b>).</li>" +
      "<li>Illeszd be ide, és koppints a Beolvasás gombra:" +
      '<label class="field"><textarea id="paste" placeholder="Ide illeszd be a Terminál szövegét" spellcheck="false">' +
      demoFill("mac") +
      "</textarea></label>" +
      '<button type="button" class="btn small" id="parse">Beolvasás</button></li>' +
      "</ol>" +
      demoNote() +
      '<div id="result"></div>' +
      foot()
  );
  on("parse", parseMac);
};

SCREENS.mac_manual = function () {
  show(
    top() +
      progress(2) +
      "<h1>Az akkumulátor adatai kézzel</h1>" +
      '<p class="lead">Az akkumulátor adatait a Rendszerinformációban is megtalálod.</p>' +
      '<ol class="steps">' +
      "<li>Tartsd lenyomva az <b>Option</b> billentyűt, és kattints az Apple menüre, majd a <b>Rendszerinformáció</b> pontra.</li>" +
      "<li>A bal oldalon nyisd meg az <b>Áramellátás</b> pontot.</li>" +
      "<li>Írd be a <b>ciklusszámot</b> és a <b>maximális kapacitást</b> (ha nincs, hagyd üresen).</li>" +
      "</ol>" +
      batteryFields() +
      foot("next", "Tovább") +
      '<p><button type="button" class="link" id="to-command">Mégis futtatom a parancsot</button></p>'
  );
  bindInput("capacity", "capacity");
  bindInput("cycles", "cycles");
  on("next", batteryNext);
  on("to-command", function () {
    go("mac_run");
  });
};
