  /* ---- akku, iPad és iPhone: Beállítások ---- */

  SCREENS.screen_ask = function () {
    if (!current().batteryScreen) { replace('log_ask'); return; }
    show(top() + progress(2) +
      '<h1>Látod az akku állapotát a Beállításokban?</h1>' +
      '<p class="lead">Nyisd meg: <b>Beállítások &gt; Akkumulátor &gt; Akkumulátor állapota</b>. Nem minden iPad és iPhone mutatja ezt.</p>' +
      osSelect() +
      choice('s-yes', 'Igen, látom a számokat', 'Beírod a két értéket.', false) +
      choice('s-no', 'Nem, ilyen képernyőt nem látok', 'Akkor a rendszernaplóból próbáljuk, végigvezetünk rajta.', false) +
      foot());
    bindOsSelect();
    on('s-yes', function () { go('screen_enter'); });
    on('s-no', function () { go('log_ask'); });
  };

  function batteryFields() {
    return '<div class="card">' +
      '<label class="field">Maximális kapacitás (%)<input type="number" id="capacity" inputmode="numeric" min="40" max="100" value="' + esc(state.vals.capacity) + '"><small>Például: 87</small></label>' +
      '<label class="field">Ciklusszám<input type="number" id="cycles" inputmode="numeric" min="0" max="5000" value="' + esc(state.vals.cycles) + '"><small>Ha nem látod, hagyd üresen.</small></label>' +
      '</div><div id="msg"></div>';
  }
  function batteryNext() {
    var cap = state.vals.capacity.trim(), cyc = state.vals.cycles.trim();
    if (cap && toInt(cap, 40, 100) === null) { message('msg', '<div class="error">A kapacitás 40 és 100 közötti szám legyen.</div>'); return; }
    if (cyc && toInt(cyc, 0, 5000) === null) { message('msg', '<div class="error">A ciklusszám 0 és 5000 közötti egész szám legyen.</div>'); return; }
    go('details');
  }
  function clearBattery() {
    state.vals.cycles = ''; state.vals.capacity = '';
    state.parsed = {}; state.extra.fileDate = '';
  }

  SCREENS.screen_enter = function () {
    show(top() + progress(2) +
      '<h1>Írd be a két számot</h1>' +
      '<p class="lead">A <b>maximális kapacitás</b> százalékban, a <b>ciklusszám</b> egész szám. Ha az egyiket nem látod, hagyd üresen.</p>' +
      batteryFields() + foot('next', 'Tovább') +
      '<p><button type="button" class="link" id="skip">Ezt most kihagyom</button></p>');
    bindInput('capacity', 'capacity'); bindInput('cycles', 'cycles');
    on('next', batteryNext);
    on('skip', function () { clearBattery(); go('details'); });
  };

  /* ---- akku, iPad és iPhone: napló vagy fájl ---- */

  SCREENS.log_ask = function () {
    var s = current();
    show(top() + progress(2) +
      '<h1>Keresd meg a rendszernaplót</h1>' +
      '<p class="lead">' + (s.batteryScreen ? '' : 'Ezen a rendszerverzión a Beállítások nem mutatja az akkumulátor állapotát. ') +
        'Az eszköz a ciklusszámot egy ' + (s.paste ? 'diagnosztikai naplóban' : 'analitikai fájlban') + ' tárolja. Csak akkor folytasd, ha az eszközön már van ilyen bejegyzés. Ha nincs, <b>ne kapcsolj be semmit</b>.</p>' +
      osSelect() +
      '<ol class="steps">' +
        '<li>Nyisd meg: ' + s.path + '.</li>' +
        '<li>' + s.list + '</li>' +
      '</ol>' +
      choice('l-found', 'Megtaláltam a bejegyzést', s.paste ? 'Kimásolod a szövegét, és bemásolod ide.' : 'Elmented a Fájlokba, és kiválasztod itt.', false) +
      choice('l-none', 'Nincs ilyen bejegyzés', 'Semmit nem kell bekapcsolnod, megmutatjuk, mi a teendő.', false) +
      foot());
    bindOsSelect();
    on('l-found', function () { go(current().paste ? 'log_paste' : 'log_file'); });
    on('l-none', function () { go('nolog'); });
  };

  SCREENS.log_paste = function () {
    show(top() + progress(2) +
      '<h1>A napló kimásolása</h1>' +
      '<ol class="steps">' +
        '<li>Nyisd meg a legfrissebb bejegyzést, érintsd meg hosszan a szöveget, válaszd a <b>Mindet kijelöl</b> (Select All), majd a <b>Másolás</b> (Copy) lehetőséget.</li>' +
        '<li>Térj vissza ide, érintsd meg hosszan az alábbi mezőt, válaszd a <b>Beillesztés</b> (Paste) lehetőséget, majd koppints a Beolvasás gombra:' +
          '<label class="field"><textarea id="paste" placeholder="Ide illeszd be a napló szövegét" spellcheck="false">' + demoFill('log') + '</textarea></label>' +
          '<button type="button" class="btn small" id="parse-log">Beolvasás</button></li>' +
      '</ol>' +
      '<div class="note">A beillesztett szöveget a beolvasás után töröljük a mezőből. Belőle kizárólag a ciklusszámot, a kapacitást, a rendszerverziót és a napló dátumát vesszük ki. Ha más adat is van benne (például alkalmazások nevei), azt nem olvassuk ki és nem küldjük el.</div>' +
      demoNote() + '<div id="result"></div>' + foot());
    on('parse-log', function () {
      var area = $('paste');
      applyIpadText(area ? area.value : '');
      if (area) area.value = '';
    });
  };

  SCREENS.log_file = function () {
    show(top() + progress(2) +
      '<h1>A fájl kiválasztása</h1>' +
      '<ol class="steps">' +
        '<li>Nyisd meg a legfrissebb bejegyzést, koppints a <b>Megosztás</b> gombra, majd a <b>Mentés a Fájlokba</b> pontra.</li>' +
        '<li>Térj vissza ide, és válaszd ki a mentett fájlt:<br><input type="file" id="file"></li>' +
      '</ol>' +
      '<div class="note">A fájlból kizárólag a ciklusszámot, a kapacitást, a rendszerverziót és a fájl dátumát vesszük ki. Ha más adat is van benne (például alkalmazások nevei), azt nem olvassuk ki és nem küldjük el.</div>' +
      (DEMO ? '<div class="note">Próbaüzem: fájl nélkül is kipróbálható egy kitalált minta fájllal. <button type="button" class="btn small" id="demo-file">Minta fájl használata</button></div>' : '') +
      '<div id="result"></div>' + foot());
    var file = $('file');
    if (file) file.addEventListener('change', onFile);
    if (DEMO) on('demo-file', function () { applyIpadText(demoSample('file')); });
  };

  SCREENS.nolog = function () {
    show(top() + progress(2) +
      '<h1>Nincs baj, erre van megoldás</h1>' +
      '<p class="lead">Semmit nem kell bekapcsolnod az eszközön. Előbb végigmegyünk mindenen, amit az oldal a böngészőben meg tud nézni. A végén, ha az akkumulátor adata még hiányzik, felajánlunk egy kis programot, ami USB-kábelen át kiolvassa. Azt te döntöd el, hogy kéred-e.</p>' +
      choice('n-skip', 'Rendben, tovább', 'Az akkumulátor adata egyelőre hiányzik, ezt a végén pótolhatod.', false) +
      foot());
    on('n-skip', function () { clearBattery(); state.noLog = true; go('details'); });
  };

