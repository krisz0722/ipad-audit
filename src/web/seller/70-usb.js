  /* ---- akku, iPad és iPhone: USB ---- */

  function macDownloadCommand() {
    var base = TOOL_BASE;
    return 'cd ~/Downloads && curl -fsSL -o ipad-audit-reader.tar.gz "' + base + 'ipad-audit-reader-macos-$(uname -m).tar.gz" && tar -xzf ipad-audit-reader.tar.gz && ./ipad-audit-reader';
  }

  SCREENS.usb_get = function () {
    var os = computerOs();
    var groups = os && TOOL_FILES[os] ? [os] : ['windows', 'mac', 'linux'];
    var base = TOOL_BASE;
    var buttons = '';
    for (var g = 0; g < groups.length; g++) {
      var files = TOOL_FILES[groups[g]];
      for (var i = 0; i < files.length; i++) {
        buttons += '<p><a class="btn" href="' + esc(base + files[i][0]) + '" download>' + esc(files[i][1]) + '</a></p>';
      }
    }
    var notes = '';
    if (os === 'windows' || !os) {
      notes += '<div class="note"><b>Windows:</b> az Apple USB-illesztőprogramja is kell hozzá (iTunes vagy Apple Devices alkalmazás). Ha a Windows figyelmeztet ("A Windows megvédte a számítógépet"), kattints a <b>További információ</b>, majd a <b>Futtatás mindenképpen</b> gombra. A program nyílt forráskódú, a letöltés mellett ott az ellenőrző összege.</div>';
    }
    if (os === 'mac' || !os) {
      notes += '<div class="note"><b>Mac:</b> a böngészővel letöltött programot a macOS blokkolhatja. Ilyenkor a Terminálból töltsd le, ott nincs blokk.' +
        '<pre class="code" id="mac-cmd">' + esc(macDownloadCommand()) + '</pre>' +
        '<button type="button" class="btn small" id="copy-mac">Parancs másolása</button><span class="muted" id="copied-mac"></span></div>';
    }
    var trust = '<div class="note"><b>Miért megbízható ez a program?</b><ul class="marks yes">' +
      '<li><b>Nyílt forráskód.</b> A program teljes kódja nyilvános, bárki elolvashatja: ' +
        '<a href="https://github.com/krisz0722/ipad-audit/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">a GitHubon</a> és ' +
        '<a href="https://gitlab.com/krisz0722/ipad-audit/-/blob/main/tool/ipad_audit/reader.py" target="_blank" rel="noopener">a GitLabon</a>.</li>' +
      '<li><b>Csak olvas.</b> Semmit nem módosít az eszközön.</li>' +
      '<li><b>Nem küld el semmit.</b> A program saját kódjában nincs internetes kapcsolat, ezt egy automatikus teszt őrzi. Az eredményt te másolod be ide, és az előnézetben látod, mi megy tovább.</li>' +
      '<li><b>Ellenőrizhető letöltés.</b> A fájlt a GitHub építi a nyilvános kódból (<a href="https://github.com/krisz0722/ipad-audit/actions" target="_blank" rel="noopener">a build naplója</a>), ' +
        'a <a href="https://github.com/krisz0722/ipad-audit/releases/latest" target="_blank" rel="noopener">kiadás oldalán</a> minden fájl mellett ott az ellenőrző összeg (.sha256).</li>' +
      '</ul></div>';
    show(top() + progress(2) +
      '<h1>A kiolvasó program letöltése</h1>' + trust +
      '<p class="lead">Töltsd le a számítógépedre a megfelelő fájlt:</p>' + buttons + notes +
      foot('u-next', 'Letöltöttem, tovább'));
    on('u-next', function () { go('usb_run'); });
    on('copy-mac', function () {
      copyText(macDownloadCommand(), function (ok) {
        message('copied-mac', ok ? ' Kimásolva.' : ' Nem sikerült. Jelöld ki a parancsot, és másold ki kézzel.');
      });
    });
  };

  SCREENS.usb_run = function () {
    var os = computerOs();
    var runStep = os === 'windows'
      ? 'Kattints duplán a letöltött fájlra (a mappás változatnál előbb csomagold ki, és az <b>ipad-audit-reader.exe</b> fájlt indítsd).'
      : (os === 'mac'
        ? 'Ha a Terminál-parancsot használtad, a program már fut. Különben nyisd meg a Terminált, és indítsd a letöltött programot.'
        : 'Csomagold ki a letöltött fájlt, és indítsd el a programot egy terminálból.');
    show(top() + progress(2) +
      '<h1>Csatlakoztatás és futtatás</h1>' +
      '<ol class="steps">' +
        '<li>Kösd az eszközt USB-kábellel a számítógéphez, oldd fel, és ha megkérdezi, koppints a <b>Megbízom</b> gombra.</li>' +
        '<li>' + runStep + '</li>' +
        '<li>Pár másodperc múlva a program kiírja a szöveget (az <b>IPAD-AUDIT-USB</b> sortól az <b>END</b> sorig), és <b>a vágólapra másolja</b>. Windowson az ablak bezárásához nyomj Entert.</li>' +
      '</ol>' +
      '<div class="note">Ha a vágólapra másolás nem sikerült, a program ezt kiírja. Ilyenkor jelöld ki a szöveget, és másold ki.</div>' +
      foot('u-next', 'Kész, tovább'));
    on('u-next', function () { go('usb_paste'); });
  };

  SCREENS.usb_switch = function () {
    show(top() + progress(2) +
      '<h1>Nyisd meg az oldalt a számítógépeden</h1>' +
      '<p class="lead">Az USB-s kiolvasáshoz a számítógépen kell dolgoznod, ahová az eszközt rákötöd. Nyisd meg ott ezt a címet (küldd el magadnak például emailben):</p>' +
      '<pre class="code" id="addr">' + esc(pageAddress()) + '</pre>' +
      '<button type="button" class="btn small" id="copy-addr">Cím másolása</button><span class="muted" id="copied-addr"></span>' +
      '<div class="note">A meghívókód a címben benne van, ott nem kell újra beírnod. A számítógépen az elejétől kezdd. Az eszközön eddig megcsinált böngészős tesztek eredménye nem megy át oda. A riport a számítógépről megy el, az USB-ből kiolvasott adatokkal, a böngészős tesztek abban "nem tesztelt" jelzést kapnak. Itt az eszközön nem kell mást tenned.</div>' +
      foot());
    on('copy-addr', function () {
      copyText(pageAddress(), function (ok) {
        message('copied-addr', ok ? ' Kimásolva.' : ' Nem sikerült. Jelöld ki a címet, és másold ki kézzel.');
      });
    });
  };

  SCREENS.usb_paste = function () {
    show(top() + progress(2) +
      '<h1>A kimenet beillesztése</h1>' +
      '<p>Illeszd be a program kimenetét, és koppints a Beolvasás gombra:</p>' +
      '<label class="field"><textarea id="usb-paste" placeholder="Ide illeszd be a program kimenetét" spellcheck="false">' + demoFill('usb') + '</textarea></label>' +
      '<button type="button" class="btn small" id="parse-usb">Beolvasás</button>' +
      '<div class="note">A beillesztett szöveget a beolvasás után töröljük a mezőből. Csak a modellt, a rendszerverziót, a tárhelyet, a sorozatszámot, az akkumulátor adatait és az Aktiválási zár állapotát vesszük ki belőle.</div>' +
      demoNote() + '<div id="result"></div>' + foot());
    on('parse-usb', function () {
      var area = $('usb-paste');
      applyUsbText(area ? area.value : '');
      if (area) area.value = '';
    });
  };

