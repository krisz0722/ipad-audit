# iPad és Mac állapot-ellenőrzés

**Magyar** | [English](README.en.md)

Használt iPad, iPhone és Mac vásárlásához készült ellenőrző eszköz. Az iPad/iPhone eladó először lefuttatja a USB-readert, majd az eladandó eszközön elvégzi a webes teszteket. Az eredményeket és a tesztlépéseket a vásárló private Sheetjébe mentjük; a végén egy összesített riport készül, amelyet az eladó – ha az elején kéri – egyszer emailben is megkap.

A kód nyilvános, hogy az eladó (és bárki) megnézhesse, pontosan mit olvas ki az oldal, és mit küld el.

**Példa riport:** [docs/example-report.md](docs/example-report.md). Kitalált adatokkal készült, ugyanabból a kódból, mint az éles riport, és egy teszt őrzi, hogy mindig megegyezzen vele.

## Eladóknak: mit olvas ki az oldal?

| Kiolvassuk                                                                                | Soha nem olvassuk                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| akkumulátor ciklusszáma, maximális kapacitása és az opcionális terhelésteszt mérései      | jelszavak, Apple-fiók, az eszközön tárolt emailcímek, telefonszám |
| eszköz típusa, USB-s hardverplatformja, tárhelye, rendszerverziója                        | fotók, üzenetek, névjegyek, fájlok                                |
| az Apple-fiók kijelentkezési állapota (az eladó adja meg)                                 | appok és Safari tabok tartalma, böngészési előzmények             |
| Macen: Aktiválási zár állapota, céges felügyelet igen/nem                                 | IMEI, eszköznév, helyadat, Wi-Fi hálózatok, MAC-címek, UDID       |
| teljes serial a USB-adatokkal együtt; a Mac webes riportjában a megosztás választható     |                                                                   |
| opcionálisan megadott emailcím, csak az összesített eladói riport egyszeri kézbesítéséhez | emailcím automatikus kiolvasása az eszközről                      |
| Safari-megnyitásnál átmeneti app/tab metaadat: cím és URL, nem kerül a riportba           | Safari tab tartalma, cookie-k                                     |

A USB-reader a kiolvasás előtt kéri a meghívókódot és a tesztadatok Sheetbe mentéséhez a beleegyezést. A kiolvasás után a backend a vásárló private Sheetjébe menti az USB-adatokat, a vásárlónak nem küld emailt. Nincs clipboard-másolás vagy adatbeillesztés. Az USB-mentés után a reader felajánlja az opcionális akkumulátor-terheléstesztet (1080p 60fps videólejátszás mellett, megadható perccel és másodperces mintavételi intervallummal, alapértelmezetten 5 perc / 1 mp): a mérések kötegelve az `Akku mérés` munkalapra, az összesítő pedig a `Tesztlépések` USB-szekciójába és a végső riportba kerül. Az eladandó eszközön a beleegyezés után a webes tesztek lépéseit és rész-eredményeit folyamatosan mentjük a Sheetbe; a végén az előnézet jóváhagyása és a **Teszt befejezése** után készül el és jelenik meg az összesített riport.

Az induláskor egyszer kérhető eladói emailriport: iPad/iPhone esetén a reader elején, Mac esetén a böngészős tesztindításnál adható meg egy opcionális cím. A címet csak a küldésig tartjuk memóriában (a futó readerben vagy a Mac böngészőlapjában); nem írjuk Sheetbe, ScriptProperties-be, CacheService-be, alkalmazáslogba vagy browser storage-ba, és nem kerül a riportba vagy URL-be. A végén egyetlen összesített (vagy megszakadás esetén befejezetlen) riport megy az eladónak. A levelezőszolgáltató a kézbesítéshez és a saját levelezési naplóihoz szükségszerűen kezeli a címzettet.

### Hogyan ellenőrizheted?

- [web/parse.js](web/parse.js): a kiolvasók. Csak előre felsorolt mezőket olvasnak, minden más adat figyelmen kívül marad. Itt készül a sorozatszám lenyomata és a riport szerkezete is.
- [web/seller.js](web/seller.js): a varázsló. Hálózati kérés kizárólag a `send()` függvényen keresztül megy ki, az eladó beleegyezése után. A fájl az [src/web/seller/](src/web/seller/) mappa részeiből épül (egy egyszerű összefűzés, a működésen nem változtat), a kettő együtt van a repóban, és egy teszt őrzi, hogy mindig egyezzenek.
- [web/index.html](web/index.html): az oldal harmadik fél scriptjét nem tölti be, csak a saját fájljait.
- [backend/Code.gs](backend/Code.gs): a fogadó Google Apps Script. Meghívó nélkül semmit nem fogad el, a meghívó állapotát a `Meghívók`, a tesztlépéseket és riportadatokat a `Tesztlépések`, az akkumulátor-terhelésteszt idősoros méréseit pedig az `Akku mérés` munkalapon tárolja, és kérésre a végén egy összesített emailt küld az eladónak.

Az Apps Script telepített változata nem ellenőrizhető kívülről, csak a repóban lévő fájl.

### A sorozatszám kezelése

