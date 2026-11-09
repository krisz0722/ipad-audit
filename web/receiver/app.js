// Az iPaden futó vezetett teszt. Kamerakép és hangfelvétel nem hagyja el az eszközt.
(function () {
  'use strict';

  var sid = (location.hash || '').replace('#', '').trim().toUpperCase();
  var app = document.getElementById('app');
  var POLL_MS = 1500;
  var stream = null;

  function h(html) { app.innerHTML = html; }
  function el(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function post(payload) {
    return fetch(window.BACKEND_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
  }
  function send(name, data) {
    return post({ action: 'step', sid: sid, name: name, data: data || {} }).catch(function () {
      return sleep(2000).then(function () { return send(name, data); });
    });
  }
  function steps() {
    return fetch(window.BACKEND_URL + '?s=' + encodeURIComponent(sid)).then(function (r) { return r.json(); });
  }
  function stopStream() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }

  // Megvárja, amíg a számítógépen futó program USB-n észleli a felsorolt jeleket.
  function waitUsb(names, onUpdate, skip) {
    return new Promise(function (resolve) {
      var stopped = false;
      if (skip) skip(function () { stopped = true; resolve(false); });
      (function loop() {
        if (stopped) return;
        steps().then(function (r) {
          var s = (r && r.steps) || {};
          var missing = names.filter(function (n) { return !s['usb_' + n]; });
          onUpdate(missing);
          if (!missing.length) { stopped = true; resolve(true); return; }
          setTimeout(loop, POLL_MS);
        }).catch(function () { setTimeout(loop, POLL_MS * 2); });
      })();
    });
  }

  function camera(facing, name, title, hint) {
    return new Promise(function (resolve) {
      h('<div class="progress">' + title + '</div><h1>' + title + '</h1><p>' + hint + '</p>' +
        '<video id="v" playsinline muted autoplay></video><p class="status wait" id="s">Keresem a kódot...</p>' +
        '<button class="ghost" id="fail" style="display:none">Nem sikerül beolvasni</button>');
      setTimeout(function () { var b = el('fail'); if (b) b.style.display = ''; }, 45000);
      var done = false;
      var canvas = document.createElement('canvas');
      function finish(data) {
        if (done) return;
        done = true; stopStream();
        send(name, data).then(resolve);
      }
      el('fail').onclick = function () { finish({ skipped: true }); };
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facing }, width: { ideal: 1280 } }, audio: false })
        .then(function (s) {
          stream = s;
          var video = el('v');
          video.srcObject = s;
          var ctx = canvas.getContext('2d');
          (function scan() {
            if (done) return;
            if (video.readyState >= 2) {
              canvas.width = video.videoWidth; canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              var found = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
              if (found && found.data.indexOf('IPA1:') === 0) { finish({ code: found.data }); return; }
            }
            setTimeout(scan, 150);
          })();
        })
        .catch(function () {
          el('s').textContent = 'Nem indult el a kamera. Engedélyezd a kamerát, majd töltsd újra az oldalt.';
          el('s').className = 'status bad';
          el('fail').style.display = '';
        });
    });
  }

  function randomTones() {
    var pool = [700, 950, 1250, 1600, 2000, 2500, 3100, 3800];
    var out = [];
    while (out.length < 4) {
      var f = pool[Math.floor(Math.random() * pool.length)];
      if (out.indexOf(f) < 0) out.push(f);
    }
    return out;
  }

  function audioTest() {
    return new Promise(function (resolve) {
      h('<h1>Hangszóró és mikrofon</h1><p>Húzd ki a fülest, és vedd fel a hangerőt legalább a felére. A teszt hangjelzéseket játszik le.</p>' +
        '<button id="go">Indítás</button><button class="ghost" id="skip">Kihagyom</button><p class="status" id="s"></p>');
      el('skip').onclick = function () { send('audio', { skipped: true }).then(resolve); };
      el('go').onclick = function () {
        el('go').disabled = true;
        var AC = window.AudioContext || window.webkitAudioContext;
        var ctx = new AC();
        ctx.resume();
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
          .then(function (s) {
            stream = s;
            var analyser = ctx.createAnalyser();
            analyser.fftSize = 4096;
            analyser.smoothingTimeConstant = 0;
            ctx.createMediaStreamSource(s).connect(analyser);
            var bins = new Float32Array(analyser.frequencyBinCount);
            function level(freq) {
              analyser.getFloatFrequencyData(bins);
              var hz = ctx.sampleRate / analyser.fftSize;
              var center = Math.round(freq / hz), peak = -200, sum = 0, n = 0;
              for (var i = 0; i < bins.length; i++) {
                if (i * hz < 300) continue;
                if (Math.abs(i - center) <= 3) { if (bins[i] > peak) peak = bins[i]; }
                else if (bins[i] > -180) { sum += bins[i]; n++; }
              }
              return peak - (n ? sum / n : -120);
            }
            function play(freq, pan) {
              var osc = ctx.createOscillator(), gain = ctx.createGain();
              osc.frequency.value = freq; gain.gain.value = 0.9;
              osc.connect(gain);
              if (ctx.createStereoPanner) {
                var p = ctx.createStereoPanner(); p.pan.value = pan; gain.connect(p); p.connect(ctx.destination);
              } else { gain.connect(ctx.destination); }
              osc.start();
              return sleep(180).then(function () {
                var best = -999, i = 0;
                return (function sample() {
                  best = Math.max(best, level(freq));
                  if (++i >= 8) return best;
                  return sleep(40).then(sample);
                })();
              }).then(function (best) { osc.stop(); return sleep(180).then(function () { return best; }); });
            }
            function channel(pan) {
              var expected = randomTones(), heard = [], margin = 25;
              var chain = Promise.resolve();
              expected.forEach(function (f) {
                chain = chain.then(function () { return play(f, pan); }).then(function (v) { heard.push(v >= margin); });
              });
              return chain.then(function () { return { expected: expected, heard: heard }; });
            }
            el('s').textContent = 'Bal csatorna...';
            return channel(-1).then(function (left) {
              el('s').textContent = 'Jobb csatorna...';
              return channel(1).then(function (right) {
                stopStream(); ctx.close();
                return send('audio', { left: left, right: right }).then(resolve);
              });
            });
          })
          .catch(function () { el('s').textContent = 'Nem indult el a mikrofon. Engedélyezd, majd töltsd újra az oldalt.'; el('s').className = 'status bad'; });
      };
    });
  }

  function motionTest() {
    return new Promise(function (resolve) {
      h('<h1>Mozgásszenzorok</h1><p>Koppints az indításra, engedélyezd, majd döntsd az iPadet minden irányba és fordítsd körbe.</p>' +
        '<button id="go">Indítás</button><button class="ghost" id="skip">Kihagyom</button><p class="status" id="s"></p>');
      var min = { x: 99, y: 99 }, max = { x: -99, y: -99 }, rot = 0, finished = false;
      function done(data) { if (finished) return; finished = true; window.removeEventListener('devicemotion', onMotion); send('motion', data).then(resolve); }
      function onMotion(e) {
        var a = e.accelerationIncludingGravity, r = e.rotationRate;
        if (a) {
          min.x = Math.min(min.x, a.x); max.x = Math.max(max.x, a.x);
          min.y = Math.min(min.y, a.y); max.y = Math.max(max.y, a.y);
        }
        if (r) rot = Math.max(rot, Math.abs(r.alpha || 0), Math.abs(r.beta || 0), Math.abs(r.gamma || 0));
        if (max.x - min.x > 8 && max.y - min.y > 8 && rot > 40) done({ ok: true });
      }
      function begin() {
        el('s').textContent = 'Mozgasd az iPadet...'; el('s').className = 'status wait';
        window.addEventListener('devicemotion', onMotion);
        setTimeout(function () { done({ ok: false }); }, 40000);
      }
      el('skip').onclick = function () { done({ skipped: true }); };
      el('go').onclick = function () {
        el('go').disabled = true;
        if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) {
          DeviceMotionEvent.requestPermission().then(function (p) { if (p === 'granted') begin(); else done({ ok: false }); }).catch(function () { done({ ok: false }); });
        } else { begin(); }
      };
    });
  }

  function touchTest() {
    return new Promise(function (resolve) {
      var cols = 8, rows = 12, total = cols * rows, hit = 0, multi = false;
      h('<div id="grid"></div><div id="gridnote">Húzd végig az ujjad minden mezőn</div>');
      var grid = el('grid');
      grid.style.gridTemplateColumns = 'repeat(' + cols + ',1fr)';
      grid.style.gridTemplateRows = 'repeat(' + rows + ',1fr)';
      for (var i = 0; i < total; i++) grid.appendChild(document.createElement('div'));
      var finished = false;
      function done() { if (finished) return; finished = true; send('touch', { cells: hit, total: total, multi: multi }).then(resolve); }
      function mark(e) {
        e.preventDefault();
        if (!e.isTrusted) return;
        if (e.touches.length >= 2) multi = true;
        for (var t = 0; t < e.touches.length; t++) {
          var cell = document.elementFromPoint(e.touches[t].clientX, e.touches[t].clientY);
          if (cell && cell.parentNode === grid && !cell.className) { cell.className = 'on'; hit++; }
        }
        if (hit === total) {
          if (multi) done();
          else el('gridnote').textContent = 'Most tegyél egyszerre két ujjat a kijelzőre';
        }
      }
      grid.addEventListener('touchstart', mark, { passive: false });
      grid.addEventListener('touchmove', mark, { passive: false });
      setTimeout(function () { var n = el('gridnote'); if (n) n.textContent += ' (ha elakadtál, 3 percnél automatikusan továbblép)'; }, 60000);
      setTimeout(done, 180000);
    });
  }

  function usbStep(title, text, names, labels, skipName) {
    return new Promise(function (resolve) {
      h('<h1>' + title + '</h1><p>' + text + '</p><ul class="checks" id="c"></ul>' +
        (skipName ? '<button class="ghost" id="skip">Nincs fülesem</button>' : ''));
      var skipFn = skipName ? function (cancel) {
        el('skip').onclick = function () { cancel(); send(skipName, { skipped: true }).then(resolve); };
      } : null;
      waitUsb(names, function (missing) {
        var c = el('c');
        if (!c) return;
        c.innerHTML = names.map(function (n, i) {
          return '<li>' + (missing.indexOf(n) < 0 ? '✅ ' : '⏳ ') + labels[i] + '</li>';
        }).join('');
      }, skipFn).then(function (ok) { if (ok) resolve(); });
    });
  }

  function displayTest() {
    return new Promise(function (resolve) {
      var colors = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#808080'], i = 0;
      h('<div id="color"></div><div id="colorbar"><button id="next">Következő szín</button></div>');
      el('color').style.background = colors[0];
      el('next').onclick = function () {
        i++;
        if (i < colors.length) { el('color').style.background = colors[i]; return; }
        h('<h1>Kijelző</h1><p>Láttál halott pixelt, foltot vagy elszíneződést valamelyik színen?</p>' +
          '<button id="no">Nem láttam hibát</button><button class="ghost" id="yes">Igen, van hiba</button>');
        el('no').onclick = function () { send('display', { defect: false }).then(resolve); };
        el('yes').onclick = function () { send('display', { defect: true }).then(resolve); };
      };
    });
  }

  function run() {
    var chain = camera('environment', 'cam_rear', 'Hátlapi kamera',
      'Tartsd az iPad hátlapi kameráját a számítógép képernyőjén látható kódra.')
      .then(function () { return camera('user', 'cam_front', 'Előlapi kamera', 'Fordítsd az iPad kijelzőjét a számítógép felé, hogy az előlapi kamera lássa a kódot.'); })
      .then(audioTest)
      .then(motionTest)
      .then(touchTest)
      .then(function () { return usbStep('Fülhallgató', 'Dugd be a fülest a Jack-aljzatba, majd húzd ki.', ['jack_in', 'jack_out'], ['Bedugva', 'Kihúzva'], 'jack'); })
      .then(function () { return usbStep('Hangerőgombok', 'Nyomd meg a hangerő fel és a hangerő le gombot.', ['vol_up', 'vol_down'], ['Hangerő fel', 'Hangerő le']); })
      .then(function () { return usbStep('Home és bekapcsoló', 'Nyomd meg a bekapcsoló gombot, majd a Home gombbal ébreszd fel és oldd fel az iPadet. Ha kilépett, nyisd meg újra a Safarit.', ['lock', 'home'], ['Bekapcsoló gomb', 'Home gomb']); })
      .then(displayTest)
      .then(function () { return send('page_done', {}); })
      .then(function () { h('<h1>Kész</h1><p>Köszönöm! A számítógépen futó program most elküldi a riportot. Ezt az oldalt bezárhatod.</p>'); });
    return chain;
  }

  if (!/^[0-9A-Z]{10}$/.test(sid)) {
    h('<h1>Hibás link</h1><p>Nyisd meg a számítógépen megjelenő kódot vagy linket.</p>');
    return;
  }
  h('<h1>iPad hardverteszt</h1><p>Kb. 5 perc. A teszt kéri a kamera, a mikrofon és a mozgásérzékelő használatát.</p>' +
    '<p class="muted">Kép és hang nem hagyja el az iPadet, csak a mért eredmények kerülnek elküldésre.</p><button id="go">Kezdés</button>');
  el('go').onclick = function () { el('go').disabled = true; send('page_open', {}).then(run); };
})();
