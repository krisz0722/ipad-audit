// Végigjárt forgatókönyvek. Minden lépés után képernyőkép készül a flows-out/ mappába (lásd scripts/build-flows-gallery.js).
// A próbaüzem (DEMO) kódot használják, így semmi nem megy ki. A valódi küldés hibaágai a backend.spec.js-ben vannak.
const { test } = require('@playwright/test');
const H = require('./helpers');
const { expect } = H;

const G = {
  ios9: 'iPad, iOS 9 és 10', ios12: 'iPad, iOS 11 és 12', ios14: 'iPad, iPadOS 13 és 14', ios17: 'iPad, iPadOS 15 és újabb',
  pc: 'Számítógép, USB-s kiolvasás (iPad vagy iPhone)', mac: 'Mac eladása', open: 'Nyitás és hibák'
};

async function review(page, f, label) {
  await expect(page.locator('h1').first()).toHaveText('Ellenőrizd, mit küldünk el');
  await f.snap(label || 'Előnézet');
}
async function sendDemo(page, f) {
  await f.step('Beleegyezés, Küldés (próbaüzem)', async () => {
    await page.locator('#consent').check();
    await page.locator('#send').click();
  }, 'Köszönjük!');
}
async function details(page, f, apple) {
  await expect(page.locator('h1').first()).toHaveText('Az eszköz adatai');
  await f.step('Kijelentkezési válasz, Tovább', async () => { await H.chooseApple(page, apple); await page.locator('#next').click(); });
}

