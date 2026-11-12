# iPad és Mac állapot-ellenőrzés

**Magyar** | [English](README.en.md)

Használt iPad, iPhone és Mac vásárlásához készült ellenőrző eszköz. Az iPad/iPhone eladó először lefuttatja a USB-readert, majd az eladandó eszközön elvégzi a webes teszteket. Ugyanahhoz a meghívóhoz két külön email tartozik: a USB-adatok és a webes tesztek riportja.

A kód nyilvános, hogy az eladó (és bárki) megnézhesse, pontosan mit olvas ki az oldal, és mit küld el.

**Példa riport:** [docs/example-report.md](docs/example-report.md). Kitalált adatokkal készült, ugyanabból a kódból, mint az éles riport, és egy teszt őrzi, hogy mindig megegyezzen vele.

## Eladóknak: mit olvas ki az oldal?

| Kiolvassuk                                                                                 | Soha nem olvassuk                                           |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| akkumulátor ciklusszáma és maximális kapacitása                                            | jelszavak, Apple-fiók, e-mail cím, telefonszám              |
| eszköz típusa, USB-s hardverplatformja, tárhelye, rendszerverziója                         | fotók, üzenetek, névjegyek, fájlok                          |
| az Apple-fiók kijelentkezési állapota (az eladó adja meg)                                  | telepített alkalmazások, böngészési adatok                  |
| Macen: Aktiválási zár állapota, céges felügyelet igen/nem                                  | IMEI, eszköznév, helyadat, Wi-Fi hálózatok, MAC-címek, UDID |
| teljes serial a USB-riportban; a Mac webes riportjában a megosztás továbbra is választható |                                                             |

A USB-reader a kiolvasás előtt kéri a meghívókódot és az automatikus küldéshez a beleegyezést. A kiolvasás után a backend azonnal emailben küldi a felsorolt adatokat. Nincs clipboard-másolás vagy adatbeillesztés. A webes tesztek külön riportja csak az előnézet jóváhagyása és a **Küldés** után megy el. Az oldal megmutatja az elküldött webes riportot is.

### Hogyan ellenőrizheted?

- [web/parse.js](web/parse.js): a kiolvasók. Csak előre felsorolt mezőket olvasnak, minden más adat figyelmen kívül marad. Itt készül a sorozatszám lenyomata és a riport szerkezete is.
- [web/seller.js](web/seller.js): a varázsló. Hálózati kérés kizárólag a `send()` függvényben van, a Küldés gomb után. A fájl az [src/web/seller/](src/web/seller/) mappa részeiből épül (egy egyszerű összefűzés, a működésen nem változtat), a kettő együtt van a repóban, és egy teszt őrzi, hogy mindig egyezzenek.
- [web/index.html](web/index.html): az oldal harmadik fél scriptjét nem tölti be, csak a saját fájljait.
- [backend/Code.gs](backend/Code.gs): a fogadó Google Apps Script. Meghívó nélkül semmit nem fogad el, a Táblában csak kódot, címkét, lejáratot és állapotot tárol, az eredményt emailben küldi.

Az Apps Script telepített változata nem ellenőrizhető kívülről, csak a repóban lévő fájl.

### A sorozatszám kezelése

A USB-riport tartalmazza a teljes serialt, a levél tárgyában is. Ehhez a reader a kiolvasás előtt kér beleegyezést. A külön iPad/iPhone webes riport nem ismétli meg a USB-adatokat; a meghívó címkéje kapcsolja össze a két emailt. A Mac webes útvonalán továbbra is választható a serial megosztása vagy a lenyomat küldése.

## Hogyan működik?

Két mód van:

1. **Eladói flow** ([web/](web/), [tool/ipad_audit/reader.py](tool/ipad_audit/reader.py)): a weboldal elmondja a menetet. A számítógépen futó USB-reader beleegyezés után automatikusan elküldi az első riportot, majd megnyitja az oldalt. Az eladó az iPaden/iPhone-on visszatér az eredeti oldalra, folytatja a webes teszteket, és a végén külön riportot küld. A számítógép böngészője nem teszteli az iPad hardverét. A Mac útvonal továbbra is csak olvasó Terminal-parancsot használ.
2. **Átvételi program** ([tool/](tool/), [web/receiver/](web/receiver/)): a vásárló számítógépén fut, USB-n olvassa ki az iPad adatait (`pymobiledevice3`). Ez a vásárló saját gépén végzett ellenőrzés, de nem kriptográfiai bizonyíték az adatok vagy az alkatrészek eredetére.

Hiányzó USB-mező vagy nem elvégezhető webes teszt ismeretlen/nem tesztelt eredményt kap, nem hardverhibát. A seller gépéről származó adat nem kriptográfiai bizonyíték.

Adatút: USB-reader, Google Apps Script, első email; majd az eladandó eszköz böngészője, Google Apps Script, második email. A backend címzettje a deployment tulajdonosa. A backend tartósan csak a küldési állapotot tárolja, a riport tartalmát nem. Bizonytalan emailküldést nem ismétel meg automatikusan.

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

Az USB-reader indítása: a meghívókód és a beleegyezés után kiolvas, a backenddel elküldeti a USB-emailt, majd helyi weboldalt nyit a visszaigazolással. A webes teszteket az eladandó eszközön folytasd.

```bash
npm run usb
```

A két-riportos integrációs teszt mock backenddel fut, valódi email nélkül. A projekt Python-környezete és Google Chrome szükséges hozzá:

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
