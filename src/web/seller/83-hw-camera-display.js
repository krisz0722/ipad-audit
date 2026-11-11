  /* kamerák */
  function cameraSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  function cameraScreen(name, facing, lead) {
    return function () {
      var ok = hwScreen(name, lead, '<div id="preview"></div>', cameraSupported(),
        'ezen a rendszeren a böngésző nem engedi a kamera használatát (iOS 11 vagy újabb kell), ezért ezt nem tudtuk ellenőrizni');
      if (ok) on('hw-start', function () { startCamera(name, facing); });
    };
  }
  SCREENS.hw_camera_rear = cameraScreen('camera_rear', 'environment', 'Koppints az Indításra, engedélyezd a kamerát, és tartsd a hátlapi kamerát valami elé, ami nem egyszínű. Az oldal azt nézi, hogy valódi kép jön-e.');
  SCREENS.hw_camera_front = cameraScreen('camera_front', 'user', 'Koppints az Indításra, engedélyezd a kamerát, és nézz az előlapi kamerába. Az oldal azt nézi, hogy valódi kép jön-e.');

  function startCamera(name, facing) {
    var constraints = state.kind === 'mac' ? { video: true } : { video: { facingMode: { exact: facing } } };
    navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
      var video = document.createElement('video');
      video.setAttribute('playsinline', ''); video.setAttribute('autoplay', ''); video.muted = true;
      video.style.width = '100%';
      $('preview').appendChild(video);
      video.srcObject = stream;
      var canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 48;
      var ctx = canvas.getContext('2d'), started = new Date().getTime(), done = false;
      function stop() {
        var tracks = stream.getTracks();
        for (var t = 0; t < tracks.length; t++) tracks[t].stop();
        if (video.parentNode) video.parentNode.removeChild(video);
      }
      (function sample() {
        if (done) return;
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, 64, 48);
          if (P.frameLooksReal(P.frameStats(ctx.getImageData(0, 0, 64, 48).data))) {
            done = true; stop(); hwDone(name, 'ok', 'élő kép érkezik'); hwResult(name); return;
          }
        }
        if (new Date().getTime() - started > 15000) {
          done = true; stop();
          hwDone(name, 'bad', 'csak fekete vagy egyszínű kép érkezett (a lencsét takarja valami, vagy hibás)');
          hwResult(name);
          return;
        }
        setTimeout(sample, 400);
      })();
    }).catch(function (error) {
      var denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      if (denied) hwDone(name, 'skipped', 'nem engedélyezte a kamerát');
      else hwDone(name, 'bad', 'nem található működő ' + (facing === 'user' ? 'előlapi' : 'hátlapi') + ' kamera');
      hwResult(name);
    });
  }

  /* kijelző: az egyetlen teszt, ami az eladó válaszára épül, ezért a riportban bemondásként szerepel */
  SCREENS.hw_display = function () {
    if (hwScreen('display', 'Végigmegyünk néhány egyszínű képen. Figyeld, van-e halott pixel, folt vagy elszíneződés valamelyiken.', '', true, '')) {
      on('hw-start', startDisplay);
    }
  };

  function startDisplay() {
    var colors = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#808080'], i = 0;
    var overlay = document.createElement('div');
    overlay.id = 'color-overlay';
    overlay.innerHTML = '<div id="color"></div><div id="colorbar"><button type="button" class="btn" id="color-next">Következő szín</button></div>';
    document.body.appendChild(overlay);
    document.getElementById('color').style.background = colors[0];
    document.getElementById('color-next').addEventListener('click', function () {
      i++;
      if (i < colors.length) { document.getElementById('color').style.background = colors[i]; return; }
      document.body.removeChild(overlay);
      message('result', '<p>Láttál halott pixelt, foltot vagy elszíneződést valamelyik színen?</p>' +
        '<button type="button" class="btn" id="d-no">Nem láttam hibát</button>' +
        '<button type="button" class="btn secondary" id="d-yes">Igen, van hiba</button>');
      on('d-no', function () { hwDone('display', 'ok', 'az eladó nem látott hibát'); hwResult('display'); });
      on('d-yes', function () { hwDone('display', 'bad', 'az eladó hibát látott a kijelzőn'); hwResult('display'); });
    });
  }

