  /* ---- akku, Mac ---- */

  SCREENS.mac_run = function () {
    var parts = [
      ['<code>sw_vers -productVersion</code>', 'a macOS verziószáma'],
      ['<code>system_profiler -xml SPHardwareDataType</code> és <code>grep</code>', 'a Mac típusa, chipje, memóriája, sorozatszáma és az Aktiválási zár állapota. A gép nevét, az azonosítókat és a hálózati adatokat nem írja ki.'],
      ['<code>system_profiler -xml SPPowerDataType</code> és <code>grep</code>', 'az akkumulátor ciklusszáma, állapota és maximális kapacitása'],
      ['<code>profiles status -type enrollment</code> és <code>grep</code>', 'csak két igen/nem válasz arról, van-e céges vagy iskolai felügyelet. A szervezet nevét és a szerver címét nem írja ki.'],
      ['<code>df -k</code> és <code>tail</code>', 'a tárhely mérete']
    ];
    var rows = '';
    for (var i = 0; i < parts.length; i++) rows += '<tr><td>' + parts[i][0] + '</td><td>' + parts[i][1] + '</td></tr>';
    show(top() + progress(2) +
      '<h1>A Mac adatai</h1>' +
      '<p class="lead">A Mac az akkumulátor és a hardver adatait a Rendszerinformációban tárolja. Egy rövid parancs kiolvassa ezeket, a kimenetet pedig te másolod ide. Így pontosan látod, mi megy tovább.</p>' +
      '<div class="card"><h3>Mit csinál a parancs?</h3><ul class="marks yes">' +
        '<li>Csak olvas, semmit nem módosít és nem telepít.</li>' +
        '<li>Nem csatlakozik az internetre.</li>' +
        '<li>Nem kér jelszót. Ha bármi jelszót kér, állj meg, és ne add meg.</li>' +
        '<li>Csak a felsorolt adatokat írja ki.</li>' +
      '</ul></div>' +
      '<ol class="steps">' +
        '<li>Nyisd meg a <b>Terminált</b>: nyomd meg a <b>Cmd + Szóköz</b> billentyűt, írd be, hogy <b>Terminal</b>, majd nyomj Entert.</li>' +
        '<li>Másold ki az alábbi parancsot, illeszd be a Terminálba, és nyomj <b>Entert</b>. Pár másodpercig dolgozik.' +
          '<pre class="code" id="cmd">' + esc(MAC_COMMAND) + '</pre>' +
          '<button type="button" class="btn small" id="copy">Parancs másolása</button><span class="muted" id="copied"></span></li>' +
      '</ol>' +
      '<details><summary>Mit jelentenek a parancs részei?</summary><div class="tablewrap"><table><thead><tr><th>Rész</th><th>Mit olvas</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>' +
      '<p><button type="button" class="link" id="to-manual">Inkább nem futtatok parancsot</button></p>' +
      foot('m-next', 'Lefuttattam, tovább'));
    on('copy', function () {
      copyText(MAC_COMMAND, function (ok) {
        message('copied', ok ? ' Kimásolva.' : ' Nem sikerült. Jelöld ki a parancsot, és másold ki kézzel.');
      });
    });
    on('to-manual', function () { go('mac_manual'); });
    on('m-next', function () { go('mac_paste'); });
  };

  SCREENS.mac_paste = function () {
    show(top() + progress(2) +
      '<h1>A Terminál szövegének beillesztése</h1>' +
      '<ol class="steps">' +
        '<li>Jelöld ki a Terminál teljes szövegét (<b>Cmd + A</b>), és másold ki (<b>Cmd + C</b>).</li>' +
        '<li>Illeszd be ide, és koppints a Beolvasás gombra:' +
          '<label class="field"><textarea id="paste" placeholder="Ide illeszd be a Terminál szövegét" spellcheck="false"></textarea></label>' +
          '<button type="button" class="btn small" id="parse">Beolvasás</button></li>' +
      '</ol>' +
      '<div id="result"></div>' + foot());
    on('parse', parseMac);
  };

  SCREENS.mac_manual = function () {
    show(top() + progress(2) +
      '<h1>Az akkumulátor adatai kézzel</h1>' +
      '<p class="lead">Az akkumulátor adatait a Rendszerinformációban is megtalálod.</p>' +
      '<ol class="steps">' +
        '<li>Tartsd lenyomva az <b>Option</b> billentyűt, és kattints az Apple menüre, majd a <b>Rendszerinformáció</b> pontra.</li>' +
        '<li>A bal oldalon nyisd meg az <b>Áramellátás</b> pontot.</li>' +
        '<li>Írd be a <b>ciklusszámot</b> és a <b>maximális kapacitást</b> (ha nincs, hagyd üresen).</li>' +
      '</ol>' + batteryFields() + foot('next', 'Tovább') +
      '<p><button type="button" class="link" id="to-command">Mégis futtatom a parancsot</button></p>');
    bindInput('capacity', 'capacity'); bindInput('cycles', 'cycles');
    on('next', batteryNext);
    on('to-command', function () { go('mac_run'); });
  };

