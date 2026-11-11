// Képernyő-katalógus: a #DEMO lista minden állapotát megnyitja a mélylinkjén, és képernyőképet készít.
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

test('screens: az összes demo képernyő képernyőképe', async ({ page }) => {
  test.setTimeout(400000);
  await page.goto('/#DEMO');
  const items = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.demo-panel h3, .demo-panel .demo-btn').forEach((n) => {
      if (n.tagName === 'H3') out.push({ group: n.textContent });
      else out.push({ id: n.getAttribute('data-demo'), title: n.childNodes[0].textContent });
    });
    return out;
  });
  expect(items.filter((i) => i.id).length).toBeGreaterThan(50);

  const dir = path.join(H.OUT, 'screens');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const groups = [];
  let current = null;
  for (const it of items) {
    if (it.group) { current = { title: it.group, items: [] }; groups.push(current); continue; }
    await page.setViewportSize(/^(pc|mac)-/.test(it.id) ? H.DESKTOP : H.IPAD);
    await page.goto('/#DEMO-' + it.id);
    await page.reload();
    await expect(page.locator('h1').first()).toBeVisible();
    const h1 = ((await page.locator('h1').first().textContent()) || '').trim();
    const file = it.id + '.png';
    await page.screenshot({ path: path.join(dir, file), fullPage: true });
    current.items.push({ id: it.id, title: it.title, h1, file });
  }
  fs.writeFileSync(path.join(dir, 'screens.json'), JSON.stringify({ groups }, null, 2));
});

// Próbaüzemben a beillesztős képernyők kitalált minta kimenettel előre kitöltve, a Beolvasás a valódi parseren megy át.
const PREFILLED = [
  { id: 'pc-paste', area: '#usb-paste', button: '#parse-usb', expect: 'iPad mini 1', view: H.DESKTOP },
  { id: 'mac-paste', area: '#paste', button: '#parse', expect: 'MacBook Air', view: H.DESKTOP },
  { id: 'ios9-log-paste', area: '#paste', button: '#parse-log', expect: '245', view: H.IPAD },
  { id: 'mid-log-paste', area: '#paste', button: '#parse-log', expect: '245', view: H.IPAD },
  { id: 'modern-log-file', area: null, button: '#demo-file', expect: '312', view: H.IPAD }
];
for (const c of PREFILLED) {
  test('demo minta: ' + c.id + ' futtatás nélkül beolvasható', async ({ page }) => {
    await page.setViewportSize(c.view);
    await page.goto('/#DEMO-' + c.id);
    await page.reload();
    if (c.area) expect((await page.locator(c.area).inputValue()).length).toBeGreaterThan(20);
    await page.click(c.button);
    await expect(page.locator('#result .result')).toContainText(c.expect);
    if (c.area) expect(await page.locator(c.area).inputValue()).toBe('');
    await expect(page.locator('#res-next')).toBeVisible();
  });
}

test.describe('Valódi kóddal nincs minta', () => {
  test.use({ userAgent: H.UA.mac, viewport: H.DESKTOP });
  test('valódi kóddal a beillesztős mező üres, és nincs próbaüzem jelzés', async ({ page }) => {
    await page.goto('/');
    await page.locator('#code').fill('123 456 789');
    await page.locator('#start').click();
    await page.locator('#k-mac').click();
    await page.locator('#m-next').click();
    await expect(page.locator('h1').first()).toHaveText('A Terminál szövegének beillesztése');
    expect(await page.locator('#paste').inputValue()).toBe('');
    await expect(page.locator('body')).not.toContainText('Próbaüzem');
  });
});
