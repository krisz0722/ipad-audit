const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

function makeBackend(label) {
  const rows = [["Kód", "Címke", "Lejárat", "Állapot", "Utolsó esemény"]];
  const cache = new Map();
  const props = new Map();
  const mails = [];
  const dialogs = [];
  const sheet = {
    getDataRange: () => ({ getValues: () => rows.map((row) => row.slice()) }),
    appendRow: (row) => rows.push(row),
    setFrozenRows: () => {},
    getRange: (row, column) => ({
      getValue: () => rows[row - 1][column - 1],
      setValue: (value) => {
        rows[row - 1][column - 1] = value;
      },
    }),
  };
  const sheets = new Map([["Meghívók", sheet]]);
  const eventRows = [];
  const batteryRows = [];
  const out = (text) => ({
    text,
    getContent() {
      return this.text;
    },
    setMimeType() {
      return this;
    },
  });
  const ui = {
    Button: { OK: "OK" },
    ButtonSet: { OK_CANCEL: "OK_CANCEL" },
    prompt: () => ({
      getSelectedButton: () => "OK",
      getResponseText: () => label || "Jófogás",
    }),
    showModalDialog: (html, title) => dialogs.push({ html: html.html, title }),
  };
  const context = {
    SpreadsheetApp: {
      getActive: () => ({
        getSheetByName: (name) => sheets.get(name) || null,
        insertSheet: (name) => {
          const target = name === "Akku mérés" ? batteryRows : eventRows;
          const created = {
            appendRow: (row) => target.push(row),
            setFrozenRows: () => {},
            getDataRange: () => ({
              getValues: () => target.map((row) => row.slice()),
            }),
            getRange: (row, column) => ({
              getValue: () => target[row - 1][column - 1],
              setValue: (value) => {
                target[row - 1][column - 1] = value;
              },
            }),
          };
          sheets.set(name, created);
          return created;
        },
      }),
      getUi: () => ui,
    },
    HtmlService: {
      createHtmlOutput: (html) => ({
        html,
        setWidth() {
          return this;
        },
        setHeight() {
          return this;
        },
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key) => (cache.has(key) ? cache.get(key) : null),
        put: (key, value) => cache.set(key, String(value)),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (props.has(key) ? props.get(key) : null),
        setProperty: (key, value) => props.set(key, String(value)),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: out,
    },
    MailApp: {
      getRemainingDailyQuota: () => 100,
      sendEmail: (mail) => mails.push(mail),
    },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => "owner@example.test" }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (_algorithm, text) =>
        Array.from(crypto.createHash("sha256").update(text).digest()).map(
          (byte) => (byte > 127 ? byte - 256 : byte),
        ),
      formatDate: (date) => date.toISOString().slice(0, 13),
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "..", "..", "backend", "Code.gs"),
      "utf8",
    ),
    context,
  );
  const call = (body) =>
    JSON.parse(
      context.doPost({ postData: { contents: JSON.stringify(body) } }).text,
    );
  const invite = (code, status, hoursLeft) => {
    rows.push([
      code,
      "próba",
      new Date(
        Date.now() + (hoursLeft === undefined ? 72 : hoursLeft) * 3600 * 1000,
      ),
      status || "új",
      "",
    ]);
  };
  return {
    call,
    invite,
    rows,
    mails,
    dialogs,
    context,
    props,
    cache,
    eventRows,
    batteryRows,
  };
}

module.exports = { makeBackend };
