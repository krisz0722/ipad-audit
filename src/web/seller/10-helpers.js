/* ---------- segédek ---------- */

function esc(text) {
  return String(text === null || text === undefined ? "" : text).replace(
    /[&<>"']/g,
    function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c];
    }
  );
}
function clean(text, max) {
  return String(text === null || text === undefined ? "" : text)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max || 60);
}
function $(id) {
  return document.getElementById(id);
}
function on(id, fn) {
  var node = $(id);
  if (node) node.addEventListener("click", fn);
}
function formatCode(c) {
  var digits = String(c || "").replace(/\D/g, "");
  if (digits.length >= 9) {
    return digits.replace(/(\d{3})(?=\d)/g, "$1 ");
  }
  return String(c || "");
}
function updateLiveVersion() {
  var bar = document.querySelector ? document.querySelector(".version-bar") : null;
  if (!bar) return;
  var url = "version.json";
  function applyCommit(data) {
    if (!data) return;
    var hash = data.commit || data.short_id;
    var dateStr = data.date ? (data.date + (data.time ? " " + data.time : "")) : "";
    if (!hash && !dateStr) return;
    bar.innerHTML = 'Git: ' + esc(hash || '') + ' <span aria-hidden="true">|</span> Frissítve: <time datetime="' + esc(data.date || '') + '">' + esc(dateStr) + '</time>';
  }
  if (window.fetch) {
    fetch(url)
      .then(function (res) {
        if (res && res.ok) return res.json();
      })
      .then(applyCommit)
      .catch(function () {});
  } else if (window.XMLHttpRequest) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
          try {
            applyCommit(JSON.parse(xhr.responseText));
          } catch (e) {}
        }
      };
      xhr.send();
    } catch (e) {}
  }
}
function toInt(text, min, max) {
  var t = String(text).trim();
  if (!/^\d{1,5}$/.test(t)) return null;
  var n = parseInt(t, 10);
  return n >= min && n <= max ? n : null;
}
function show(html) {
  app.innerHTML = html;
  // A Vissza gomb mindig a főcím alatt van, így a hosszú oldalakon sem kell lefelé keresni. A láblécből kivesszük.
  var stale = $("back");
  while (stale) {
    stale.parentNode.removeChild(stale);
    stale = $("back");
  }
  var bars = app.querySelectorAll(".nav");
  for (var b = 0; b < bars.length; b++) {
    if (!bars[b].children.length) bars[b].parentNode.removeChild(bars[b]);
  }
  var title = app.querySelector("h1");
  if (title && state.idx > 0 && !state.sent) {
    var row = document.createElement("div");
    row.className = "backrow";
    row.innerHTML =
      '<button type="button" class="btn secondary small" id="back">← Vissza</button>';
    title.parentNode.insertBefore(row, title.nextSibling);
  }
  if (title) {
    title.setAttribute("tabindex", "-1");
    try {
      title.focus({ preventScroll: true });
    } catch (e) {
      /* régi böngésző */
    }
  }
  window.scrollTo(0, 0);
  on("back", goBack);
  save();
}
function top() {
  return (
    '<div class="top"><span class="brand">Eszköz-ellenőrzés</span>' +
    (DEMO ? '<span class="demo">Próbaüzem: semmi nem megy el</span>' : "") +
    "</div>" +
    (state.auditActive
      ? '<p class="muted" id="audit-status" role="status">A teszt lépéseit a private Sheetbe mentjük.</p>'
      : "")
  );
}
function progress(n) {
  return (
    '<div class="progress"><span style="width:' +
    n * 20 +
    '%"></span></div>' +
    '<p class="step-label">' +
    n +
    ". lépés az 5-ből</p>"
  );
}
function choice(id, title, sub, selected) {
  return (
    '<button type="button" class="choice' +
    (selected ? " on" : "") +
    '" id="' +
    id +
    '"><b>' +
    title +
    "</b><span>" +
    sub +
    "</span></button>"
  );
}
// Lábléc: Vissza (ha van hova) és opcionálisan a Tovább gomb.
function foot(nextId, nextLabel) {
  return (
    '<div class="nav">' +
    (state.idx > 0
      ? '<button type="button" class="btn secondary" id="back">Vissza</button>'
      : "") +
    (nextId
      ? '<button type="button" class="btn" id="' +
        nextId +
        '">' +
        nextLabel +
        "</button>"
      : "") +
    "</div>"
  );
}
function textField(id, label, value, placeholder, help, max, extra) {
  return (
    '<label class="field">' +
    label +
    '<input type="text" id="' +
    id +
    '" value="' +
    esc(value) +
    '" placeholder="' +
    esc(placeholder) +
    '" maxlength="' +
    max +
    '" autocomplete="off" spellcheck="false"' +
    (extra || "") +
    "><small>" +
    help +
    "</small></label>"
  );
}
function bindInput(id, key) {
  var node = $(id);
  if (node)
    node.addEventListener("input", function () {
      state.vals[key] = this.value;
    });
}
// Az üzenetet a képernyőre görgeti, ha az a látható rész alatt vagy felett jelent meg. Enélkül egy hosszú oldalon "nem történik semmi".
function message(id, html) {
  var node = $(id);
  if (!node) return;
  node.innerHTML = html;
  if (!html || !node.scrollIntoView) return;
  var box = node.getBoundingClientRect();
  if (box.bottom > window.innerHeight || box.top < 0)
    node.scrollIntoView(false);
}
function copyText(text, done) {
  function fallback() {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      area.setSelectionRange(0, text.length);
    } catch (e) {
      /* nem baj */
    }
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e2) {
      ok = false;
    }
    document.body.removeChild(area);
    done(ok);
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function () {
      done(true);
    }, fallback);
  } else {
    fallback();
  }
}
