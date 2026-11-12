// Védőháló az iOS 9-es kompatibilitásra: a web/ kódja szándékosan régi szintaxisú (az iPad mini 1 Safarija 9.3.5).
// Nincs szintaxis-elemző függőség: egy kis szkenner kiszűri a sztringeket, megjegyzéseket és reguláris kifejezéseket,
// a maradék kódban keresi a modern szintaxist és az iOS 9-en hiányzó függvényeket.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const acorn = require("acorn");

function strip(code) {
  let out = "",
    i = 0,
    prev = "";
  const n = code.length,
    templates = [];
  const regexAllowed = () =>
    prev === "" ||
    "(,=:[!&|?{};+-*%<>~^}".indexOf(prev) >= 0 ||
    /(?:^|[^\w$])(?:return|typeof|case|in|of|delete|void|throw|new|else)\s*$/.test(
      out,
    );
  while (i < n) {
    const ch = code[i],
      nx = code[i + 1];
    if (ch === "/" && nx === "/") {
      while (i < n && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && nx === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) {
        if (code[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      out += " ";
      continue;
    }
    if (ch === '"' || ch === "'") {
      i++;
      while (i < n && code[i] !== ch) {
        if (code[i] === "\\") i++;
        i++;
      }
      i++;
      out += '""';
      prev = '"';
      continue;
    }
    if (ch === "`") {
      templates.push(out.length);
      i++;
      while (i < n && code[i] !== "`") {
        if (code[i] === "\\") i++;
        i++;
      }
      i++;
      out += "``";
      prev = "`";
      continue;
    }
    if (ch === "/" && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n && (code[i] !== "/" || inClass)) {
        if (code[i] === "\\") i++;
        else if (code[i] === "[") inClass = true;
        else if (code[i] === "]") inClass = false;
        i++;
      }
      i++;
      while (/[a-z]/i.test(code[i] || "")) i++;
      out += "/r/";
      prev = "/";
      continue;
    }
    out += ch;
    if (!/\s/.test(ch)) prev = ch;
    i++;
  }
  return { code: out, templates };
}

const RULES = [
  ["nyílfüggvény", /=>/],
  ["let vagy const", /\b(?:let|const)\b/],
  ["class", /\bclass\s+[\w$]/],
  ["spread vagy rest (...)", /\.\.\./],
  ["destrukturálás", /\bvar\s*[[{]|\bfunction\s*[\w$]*\s*\(\s*[[{]/],
  [
    "alapértelmezett paraméter",
    /\bfunction\s*[\w$]*\s*\([^()]*[^=!<>]=[^=][^()]*\)/,
  ],
  ["async vagy await", /\b(?:async|await)\b/],
  ["import vagy export", /^\s*(?:import|export)\b/m],
  ["hatványozás (**)", /\*\*/],
  ["opcionális láncolás vagy ??", /\?\.[A-Za-z_$[(]|\?\?/],
  [
    "iOS 9-en hiányzó függvény",
    /\bObject\.(?:entries|values|fromEntries)\b|\.(?:padStart|padEnd|flat|flatMap|finally|replaceAll)\s*\(/,
  ],
];

function findModern(source) {
  const { code, templates } = strip(source);
  const found = [];
  if (templates.length) found.push("sablon-literál");
  for (const [name, re] of RULES) if (re.test(code)) found.push(name);
  return found;
}

test("a szkenner felismeri a modern szintaxist", () => {
  assert.deepStrictEqual(findModern("var f = (a) => a;"), ["nyílfüggvény"]);
  assert.deepStrictEqual(findModern("let x = 1;"), ["let vagy const"]);
  assert.deepStrictEqual(findModern("const x = 1;"), ["let vagy const"]);
  assert.deepStrictEqual(findModern("var s = `a${b}`;"), ["sablon-literál"]);
  assert.deepStrictEqual(findModern("class A {}"), ["class"]);
  assert.deepStrictEqual(findModern("f(...args);"), ["spread vagy rest (...)"]);
  assert.deepStrictEqual(findModern("var {a} = o;"), ["destrukturálás"]);
  assert.deepStrictEqual(findModern("function f(a = 1) {}"), [
    "alapértelmezett paraméter",
  ]);
  assert.deepStrictEqual(findModern("async function f() { await g(); }"), [
    "async vagy await",
  ]);
  assert.deepStrictEqual(findModern("var a = o?.b;"), [
    "opcionális láncolás vagy ??",
  ]);
  assert.deepStrictEqual(findModern("var a = Object.entries(o);"), [
    "iOS 9-en hiányzó függvény",
  ]);
  assert.deepStrictEqual(findModern('var a = "x".padStart(3);'), [
    "iOS 9-en hiányzó függvény",
  ]);
});

test("a szkenner nem riaszt sztringre, megjegyzésre és reguláris kifejezésre", () => {
  assert.deepStrictEqual(
    findModern('var s = "const x = () => 1; `a` ...";'),
    [],
  );
  assert.deepStrictEqual(findModern("var s = '<a class=\"x\">let</a>';"), []);
  assert.deepStrictEqual(
    findModern("// let x = () => 1;\n/* class A {} */ var a = 1;"),
    [],
  );
  assert.deepStrictEqual(
    findModern("var re = /[`\"'=>]+\\/const/g; var b = a / 2;"),
    [],
  );
  assert.deepStrictEqual(
    findModern("if (/^let /.test(x)) { y = a == b; }"),
    [],
  );
  assert.deepStrictEqual(findModern("function f(a, b) { return a >= b; }"), []);
});

const FILES = [
  "web/seller.js",
  "web/parse.js",
  "web/example.js",
  "web/config.js",
];
for (const file of FILES) {
  test(file + ": nincs benne modern szintaxis (iOS 9 Safari)", () => {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    acorn.parse(source, { ecmaVersion: 5 });
    assert.deepStrictEqual(findModern(source), []);
  });
}

test("a szkenner nem nyeli el a valódi kódot: a kiszűrt seller.js-ben még ott a váz", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "web/seller.js"),
    "utf8",
  );
  const code = strip(source).code;
  assert.ok(
    (code.match(/\bfunction\b/g) || []).length > 150,
    "a function kulcsszavak megvannak",
  );
  assert.ok(
    (code.match(/\bSCREENS\./g) || []).length > 25,
    "a képernyők megvannak",
  );
  assert.ok(code.length > source.length * 0.35, "a kód nagy része megmaradt");
});

// A részfájlokat (src/web/seller/) is ellenőrizzük, mert azokat szerkesztjük, nem a generált fájlt.
const PARTS_DIR = path.join(__dirname, "..", "src", "web", "seller");
for (const name of fs
  .readdirSync(PARTS_DIR)
  .filter((n) => /\.js$/.test(n))
  .sort()) {
  test(
    "src/web/seller/" + name + ": nincs benne modern szintaxis (iOS 9 Safari)",
    () => {
      assert.deepStrictEqual(
        findModern(fs.readFileSync(path.join(PARTS_DIR, name), "utf8")),
        [],
      );
    },
  );
}
