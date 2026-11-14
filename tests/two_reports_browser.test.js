const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { chromium } = require("@playwright/test");
const { makeBackend } = require("./helpers/backend.js");

test(
  "reader saves USB data to Sheet, prints continuation URL, watches web steps, and sends one combined seller email at the end",
  { timeout: 60000 },
  async () => {
    const appsScript = makeBackend();
    appsScript.invite("123456789");
    const requests = [];
    let interruptFinish = true;
    const backend = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const payload = JSON.parse(body);
        requests.push(payload);
        if (
          payload.action === "audit_event" &&
          payload.step === "finish" &&
          interruptFinish
        ) {
          interruptFinish = false;
          response.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          response.end(
            JSON.stringify({
              ok: false,
              error: "A teszt backend átmenetileg foglalt.",
            }),
          );
          return;
        }
        const result = appsScript.call(payload);
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        response.end(JSON.stringify(result));
      });
    });
    await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
    const endpoint = "http://127.0.0.1:" + backend.address().port;
    const script = [
      "import sys, builtins",
      "sys.path.insert(0, 'tool')",
      "from ipad_audit import audit, reader, reader_web, config",
      "config.BACKEND_URL = " + JSON.stringify(endpoint),
      "answers = iter(['igen', 'reader@example.test'])",
      "builtins.input = lambda prompt: next(answers)",
      "async def read(notify):",
      '    return {"info": {"ProductType": "iPad2,5", "SerialNumber": "DMPS00000FAK", "ProductVersion": "9.3.5", "HardwarePlatform": "s5l8942x"}, "disk": {"TotalDiskCapacity": 16000000000}, "bat": {"CycleCount": 246, "DesignCapacity": 4490, "AppleRawMaxCapacity": 3637}}',
      "reader.read_raw = read",
      "reader_web.open_on_device = lambda code, **options: False",
      "orig_watch = audit.watch",
      "audit.watch = lambda *a, **kw: orig_watch(*a, **{**kw, 'interval': 0.05})",
      "def reject_desktop(*args, **options):",
      "    raise AssertionError('The reader must not open a computer browser or local server')",
      "reader_web.open_page = reject_desktop",
      "reader_web.create_server = reject_desktop",
      "status = reader.main(['--code', '123456789', '--web-url', " +
        JSON.stringify(endpoint + "/") +
        "])",
      "sys.exit(status)",
    ].join("\n");
    const worker = spawn(".venv/bin/python", ["-u", "-c", script], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = new Promise((resolve) => worker.once("close", resolve));
    let readerOutput = "";
    worker.stderr.on("data", (chunk) => {
      readerOutput += chunk;
    });
    const errLines = readline.createInterface({ input: worker.stderr });
    let browser;
    try {
      const address = await new Promise((resolve, reject) => {
        errLines.on("line", (line) => {
          if (line.startsWith(endpoint + "/#123456789.")) resolve(line.trim());
        });
        worker.once("error", reject);
        worker.once("exit", (code) =>
          reject(
            new Error("reader exited early: " + code + "\n" + readerOutput),
          ),
        );
      });
      assert.match(
        address,
        new RegExp(
          "^" +
            endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "/#123456789\\.[0-9A-F]{32}$",
        ),
      );
      assert.equal(appsScript.mails.length, 1);
      assert.equal(appsScript.mails[0].to, "reader@example.test");
      assert.match(appsScript.mails[0].subject, /iPad audit folytatása/);
      assert.equal(appsScript.rows[1][3], "teszt folyamatban");
      assert.match(JSON.stringify(appsScript.eventRows), /DMPS00000FAK/);
      assert.doesNotMatch(
        JSON.stringify({
          rows: appsScript.rows,
          events: appsScript.eventRows,
          cache: Array.from(appsScript.cache),
          props: Array.from(appsScript.props),
        }),
        /reader@example\.test/,
      );

      browser = await chromium.launch({ channel: "chrome", headless: true });
      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 Version/9.0 Mobile/13G36 Safari/601.1",
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.addInitScript(() => {
        window.fetch = undefined;
      });
      const files = new Set([
        "index.html",
        "style.css",
        "parse.js",
        "example.js",
        "seller.js",
      ]);
      await page.route(endpoint + "/**", async (route) => {
        if (route.request().method() === "POST") return route.continue();
        const name =
          new URL(route.request().url()).pathname.slice(1) || "index.html";
        if (name === "config.js") {
          return route.fulfill({
            contentType: "text/javascript",
            body: "window.BACKEND_URL=" + JSON.stringify(endpoint) + ";",
          });
        }
        if (!files.has(name)) return route.abort();
        await route.fulfill({
          contentType: name.endsWith(".js")
            ? "text/javascript"
            : name.endsWith(".css")
              ? "text/css"
              : "text/html",
          body: fs.readFileSync(path.join(__dirname, "..", "web", name)),
        });
      });
      await page.goto(address);
      assert.equal(await page.locator("#code").count(), 0);
      assert.equal(await page.locator("#start").count(), 0);
      assert.equal(await page.locator("#k-ios").count(), 0);
      assert.equal(await page.locator("#web-download").count(), 0);
      await page.locator("#web-start").click();
      assert.match(await page.locator("#msg").innerText(), /beleegyezésed/);
      await page.locator("#audit-consent").check();
      await page.locator("#web-start").click();
      await page.locator("input[name=apple][value=yes]").check();
      await page.locator("#next").click();
      await page.locator("#hw-no").click();
      assert.equal(await page.locator("#consent").isChecked(), false);
      assert.equal(await page.locator("#copy-email").count(), 0);
      assert.equal(appsScript.mails.length, 1);
      await page.locator("#consent").check();
      await page.locator("#send").click();
      await page.locator("#msg .error").waitFor();
      assert.match(
        await page.locator("#msg").innerText(),
        /átmenetileg foglalt/,
      );
      assert.equal(appsScript.mails.length, 1);
      await page.reload();
      assert.equal(await page.locator("#consent").isChecked(), false);
      await page.locator("#consent").check();
      await page.locator("#send").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#msg .error") ||
          document.querySelector("h1").textContent === "Köszönjük!",
      );
      assert.equal(
        await page.locator("h1").innerText(),
        "Köszönjük!",
        await page.locator("#app").innerText(),
      );
      await page.getByRole("heading", { name: "Összesített riport" }).waitFor();
      const doneText = await page.locator("#app").innerText();
      assert.match(doneText, /A számítógépen futó reader most küldi/);
      assert.match(doneText, /DMPS00000FAK/);
      assert.match(doneText, /Hardverteszt/);
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("ipad-audit-seller-v2"),
        ),
        null,
      );

      assert.equal(await exited, 0, readerOutput);
      assert.match(
        readerOutput,
        /A WEBES TESZTET AZ IPADEN VAGY IPHONE-ON FOLYTASD/,
      );
      assert.ok(readerOutput.split(/\r?\n/).includes(address));
      assert.match(readerOutput, /USB-adatok mentése: rendben/);
      assert.match(readerOutput, /Összesített riport mentése: rendben/);
      assert.match(
        readerOutput,
        /Az összesített eladói email küldését a szerver visszaigazolta\./,
      );
      assert.doesNotMatch(
        readerOutput,
        /apple\.audit\.kokocloud\.space|DMPS00000FAK|reader@example\.test/,
      );
      assert.equal(appsScript.mails.length, 2);
      assert.equal(appsScript.mails[1].to, "reader@example.test");
      assert.equal(appsScript.mails[1].bcc, undefined);
      assert.match(appsScript.mails[1].subject, /összesített riport/);
      assert.match(appsScript.mails[1].body, /DMPS00000FAK/);
      assert.match(appsScript.mails[1].body, /Hardverteszt/);
      assert.match(appsScript.mails[1].body, /A teszt menete/);
      assert.doesNotMatch(
        JSON.stringify({
          rows: appsScript.rows,
          events: appsScript.eventRows,
          props: Array.from(appsScript.props),
          cache: Array.from(appsScript.cache),
        }),
        /reader@example\.test/,
      );
    } finally {
      if (browser) await browser.close();
      worker.kill();
      await exited;
      errLines.close();
      await new Promise((resolve) => backend.close(resolve));
    }
  },
);
