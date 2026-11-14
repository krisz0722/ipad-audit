/* ---------- eredmények: ugyanaz a Tovább és javítás gomb minden beolvasás után ---------- */

function resultActions() {
  return (
    '<button type="button" class="btn" id="res-next">Tovább</button>' +
    '<p><button type="button" class="link" id="res-edit">Az értékek javítása</button></p>'
  );
}
function bindResult(editStep) {
  on("res-next", function () {
    go(state.route === "usb" && ON_COMPUTER ? "usb_web_continue" : "details");
  });
  on("res-edit", function () {
    go(editStep);
  });
}

function applyUsbText(text) {
  var r = P.parseUsbOutput(String(text));
  if (!r.valid) {
    message(
      "result",
      '<div class="error">Nem sikerült átvenni a kiolvasott adatokat. Futtasd újra a kiolvasó programot.</div>'
    );
    return;
  }
  state.parsed = {};
  state.noLog = false;
  state.route = "usb";
  function put(key, value) {
    if (value === "" || value === null || value === undefined) return;
    state.parsed[key] = String(value);
    state.vals[key] = String(value);
  }
  put("cycles", r.cycles);
  put("capacity", r.capacity);
  put("os", r.os);
  put("serial", r.serial);
  put("storage", r.storage);
  put("model", r.modelName || r.model);
  state.extra.activationLock = r.activationLock;
  state.extra.modelId = r.modelName ? r.model : "";
  state.extra.hardwarePlatform = r.hardwarePlatform;
  state.extra.batteryManufacturer = r.batteryManufacturer;
  state.extra.batterySerial = r.batterySerial;
  state.extra.batteryDeviceName = r.batteryDeviceName;
  state.extra.batteryMfgDate = r.batteryMfgDate;
  save();
  var lock =
    r.activationLock === "Enabled"
      ? "bekapcsolva"
      : r.activationLock === "Disabled"
        ? "kikapcsolva"
        : "nem olvasható ki";
  message(
    "result",
    '<div class="result"><dl>' +
      "<dt>Modell</dt><dd>" +
      esc(
        r.modelName
          ? r.modelName + " (" + r.model + ")"
          : r.model || "nem található"
      ) +
      "</dd>" +
      "<dt>Rendszer</dt><dd>" +
      esc(r.os || "nem található") +
      "</dd>" +
      "<dt>Hardverplatform</dt><dd>" +
      esc(r.hardwarePlatform || "nem található") +
      "</dd>" +
      "<dt>Ciklusszám</dt><dd>" +
      esc(r.cycles === null ? "nem található" : r.cycles) +
      "</dd>" +
      "<dt>Maximális kapacitás</dt><dd>" +
      esc(r.capacity === null ? "nem található" : r.capacity + "%") +
      "</dd>" +
      (r.batteryManufacturer
        ? "<dt>Akku gyártója</dt><dd>" + esc(r.batteryManufacturer) + "</dd>"
        : "") +
      (r.batterySerial
        ? "<dt>Akku sorozatszáma</dt><dd>" + esc(r.batterySerial) + "</dd>"
        : "") +
      "<dt>Aktiválási zár</dt><dd>" +
      esc(lock) +
      "</dd>" +
      '</dl></div><div class="success">A kiolvasás elkészült.</div>' +
      resultActions()
  );
  bindResult("screen_enter");
}

