const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { chromium } = require("@playwright/test");

test(
  "USB reader opens local page and preserves device data without sending it",
  { timeout: 30000 },
  async () => {
    const script = [
      "import sys, threading",
      "sys.path.insert(0, 'tool')",
      "from ipad_audit.reader_web import create_server",
      "server, url = create_server('IPAD-AUDIT-USB 1\\nmodel: iPad2,5\\nmodel_name: iPad mini 1\\nos: 9.3.5\\nserial: DMPS00000FAK\\nhardware_platform: s5l8942x\\nstorage_gb: 16\\ncycles: 246\\ncapacity_percent: 81.0\\nactivation_lock: unknown\\nEND')",
      "thread = threading.Thread(target=server.serve_forever)",
      "thread.start()",
      "print(url, flush=True)",
      "sys.stdin.readline()",
      "server.shutdown()",
      "thread.join()",
      "server.server_close()",
    ].join("\n");
    const server = spawn(".venv/bin/python", ["-u", "-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const lines = readline.createInterface({ input: server.stdout });
    const address = await new Promise((resolve, reject) => {
      lines.once("line", resolve);
      server.once("error", reject);
      server.once("exit", (code) =>
        reject(new Error("Local server exited: " + code)),
      );
    });
    let browser;
    try {
      browser = await chromium.launch({ channel: "chrome", headless: true });
      const page = await browser.newPage();
      const external = [];
      await page.route("**/*", async (route) => {
        if (!route.request().url().startsWith(address)) {
          external.push(route.request().url());
          await route.abort();
        } else await route.continue();
      });
      await page.goto(address);
      await page.locator("#code").fill("DEMO");
      await page.locator("#start").click();
      await page.locator("#k-ios").click();
      await page.getByRole("heading", { name: "Kiolvasott adatok" }).waitFor();
      assert.match(await page.locator("#result").innerText(), /iPad mini 1/);
      assert.match(await page.locator("#result").innerText(), /s5l8942x/);
      await page.reload();
      await page.getByRole("heading", { name: "Kiolvasott adatok" }).waitFor();
      await page.locator("#res-next").click();
      await page
        .getByRole("heading", { name: "Folytasd az eladandó eszközön" })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(sessionStorage.getItem("ipad-audit-seller-v2")).state
              .vals.serial,
        ),
        "DMPS00000FAK",
      );
      assert.deepEqual(external, []);
    } finally {
      if (browser) await browser.close();
      server.stdin.end("\n");
      await new Promise((resolve) => server.once("exit", resolve));
      lines.close();
    }
  },
);