/* ---------------- iPad, iOS 9 és 10 ---------------- */
test.describe('iPad iOS 9', () => {
  test.use({ userAgent: H.UA.ipad9, viewport: H.IPAD, hasTouch: true });
  test.beforeEach(async ({ page }) => { await H.emulate(page, 'legacy'); });

  test('ios9-nolog-minimal: nincs napló, hardverteszt és USB nélkül, a legrövidebb út', async ({ page }) => {
    const f = new H.Flow(page, 'ios9-nolog-minimal', 'Nincs napló, hardverteszt és USB nélkül (a legrövidebb út)', G.ios9);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Keresd meg a rendszernaplót');
    await f.step('Nincs bejegyzés a listában', () => page.locator('#l-none').click(), 'Nincs baj, erre van megoldás');
    await f.step('Rendben, tovább', () => page.locator('#n-skip').click(), 'Az eszköz adatai');
    await details(page, f);
    await f.step('Hardverteszt kihagyása', () => page.locator('#hw-no').click(), 'Ez még nincs ellenőrizve');
    await f.step('Nem kérem a programot', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await expect(page.locator('#app')).toContainText('USB nélkül nem olvasható ki');
    await sendDemo(page, f);
    await f.save();
  });

  async function logAndHardware(page, f) {
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Keresd meg a rendszernaplót');
    await f.step('Van bejegyzés', () => page.locator('#l-found').click(), 'A napló kimásolása');
    await f.step('Napló beillesztése, Beolvasás', async () => {
      await page.locator('#paste').fill(H.LOG9);
      await page.locator('#parse-log').click();
      await expect(page.locator('#result')).toContainText('245');
    });
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await details(page, f);
    await f.step('Elkezdem a hardvertesztet', () => page.locator('#hw-go').click(), 'Érintőképernyő');
    await H.hwTouch(page, f, 'run');
    await H.hwMotion(page, f, 'run');
    await H.hwMedia(page, f, 'unavailable', 'Hang');
    await H.hwMedia(page, f, 'unavailable', 'Hátlapi kamera');
    await H.hwMedia(page, f, 'unavailable', 'Előlapi kamera');
    await H.hwDisplay(page, f, 'ok');
    await expect(page.locator('h1').first()).toHaveText('Ez még nincs ellenőrizve');
    await f.snap('Mi maradt: az USB-s program ajánlata');
  }

  test('ios9-log-hw-usb-offer: napló, hardverteszt, az USB-s program elfogadása', async ({ page }) => {
    const f = new H.Flow(page, 'ios9-log-hw-usb-offer', 'Napló, hardverteszt, majd az USB-s program elfogadása', G.ios9);
    await logAndHardware(page, f);
    await f.step('Igen, megnézem a programot', () => page.locator('#r-yes').click(), 'Mit csinál a program, és mit kapsz belőle?');
    await f.step('Rendben, letöltöm', () => page.locator('#a-go').click(), 'Nyisd meg az oldalt a számítógépeden');
    await f.save();
  });

  test('ios9-log-hw-send: napló, hardverteszt, az USB-s program elutasítása, küldés', async ({ page }) => {
    const f = new H.Flow(page, 'ios9-log-hw-send', 'Napló, hardverteszt, USB nélkül küldés', G.ios9);
    await logAndHardware(page, f);
    await f.step('Nem, így küldöm', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
  });

  test('ios9-usb-offer-declined-later: az USB-s program leírásánál meggondolja magát', async ({ page }) => {
    const f = new H.Flow(page, 'ios9-usb-offer-declined-later', 'Megnézi az USB-s program leírását, majd mégsem kéri', G.ios9);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Keresd meg a rendszernaplót');
    await f.step('Nincs bejegyzés', () => page.locator('#l-none').click(), 'Nincs baj, erre van megoldás');
    await f.step('Rendben, tovább', () => page.locator('#n-skip').click(), 'Az eszköz adatai');
    await details(page, f);
    await f.step('Hardverteszt kihagyása', () => page.locator('#hw-no').click(), 'Ez még nincs ellenőrizve');
    await f.step('Igen, megnézem', () => page.locator('#r-yes').click(), 'Mit csinál a program, és mit kapsz belőle?');
    await f.step('Mégsem, így küldöm', () => page.locator('#a-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await f.save();
  });

  test('ios9-log-bad-text: hibás napló, majd a nincs több bejegyzés ág', async ({ page }) => {
    const f = new H.Flow(page, 'ios9-log-bad-text', 'Hibás napló beillesztése, majd "nincs több ilyen bejegyzés"', G.ios9);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Keresd meg a rendszernaplót');
    await f.step('Van bejegyzés', () => page.locator('#l-found').click(), 'A napló kimásolása');
    await f.step('Értelmetlen szöveg beillesztése', async () => {
      await page.locator('#paste').fill('ez nem napló, semmi hasznos nincs benne');
      await page.locator('#parse-log').click();
      await expect(page.locator('#result')).toContainText('nem találtunk akkumulátor adatot');
    });
    await f.step('Nincs több ilyen bejegyzés', () => page.locator('#res-none').click(), 'Nincs baj, erre van megoldás');
    await f.save();
  });

  test('ios9-back-and-reload: a Vissza gomb a főcím alatt, újratöltés után folytatás', async ({ page }) => {
    const f = new H.Flow(page, 'ios9-back-and-reload', 'Vissza gomb és újratöltés (a régi iPad gyakran újratölti a lapot)', G.ios9);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Keresd meg a rendszernaplót');
    await f.step('Van bejegyzés', () => page.locator('#l-found').click(), 'A napló kimásolása');
    await expect(page.locator('h1 + .backrow #back')).toBeVisible();
    await f.step('A Vissza közvetlenül a főcím alatt van, vissza a naplókereséshez', () => page.locator('#back').click(), 'Keresd meg a rendszernaplót');
    await f.step('Újra: nincs bejegyzés', () => page.locator('#l-none').click(), 'Nincs baj, erre van megoldás');
    await f.step('A lap újratöltése: ugyanott folytatódik', async () => { await page.reload(); }, 'Nincs baj, erre van megoldás');
    await f.step('Vissza, vissza: a típus választóig', async () => { await page.locator('#back').click(); await expect(page.locator('h1').first()).toHaveText('Keresd meg a rendszernaplót'); await page.locator('#back').click(); }, 'Milyen eszközt adsz el?');
    await f.step('Még egy Vissza: a nyitóoldal, ott nincs Vissza gomb', async () => { await page.locator('#back').click(); await expect(page.locator('#back')).toHaveCount(0); }, 'Az eszközöd állapotának ellenőrzése');
    await f.save();
  });
});

/* ---------------- iPad, iOS 11 és 12 ---------------- */
test.describe('iPad iOS 12', () => {
  test.use({ userAgent: H.UA.ipad12, viewport: H.IPAD, hasTouch: true });
  test.beforeEach(async ({ page }) => { await H.emulate(page, 'ios11'); });

  test('ios12-settings-all-hw: Beállításokból, minden hardverteszt', async ({ page }) => {
    const f = new H.Flow(page, 'ios12-settings-all-hw', 'Akku a Beállításokból, minden hardverteszt (hamis kamera és mikrofon)', G.ios12);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Látod az akku állapotát a Beállításokban?');
    await f.step('Igen, látom', () => page.locator('#s-yes').click(), 'Írd be a két számot');
    await f.step('Értékek beírása', async () => { await page.locator('#capacity').fill('88'); await page.locator('#cycles').fill('312'); await page.locator('#next').click(); }, 'Az eszköz adatai');
    await details(page, f);
    await f.step('Elkezdem a hardvertesztet', () => page.locator('#hw-go').click(), 'Érintőképernyő');
    await H.hwTouch(page, f, 'run');
    await H.hwMotion(page, f, 'run');
    await H.hwMedia(page, f, 'run', 'Hang');
    await H.hwMedia(page, f, 'run', 'Hátlapi kamera');
    await H.hwMedia(page, f, 'run', 'Előlapi kamera');
    await H.hwDisplay(page, f, 'ok');
    await expect(page.locator('h1').first()).toHaveText('Ez még nincs ellenőrizve');
    await f.snap('Mi maradt');
    await f.step('Nem, így küldöm', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
  });

  test('ios12-no-settings-log: nincs akku képernyő, napló beillesztése', async ({ page }) => {
    const f = new H.Flow(page, 'ios12-no-settings-log', 'Nem látja a Beállításokban, a naplóból olvassuk', G.ios12);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Látod az akku állapotát a Beállításokban?');
    await f.step('Nem látom', () => page.locator('#s-no').click(), 'Keresd meg a rendszernaplót');
    await f.step('Van bejegyzés', () => page.locator('#l-found').click(), 'A napló kimásolása');
    await f.step('Napló beillesztése', async () => { await page.locator('#paste').fill(H.LOG9); await page.locator('#parse-log').click(); await expect(page.locator('#result')).toContainText('245'); });
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await details(page, f);
    await f.step('Hardverteszt kihagyása', () => page.locator('#hw-no').click(), 'Ez még nincs ellenőrizve');
    await f.step('Nem, így küldöm', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
  });

  test('ios12-battery-validation: hibás akku értékek, javítás, kihagyás', async ({ page }) => {
    const f = new H.Flow(page, 'ios12-battery-validation', 'Hibás akku értékek, javítás és kihagyás', G.ios12);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Látod az akku állapotát a Beállításokban?');
    await f.step('Igen, látom', () => page.locator('#s-yes').click(), 'Írd be a két számot');
    await f.step('Túl nagy kapacitás', async () => { await page.locator('#capacity').fill('120'); await page.locator('#next').click(); await expect(page.locator('#msg')).toContainText('40 és 100 közötti'); });
    await f.step('Hibás ciklusszám', async () => { await page.locator('#capacity').fill('88'); await page.locator('#cycles').fill('99999'); await page.locator('#next').click(); await expect(page.locator('#msg')).toContainText('0 és 5000 közötti'); });
    await f.step('Ezt most kihagyom', () => page.locator('#skip').click(), 'Az eszköz adatai');
    await f.save();
  });
});

/* ---------------- iPad, iPadOS 13 és 14 ---------------- */
test.describe('iPad iPadOS 14', () => {
  test.use({ userAgent: H.UA.ipad14, viewport: H.IPAD, hasTouch: true });
  test.beforeEach(async ({ page }) => { await H.emulate(page, 'ios13'); });

  test('ios14-file-upload: analitikai fájl feltöltése', async ({ page }) => {
    const f = new H.Flow(page, 'ios14-file-upload', 'Nem látja a Beállításokban, az analitikai fájlt választja ki', G.ios14);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Látod az akku állapotát a Beállításokban?');
    await f.step('Nem látom', () => page.locator('#s-no').click(), 'Keresd meg a rendszernaplót');
    await f.step('Van bejegyzés', () => page.locator('#l-found').click(), 'A fájl kiválasztása');
    await f.step('Fájl kiválasztása', async () => {
      await page.locator('#file').setInputFiles({ name: 'log-aggregated.ips', mimeType: 'text/plain', buffer: Buffer.from(H.FILE17) });
      await expect(page.locator('#result')).toContainText('312');
    });
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await details(page, f);
    await f.step('Hardverteszt kihagyása', () => page.locator('#hw-no').click(), 'Ez még nincs ellenőrizve');
    await f.step('Nem, így küldöm', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await expect(page.locator('#app')).toContainText('fájlból');
    await sendDemo(page, f);
    await f.save();
  });

  test('ios14-file-without-battery: a fájlban nincs akku adat', async ({ page }) => {
    const f = new H.Flow(page, 'ios14-file-without-battery', 'Fájl akku adat nélkül, majd "nincs több bejegyzés"', G.ios14);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Látod az akku állapotát a Beállításokban?');
    await f.step('Nem látom', () => page.locator('#s-no').click(), 'Keresd meg a rendszernaplót');
    await f.step('Van bejegyzés', () => page.locator('#l-found').click(), 'A fájl kiválasztása');
    await f.step('Üres fájl kiválasztása', async () => {
      await page.locator('#file').setInputFiles({ name: 'x.ips', mimeType: 'text/plain', buffer: Buffer.from('nincs benne semmi hasznos') });
      await expect(page.locator('#result')).toContainText('nem találtunk akkumulátor adatot');
    });
    await f.step('Nincs több ilyen bejegyzés', () => page.locator('#res-none').click(), 'Nincs baj, erre van megoldás');
    await f.save();
  });
});

/* ---------------- iPad, iPadOS 15 és újabb ---------------- */
test.describe('iPad iPadOS 17', () => {
  test.use({ userAgent: H.UA.ipad17, viewport: H.IPAD, hasTouch: true });
  test.beforeEach(async ({ page }) => { await H.emulate(page, 'ios13'); });

  test('ios17-everything: Beállításokból, minden teszt, az USB-s program elutasítása', async ({ page }) => {
    const f = new H.Flow(page, 'ios17-everything', 'Beállításokból, minden hardverteszt, az USB-s program leírása után mégsem kéri', G.ios17);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Látod az akku állapotát a Beállításokban?');
    await f.step('Igen, látom', () => page.locator('#s-yes').click(), 'Írd be a két számot');
    await f.step('Értékek beírása', async () => { await page.locator('#capacity').fill('91'); await page.locator('#cycles').fill('180'); await page.locator('#next').click(); }, 'Az eszköz adatai');
    await details(page, f, 'unsure');
    await f.step('Elkezdem a hardvertesztet', () => page.locator('#hw-go').click(), 'Érintőképernyő');
    await H.hwTouch(page, f, 'run');
    await H.hwMotion(page, f, 'run');
    await H.hwMedia(page, f, 'run', 'Hang');
    await H.hwMedia(page, f, 'run', 'Hátlapi kamera');
    await H.hwMedia(page, f, 'run', 'Előlapi kamera');
    await H.hwDisplay(page, f, 'bad');
    await f.step('Igen, megnézem a programot', () => page.locator('#r-yes').click(), 'Mit csinál a program, és mit kapsz belőle?');
    await f.step('Mégsem, így küldöm', () => page.locator('#a-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
  });

  test('ios17-skip-all-hw: minden hardverteszt kihagyva egyenként', async ({ page }) => {
    const f = new H.Flow(page, 'ios17-skip-all-hw', 'Egyenként kihagyja az összes hardvertesztet', G.ios17);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'Látod az akku állapotát a Beállításokban?');
    await f.step('Igen, látom', () => page.locator('#s-yes').click(), 'Írd be a két számot');
    await f.step('Értékek beírása', async () => { await page.locator('#capacity').fill('95'); await page.locator('#cycles').fill('60'); await page.locator('#next').click(); }, 'Az eszköz adatai');
    await details(page, f);
    await f.step('Elkezdem a hardvertesztet', () => page.locator('#hw-go').click(), 'Érintőképernyő');
    await H.hwTouch(page, f, 'skip');
    await H.hwMotion(page, f, 'skip');
    await f.step('Hang: kihagyom', () => page.locator('#hw-skip').click(), 'Hátlapi kamera');
    await f.step('Hátlapi kamera: kihagyom', () => page.locator('#hw-skip').click(), 'Előlapi kamera');
    await f.step('Előlapi kamera: kihagyom', () => page.locator('#hw-skip').click(), 'Kijelző színei');
    await f.step('Kijelző: kihagyom', () => page.locator('#hw-skip').click(), 'Ez még nincs ellenőrizve');
    await f.step('Nem, így küldöm', () => page.locator('#r-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
  });
});

/* ---------------- számítógép, USB-s kiolvasás ---------------- */
async function pcUsb(page, f, o) {
  await H.begin(page, f, 'DEMO');
  await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'A kiolvasó program letöltése');
  if (o.macCommand) await expect(page.locator('#mac-cmd')).toBeVisible();
  await f.step('Letöltöttem, tovább', () => page.locator('#u-next').click(), 'Csatlakoztatás és futtatás');
  await f.step('Kész, tovább', () => page.locator('#u-next').click(), 'A kimenet beillesztése');
  await f.step('A program kimenetének beillesztése, Beolvasás', async () => {
    await page.locator('#usb-paste').fill(o.text || H.USB);
    await page.locator('#parse-usb').click();
    await expect(page.locator('#result')).toContainText(o.expect || 'iPad mini 1');
  });
}

test.describe('Számítógép, USB', () => {
  test.use({ viewport: H.DESKTOP });

  test('pc-win-usb: Windows, USB-ből kiolvasva', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: H.UA.win, viewport: H.DESKTOP });
    const page = await ctx.newPage();
    const f = new H.Flow(page, 'pc-win-usb', 'Windows, az iPad USB-n át kiolvasva', G.pc);
    await pcUsb(page, f, {});
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await expect(page.locator('#app')).toContainText('DMPS00000FAK');
    await details(page, f);
    await review(page, f);
    await expect(page.locator('#app')).toContainText('USB-ből');
    await sendDemo(page, f);
    await f.save();
    await ctx.close();
  });

  test('pc-mac-usb: Mac számítógép, Terminál-letöltés', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: H.UA.mac, viewport: H.DESKTOP });
    const page = await ctx.newPage();
    const f = new H.Flow(page, 'pc-mac-usb', 'Mac számítógép, letöltés Terminálból, az iPad USB-n át kiolvasva', G.pc);
    await pcUsb(page, f, { macCommand: true });
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await details(page, f);
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
    await ctx.close();
  });

  test('pc-linux-usb: Linux, USB-ből kiolvasva', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: H.UA.linux, viewport: H.DESKTOP });
    const page = await ctx.newPage();
    const f = new H.Flow(page, 'pc-linux-usb', 'Linux, az iPad USB-n át kiolvasva', G.pc);
    await pcUsb(page, f, {});
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await details(page, f);
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
    await ctx.close();
  });

  test('pc-win-serial-hidden: a sorozatszámot nem küldi, csak a lenyomatot', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: H.UA.win, viewport: H.DESKTOP });
    const page = await ctx.newPage();
    const f = new H.Flow(page, 'pc-win-serial-hidden', 'A sorozatszám küldésének kikapcsolása: csak lenyomat megy el', G.pc);
    await pcUsb(page, f, {});
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await f.step('A sorozatszám küldésének kikapcsolása', async () => { await page.locator('#share').uncheck(); await H.chooseApple(page, 'yes'); await page.locator('#next').click(); }, 'Ellenőrizd, mit küldünk el');
    await expect(page.locator('#app')).toContainText('Sorozatszám lenyomat');
    await expect(page.locator('#app')).not.toContainText('DMPS00000FAK');
    await f.snap('Előnézet: csak a lenyomat és a vége látszik');
    await sendDemo(page, f);
    await f.save();
    await ctx.close();
  });

  test('pc-win-bad-paste: hibás kimenet, majd a helyes', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: H.UA.win, viewport: H.DESKTOP });
    const page = await ctx.newPage();
    const f = new H.Flow(page, 'pc-win-bad-paste', 'Hibás szöveg beillesztése, majd a helyes kimenet', G.pc);
    await H.begin(page, f, 'DEMO');
    await f.step('iPad vagy iPhone', () => page.locator('#k-ios').click(), 'A kiolvasó program letöltése');
    await f.step('Letöltöttem', () => page.locator('#u-next').click(), 'Csatlakoztatás és futtatás');
    await f.step('Kész', () => page.locator('#u-next').click(), 'A kimenet beillesztése');
    await f.step('Értelmetlen szöveg', async () => {
      await page.locator('#usb-paste').fill('ez nem a program kimenete');
      await page.locator('#parse-usb').click();
      await expect(page.locator('#result')).toContainText('nem találtuk a program kimenetét');
    });
    await f.step('A helyes kimenet', async () => {
      await page.locator('#usb-paste').fill(H.USB);
      await page.locator('#parse-usb').click();
      await expect(page.locator('#result')).toContainText('iPad mini 1');
    });
    await f.save();
    await ctx.close();
  });
});

