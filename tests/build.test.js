// A web/seller.js az src/web/seller/ részeiből épül. Ez a teszt őrzi, hogy a kettő mindig egyezzen, vagyis hogy senki ne
// szerkessze közvetlenül a generált fájlt, és hogy a részek módosítása után lefusson a build.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { build, parts, OUT, PARTS_DIR } = require("../scripts/build-web.js");

test("a seller oldal megjeleníti a web verzióját és a frissítés dátumát", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "web", "index.html"),
    "utf8",
  );
  assert.match(
    html,
    /class="version-bar"[^>]*>\s*Web v\d{4}\.\d{2}\.\d{2}\.\d+/,
  );
  assert.match(
    html,
    /<time datetime="\d{4}-\d{2}-\d{2}">\d{4}\.\d{2}\.\d{2}\.<\/time>/,
  );
});

test("a web/seller.js egyezik a részekből épített változattal (ha nem, futtasd: npm run build:web)", () => {
  assert.strictEqual(fs.readFileSync(OUT, "utf8"), build());
});

test("a részek sorrendje egyértelmű, számmal kezdődnek, és nincs köztük ismétlődő szám", () => {
  const names = parts();
  assert.ok(names.length >= 10);
  const numbers = names.map((n) => Number(n.split("-")[0]));
  assert.deepStrictEqual(
    numbers,
    numbers.slice().sort((a, b) => a - b),
  );
  assert.strictEqual(new Set(numbers).size, numbers.length);
});

test("az első rész nyitja, az utolsó zárja a közös függvényt, így a részek külön nem futtathatók félreérthetően", () => {
  const names = parts();
  const first = fs.readFileSync(path.join(PARTS_DIR, names[0]), "utf8");
  const last = fs.readFileSync(
    path.join(PARTS_DIR, names[names.length - 1]),
    "utf8",
  );
  assert.match(first, /\(function \(\) \{\n  'use strict';/);
  assert.match(last.trimEnd(), /\}\)\(\);$/);
});

test("minden rész szakaszjelölővel vagy megjegyzéssel kezdődik, nem a kód közepén", () => {
  for (const name of parts()) {
    const firstLine = fs
      .readFileSync(path.join(PARTS_DIR, name), "utf8")
      .split("\n")[0]
      .trim();
    assert.ok(
      firstLine.startsWith("//") ||
        firstLine.startsWith("/*") ||
        firstLine.startsWith("("),
      name + " eleje: " + firstLine,
    );
  }
});
