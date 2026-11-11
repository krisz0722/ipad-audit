// A küldés útvonalai hamis Apps Scripttel. Az éles backendet a tesztek soha nem érik el.
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

const GROUP = 'Küldés és a backend hibaágai';

// Valódi (nem DEMO) kóddal a legrövidebb úton az előnézetig.
async function toReview(page, f) {
  await H.begin(page, f, '123 456 789', 'Valódi formátumú kód beírása');
  await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Keresd meg a rendszernaplót');
  await f.step('Nincs bejegyzés', () => page.locator('#l-none').click(), 'Nincs baj, erre van megoldás');
  await f.step('Rendben, tovább', () => page.locator('#n-skip').click(), 'Az eszköz adatai');
  await f.step('Kijelentkezési válasz, Tovább', async () => { await H.chooseApple(page, 'yes'); await page.locator('#next').click(); }, 'Hardverteszt');
  await f.step('Hardverteszt kihagyása', () => page.locator('#hw-no').click(), 'Ez még nincs ellenőrizve');
  await f.step('Nem kérem a programot', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
}
async function consentAndSend(page) {
  await page.locator('#consent').check();
  await page.locator('#send').click();
}

test.describe('Backend', () => {
  test.use({ userAgent: H.UA.ipad9, viewport: H.IPAD });
  test.beforeEach(async ({ page }) => { await H.emulate(page, 'legacy'); });

  test('send-success: a start és a finish hívás, egy riport megy el', async ({ page }) => {
    const f = new H.Flow(page, 'send-success', 'Sikeres küldés: start, majd finish', GROUP);
    const requests = await H.mockBackend(page, (body) => (body.action === 'start' ? { ok: true, sid: 'SID0123456' } : { ok: true }));
    await toReview(page, f);
    await f.step('Beleegyezés, Küldés', () => consentAndSend(page), 'Köszönjük!');
    expect(requests.map((r) => r.action)).toEqual(['start', 'finish']);
    expect(requests[0].code).toBe('123456789');
    expect(requests[1].sid).toBe('SID0123456');
    expect(Array.isArray(requests[1].sections)).toBe(true);
    expect(requests[1].sections.length).toBeGreaterThan(3);
    await f.step('A Vissza nem hozza vissza az előnézetet', async () => { await page.goBack(); }, 'Köszönjük!');
    await f.save();
  });

  test('send-invalid-invite: érvénytelen meghívó', async ({ page }) => {
    const f = new H.Flow(page, 'send-invalid-invite', 'Küldés: érvénytelen meghívókód', GROUP);
    await H.mockBackend(page, () => ({ ok: false, error: 'A meghívókód nem érvényes.' }));
    await toReview(page, f);
    await f.step('Küldés', async () => {
      await consentAndSend(page);
      await expect(page.locator('#msg')).toContainText('A meghívókód nem érvényes.');
      await expect(page.locator('#msg')).toContainText('Új meghívókódra van szükséged');
    });
    await expect(page.locator('#send')).toBeEnabled();
    await f.save();
  });

  test('send-used-invite: már felhasznált meghívó', async ({ page }) => {
    const f = new H.Flow(page, 'send-used-invite', 'Küldés: már felhasznált meghívókód', GROUP);
    await H.mockBackend(page, () => ({ ok: false, error: 'Ezt a meghívókódot már felhasználták.' }));
    await toReview(page, f);
    await f.step('Küldés', async () => {
      await consentAndSend(page);
      await expect(page.locator('#msg')).toContainText('már felhasználták');
    });
    await f.save();
  });

  test('send-network-retry: nincs kapcsolat, majd újrapróbálás', async ({ page }) => {
    const f = new H.Flow(page, 'send-network-retry', 'Küldés: nincs kapcsolat, majd az újrapróbálás sikerül', GROUP);
    const requests = await H.mockBackend(page, (body, n) => {
      if (n === 1) return 'abort';
      return body.action === 'start' ? { ok: true, sid: 'SID0123456' } : { ok: true };
    });
    await toReview(page, f);
    await f.step('Küldés, nincs kapcsolat', async () => {
      await consentAndSend(page);
      await expect(page.locator('#msg')).toContainText('Nincs kapcsolat a szerverrel');
    });
    await f.step('Újra a Küldés gombbal', () => page.locator('#send').click(), 'Köszönjük!');
    expect(requests.map((r) => r.action)).toEqual(['start', 'start', 'finish']);
    await f.save();
  });

  test('send-quota: a napi riportkeret betelt', async ({ page }) => {
    const f = new H.Flow(page, 'send-quota', 'Küldés: a napi riportkeret betelt', GROUP);
    await H.mockBackend(page, (body) => (body.action === 'start' ? { ok: true, sid: 'SID0123456' } : { ok: false, error: 'Elérte a napi riportkeretet, próbáld holnap.' }));
    await toReview(page, f);
    await f.step('Küldés', async () => {
      await consentAndSend(page);
      await expect(page.locator('#msg')).toContainText('napi riportkeretet');
    });
    await expect(page.locator('#send')).toBeEnabled();
    await f.save();
  });

  test('send-needs-consent: a Küldés a beleegyezésig le van tiltva', async ({ page }) => {
    const f = new H.Flow(page, 'send-needs-consent', 'Küldés: a beleegyezés nélkül nem aktív', GROUP);
    const requests = await H.mockBackend(page, () => ({ ok: true, sid: 'SID0123456' }));
    await toReview(page, f);
    await expect(page.locator('#send')).toBeDisabled();
    await f.snap('A Küldés gomb inaktív');
    await f.step('Beleegyezés', () => page.locator('#consent').check());
    await expect(page.locator('#send')).toBeEnabled();
    expect(requests.length).toBe(0);
    await f.save();
  });

  test('demo-sends-nothing: próbaüzemben semmilyen hálózati kérés nem megy ki', async ({ page }) => {
    const f = new H.Flow(page, 'demo-sends-nothing', 'Próbaüzem (DEMO): semmi nem megy ki a hálózatra', GROUP);
    const requests = await H.mockBackend(page, () => ({ ok: true, sid: 'SID0123456' }));
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Keresd meg a rendszernaplót');
    await f.step('Nincs bejegyzés', () => page.locator('#l-none').click(), 'Nincs baj, erre van megoldás');
    await f.step('Rendben, tovább', () => page.locator('#n-skip').click(), 'Az eszköz adatai');
    await f.step('Kijelentkezési válasz', async () => { await H.chooseApple(page, 'yes'); await page.locator('#next').click(); }, 'Hardverteszt');
    await f.step('Hardverteszt kihagyása', () => page.locator('#hw-no').click(), 'Ez még nincs ellenőrizve');
    await f.step('Nem kérem a programot', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
    await f.step('Küldés', () => consentAndSend(page), 'Köszönjük!');
    expect(requests.length).toBe(0);
    await f.save();
  });
});