/* ---------------- Mac eladása ---------------- */
test.describe('Mac', () => {
  test.use({ userAgent: H.UA.mac, viewport: H.DESKTOP });

  test('mac-command-hw: Terminál-parancs, hardverteszt', async ({ page }) => {
    const f = new H.Flow(page, 'mac-command-hw', 'Mac: parancs a Terminálból, hang, előlapi kamera, kijelző', G.mac);
    await H.begin(page, f, 'DEMO');
    await f.step('Mac', () => page.locator('#k-mac').click(), 'A Mac adatai');
    await f.step('Lefuttattam a parancsot', () => page.locator('#m-next').click(), 'A Terminál szövegének beillesztése');
    await f.step('Kimenet beillesztése', async () => {
      await page.locator('#paste').fill(H.MAC);
      await page.locator('#parse').click();
      await expect(page.locator('#result')).toContainText('MacBook Air');
    });
    await f.step('Tovább', () => page.locator('#res-next').click(), 'Az eszköz adatai');
    await details(page, f);
    await f.step('Elkezdem a hardvertesztet', () => page.locator('#hw-go').click(), 'Hangszóró és mikrofon');
    await H.hwMedia(page, f, 'run', 'Hang');
    await H.hwMedia(page, f, 'run', 'Előlapi kamera');
    await H.hwDisplay(page, f, 'ok');
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
  });

  test('mac-manual: kézi megadás, hardverteszt nélkül', async ({ page }) => {
    const f = new H.Flow(page, 'mac-manual', 'Mac: a parancs nem megy, kézi megadás, hardverteszt nélkül', G.mac);
    await H.begin(page, f, 'DEMO');
    await f.step('Mac', () => page.locator('#k-mac').click(), 'A Mac adatai');
    await f.step('Nem sikerül a parancs, kézzel adom meg', () => page.locator('#to-manual').click(), 'Az akkumulátor adatai kézzel');
    await f.step('Értékek', async () => { await page.locator('#capacity').fill('91'); await page.locator('#cycles').fill('212'); await page.locator('#next').click(); }, 'Az eszköz adatai');
    await details(page, f);
    await f.step('Hardverteszt kihagyása', () => page.locator('#hw-no').click(), 'Ellenőrizd, mit küldünk el');
    await review(page, f);
    await sendDemo(page, f);
    await f.save();
  });

  test('mac-bad-paste: hibás Terminál kimenet', async ({ page }) => {
    const f = new H.Flow(page, 'mac-bad-paste', 'Mac: hibás Terminál kimenet beillesztése', G.mac);
    await H.begin(page, f, 'DEMO');
    await f.step('Mac', () => page.locator('#k-mac').click(), 'A Mac adatai');
    await f.step('Lefuttattam', () => page.locator('#m-next').click(), 'A Terminál szövegének beillesztése');
    await f.step('Értelmetlen szöveg', async () => {
      await page.locator('#paste').fill('semmi értelmes');
      await page.locator('#parse').click();
      await expect(page.locator('#result')).not.toBeEmpty();
    });
    await f.save();
  });
});

