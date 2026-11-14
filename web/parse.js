// Kiolvasók az eladói varázslóhoz. Böngészőben és Node-ban is fut (a tesztekhez).
// Alapelv: csak előre felsorolt mezőket olvasunk ki, minden más figyelmen kívül marad.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SellerParse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  // Kézi UTF-8, mert a TextEncoder a régi (iOS 9, 10) Safariban nincs meg.
  function utf8Bytes(text) {
    var binary = unescape(encodeURIComponent(String(text))),
      bytes = [];
    for (var i = 0; i < binary.length; i++) bytes.push(binary.charCodeAt(i));
    return bytes;
  }

  // Tiszta JS SHA-256, mert a crypto.subtle csak biztonságos (HTTPS) környezetben érhető el.
  function sha256Hex(text) {
    var bytes = utf8Bytes(text);
    var bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLength / 0x100000000),
      lo = bitLength >>> 0;
    bytes.push(
      (hi >>> 24) & 255,
      (hi >>> 16) & 255,
      (hi >>> 8) & 255,
      hi & 255,
      (lo >>> 24) & 255,
      (lo >>> 16) & 255,
      (lo >>> 8) & 255,
      lo & 255
    );
    var H = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
      0x1f83d9ab, 0x5be0cd19
    ];
    var w = new Array(64),
      i;
    for (var off = 0; off < bytes.length; off += 64) {
      for (i = 0; i < 16; i++) {
        w[i] =
          (bytes[off + i * 4] << 24) |
          (bytes[off + i * 4 + 1] << 16) |
          (bytes[off + i * 4 + 2] << 8) |
          bytes[off + i * 4 + 3] |
          0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0],
        b = H[1],
        c = H[2],
        d = H[3],
        e = H[4],
        f = H[5],
        g = H[6],
        h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0;
      H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0;
      H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0;
      H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) {
      return ("00000000" + (x >>> 0).toString(16)).slice(-8);
    }).join("");
  }

  function clean(value, max) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max || 60);
  }

  function normalizeSerial(value) {
    var text = String(value === null || value === undefined ? "" : value)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return text.length >= 8 && text.length <= 14 ? text : "";
  }

  // A meghívókóddal kulcsolt lenyomat. A kód csak az eladónál és a vevőnél (a Táblában) van meg,
  // ezért a levélből a sorozatszám nem fejthető vissza. Átvételkor a vevő újraszámolhatja.
  function fingerprint(code, serial) {
    if (!serial) return "";
    return sha256Hex(String(code) + ":" + serial).slice(0, 16);
  }

  var CAP_TO_GB = [32, 64, 128, 256, 512, 1000, 2000, 4000, 8000];
  function storageLabel(bytes) {
    var gb = bytes / 1e9;
    if (!(gb > 0)) return "";
    for (var i = 0; i < CAP_TO_GB.length; i++) {
      if (gb <= CAP_TO_GB[i])
        return CAP_TO_GB[i] >= 1000
          ? CAP_TO_GB[i] / 1000 + " TB"
          : CAP_TO_GB[i] + " GB";
    }
    return "";
  }

  // iPad analitikai fájl. Csak a ciklusszámot, a kapacitást, a rendszerverziót és a dátumot olvassa.
  function parseIpadFile(text) {
    text = String(text || "");
    var result = { cycles: null, capacity: null, os: "", fileDate: "" };
    var m,
      candidates = [],
      re = /([A-Za-z_]*)CycleCount([A-Za-z_0-9]*)[^0-9\n]{0,6}\s*(\d{1,5})\b/gi;
    while ((m = re.exec(text)) !== null) {
      if (/design|max|limit|target|nominal/i.test(m[1] + m[2])) continue;
      var n = parseInt(m[3], 10);
      if (n <= 5000) candidates.push({ n: n, last: /last/i.test(m[1]) });
    }
    var pool = candidates.filter(function (c) {
      return c.last;
    });
    if (!pool.length) pool = candidates;
    pool.forEach(function (c) {
      if (result.cycles === null || c.n > result.cycles) result.cycles = c.n;
    });

    re =
      /Max(?:imum)?Capacity(?:Percent(?:age)?)?[^0-9\n]{0,6}\s*(\d{2,3})\b/gi;
    while ((m = re.exec(text)) !== null) {
      var p = parseInt(m[1], 10);
      if (p >= 40 && p <= 100) result.capacity = p;
    }
    m = /"os_version"\s*:\s*"([^"]{1,60})"/.exec(text);
    if (m) result.os = clean(m[1], 60);
    m = /"timestamp"\s*:\s*"([^"]{1,40})"/.exec(text);
    if (m) result.fileDate = clean(m[1], 40);
    return result;
  }

  // A Mac parancs kimenete. A system_profiler -xml kulcsai nem lokalizáltak, ezért magyar Macen is működnek.
  function parseMacOutput(text) {
    text = String(text || "");
    var out = {
      model: "",
      modelId: "",
      chip: "",
      memory: "",
      storage: "",
      os: "",
      serial: "",
      activationLock: "",
      cycles: null,
      condition: "",
      capacity: null,
      dep: null,
      mdm: null,
      valid: false
    };
    var xml = Object.create(null),
      m;
    var re =
      /<key>([A-Za-z0-9_]{1,60})<\/key>\s*<(string|integer|real)>([^<]{0,80})<\/\2>/g;
    while ((m = re.exec(text)) !== null) {
      if (!(m[1] in xml)) xml[m[1]] = m[3];
    }

    out.model = clean(xml.machine_name, 60);
    out.modelId = clean(xml.machine_model, 30);
    out.chip = clean(xml.chip_type || xml.cpu_type, 60);
    out.memory = clean(xml.physical_memory, 20);
    out.serial = normalizeSerial(xml.serial_number);
    var lock = String(xml.activation_lock_status || "");
    out.activationLock = /enabled/i.test(lock)
      ? "Enabled"
      : /disabled/i.test(lock)
        ? "Disabled"
        : "";

    var cycles = parseInt(xml.sppower_battery_cycle_count, 10);
    if (cycles >= 0 && cycles <= 5000) out.cycles = cycles;
    out.condition = clean(xml.sppower_battery_health, 30);
    var cap = parseInt(xml.sppower_battery_health_maximum_capacity, 10);
    if (cap >= 40 && cap <= 100) out.capacity = cap;

    m = /^\s*(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s*$/m.exec(text);
    if (m) out.os = m[1];
    m = /Enrolled via DEP:\s*(Yes|No)/i.exec(text);
    if (m) out.dep = /yes/i.test(m[1]);
    m = /MDM enrollment:\s*(Yes|No)/i.exec(text);
    if (m) out.mdm = /yes/i.test(m[1]);
    m = /^\S+\s+(\d{6,})\s+\d+\s+\d+\s+\d+%.*\/System\/Volumes\/Data\s*$/m.exec(
      text
    );
    if (m) out.storage = storageLabel(parseInt(m[1], 10) * 1024);

    out.valid = !!(
      out.modelId ||
      out.serial ||
      out.cycles !== null ||
      out.os ||
      out.dep !== null
    );
    return out;
  }

  /* ---------- hardverteszt: tiszta kiértékelő függvények (az oldal mér, az eladó válasza nem számít) ---------- */

  // Érintőképernyő: minden mezőt érinteni kell, és kellett két ujjas érintés is.
  function touchTracker(total) {
    var seen = {},
      count = 0,
      multi = false;
    return {
      hit: function (index, fingers) {
        if (fingers >= 2) multi = true;
        if (index >= 0 && index < total && !seen[index]) {
          seen[index] = true;
          count++;
        }
      },
      state: function () {
        return {
          cells: count,
          total: total,
          multi: multi,
          complete: count === total && multi
        };
      }
    };
  }

  // Mozgásérzékelő: az eszközt tényleg el kell mozgatni és forgatni, a mért érték számít.
  function motionTracker() {
    var min = { x: 99, y: 99, z: 99 },
      max = { x: -99, y: -99, z: -99 },
      rotMin = { alpha: 999, beta: 999, gamma: 999 },
      rotMax = { alpha: -999, beta: -999, gamma: -999 },
      rot = 0,
      events = 0;
    return {
      feed: function (acc, rate) {
        events++;
        if (acc) {
          if (typeof acc.x === "number") {
            min.x = Math.min(min.x, acc.x);
            max.x = Math.max(max.x, acc.x);
          }
          if (typeof acc.y === "number") {
            min.y = Math.min(min.y, acc.y);
            max.y = Math.max(max.y, acc.y);
          }
          if (typeof acc.z === "number") {
            min.z = Math.min(min.z, acc.z);
            max.z = Math.max(max.z, acc.z);
          }
        }
        if (rate) {
          var a = typeof rate.alpha === "number" ? rate.alpha : 0,
            b = typeof rate.beta === "number" ? rate.beta : 0,
            g = typeof rate.gamma === "number" ? rate.gamma : 0;
          rotMin.alpha = Math.min(rotMin.alpha, a);
          rotMax.alpha = Math.max(rotMax.alpha, a);
          rotMin.beta = Math.min(rotMin.beta, b);
          rotMax.beta = Math.max(rotMax.beta, b);
          rotMin.gamma = Math.min(rotMin.gamma, g);
          rotMax.gamma = Math.max(rotMax.gamma, g);
          rot = Math.max(rot, Math.abs(a), Math.abs(b), Math.abs(g));
        }
      },
      state: function () {
        var rx = max.x > min.x ? max.x - min.x : 0,
          ry = max.y > min.y ? max.y - min.y : 0,
          rz = max.z > min.z ? max.z - min.z : 0;
        var checks = {
          tiltX: min.x <= -4 && max.x >= 4 && rx >= 10,
          tiltY: min.y <= -4 && max.y >= 4 && ry >= 10,
          tiltZ: rz >= 8,
          gyroBeta: rotMin.beta <= -35 && rotMax.beta >= 35,
          gyroGamma: rotMin.gamma <= -35 && rotMax.gamma >= 35,
          gyroAlpha: rotMin.alpha <= -35 && rotMax.alpha >= 35
        };
        var doneCount =
          (checks.tiltX ? 1 : 0) +
          (checks.tiltY ? 1 : 0) +
          (checks.tiltZ ? 1 : 0) +
          (checks.gyroBeta ? 1 : 0) +
          (checks.gyroGamma ? 1 : 0) +
          (checks.gyroAlpha ? 1 : 0);
        return {
          events: events,
          rangeX: rx,
          rangeY: ry,
          rangeZ: rz,
          rotation: rot,
          checks: checks,
          doneCount: doneCount,
          totalChecks: 6,
          complete: doneCount === 6
        };
      }
    };
  }

  // Hangjelzés: a mikrofon hány várt hangot hallott meg.
  function toneVerdict(expected, heard) {
    var n = 0;
    for (var i = 0; i < expected.length; i++) {
      if (heard[i]) n++;
    }
    return {
      heard: n,
      total: expected.length,
      ok: expected.length > 0 && n === expected.length
    };
  }

  // Kamera: egy képkocka akkor valódi, ha nem fekete, nem fehér és nem egyszínű.
  function frameStats(rgba) {
    var sum = 0,
      sumSq = 0,
      n = 0;
    for (var i = 0; i + 2 < rgba.length; i += 16) {
      var lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
    if (!n) return { mean: 0, std: 0 };
    var mean = sum / n;
    return { mean: mean, std: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
  }
  function frameLooksReal(stats) {
    return stats.std >= 12 && stats.mean >= 8 && stats.mean <= 247;
  }

  // Billentyűzet (Mac): a billentyűket a fizikai kódjuk (event.code) azonosítja, így a nyelvi kiosztástól független.
  // A felső funkciósort (F1 és F12) a Mac alapból hangerő, fényerő és hasonló rendszerbillentyűnek veszi, ezt a böngésző
  // csak az Fn billentyűvel együtt kapja meg, ezért ez "soft": nem számít hibának, ha nem érzékeljük.
  function keyboardLayout(kind) {
    function k(code, label, w, soft) {
      return { code: code, label: label, w: w || 1, soft: !!soft };
    }
    function letters(str) {
      var o = [],
        i;
      for (i = 0; i < str.length; i++)
        o.push(k("Key" + str.charAt(i), str.charAt(i)));
      return o;
    }
    var iso = kind === "iso",
      fn = [k("Escape", "esc", 1.5)],
      nums = [k("Backquote", "`")],
      f,
      n;
    for (f = 1; f <= 12; f++) fn.push(k("F" + f, "F" + f, 1, true));
    for (n = 1; n <= 9; n++) nums.push(k("Digit" + n, String(n)));
    nums.push(
      k("Digit0", "0"),
      k("Minus", "-"),
      k("Equal", "="),
      k("Backspace", "törlés", 2)
    );
    var top = [k("Tab", "tab", 1.5)].concat(letters("QWERTYUIOP"), [
      k("BracketLeft", "["),
      k("BracketRight", "]")
    ]);
    if (!iso) top.push(k("Backslash", "\\", 1.5));
    var home = [k("CapsLock", "caps", 1.8)].concat(letters("ASDFGHJKL"), [
      k("Semicolon", ";"),
      k("Quote", "'")
    ]);
    if (iso) home.push(k("Backslash", "#"));
    home.push(k("Enter", "enter", iso ? 1.4 : 2.2));
    var bottom = [k("ShiftLeft", "shift", iso ? 1.3 : 2.4)];
    if (iso) bottom.push(k("IntlBackslash", "<"));
    bottom = bottom.concat(letters("ZXCVBNM"), [
      k("Comma", ","),
      k("Period", "."),
      k("Slash", "/"),
      k("ShiftRight", "shift", iso ? 2.7 : 2.4)
    ]);
    var space = [
      k("ControlLeft", "ctrl", 1.2),
      k("AltLeft", "opt", 1.2),
      k("MetaLeft", "cmd", 1.3),
      k("Space", "szóköz", 5.6),
      k("MetaRight", "cmd", 1.3),
      k("AltRight", "opt", 1.2),
      k("ArrowLeft", "←"),
      k("ArrowUp", "↑"),
      k("ArrowDown", "↓"),
      k("ArrowRight", "→")
    ];
    return [fn, nums, top, home, bottom, space];
  }

  function keyboardTracker(rows) {
    var required = {},
      soft = {},
      label = {},
      pressed = {},
      down = {},
      doubles = {},
      unknown = {},
      order = [],
      total = 0,
      softTotal = 0,
      r,
      c,
      key;
    for (r = 0; r < rows.length; r++) {
      for (c = 0; c < rows[r].length; c++) {
        key = rows[r][c];
        label[key.code] = key.label;
        if (key.soft) {
          soft[key.code] = true;
          softTotal++;
        } else {
          required[key.code] = true;
          order.push(key.code);
          total++;
        }
      }
    }
    function mark(code) {
      if (required[code] || soft[code]) pressed[code] = true;
      else unknown[code] = true;
    }
    return {
      down: function (code, repeat) {
        if (!code) return;
        // Két leütés felengedés nélkül: egy fizikai nyomásra kétszer reagál (a pillangó-billentyűzetek tipikus hibája).
        if (down[code] && !repeat && code !== "CapsLock")
          doubles[code] = (doubles[code] || 0) + 1;
        down[code] = true;
        mark(code);
      },
      // A Caps Lock Macen csak bekapcsoláskor ad leütést, kikapcsoláskor csak felengedést.
      up: function (code) {
        if (!code) return;
        down[code] = false;
        if (code === "CapsLock") mark(code);
      },
      state: function () {
        var missing = [],
          missingLabels = [],
          doubleCodes = [],
          doubleLabels = [],
          unknownCodes = [],
          softPressed = 0,
          i,
          code;
        for (i = 0; i < order.length; i++) {
          code = order[i];
          if (!pressed[code]) {
            missing.push(code);
            missingLabels.push(label[code]);
          }
        }
        for (code in soft) {
          if (Object.prototype.hasOwnProperty.call(soft, code) && pressed[code])
            softPressed++;
        }
        for (code in doubles) {
          if (Object.prototype.hasOwnProperty.call(doubles, code)) {
            doubleCodes.push(code);
            doubleLabels.push(label[code] || code);
          }
        }
        for (code in unknown) {
          if (Object.prototype.hasOwnProperty.call(unknown, code))
            unknownCodes.push(code);
        }
        return {
          total: total,
          pressed: total - missing.length,
          missing: missing,
          missingLabels: missingLabels,
          softTotal: softTotal,
          softPressed: softPressed,
          doubles: doubleCodes,
          doubleLabels: doubleLabels,
          unknown: unknownCodes,
          complete: missing.length === 0
        };
      }
    };
  }

  function keyboardVerdict(st) {
    var fnText = st.softTotal
      ? ", funkciósor " +
        st.softPressed +
        " / " +
        st.softTotal +
        " (csak az Fn billentyűvel együtt mérhető, a hangerő és fényerő billentyűket a rendszer elnyeli)"
      : "";
    if (st.missing.length || st.doubles.length) {
      var parts = [];
      if (st.missing.length)
        parts.push("nem érzékelt: " + st.missingLabels.join(", "));
      if (st.doubles.length)
        parts.push("dupla leütés gyanú: " + st.doubleLabels.join(", "));
      return {
        status: "bad",
        detail:
          parts.join("; ") +
          " (" +
          st.pressed +
          " / " +
          st.total +
          " billentyű rendben)" +
          fnText
      };
    }
    return {
      status: "ok",
      detail:
        "mind a " +
        st.total +
        " billentyű érzékelt, dupla leütés nélkül" +
        fnText
    };
  }

  // Egér és trackpad (Mac): a kurzor mozgása rácson, öt kattintási pont (a trackpad sarkai is), jobb kattintás, görgetés fel és le.
  // Nem kötelező: vízszintes görgetés, csippentés, dupla kattintás.
  var POINTER_TARGETS = [
    ["tl", "bal felső sarok"],
    ["tr", "jobb felső sarok"],
    ["bl", "bal alsó sarok"],
    ["br", "jobb alsó sarok"],
    ["c", "közép"]
  ];
  function pointerTracker(total) {
    var cells = {},
      count = 0,
      hits = {},
      hitCount = 0,
      right = false,
      up = false,
      down = false,
      side = false,
      pinch = false,
      dbl = false;
    return {
      move: function (index) {
        if (index >= 0 && index < total && !cells[index]) {
          cells[index] = true;
          count++;
        }
      },
      target: function (id) {
        if (!hits[id]) {
          hits[id] = true;
          hitCount++;
        }
      },
      right: function () {
        right = true;
      },
      wheel: function (dx, dy, ctrl) {
        if (ctrl) {
          pinch = true;
          return;
        }
        if (dy < 0) up = true;
        if (dy > 0) down = true;
        if (dx) side = true;
      },
      pinch: function () {
        pinch = true;
      },
      dbl: function () {
        dbl = true;
      },
      state: function () {
        var missingTargets = [],
          i;
        for (i = 0; i < POINTER_TARGETS.length; i++) {
          if (!hits[POINTER_TARGETS[i][0]])
            missingTargets.push(POINTER_TARGETS[i][1]);
        }
        return {
          cells: count,
          total: total,
          targets: hitCount,
          targetsTotal: POINTER_TARGETS.length,
          missingTargets: missingTargets,
          right: right,
          up: up,
          down: down,
          side: side,
          pinch: pinch,
          dbl: dbl,
          complete:
            count === total &&
            hitCount === POINTER_TARGETS.length &&
            right &&
            up &&
            down
        };
      }
    };
  }

  function pointerVerdict(st) {
    function yn(v) {
      return v ? "igen" : "nem";
    }
    var extra =
      " (nem kötelező: vízszintes görgetés " +
      yn(st.side) +
      ", csippentés " +
      yn(st.pinch) +
      ", dupla kattintás " +
      yn(st.dbl) +
      ")";
    if (st.complete)
      return {
        status: "ok",
        detail:
          "a kurzor mind a " +
          st.total +
          " mezőn végigért, mind az " +
          st.targetsTotal +
          " kattintási pont, a jobb kattintás és a görgetés fel és le rendben" +
          extra
      };
    var bad = [];
    if (st.cells < st.total)
      bad.push(
        "a kurzor csak " + st.cells + " / " + st.total + " mezőn ért végig"
      );
    if (st.missingTargets.length)
      bad.push("nem érzékelt kattintás: " + st.missingTargets.join(", "));
    if (!st.right) bad.push("jobb kattintás (kétujjas) nem érzékelt");
    if (!st.up) bad.push("görgetés felfelé nem érzékelt");
    if (!st.down) bad.push("görgetés lefelé nem érzékelt");
    return { status: "bad", detail: bad.join("; ") + extra };
  }

  var HW_LABELS = {
    touch: "Érintőképernyő",
    motion: "Mozgásérzékelők",
    audio: "Hangszóró és mikrofon",
    camera_rear: "Hátlapi kamera",
    camera_front: "Előlapi kamera",
    display: "Kijelző színei",
    buttons: "Fizikai gombok",
    keyboard: "Billentyűzet",
    pointer: "Egér és trackpad"
  };
  // Amit az oldal mér (a kijelző színei bemondás, ezért az összegzésben nem szerepel).
  var HW_MEASURED = {
    ios: ["touch", "motion", "audio", "camera_rear", "camera_front"],
    mac: ["keyboard", "pointer", "audio", "camera_front"]
  };
  var HW_SHOWN = {
    ios: [
      "touch",
      "motion",
      "audio",
      "camera_rear",
      "camera_front",
      "display",
      "buttons"
    ],
    mac: ["keyboard", "pointer", "audio", "camera_front", "display"]
  };

  // A riport szakaszai a Code.gs finish_ műveletének formátumában.
  function buildSections(d) {
    var src = d.sources || {};
    function row(label, value, status, tag, missing) {
      var has = !(value === null || value === undefined || value === "");
      return {
        label: label,
        value: has ? String(value) : missing || "nem adta meg",
        status: has ? status || "info" : "nodata",
        tag: has ? tag || "" : ""
      };
    }
    // iPaden és iPhone-on ezeket a böngésző nem látja, csak az USB-s program olvassa ki. Ezt nem az eladó mulasztja el.
    var noUsb = d.kind === "mac" ? "" : "USB nélkül nem olvasható ki";
    var device = [
      row(
        "Típus",
        d.kind === "mac" ? "Mac" : "iPad / iPhone",
        "info",
        "választotta"
      ),
      row(
        "Modell",
        d.model ? d.model + (d.modelId ? " (" + d.modelId + ")" : "") : "",
        "info",
        src.model,
        noUsb
      ),
      row("Tárhely", d.storage, "info", src.storage, noUsb),
      row("Rendszerverzió", d.os, "info", src.os)
    ];
    // A chip és a memória csak Macnél értelmes, iPaden és iPhone-on soha nem kérjük.
    if (d.kind === "mac") {
      device.splice(
        2,
        0,
        row("Chip", d.chip, "info", src.chip),
        row("Memória", d.memory, "info", src.memory)
      );
    }
    if (d.kind !== "mac" && d.hardwarePlatform) {
      device.push(
        row("Hardverplatform", d.hardwarePlatform, "info", "USB-ből")
      );
    }
    if (d.serialRaw) {
      device.push(
        row("Sorozatszám", d.serialRaw, "info", "az eladó jóváhagyta")
      );
    } else {
      device.push(
        row(
          "Sorozatszám lenyomat",
          d.fingerprint,
          "info",
          "a meghívókóddal kulcsolt SHA-256, első 16 karakter",
          noUsb
        )
      );
      device.push(
        row("Sorozatszám vége", d.serialTail, "info", src.serial, noUsb)
      );
    }

    var deferText =
      d.batteryDefer && d.cycles === null && d.capacity === null
        ? "nincs napló, USB-s méréssel pótlandó (az eladó számítógépén)"
        : "";
    var battery = [
      row(
        "Ciklusszám",
        d.cycles === null ? deferText : d.cycles,
        "info",
        src.cycles
      ),
      row(
        "Maximális kapacitás",
        d.capacity === null ? deferText : d.capacity + "%",
        "info",
        src.capacity
      )
    ];
    if (d.batteryManufacturer) {
      battery.push(
        row("Akku gyártója", d.batteryManufacturer, "info", "USB-ből")
      );
    }
    if (d.batterySerial) {
      battery.push(
        row("Akku sorozatszáma", d.batterySerial, "info", "USB-ből")
      );
    }
    if (d.batteryDeviceName) {
      battery.push(
        row("Akku vezérlő (Gas Gauge)", d.batteryDeviceName, "info", "USB-ből")
      );
    }
    if (d.batteryMfgDate) {
      battery.push(
        row("Akku gyártási ideje", d.batteryMfgDate, "info", "USB-ből")
      );
    }
    if (d.condition)
      battery.push(
        row(
          "Akkumulátor állapota",
          d.condition,
          /^(normal|good)$/i.test(d.condition) ? "ok" : "warn",
          src.condition
        )
      );
    if (d.fileDate)
      battery.push(
        row("Az analitikai fájl kelte", d.fileDate, "info", "fájlból")
      );

    var appleText =
      {
        yes: "kijelentkezett, a Keresés kikapcsolva",
        no: "még nincs kijelentkezve",
        unsure: "nem biztos benne"
      }[d.apple] || "";
    var locks = [
      row(
        "Apple-fiók (az eladó szerint)",
        appleText,
        d.apple === "yes" ? "ok" : d.apple === "no" ? "bad" : "warn",
        "beírta"
      )
    ];
    if (d.kind === "mac") {
      locks.push(
        row(
          "Aktiválási zár",
          d.activationLock === "Enabled"
            ? "bekapcsolva"
            : d.activationLock === "Disabled"
              ? "kikapcsolva"
              : "",
          d.activationLock === "Enabled" ? "bad" : "ok",
          src.activationLock
        )
      );
      var mdm =
        d.dep === null && d.mdm === null
          ? ""
          : d.dep || d.mdm
            ? "van"
            : "nincs";
      locks.push(
        row(
          "Céges felügyelet (MDM)",
          mdm,
          mdm === "van" ? "bad" : "ok",
          src.mdm
        )
      );
    } else if (d.activationLock) {
      locks.push(
        row(
          "Aktiválási zár",
          d.activationLock === "Enabled" ? "bekapcsolva" : "kikapcsolva",
          d.activationLock === "Enabled" ? "bad" : "ok",
          src.activationLock
        )
      );
    }

    // Összegzés a vevőnek: melyik adat olvasható ki a rendszerből, és melyik az eladó szava.
    var systemSource = {
      fájlból: true,
      naplóból: true,
      parancsból: true,
      "USB-ből": true
    };
    var summary = [];
    var batterySources = [];
    if (d.cycles !== null) batterySources.push(src.cycles);
    if (d.capacity !== null) batterySources.push(src.capacity);
    if (!batterySources.length) {
      summary.push(
        row(
          "Akkumulátor",
          d.batteryDefer ? "nincs adat, USB-s méréssel pótlandó" : "nincs adat",
          "warn",
          ""
        )
      );
    } else if (
      batterySources.every(function (s) {
        return systemSource[s];
      })
    ) {
      summary.push(
        row(
          "Akkumulátor",
          "a rendszerből kiolvasott érték, nehezen hamisítható",
          "ok",
          ""
        )
      );
    } else {
      summary.push(
        row("Akkumulátor", "az eladó írta be, nem ellenőrizhető", "warn", "")
      );
    }
    if (d.serialRaw) {
      summary.push(
        row(
          "Modell",
          "a sorozatszámmal az Apple lefedettség-ellenőrzőjén megnézhető: https://checkcoverage.apple.com/",
          "info",
          ""
        )
      );
    } else if (d.fingerprint) {
      summary.push(
        row(
          "Modell",
          "a sorozatszámot az eladó nem küldte el, kérd el tőle, és nézd meg az Apple lefedettség-ellenőrzőjén",
          "warn",
          ""
        )
      );
    } else {
      summary.push(
        row(
          "Modell",
          "nincs sorozatszám, a modell nem ellenőrizhető",
          "warn",
          ""
        )
      );
    }
    if (d.activationLock) {
      summary.push(
        row(
          "Aktiválási zár",
          d.activationLock === "Enabled"
            ? "BEKAPCSOLVA, az új tulajdonos nem tudja használni"
            : "kikapcsolva, az eszközből kiolvasva",
          d.activationLock === "Enabled" ? "bad" : "ok",
          ""
        )
      );
    } else {
      summary.push(
        row(
          "Apple-fiók zár",
          d.apple === "no"
            ? "az eladó szerint még be van jelentkezve"
            : d.apple === "yes"
              ? "az eladó szerint ki van jelentkezve, az eszközből ez nem olvasható ki"
              : "az eladó nem biztos benne",
          d.apple === "no" ? "bad" : d.apple === "yes" ? "info" : "warn",
          ""
        )
      );
    }
    if (d.kind === "mac" && (d.dep || d.mdm)) {
      summary.push(
        row(
          "Céges felügyelet",
          "VAN: a gép céges vagy iskolai felügyelet alatt áll",
          "bad",
          ""
        )
      );
    }
    var measured = HW_MEASURED[d.kind === "mac" ? "mac" : "ios"],
      okN = 0,
      badN = 0,
      untestedN = 0;
    for (var h = 0; h < measured.length; h++) {
      var rec = d.hw && d.hw[measured[h]];
      if (rec && rec.status === "ok") okN++;
      else if (rec && rec.status === "bad") badN++;
      else untestedN++;
    }
    summary.push(
      row(
        "Hardver (mért tesztek)",
        okN +
          " rendben" +
          (badN ? ", " + badN + " hibás" : "") +
          (untestedN ? ", " + untestedN + " nem tesztelt" : ""),
        badN ? "bad" : untestedN ? "warn" : "ok",
        ""
      )
    );

    var hardware = [];
    var shown = HW_SHOWN[d.kind === "mac" ? "mac" : "ios"];
    for (var k = 0; k < shown.length; k++) {
      var r = d.hw && d.hw[shown[k]],
        label = HW_LABELS[shown[k]],
        tag =
          shown[k] === "display"
            ? "bemondás"
            : shown[k] === "buttons"
              ? "vegyes"
              : "mért";
      if (r && r.status === "ok")
        hardware.push(row(label, r.detail || "rendben", "ok", tag));
      else if (r && r.status === "bad")
        hardware.push(row(label, r.detail || "hibás", "bad", tag));
      else if (r && r.status === "unavailable")
        hardware.push(
          row(
            label,
            r.detail || "ezen a rendszeren a böngészőből nem ellenőrizhető",
            "nodata",
            ""
          )
        );
      else if (r && r.status === "skipped")
        hardware.push(
          row(
            label,
            "kihagyta" + (r.detail ? ": " + r.detail : ""),
            "nodata",
            ""
          )
        );
      else hardware.push(row(label, "nem tesztelt", "nodata", ""));
    }

    return [
      { title: "Összegzés a vevőnek", rows: summary },
      { title: "Eszköz", rows: device },
      { title: "Akkumulátor", rows: battery },
      { title: "Zárak és felügyelet", rows: locks },
      { title: "Hardverteszt", rows: hardware },
      {
        title: "Az adatok jellege",
        rows: [
          row(
            "Forrás",
            "Az eladó a saját eszközén gyűjtötte egy böngészős varázslóval. Az összegzés mutatja, melyik adat olvasható ki a rendszerből, és melyik az eladó bevallása.",
            "info",
            ""
          )
        ]
      }
    ];
  }

  // Az USB-s kiolvasó (tool/ipad_audit/reader.py) blokkja. Csak a felsorolt mezőket veszi át, érvényes értékkel.
  function parseUsbOutput(text) {
    text = String(text || "");
    var out = {
      valid: false,
      model: "",
      modelName: "",
      os: "",
      serial: "",
      hardwarePlatform: "",
      storage: "",
      cycles: null,
      capacity: null,
      activationLock: "",
      batteryManufacturer: "",
      batterySerial: "",
      batteryDeviceName: "",
      batteryMfgDate: ""
    };
    var start = text.indexOf("IPAD-AUDIT-USB 1");
    if (start < 0) return out;
    var end = text.indexOf("\nEND", start);
    var block = text.slice(start, end < 0 ? text.length : end);
    var f = Object.create(null),
      m,
      re = /^([a-z_]{1,24}):[ \t]*(.{1,60})$/gm;
    while ((m = re.exec(block)) !== null) {
      if (!(m[1] in f)) f[m[1]] = m[2].replace(/\s+$/, "");
    }

    out.model = clean(f.model, 20);
    out.modelName = clean(f.model_name, 40);
    out.os = /^\d{1,2}(\.\d{1,2}){0,2}$/.test(f.os || "") ? f.os : "";
    out.serial = normalizeSerial(f.serial);
    out.hardwarePlatform = /^[A-Za-z0-9_-]{1,20}$/.test(
      f.hardware_platform || ""
    )
      ? f.hardware_platform
      : "";
    var gb = parseInt(f.storage_gb, 10);
    if (gb > 0 && gb <= 16000)
      out.storage = gb >= 1000 ? gb / 1000 + " TB" : gb + " GB";
    var cycles = parseInt(f.cycles, 10);
    if (cycles >= 0 && cycles <= 5000) out.cycles = cycles;
    var cap = parseFloat(f.capacity_percent);
    if (cap >= 40 && cap <= 110) out.capacity = Math.round(Math.min(cap, 100));
    out.activationLock =
      { on: "Enabled", off: "Disabled" }[f.activation_lock] || "";
    out.batteryManufacturer = clean(f.battery_manufacturer, 40);
    out.batterySerial = clean(f.battery_serial, 30);
    out.batteryDeviceName = clean(f.battery_device_name, 30);
    out.batteryMfgDate = clean(f.battery_mfg_date, 30);
    out.valid = !!(out.model || out.os || out.cycles !== null || out.serial);
    return out;
  }

  // A böngésző azonosítójából felismeri az iOS/iPadOS verziót. Az iPadOS 13 felett az iPad
  // alapból asztali Safarinak hazudja magát, ilyenkor az érintési pontok száma és a Safari verziója segít.
  function detectOs(userAgent, touchPoints) {
    var ua = String(userAgent || ""),
      device = "",
      major,
      minor,
      patch;
    var m =
      /\b(iPhone|iPad|iPod)\b[^)]*?\bOS (\d+)[_.](\d+)(?:[_.](\d+))?/.exec(ua);
    if (m) {
      device = m[1];
      major = parseInt(m[2], 10);
      minor = parseInt(m[3], 10);
      patch = m[4] === undefined ? 0 : parseInt(m[4], 10);
    } else if (/Macintosh/.test(ua) && touchPoints > 1) {
      var v = /\bVersion\/(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(ua);
      if (!v) return null;
      device = "iPad";
      major = parseInt(v[1], 10);
      minor = v[2] === undefined ? 0 : parseInt(v[2], 10);
      patch = v[3] === undefined ? 0 : parseInt(v[3], 10);
    } else {
      return null;
    }
    return {
      device: device,
      major: major,
      version: major + "." + minor + (patch ? "." + patch : ""),
      name: device === "iPad" && major >= 13 ? "iPadOS" : "iOS"
    };
  }

  return {
    sha256Hex: sha256Hex,
    fingerprint: fingerprint,
    normalizeSerial: normalizeSerial,
    storageLabel: storageLabel,
    parseIpadFile: parseIpadFile,
    parseMacOutput: parseMacOutput,
    parseUsbOutput: parseUsbOutput,
    buildSections: buildSections,
    detectOs: detectOs,
    touchTracker: touchTracker,
    motionTracker: motionTracker,
    keyboardLayout: keyboardLayout,
    keyboardTracker: keyboardTracker,
    keyboardVerdict: keyboardVerdict,
    pointerTracker: pointerTracker,
    pointerVerdict: pointerVerdict,
    POINTER_TARGETS: POINTER_TARGETS,
    toneVerdict: toneVerdict,
    frameStats: frameStats,
    frameLooksReal: frameLooksReal
  };
});
