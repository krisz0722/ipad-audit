// A docs/flows.md és docs/flows.en.md nem avulhat el: minden demo azonosító és minden e2e forgatókönyv szerepeljen bennük.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const demoIds = [
  ...read("web/seller.js").matchAll(
    /^\s*demo\(\s*G[A-Z0-9_]*\s*,\s*['"]([a-z0-9-]+)['"]/gm,
  ),
].map((m) => m[1]);
const flowIds = [];
for (const f of ["tests/e2e/flows.spec.js", "tests/e2e/backend.spec.js"]) {
  for (const m of read(f).matchAll(
    /new H\.Flow\(\s*page\s*,\s*['"]([a-z0-9-]+)['"]/g,
  ))
    flowIds.push(m[1]);
}

for (const doc of ["docs/flows.md", "docs/flows.en.md"]) {
  test(doc + ": minden demo azonosító szerepel", () => {
    assert.ok(demoIds.length > 50);
    const text = read(doc);
    const missing = demoIds.filter(
      (id) => text.indexOf("`#DEMO-" + id + "`") < 0,
    );
    assert.deepStrictEqual(missing, []);
  });
  test(doc + ": minden e2e forgatókönyv szerepel", () => {
    assert.ok(flowIds.length > 25);
    const text = read(doc);
    const missing = flowIds.filter((id) => text.indexOf("`" + id + "`") < 0);
    assert.deepStrictEqual(missing, []);
  });
  test(doc + ": van legalább hat Mermaid diagram", () => {
    assert.ok((read(doc).match(/```mermaid/g) || []).length >= 6);
  });
}