/* ---------------- nyitás és hibák ---------------- */
test.describe('Nyitás', () => {
  test.use({ userAgent: H.UA.ipad9, viewport: H.IPAD });

  test('welcome-code-errors: hibás meghívókódok, a példa riport', async ({ page }) => {
    const f = new H.Flow(page, 'welcome-code-errors', 'Nyitóoldal: üres és hibás meghívókód, a példa riport kinyitása', G.open);
    await page.goto('/');
    await expect(page.locator('h1').first()).toHaveText('Az eszközöd állapotának ellenőrzése');
    await f.snap('Nyitóoldal');
    await f.step('Üres kód', async () => { await page.locator('#start').click(); await expect(page.locator('#msg')).toContainText('9 számjegyből áll'); });
    await f.step('Rövid kód (12345)', async () => { await page.locator('#code').fill('12345'); await page.locator('#start').click(); await expect(page.locator('#msg')).toContainText('9 számjegyből áll'); });
    await f.step('A példa riport kinyitása', async () => { await page.locator('details.example summary').click(); await expect(page.locator('details.example[open]')).toBeVisible(); });
    await f.step('Szóközökkel, kötőjellel tagolt kód elfogadva', async () => { await page.locator('#code').fill('123 456-789'); await page.locator('#start').click(); }, 'Milyen eszközt adsz el?');
    await f.save();
  });
});
