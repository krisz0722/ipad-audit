  /* érintőképernyő */
  SCREENS.hw_touch = function () {
    if (hwScreen('touch', 'Húzd végig az ujjad a kijelzőn úgy, hogy minden mezőt érintsél, a végén pedig tegyél egyszerre két ujjat a kijelzőre. Az oldal számolja, hány mezőt érzékelt az eszköz.', '', true, '')) {
      on('hw-start', startTouch);
    }
  };

  function startTouch() {
    var cols = 8, rows = 12, total = cols * rows, tracker = P.touchTracker(total), finished = false, timer;
    var html = '<table id="touch-grid"><tbody>', index = 0;
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var c = 0; c < cols; c++) html += '<td data-i="' + (index++) + '"></td>';
      html += '</tr>';
    }
    html += '</tbody></table><div id="touch-note">Húzd végig az ujjad minden mezőn</div><button type="button" class="btn secondary" id="touch-skip">Kihagyom</button>';
    var overlay = document.createElement('div');
    overlay.id = 'touch-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      hwDone('touch', status, detail);
      if (status === 'skipped' && !detail) { hwNext(); return; }
      hwResult('touch');
    }
    var cellEls = overlay.getElementsByTagName('td'), note = document.getElementById('touch-note');
    // A mezőt a koordinátából számoljuk, mert az elementFromPoint régi Safarin egy táblázat fölött nem megbízható.
    function cellAt(x, y) {
      var grid = document.getElementById('touch-grid');
      if (!grid) return -1;
      var box = grid.getBoundingClientRect();
      if (!box.width || !box.height) return -1;
      var col = Math.floor((x - box.left) * cols / box.width), row = Math.floor((y - box.top) * rows / box.height);
      if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
      return row * cols + col;
    }
    function mark(event) {
      // A Kihagyom gomb érintését nem nyeljük el, különben nem kattintható.
      if (event.target && event.target.id === 'touch-skip') return;
      event.preventDefault();
      // Csak a kifejezetten szkriptből küldött esemény számít hamisnak. A Safari 9 az isTrusted értéket nem adja meg (undefined).
      if (event.isTrusted === false) return;
      var touches = event.touches || [], fingers = touches.length;
      tracker.hit(-1, fingers);
      for (var t = 0; t < fingers; t++) {
        var i = cellAt(touches[t].clientX, touches[t].clientY);
        if (i >= 0 && cellEls[i]) { cellEls[i].className = 'on'; tracker.hit(i, fingers); }
      }
      var st = tracker.state();
      if (st.complete) finish('ok', 'mind a ' + st.total + ' mező érzékelt, két ujjal is');
      else if (st.cells === st.total) note.textContent = 'Most tegyél egyszerre két ujjat a kijelzőre';
      else note.textContent = 'Érzékelt mezők: ' + st.cells + ' / ' + st.total + '. Húzd végig az ujjad minden mezőn';
    }
    overlay.addEventListener('touchstart', mark, false);
    overlay.addEventListener('touchmove', mark, false);
    document.getElementById('touch-skip').addEventListener('click', function () { finish('skipped'); });
    timer = setTimeout(function () {
      var st = tracker.state();
      if (st.cells >= st.total * 0.6) finish('bad', st.cells + ' / ' + st.total + ' mezőt érzékelt' + (st.multi ? ', két ujjal is' : ', két ujjas érintés nélkül'));
      else finish('skipped', 'csak ' + st.cells + ' / ' + st.total + ' mezőt érintett meg');
    }, 180000);
  }

  /* billentyűzet (Macen) */
  SCREENS.hw_keyboard = function () {
    var pre = '<div class="note"><b>Milyen az Enter billentyű alakja?</b>' +
      '<label class="radio"><input type="radio" name="kbl" value="ansi" checked> Lapos, egysoros (amerikai, ANSI)</label>' +
      '<label class="radio"><input type="radio" name="kbl" value="iso"> Magas, L alakú (európai, magyar, ISO)</label></div>';
    if (hwScreen('keyboard', 'Nyomd meg egyenként az összes billentyűt, a képernyőn kigyulladnak. A felső F1-F12 sort az Fn billentyűvel együtt nyomd. A Cmd, Ctrl, Opt és Shift billentyűt önmagában nyomd meg, ne kombinációban. Az Fn, a hangerő, a fényerő és a Touch ID gombot a böngésző nem látja, ezeket nem kell megnyomnod.', '', true, '', pre)) {
      on('hw-start', startKeyboard);
    }
  };

  function startKeyboard() {
    var radio = app.querySelector('input[name=kbl]:checked');
    var rows = P.keyboardLayout(radio && radio.value === 'iso' ? 'iso' : 'ansi'), tracker = P.keyboardTracker(rows), finished = false;
    var html = '<div id="key-wrap"><h2 id="key-note"></h2><div id="key-board">', r, c, key, i;
    for (r = 0; r < rows.length; r++) {
      html += '<div class="krow">';
      for (c = 0; c < rows[r].length; c++) {
        key = rows[r][c];
        html += '<div class="kcell' + (key.soft ? ' soft' : '') + '" data-code="' + esc(key.code) + '" style="flex:' + key.w + ' 1 0">' + esc(key.label) + '</div>';
      }
      html += '</div>';
    }
    html += '</div><p id="key-list" class="muted"></p><div class="nav"><button type="button" class="btn" id="key-done">Kész</button>' +
      '<button type="button" class="btn secondary" id="key-skip">Kihagyom</button></div></div>';
    var overlay = document.createElement('div');
    overlay.id = 'key-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    var cells = {}, nodes = overlay.querySelectorAll('.kcell');
    for (i = 0; i < nodes.length; i++) cells[nodes[i].getAttribute('data-code')] = nodes[i];
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    function light(el) { if (el && el.className.indexOf(' on') < 0) el.className += ' on'; }
    function refresh() {
      var st = tracker.state();
      $('key-note').textContent = st.complete ? 'Minden billentyű érzékelve. Nyomd meg a Kész gombot.' : 'Érzékelt billentyűk: ' + st.pressed + ' / ' + st.total;
      $('key-list').textContent = (st.softTotal ? 'Funkciósor (az Fn-nel együtt): ' + st.softPressed + ' / ' + st.softTotal : '') +
        (st.doubles.length ? '. Dupla leütés gyanú: ' + st.doubleLabels.join(', ') : '');
    }
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      hwDone('keyboard', status, detail);
      if (status === 'skipped' && !detail) { hwNext(); return; }
      hwResult('keyboard');
    }
    function onDown(event) {
      if (finished || event.isTrusted === false) return;
      var code = event.code;
      if (!code) { // régi böngésző: nincs event.code
        finish('unavailable', 'a böngésző nem adja meg a billentyű fizikai kódját (túl régi böngésző), ezért ezt nem tudtuk ellenőrizni');
        return;
      }
      event.preventDefault();
      tracker.down(code, event.repeat);
      var el = cells[code];
      light(el);
      // A kigyulladt billentyűn a valódi felirat látszik (például a magyar kiosztás betűi).
      if (el && event.key && event.key.length === 1 && /^(Key|Digit|Semicolon|Quote|Comma|Period|Slash|Bracket|Minus|Equal|Backquote|IntlBackslash|Backslash)/.test(code)) el.textContent = event.key.toUpperCase();
      refresh();
    }
    function onUp(event) {
      if (finished || event.isTrusted === false || !event.code) return;
      event.preventDefault();
      tracker.up(event.code);
      if (event.code === 'CapsLock') light(cells.CapsLock);
      refresh();
    }
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    $('key-done').addEventListener('click', function () { var v = P.keyboardVerdict(tracker.state()); finish(v.status, v.detail); });
    $('key-skip').addEventListener('click', function () { finish('skipped'); });
    refresh();
  }

  /* egér és trackpad (Macen) */
  SCREENS.hw_pointer = function () {
    if (hwScreen('pointer', 'Mozgasd végig a kurzort az egész képernyőn, kattints a kék karikákra (a négy sarokban és középen, így a trackpad sarkait is próbálod), kattints jobb gombbal vagy két ujjal, majd görgess felfelé és lefelé. Nem kötelező próbák: vízszintes görgetés, csippentés, dupla kattintás.', '', true, '')) {
      on('hw-start', startPointer);
    }
  };

  function startPointer() {
    var cols = 8, rows = 6, total = cols * rows, tracker = P.pointerTracker(total), finished = false, r, c, t;
    var html = '<table id="pointer-grid"><tbody>';
    for (r = 0; r < rows; r++) { html += '<tr>'; for (c = 0; c < cols; c++) html += '<td></td>'; html += '</tr>'; }
    html += '</tbody></table>';
    for (t = 0; t < P.POINTER_TARGETS.length; t++) {
      html += '<button type="button" class="ptarget p-' + P.POINTER_TARGETS[t][0] + '" data-id="' + P.POINTER_TARGETS[t][0] + '">' + (t + 1) + '</button>';
    }
    html += '<div id="pointer-panel"></div><div id="pointer-actions"><button type="button" class="btn" id="pointer-done">Kész</button>' +
      '<button type="button" class="btn secondary" id="pointer-skip">Kihagyom</button></div>';
    var overlay = document.createElement('div');
    overlay.id = 'pointer-overlay';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    var cellEls = overlay.getElementsByTagName('td'), grid = $('pointer-grid');
    function mark(v) { return v ? '✅' : '⬜'; }
    function refresh() {
      var st = tracker.state();
      $('pointer-panel').innerHTML = 'Mozgás: ' + st.cells + ' / ' + st.total + ' mező<br>Bal kattintás: ' + st.targets + ' / ' + st.targetsTotal + ' pont<br>' +
        'Jobb kattintás: ' + mark(st.right) + '<br>Görgetés felfelé: ' + mark(st.up) + ' lefelé: ' + mark(st.down) + '<br>' +
        '<span class="muted">Nem kötelező: vízszintes görgetés ' + mark(st.side) + ' csippentés ' + mark(st.pinch) + ' dupla kattintás ' + mark(st.dbl) + '</span>' +
        (st.complete ? '<br><b>Minden kötelező próba kész, nyomd meg a Kész gombot.</b>' : '');
    }
    function cellAt(x, y) {
      var box = grid.getBoundingClientRect();
      if (!box.width || !box.height) return -1;
      var col = Math.floor((x - box.left) * cols / box.width), row = Math.floor((y - box.top) * rows / box.height);
      if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
      return row * cols + col;
    }
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      hwDone('pointer', status, detail);
      if (status === 'skipped' && !detail) { hwNext(); return; }
      hwResult('pointer');
    }
    overlay.addEventListener('mousemove', function (e) {
      if (finished || e.isTrusted === false) return;
      var i = cellAt(e.clientX, e.clientY);
      if (i >= 0) { tracker.move(i); if (cellEls[i].className !== 'on') cellEls[i].className = 'on'; }
      refresh();
    }, false);
    // A kattintás csak akkor számít, ha tényleg a mutató nyomta (a billentyűzettel kiváltott kattintásnak nincs detail értéke).
    overlay.addEventListener('click', function (e) {
      if (finished || e.isTrusted === false || !(e.detail > 0)) return;
      var id = e.target && e.target.getAttribute ? e.target.getAttribute('data-id') : null;
      if (id) { tracker.target(id); if (e.target.className.indexOf(' on') < 0) e.target.className += ' on'; refresh(); }
    }, false);
    overlay.addEventListener('contextmenu', function (e) { e.preventDefault(); if (finished || e.isTrusted === false) return; tracker.right(); refresh(); }, false);
    overlay.addEventListener('wheel', function (e) { e.preventDefault(); if (finished || e.isTrusted === false) return; tracker.wheel(e.deltaX, e.deltaY, e.ctrlKey); refresh(); }, false);
    overlay.addEventListener('dblclick', function (e) { if (finished || e.isTrusted === false) return; tracker.dbl(); refresh(); }, false);
    overlay.addEventListener('gesturechange', function (e) { e.preventDefault(); tracker.pinch(); refresh(); }, false);
    $('pointer-done').addEventListener('click', function () { var v = P.pointerVerdict(tracker.state()); finish(v.status, v.detail); });
    $('pointer-skip').addEventListener('click', function () { finish('skipped'); });
    refresh();
  }