A USB-kiolvasás tartalmazza a teljes serialt, amelyhez a reader a kiolvasás előtt kér beleegyezést. A teszt végén a backend a mentett USB-adatokat és a webes teszt eredményeit egyetlen összesített riportba fűzi össze. A Mac webes útvonalán továbbra is választható a serial megosztása vagy a lenyomat küldése.

## Hogyan működik?

Két mód van:

1. **Eladói flow** ([web/](web/), [tool/ipad_audit/reader.py](tool/ipad_audit/reader.py), [tool/ipad_audit/battery_test.py](tool/ipad_audit/battery_test.py), [tool/ipad_audit/audit.py](tool/ipad_audit/audit.py)): a weboldal elmondja a menetet. A számítógépen futó USB-reader beleegyezés és opcionális eladói emailcím után elmenti az USB-adatokat a Sheetbe, felajánlja az opcionális akkumulátor-terheléstesztet (1080p 60fps videó mellett, másodperces mintavétellel az `Akku mérés` munkalapra), majd megpróbálja az audit oldalt az iPaden/iPhone-on megnyitni (vagy kiírja a `#KÓD.SESSION` folytatólinket), és nyitva maradva követi a webes teszt lépéseit. A webes tesztek végén az összesített riport a Sheetbe kerül, és ha az eladó az elején kérte, a reader kiváltja az egyszeri összesített email küldését. A Mac útvonal továbbra is csak olvasó Terminal-parancsot használ.
2. **Átvételi program** ([tool/](tool/), [web/receiver/](web/receiver/)): a vásárló számítógépén fut, USB-n olvassa ki az iPad adatait (`pymobiledevice3`). Ez a vásárló saját gépén végzett ellenőrzés, de nem kriptográfiai bizonyíték az adatok vagy az alkatrészek eredetére.

Hiányzó USB-mező vagy nem elvégezhető webes teszt ismeretlen/nem tesztelt eredményt kap, nem hardverhibát. A seller gépéről származó adat nem kriptográfiai bizonyíték.

Adatút: USB-reader és az eladandó eszköz böngészője -> Google Apps Script (`Meghívók` és `Tesztlépések` munkalapok); a végén összesített riport és – ha az eladó az induláskor kérte – egyetlen eladói email. Bizonytalan emailküldést a backend nem ismétel meg automatikusan.

A napi emailkeret 20 levél (`DAILY_MAILS`).

A Safari-megnyitási próba Web Inspectort igényel, nem Remote Automationt. A program nem kapcsolja be ezt a beállítást. A könyvtár átmenetileg megkapja az inspectálható appok és tabok metaadatait, de nem mentjük vagy küldjük el őket, és nem kérünk le oldaltartalmat, cookie-t vagy előzményt. Navigáció csak saját audit oldalon vagy üres Safari tabon történik. A próba időkorlátos; az iOS 9-es működés valódi eszközön még ellenőrizendő. Ennek hiánya nem akadályozza a reader által kiírt folytatólink használatát.

## Állapot

- Az átvételi program akkumulátor-riportjában az `OriginalBattery` rendszerlogjelzés nem igazolja az akkumulátor eredetiségét, a csere tényét vagy a szerviz hivatalosságát. Hiányzó jelzésnél az eredet ismeretlen. Az akkumulátor gyártója és a szervizelőzmény jelenleg nem ellenőrzött.
- A varázsló iPad-fájl kiolvasója feltételezett mezőnevekre épül (`Last_Value_CycleCount`, `MaximumCapacityPercent`), valódi fájllal még ellenőrizendő.
- A Mac-parancs `system_profiler` kulcsnevei valódi Macen még ellenőrizendők.
- A böngészős hardverteszt (érintés, mozgás, hang, kamera, kijelző) benne van a varázslóban, valódi eszközön az érintés, kamera és mikrofon még ellenőrizendő. A gombok és a fejhallgató-aljzat tesztje még nincs meg.
- A seller flow USB-riportja és webes tesztriportja külön küldhető ugyanazzal a meghívóval. A korábbi flow-galéria az előző, egy-riportos menet katalógusa; az új flow integrációs tesztje külön fut.
- A varázsló a Safari 9.1-et (iOS 9.3.5) és az újabbakat célozza, ezért csak ES5-öt használ, `fetch` és `TextEncoder` nélkül. Az iOS 9.3.5 menünevei valódi iPaden ellenőrizve vannak, a többi rendszeré az Apple magyar oldalairól és útmutatókból származik, valódi eszközön még ellenőrizendők.

## Fejlesztés

A varázsló kódját az [src/web/seller/](src/web/seller/) részfájljaiban szerkeszd, utána futtasd az összefűzést (a web/seller.js ebből készül, a teszt hibát jelez, ha elfelejted):

```
npm run build:web
```

Az összes egységteszt (kiolvasók, backend, dokumentáció, és egy védőháló, ami az iOS 9-es Safari miatt tiltja a modern szintaxist a web/ mappában) egy paranccsal fut:

```
npm test
```

Ezt a GitLab és a GitHub is lefuttatja minden push után, a GitLab Pages csak zöld teszt után frissül.

