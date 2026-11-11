  /* ---------- próbaüzem: ugrás bármelyik képernyőre és állapotra (csak #DEMO címen él) ---------- */

  var DEMO_ENVS = {
    ipad9: { device: { device: 'iPad', major: 9, version: '9.3.5', name: 'iOS' } },
    ipad12: { device: { device: 'iPad', major: 12, version: '12.5.7', name: 'iOS' } },
    ipad14: { device: { device: 'iPad', major: 14, version: '14.8', name: 'iOS' } },
    ipad17: { device: { device: 'iPad', major: 17, version: '17.4', name: 'iPadOS' } },
    win: { os: 'windows' }, macpc: { os: 'mac' }, linux: { os: 'linux' }
  };
  var USB_V = { model: 'iPad mini 1', storage: '16 GB', os: '9.3.5', serial: 'DMPS00000FAK', cycles: '245', capacity: '85' };
  var MAC_V = { model: 'MacBook Air', chip: 'Apple M1', memory: '8 GB', storage: '256 GB', os: '14.5', serial: 'C02XYZ123456', cycles: '212', capacity: '91' };
  var MAC_E = { condition: 'Normal', modelId: 'MacBookAir10,1', activationLock: 'Disabled', dep: false, mdm: false };
  var DEMO_VALS = {
    none: { v: {}, e: {} },
    log: { v: { cycles: '245' }, e: { fileDate: '2026-11-09' } },
    logweak: { v: { cycles: '1180' }, e: { fileDate: '2026-11-09' } },
    entered: { v: { cycles: '312', capacity: '88' }, e: {} },
    file: { v: { cycles: '312', capacity: '88' }, e: { fileDate: '2026-11-09' } },
    usb: { v: USB_V, e: { modelId: 'iPad2,5', activationLock: 'Disabled' } },
    usblock: { v: USB_V, e: { modelId: 'iPad2,5', activationLock: 'Enabled' } },
    usbweak: { v: { model: 'iPad mini 1', storage: '16 GB', os: '9.3.5', serial: 'DMPS00000FAK', cycles: '1100', capacity: '70' }, e: { modelId: 'iPad2,5', activationLock: 'Disabled' } },
    mac: { v: MAC_V, e: MAC_E },
    macmdm: { v: MAC_V, e: { condition: 'Service Recommended', modelId: 'MacBookAir10,1', activationLock: 'Enabled', dep: true, mdm: true } }
  };
  var DEMO_LIST = [];
  function demo(group, id, title, o) { DEMO_LIST.push({ group: group, id: id, title: title, o: o }); }

  function demoHw(kind, mode) {
    var out = {}, list = HW_FLOW[kind === 'mac' ? 'mac' : 'ios'], i, name;
    if (mode === 'none') return out;
    function demoKeyboard(allKeys) {
      var kr = P.keyboardLayout('ansi'), kt = P.keyboardTracker(kr), a, b;
      for (a = 0; a < kr.length; a++) { for (b = 0; b < kr[a].length; b++) { if (allKeys || kr[a][b].code !== 'KeyQ') { kt.down(kr[a][b].code, false); kt.up(kr[a][b].code); } } }
      return P.keyboardVerdict(kt.state());
    }
    function demoPointer(allDone) {
      var pt = P.pointerTracker(48), q;
      for (q = 0; q < (allDone ? 48 : 30); q++) pt.move(q);
      pt.target('tl'); pt.target('c'); pt.wheel(0, 40, false);
      if (allDone) { pt.target('tr'); pt.target('bl'); pt.target('br'); pt.right(); pt.wheel(0, -40, false); }
      return P.pointerVerdict(pt.state());
    }
    var good = { keyboard: demoKeyboard(true).detail, pointer: demoPointer(true).detail, touch: 'minden mező érzékelve, két ujj is', motion: 'mért mozgás: 12 és 10 m/s² tartomány, 55 °/s forgás',
      audio: 'a hangszóró és a mikrofon rendben, a mikrofon meghallotta a hangjelzéseket', camera_rear: 'élő kép érkezik',
      camera_front: 'élő kép érkezik', display: 'az eladó nem látott hibát' };
    var bad = { keyboard: [demoKeyboard(false).status, demoKeyboard(false).detail], pointer: [demoPointer(false).status, demoPointer(false).detail], touch: ['ok', good.touch], motion: ['bad', 'nem érkezett mozgásadat az érzékelőtől'], audio: ['bad', 'a mikrofon nem hallotta a hangszórót'],
      camera_rear: ['bad', 'csak fekete vagy egyszínű kép érkezett'], camera_front: ['ok', good.camera_front], display: ['bad', 'az eladó hibát látott a kijelzőn'] };
    var legacy = { touch: ['ok', good.touch], motion: ['ok', good.motion], display: ['ok', good.display] };
    for (i = 0; i < list.length; i++) {
      name = list[i];
      if (mode === 'ok') out[name] = { status: 'ok', detail: good[name] };
      else if (mode === 'bad') out[name] = { status: bad[name][0], detail: bad[name][1] };
      else if (mode === 'legacy') {
        out[name] = legacy[name] ? { status: legacy[name][0], detail: legacy[name][1] }
          : { status: 'unavailable', detail: 'ezen a rendszeren a böngésző nem engedi a használatát (iOS 11 vagy újabb kell), ezért ezt nem tudtuk ellenőrizni' };
      }
    }
    return out;
  }

  function applyDemo(spec) {
    var o = spec.o, env = DEMO_ENVS[o.env] || DEMO_ENVS.ipad9, preset = DEMO_VALS[o.vals || 'none'], key;
    DEVICE = env.device || null; ON_COMPUTER = !DEVICE; FORCE_OS = env.os || '';
    state.sent = false; state.sending = false; state.sid = ''; state.demoSections = null;
    state.kind = o.kind || 'ios';
    state.osFamily = o.fam || (DEVICE ? familyOf(DEVICE.major) : 'latest');
    state.detectedOs = DEVICE ? DEVICE.version : '';
    state.vals = { model: '', storage: '', os: '', memory: '', chip: '', serial: '', cycles: '', capacity: '' };
    for (key in preset.v) { if (Object.prototype.hasOwnProperty.call(preset.v, key)) state.vals[key] = preset.v[key]; }
    if (DEVICE && !state.vals.os) state.vals.os = DEVICE.version;
    state.route = o.route || '';
    state.parsed = {};
    if (state.route) { for (key in preset.v) { if (Object.prototype.hasOwnProperty.call(preset.v, key)) state.parsed[key] = preset.v[key]; } }
    state.extra = { condition: '', fileDate: '', activationLock: '', dep: null, mdm: null, modelId: '' };
    for (key in preset.e) { if (Object.prototype.hasOwnProperty.call(preset.e, key)) state.extra[key] = preset.e[key]; }
    state.apple = o.apple === undefined ? 'yes' : o.apple;
    state.shareSerial = true;
    state.noLog = !!o.noLog;
    state.hw = demoHw(state.kind, o.hw || 'none');
    state.hwSkipped = o.hw === 'none' && !!o.hwSkipped;
    state.path = ['welcome']; state.idx = 0; state.step = 'welcome';
    try { history.replaceState({ idx: 0 }, ''); } catch (e) { /* nem baj */ }
    if (o.screen === 'done') { done(P.buildSections(collect())); return; }
    go(o.screen);
  }

  function jumpDemo(id) {
    for (var i = 0; i < DEMO_LIST.length; i++) { if (DEMO_LIST[i].id === id) { applyDemo(DEMO_LIST[i]); return true; } }
    return false;
  }

  function demoPanel() {
    var html = '<div class="demo-panel"><h2>Próbaüzem: ugrás bármelyik képernyőre</h2>' +
      '<p class="muted">Egy kattintás beállítja az eszközt, a rendszert és az adatokat, és a kiválasztott képernyőre visz. A Vissza ide hoz. Közvetlen cím: a #DEMO után egy kötőjel és az azonosító, például <b>#DEMO-ios9-review-log</b>. Ez csak a #DEMO címen létezik.</p>', group = '', i;
    for (i = 0; i < DEMO_LIST.length; i++) {
      var item = DEMO_LIST[i];
      if (item.group !== group) {
        if (group) html += '</div>';
        html += '<h3>' + esc(item.group) + '</h3><div class="demo-list">';
        group = item.group;
      }
      html += '<button type="button" class="demo-btn" data-demo="' + esc(item.id) + '">' + esc(item.title) + '<small>#DEMO-' + esc(item.id) + '</small></button>';
    }
    return html + '</div></div>';
  }

  var G_OPEN = 'Nyitás';
  demo(G_OPEN, 'kind', 'Milyen eszközt adsz el?', { env: 'ipad9', kind: '', screen: 'kind' });

  var G9 = 'iPad, iOS 9 és 10';
  demo(G9, 'ios9-log-ask', 'Rendszernapló keresése', { env: 'ipad9', screen: 'log_ask' });
  demo(G9, 'ios9-log-paste', 'Napló beillesztése', { env: 'ipad9', screen: 'log_paste' });
  demo(G9, 'ios9-nolog', 'Nincs napló bejegyzés', { env: 'ipad9', screen: 'nolog' });
  demo(G9, 'ios9-details-nodata', 'Az eszköz adatai, még nincs akku adat', { env: 'ipad9', apple: '', screen: 'details' });
  demo(G9, 'ios9-details-log', 'Az eszköz adatai, napló beolvasva', { env: 'ipad9', vals: 'log', route: 'file', apple: '', screen: 'details' });
  demo(G9, 'ios9-hw-intro', 'Hardverteszt bevezető', { env: 'ipad9', screen: 'hw_intro' });
  demo(G9, 'ios9-hw-touch', 'Érintőképernyő teszt', { env: 'ipad9', screen: 'hw_touch' });
  demo(G9, 'ios9-hw-motion', 'Mozgásérzékelő teszt', { env: 'ipad9', screen: 'hw_motion' });
  demo(G9, 'ios9-hw-audio', 'Hang és mikrofon (iOS 9-en nem ellenőrizhető)', { env: 'ipad9', screen: 'hw_audio' });
  demo(G9, 'ios9-hw-camera-rear', 'Hátlapi kamera (iOS 9-en nem ellenőrizhető)', { env: 'ipad9', screen: 'hw_camera_rear' });
  demo(G9, 'ios9-hw-camera-front', 'Előlapi kamera (iOS 9-en nem ellenőrizhető)', { env: 'ipad9', screen: 'hw_camera_front' });
  demo(G9, 'ios9-hw-display', 'Kijelző színei', { env: 'ipad9', screen: 'hw_display' });
  demo(G9, 'ios9-remaining-nolog', 'Mi maradt, akku adat nélkül', { env: 'ipad9', noLog: true, hw: 'legacy', screen: 'remaining' });
  demo(G9, 'ios9-remaining-log', 'Mi maradt, napló beolvasva', { env: 'ipad9', vals: 'log', route: 'file', hw: 'legacy', screen: 'remaining' });
  demo(G9, 'ios9-usb-about', 'Mit csinál az USB-s program', { env: 'ipad9', screen: 'usb_about' });
  demo(G9, 'ios9-usb-switch', 'Nyisd meg a számítógépeden', { env: 'ipad9', screen: 'usb_switch' });
  demo(G9, 'ios9-review-nolog', 'Előnézet: akku adat nélkül, hardverteszt kihagyva', { env: 'ipad9', noLog: true, hw: 'none', hwSkipped: true, screen: 'review' });
  demo(G9, 'ios9-review-log', 'Előnézet: napló, hardverteszt iOS 9 szerint', { env: 'ipad9', vals: 'log', route: 'file', hw: 'legacy', screen: 'review' });
  demo(G9, 'ios9-review-weak', 'Előnézet: kopott akku, hibás tesztek', { env: 'ipad9', vals: 'logweak', route: 'file', hw: 'bad', apple: 'no', screen: 'review' });
  demo(G9, 'ios9-done', 'Köszönjük (a küldés után)', { env: 'ipad9', vals: 'log', route: 'file', hw: 'legacy', screen: 'done' });

  var G12 = 'iPad, iOS 11 és 12';
  demo(G12, 'mid-screen-ask', 'Látod az akku állapotát a Beállításokban?', { env: 'ipad12', screen: 'screen_ask' });
  demo(G12, 'mid-screen-enter', 'Akku értékek beírása', { env: 'ipad12', screen: 'screen_enter' });
  demo(G12, 'mid-log-ask', 'Rendszernapló keresése', { env: 'ipad12', screen: 'log_ask' });
  demo(G12, 'mid-log-paste', 'Napló beillesztése', { env: 'ipad12', screen: 'log_paste' });
  demo(G12, 'mid-hw-audio', 'Hang és mikrofon teszt', { env: 'ipad12', screen: 'hw_audio' });
  demo(G12, 'mid-hw-camera-rear', 'Hátlapi kamera teszt', { env: 'ipad12', screen: 'hw_camera_rear' });
  demo(G12, 'mid-review', 'Előnézet: beírt akku, minden teszt rendben', { env: 'ipad12', vals: 'entered', hw: 'ok', screen: 'review' });

  var G14 = 'iPad, iPadOS 13 és 14';
  demo(G14, 'modern-screen-ask', 'Látod az akku állapotát a Beállításokban?', { env: 'ipad14', screen: 'screen_ask' });
  demo(G14, 'modern-screen-enter', 'Akku értékek beírása', { env: 'ipad14', screen: 'screen_enter' });
  demo(G14, 'modern-log-ask', 'Analitikai fájl keresése', { env: 'ipad14', screen: 'log_ask' });
  demo(G14, 'modern-log-file', 'Fájl kiválasztása', { env: 'ipad14', screen: 'log_file' });
  demo(G14, 'modern-review', 'Előnézet: fájlból, minden teszt rendben', { env: 'ipad14', vals: 'file', route: 'file', hw: 'ok', screen: 'review' });

  var G17 = 'iPad, iPadOS 15 és újabb';
  demo(G17, 'latest-screen-ask', 'Látod az akku állapotát a Beállításokban?', { env: 'ipad17', screen: 'screen_ask' });
  demo(G17, 'latest-log-file', 'Fájl kiválasztása', { env: 'ipad17', screen: 'log_file' });
  demo(G17, 'latest-hw-audio', 'Hang és mikrofon teszt', { env: 'ipad17', screen: 'hw_audio' });
  demo(G17, 'latest-remaining', 'Mi maradt, minden teszt rendben', { env: 'ipad17', vals: 'file', route: 'file', hw: 'ok', screen: 'remaining' });
  demo(G17, 'latest-review-ok', 'Előnézet: minden rendben', { env: 'ipad17', vals: 'file', route: 'file', hw: 'ok', screen: 'review' });
  demo(G17, 'latest-review-bad', 'Előnézet: hibás tesztek, kijelentkezés nélkül', { env: 'ipad17', vals: 'file', route: 'file', hw: 'bad', apple: 'no', screen: 'review' });

  var GPC = 'Számítógép, USB-s kiolvasás (iPad vagy iPhone)';
  demo(GPC, 'pc-win-get', 'Letöltés: Windows', { env: 'win', screen: 'usb_get' });
  demo(GPC, 'pc-mac-get', 'Letöltés: Mac', { env: 'macpc', screen: 'usb_get' });
  demo(GPC, 'pc-linux-get', 'Letöltés: Linux', { env: 'linux', screen: 'usb_get' });
  demo(GPC, 'pc-run', 'Csatlakoztatás és futtatás', { env: 'win', screen: 'usb_run' });
  demo(GPC, 'pc-paste', 'A kimenet beillesztése', { env: 'win', screen: 'usb_paste' });
  demo(GPC, 'pc-details', 'Az eszköz adatai, USB-ből kitöltve', { env: 'win', vals: 'usb', route: 'usb', apple: '', screen: 'details' });
  demo(GPC, 'pc-review', 'Előnézet: USB-s adatok, Aktiválási zár kikapcsolva', { env: 'win', vals: 'usb', route: 'usb', screen: 'review' });
  demo(GPC, 'pc-review-lock', 'Előnézet: Aktiválási zár BEKAPCSOLVA', { env: 'win', vals: 'usblock', route: 'usb', apple: 'no', screen: 'review' });
  demo(GPC, 'pc-review-weak', 'Előnézet: kopott akku', { env: 'win', vals: 'usbweak', route: 'usb', screen: 'review' });
  demo(GPC, 'pc-done', 'Köszönjük (a küldés után)', { env: 'win', vals: 'usb', route: 'usb', screen: 'done' });

  var GMAC = 'Mac eladása';
  demo(GMAC, 'mac-run', 'Terminál-parancs futtatása', { env: 'macpc', kind: 'mac', screen: 'mac_run' });
  demo(GMAC, 'mac-paste', 'A kimenet beillesztése', { env: 'macpc', kind: 'mac', screen: 'mac_paste' });
  demo(GMAC, 'mac-manual', 'Kézi megadás (ha a parancs nem megy)', { env: 'macpc', kind: 'mac', screen: 'mac_manual' });
  demo(GMAC, 'mac-details', 'Az eszköz adatai, parancsból kitöltve', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', apple: '', screen: 'details' });
  demo(GMAC, 'mac-hw-intro', 'Hardverteszt bevezető', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', screen: 'hw_intro' });
  demo(GMAC, 'mac-hw-keyboard', 'Billentyűzet teszt', { env: 'macpc', kind: 'mac', screen: 'hw_keyboard' });
  demo(GMAC, 'mac-hw-pointer', 'Egér és trackpad teszt', { env: 'macpc', kind: 'mac', screen: 'hw_pointer' });
  demo(GMAC, 'mac-hw-audio', 'Hang és mikrofon teszt', { env: 'macpc', kind: 'mac', screen: 'hw_audio' });
  demo(GMAC, 'mac-review-ok', 'Előnézet: minden rendben', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', hw: 'ok', screen: 'review' });
  demo(GMAC, 'mac-review-mdm', 'Előnézet: céges felügyelet, zár bekapcsolva, hibás tesztek', { env: 'macpc', kind: 'mac', vals: 'macmdm', route: 'command', hw: 'bad', apple: 'no', screen: 'review' });
  demo(GMAC, 'mac-review-nohw', 'Előnézet: hardverteszt kihagyva', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', hw: 'none', hwSkipped: true, screen: 'review' });
  demo(GMAC, 'mac-done', 'Köszönjük (a küldés után)', { env: 'macpc', kind: 'mac', vals: 'mac', route: 'command', hw: 'ok', screen: 'done' });

