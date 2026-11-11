// Playwright beállítás. A teszteket a gépen lévő Google Chrome futtatja, böngészőt nem tölt le.
// Az oldalt a web/ mappából szolgálja ki, a fix 8766-os porton (lásd scripts/serve.sh).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: process.env.STEP ? 0 : 150000, // léptetéskor nincs időkorlát
  expect: { timeout: 15000 },
  workers: 4,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:8766',
    channel: 'chrome',
    headless: true,
    // FLOWS_VIDEO=1 esetén minden teszt videót is készít (ehhez a Playwright ffmpeg-je kell).
    video: process.env.FLOWS_VIDEO ? 'on' : 'off',
    launchOptions: {
      // SLOWMO=400 esetén minden művelet után vár ennyi ezredmásodpercet, így élőben követhető (--headed mellett).
      slowMo: Number(process.env.SLOWMO || 0),
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
    }
  },
  webServer: {
    command: 'python3 -m http.server 8766 --bind 127.0.0.1 --directory web',
    url: 'http://127.0.0.1:8766/',
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'ignore',
    timeout: 30000
  }
});
