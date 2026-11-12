const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { chromium } = require("@playwright/test");

test(
  "reader sends USB report, then seller sends separate web report after consent and reload",
  { timeout: 60000 },
  async () => {
    const mails = [];
    let interruptWeb = true;
    const backend = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const payload = JSON.parse(body);
        assert.equal(payload.action, "report");
        assert.equal(payload.code, "123456789");
        if (payload.kind === "web" && interruptWeb) {
          interruptWeb = false;
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
        mails.push(payload);
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        response.end(JSON.stringify({ ok: true, kind: payload.kind }));
      });
    });
    await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
    const endpoint = "http://127.0.0.1:" + backend.address().port;
    const script = [
      "import sys, threading, builtins",
      "sys.path.insert(0, 'tool')",
      "from ipad_audit import reader, reader_web, config",
      "config.BACKEND_URL = " + JSON.stringify(endpoint),
      "builtins.input = lambda prompt: 'igen'",
      "async def read(notify):",
      '    return {"info": {"ProductType": "iPad2,5", "SerialNumber": "DMPS00000FAK", "ProductVersion": "9.3.5", "HardwarePlatform": "s5l8942x"}, "disk": {"TotalDiskCapacity": 16000000000}, "bat": {"CycleCount": 246, "DesignCapacity": 4490, "AppleRawMaxCapacity": 3637}}',
      "reader.read_raw = read",
      'def open_page(block, code="", usb_sent=False):',
      "    server, url = reader_web.create_server(block, code=code, usb_sent=usb_sent)",
      "    thread = threading.Thread(target=server.serve_forever)",
      "    thread.start()",
      "    print(url, flush=True)",
      "    sys.stdin.readline()",
      "    server.shutdown()",
      "    thread.join()",
      "    server.server_close()",
      "reader_web.open_page = open_page",
      "reader.main(['--code', '123456789'])",
    ].join("\n");
    const worker = spawn(".venv/bin/python", ["-u", "-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const exited = new Promise((resolve) => worker.once("exit", resolve));
    const lines = readline.createInterface({ input: worker.stdout });
    let browser;
    try {
      const address = await new Promise((resolve, reject) => {
        lines.once("line", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) =>
          reject(new Error("reader exited: " + code)),
        );
      });
      assert.equal(mails.length, 1);
      assert.equal(mails[0].kind, "usb");
      assert.match(JSON.stringify(mails[0]), /DMPS00000FAK/);
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const desktop = await browser.newPage();
      desktop.setDefaultTimeout(5000);
      await desktop.goto(address);
      assert.equal(await desktop.locator("#code").inputValue(), "123456789");
      await desktop.locator("#start").click();
      await desktop.locator("#k-ios").click();
      assert.match(
        await desktop.locator("#app").innerText(),
        /elküldte a USB-riportot/,
      );
      await desktop.locator("#res-next").click();
      await desktop
        .getByRole("heading", { name: "Folytasd az eladandó eszközön" })
        .waitFor();

      const context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 Version/9.0 Mobile/13G36 Safari/601.1",
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
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
      await page.goto(endpoint + "/#123456789");
      await page.locator("#start").click();
      await page.locator("#k-ios").click();
      await page.locator("#web-start").click();
      await page.locator("input[name=apple][value=yes]").check();
      await page.locator("#next").click();
      await page.locator("#hw-no").click();
      assert.equal(await page.locator("#consent").isChecked(), false);
      assert.equal(mails.length, 1);
      await page.locator("#consent").check();
      await page.locator("#send").click();
      await page.locator("#msg .error").waitFor();
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
      await page
        .getByRole("heading", { name: "Elküldött webes riport" })
        .waitFor();
      assert.equal(mails.length, 2);
      assert.equal(mails[1].kind, "web");
      assert.match(JSON.stringify(mails[1].sections), /Hardverteszt/);
      assert.doesNotMatch(
        JSON.stringify(mails[1].sections),
        /Töltési ciklusok|3637|USB-s kiolvasás/,
      );
      assert.equal(
        await page.evaluate(() =>
          sessionStorage.getItem("ipad-audit-seller-v2"),
        ),
        null,
      );
    } finally {
      if (browser) await browser.close();
      worker.stdin.end("\n");
      await exited;
      lines.close();
      await new Promise((resolve) => backend.close(resolve));
    }
  },
);