A böngészős kiolvasók tesztje:

```
node --test tests/seller_parse.test.js
```

Az alábbi parancsok Linuxon használhatók. A Python-programok a projekt `.venv` környezetét és a [requirements.txt](requirements.txt) függőségeit igénylik.

A webes oldal indítása:

```bash
npm start
```

Az USB-reader indítása: a meghívókód, a beleegyezés és az opcionális eladói emailcím után kiolvas, a backenddel elmenteti a USB-adatokat a Sheetbe, majd megpróbálja az eszköz Safariját az audit oldalra irányítani. A webes teszteket az eladandó eszközön folytasd. Sikertelen Safari-nyitásnál a program elválasztóvonalak között, kiemelt címmel és önálló sorban írja ki a `#KÓD.SESSION` folytatólinket, majd nyitva marad, követi a webes teszt lépéseit, és a végén – ha az eladó kérte – kiváltja az összesített email küldését. A reader nem nyit számítógépes böngészőt, és nem indít helyi webszervert.

```bash
npm run usb
```

A végponttól végpontig tartó integrációs teszt mock backenddel fut, valódi email nélkül. A projekt Python-környezete és Google Chrome szükséges hozzá:

```bash
npm run test:integration
```

Az átvételi program indítása (valódi meghívókódot kér, a backendhez kapcsolódik, és a végén elküldi a riportot):

```bash
npm run audit
```

A webes oldal közvetlenül a scriptből is indítható:

```
scripts/serve.sh
```

Ezután a `http://localhost:8766/` címen nyílik meg az oldal. A port mindig 8766, a script kiírja az iPadhez használható címet is. A meghívókód mezőbe a `DEMO` szót írva próbaüzem indul: a Küldés gomb nem küld el semmit, hanem megmutatja, mi ment volna el. Az eladó a sima címet nyitja meg, és a 9 számjegyű meghívókódot a nyitóoldalon írja be. A címhez fűzött `#KÓD` csak előtölti a mezőt. A `#DEMO` oldalon felül egy lista van minden képernyőre és állapotra (iPad iOS 9-től 17-ig, számítógép USB-vel, Mac, minden előnézet és végeredmény), egy kattintással odaugrik. Mélylink is használható, például `#DEMO-ios9-review-log`. Ezek csak a `#DEMO` címen léteznek, éles meghívókódnál semmi hatásuk.

A teljes folyamat Mermaid diagramokkal és a végigjárt forgatókönyvekkel: [docs/flows.md](docs/flows.md). A forgatókönyvek Playwright tesztek, `npm install` után az `npm run flows` lefuttatja őket, és lépésenkénti képernyőkép-galériát épít a `flows-out/index.html` fájlba.

A Python rész függőségei: [requirements.txt](requirements.txt). A tesztek: [tests/test_core.py](tests/test_core.py).

## Telepítés

1. Hozz létre egy Google Táblát, nyisd meg a Bővítmények > Apps Script menüt, és másold be a [backend/Code.gs](backend/Code.gs) és a [backend/appsscript.json](backend/appsscript.json) tartalmát.
2. Telepítsd webalkalmazásként (futtatás: te, hozzáférés: bárki). A kapott `/exec` címet írd be a [web/config.js](web/config.js) és a [tool/ipad_audit/config.py](tool/ipad_audit/config.py) fájlba.
3. A Tábla "iPad audit" menüjének "Új meghívó" pontja 72 órás kódot ad, amely egy USB-riportot és egy webes tesztriportot enged, valamint egy kész üzenetet a teljes linkkel (a kód benne van, az eladónak nem kell gépelnie). A link a Tábla "Link" oszlopába is bekerül. A link alapja a [backend/Code.gs](backend/Code.gs) elején lévő SITE_URL, ezt írd át a saját címedre.
4. A [.gitlab-ci.yml](.gitlab-ci.yml) a `web/` mappát GitLab Pagesre publikálja.

Backend-módosítás után az Apps Scriptben új deployment-verziót kell publikálni. A helyi fájl átírása vagy az editorban történő mentés nem frissíti a működő web appot. A Deploy > Manage deployments > Edit > New version útvonalon frissítsd a meglévő deploymentet, hogy az endpoint címe megmaradjon, és a korábbi verzió visszaállítható legyen. A két-riportos flow az új report műveletet igényli; a régi deployment erre ismeretlen műveletet válaszol.

Mentés után az editor függvénylistájából futtasd az emailküldés nélküli checket:

```text
checkDeployment
```

A check a meghívók Sheetjének és a címzettnek az elérhetőségét, valamint a MailApp fennmaradó keretét jelzi. Nem készít meghívót és nem küld emailt. A tényleges kézbesítést külön tesztmeghívóval és kitalált adatokkal ellenőrizd a címzett mailboxában.

A `/exec` cím nem titok, a védelmet a meghívókód és a napi levélkorlát adja.

## Biztonsági bejelentés

Ha hibát vagy adatvédelmi problémát találsz, nyiss egy bizalmas (confidential) issue-t a GitLab repóban.

## Licenc

[MIT](LICENSE)
