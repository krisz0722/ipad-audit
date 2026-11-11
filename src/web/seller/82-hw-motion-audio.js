  /* mozgásérzékelők */
  SCREENS.hw_motion = function () {
    if (hwScreen('motion', 'Koppints az Indításra, majd dönts meg és fordíts el az eszközt minden irányba kb. fél percig.', '', true, '')) {
      on('hw-start', startMotion);
    }
  };

  function startMotion() {
    if (!window.DeviceMotionEvent) { hwDone('motion', 'unavailable', 'a böngésző nem ad mozgásadatot'); hwResult('motion'); return; }
    var tracker = P.motionTracker(), finished = false, timer;
    function finish(status, detail) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener('devicemotion', onMotion);
      hwDone('motion', status, detail);
      hwResult('motion');
    }
    function onMotion(event) {
      tracker.feed(event.accelerationIncludingGravity, event.rotationRate);
      var st = tracker.state();
      if (st.complete) finish('ok', 'mért mozgás: ' + Math.round(st.rangeX) + ' és ' + Math.round(st.rangeY) + ' m/s² tartomány, ' + Math.round(st.rotation) + ' °/s forgás');
    }
    function begin() {
      message('result', '<p class="muted">Mozgasd az eszközt...</p>');
      window.addEventListener('devicemotion', onMotion);
      timer = setTimeout(function () {
        if (tracker.state().events === 0) finish('bad', 'nem érkezett mozgásadat az érzékelőtől');
        else finish('skipped', 'a mozgás nem érte el a küszöböt');
      }, 40000);
    }
    if (window.DeviceMotionEvent.requestPermission) {
      window.DeviceMotionEvent.requestPermission().then(function (answer) {
        if (answer === 'granted') begin();
        else { hwDone('motion', 'skipped', 'nem engedélyezte a mozgásadatokat'); hwResult('motion'); }
      }).catch(function () { hwDone('motion', 'skipped', 'nem engedélyezte a mozgásadatokat'); hwResult('motion'); });
    } else { begin(); }
  }

  /* hangszóró és mikrofon */
  function audioSupported() {
    return !!((window.AudioContext || window.webkitAudioContext) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  SCREENS.hw_audio = function () {
    var ok = hwScreen('audio', 'Húzd ki a fülhallgatót, és vedd fel a hangerőt legalább a felére. Az oldal hangjelzéseket játszik le a hangszórón, és a mikrofon próbálja meghallani őket. Légy csendben közben.', '',
      audioSupported(), 'ezen a rendszeren a böngésző nem engedi a mikrofon használatát (iOS 11 vagy újabb kell), ezért ezt nem tudtuk ellenőrizni');
    if (ok) on('hw-start', startAudio);
  };

  function randomTones() {
    var pool = [700, 950, 1250, 1600, 2000, 2500, 3100, 3800], out = [];
    while (out.length < 4) {
      var f = pool[Math.floor(Math.random() * pool.length)];
      if (out.indexOf(f) < 0) out.push(f);
    }
    return out;
  }

  function startAudio() {
    var AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
    if (ctx.resume) ctx.resume();
    message('result', '<p class="muted">Hangjelzések...</p>');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      ctx.createMediaStreamSource(stream).connect(analyser);
      var bins = new Float32Array(analyser.frequencyBinCount);
      function level(freq) {
        analyser.getFloatFrequencyData(bins);
        var hz = ctx.sampleRate / analyser.fftSize, center = Math.round(freq / hz), peak = -200, sum = 0, n = 0;
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
          var panner = ctx.createStereoPanner(); panner.pan.value = pan; gain.connect(panner); panner.connect(ctx.destination);
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
        var expected = randomTones(), heard = [], chain = Promise.resolve();
        expected.forEach(function (f) {
          chain = chain.then(function () { return play(f, pan); }).then(function (v) { heard.push(v >= 25); });
        });
        return chain.then(function () { return { expected: expected, heard: heard }; });
      }
      var stereo = !!ctx.createStereoPanner;
      var run = stereo
        ? channel(-1).then(function (left) { return channel(1).then(function (right) { return { left: left, right: right }; }); })
        : channel(0).then(function (mono) { return { mono: mono }; });
      return run.then(function (res) {
        var tracks = stream.getTracks();
        for (var t = 0; t < tracks.length; t++) tracks[t].stop();
        try { ctx.close(); } catch (e) { /* nem baj */ }
        var detail, good;
        if (res.mono) {
          var v = P.toneVerdict(res.mono.expected, res.mono.heard);
          good = v.ok; detail = 'a hangjelzésekből ' + v.heard + ' / ' + v.total + ' hallatszott (ezen a rendszeren a két csatorna külön nem mérhető)';
          if (!v.heard) detail += '. A hangszóró vagy a mikrofon hibás, vagy nincs felvéve a hangerő';
        } else {
          var l = P.toneVerdict(res.left.expected, res.left.heard), r = P.toneVerdict(res.right.expected, res.right.heard);
          good = l.ok && r.ok;
          detail = 'bal csatorna ' + l.heard + ' / ' + l.total + ', jobb csatorna ' + r.heard + ' / ' + r.total + ' hang hallatszott';
          if (!l.heard && !r.heard) detail += '. A hangszóró vagy a mikrofon hibás, vagy nincs felvéve a hangerő';
        }
        hwDone('audio', good ? 'ok' : 'bad', detail);
        hwResult('audio');
      });
    }).catch(function (error) {
      var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      hwDone('audio', denied ? 'skipped' : 'bad', denied ? 'nem engedélyezte a mikrofont' : 'a mikrofon nem érhető el');
      hwResult('audio');
    });
  }