function applyIpadText(text) {
  var r = P.parseIpadFile(String(text));
  var what = current().paste ? "szöveg" : "fájl";
  state.parsed = {};
  state.noLog = false;
  state.route = "file";
  if (r.cycles !== null) {
    state.parsed.cycles = String(r.cycles);
    state.vals.cycles = String(r.cycles);
  }
  if (r.capacity !== null) {
    state.parsed.capacity = String(r.capacity);
    state.vals.capacity = String(r.capacity);
  }
  if (r.os) {
    state.parsed.os = r.os;
    state.vals.os = r.os;
  }
  state.extra.fileDate = r.fileDate;
  save();
  if (r.cycles === null && r.capacity === null) {
    message(
      "result",
      '<div class="error">Ebben a ' +
        what +
        "ben nem találtunk akkumulátor adatot. Próbáld a következő legfrissebb bejegyzést.</div>" +
        '<p><button type="button" class="link" id="res-none">Nincs több ilyen bejegyzés</button></p>'
    );
    on("res-none", function () {
      go("nolog");
    });
    return;
  }
  message(
    "result",
    '<div class="result"><dl>' +
      "<dt>Ciklusszám</dt><dd>" +
      esc(r.cycles === null ? "nem található" : r.cycles) +
      "</dd>" +
      "<dt>Maximális kapacitás</dt><dd>" +
      esc(r.capacity === null ? "nem található" : r.capacity + "%") +
      "</dd>" +
      (r.fileDate
        ? "<dt>A " + what + " kelte</dt><dd>" + esc(r.fileDate) + "</dd>"
        : "") +
      '</dl></div><div class="success">Kész. A ' +
      what +
      " nem hagyta el az eszközt.</div>" +
      resultActions()
  );
  bindResult("screen_enter");
}

function onFile(event) {
  var file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > MAX_FILE) {
    message(
      "result",
      '<div class="error">A fájl túl nagy. Válassz másikat.</div>'
    );
    return;
  }
  message("result", '<p class="muted">Olvasás...</p>');
  var reader = new FileReader();
  reader.onload = function () {
    applyIpadText(reader.result);
  };
  reader.onerror = function () {
    message(
      "result",
      '<div class="error">A fájl nem olvasható. Válassz másikat.</div>'
    );
  };
  reader.readAsText(file);
}

function parseMac() {
  var r = P.parseMacOutput($("paste") ? $("paste").value : "");
  if (!r.valid) {
    message(
      "result",
      '<div class="error">Ebben a szövegben nem találtuk a parancs kimenetét. Ellenőrizd, hogy a teljes Terminál-szöveget másoltad ki, vagy futtasd újra a parancsot.</div>'
    );
    return;
  }
  state.parsed = {};
  state.noLog = false;
  state.route = "command";
  function put(key, val) {
    if (val === "" || val === null || val === undefined) return;
    state.parsed[key] = String(val);
    state.vals[key] = String(val);
  }
  put("model", r.model);
  put("chip", r.chip);
  put("memory", r.memory);
  put("storage", r.storage);
  put("os", r.os);
  put("serial", r.serial);
  put("cycles", r.cycles);
  put("capacity", r.capacity);
  state.extra = {
    condition: r.condition,
    fileDate: "",
    activationLock: r.activationLock,
    dep: r.dep,
    mdm: r.mdm,
    modelId: r.modelId
  };
  $("paste").value = "";
  function line(label, val) {
    return (
      "<dt>" +
      label +
      "</dt><dd>" +
      esc(val === "" || val === null ? "nem található" : val) +
      "</dd>"
    );
  }
  var lock =
    r.activationLock === "Enabled"
      ? "bekapcsolva"
      : r.activationLock === "Disabled"
        ? "kikapcsolva"
        : "";
  var mdm =
    r.dep === null && r.mdm === null ? "" : r.dep || r.mdm ? "van" : "nincs";
  save();
  message(
    "result",
    '<div class="result"><dl>' +
      line(
        "Modell",
        r.model ? r.model + (r.modelId ? " (" + r.modelId + ")" : "") : ""
      ) +
      line("Chip", r.chip) +
      line("Memória", r.memory) +
      line("Tárhely", r.storage) +
      line("macOS", r.os) +
      line("Ciklusszám", r.cycles) +
      line("Maximális kapacitás", r.capacity === null ? "" : r.capacity + "%") +
      line("Akku állapota", r.condition) +
      line("Aktiválási zár", lock) +
      line("Céges felügyelet", mdm) +
      line("Sorozatszám", r.serial) +
      '</dl></div><div class="success">Kész. A beillesztett szöveget töröltük a mezőből, csak a fenti értékeket használjuk.</div>' +
      resultActions()
  );
  bindResult("mac_manual");
}
