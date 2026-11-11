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
