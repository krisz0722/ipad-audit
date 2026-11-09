# iPad és Mac állapot-ellenőrzés

**Magyar** | [English](README.en.md)

Használt iPad, iPhone és Mac vásárlásához készült ellenőrző eszköz. A vásárló egyszer használható linket küld az eladónak, az eladó a saját eszközén végigmegy egy varázslón, és az eredmény egyetlen emailben megy a vásárlónak.

A kód nyilvános, hogy az eladó (és bárki) megnézhesse, pontosan mit olvas ki az oldal, és mit küld el.

## Eladóknak: mit olvas ki az oldal?

| Kiolvassuk | Soha nem olvassuk |
|---|---|
| akkumulátor ciklusszáma és maximális kapacitása | jelszavak, Apple-fiók, e-mail cím, telefonszám |
| eszköz típusa, tárhelye, rendszerverziója | fotók, üzenetek, névjegyek, fájlok |
| az Apple-fiók kijelentkezési állapota (az eladó adja meg) | telepített alkalmazások, böngészési adatok |
| Macen: Aktiválási zár állapota, céges felügyelet igen/nem | IMEI, eszköznév, helyadat, Wi-Fi hálózatok, MAC-címek, UDID |
| a sorozatszám (a vásárló ezzel ellenőrzi az Apple-nél a modellt; az előnézetben kikapcsolhatod, akkor csak a lenyomata és az utolsó 4 karaktere megy el) | |

Az eladó minden adatot előbb lát egy előnézetben, és csak a **Küldés** gomb megnyomása után megy el bármi. Az előnézet ugyanabból a függvényből épül, mint az elküldött tartalom, ezért a kettő nem térhet el.

### Hogyan ellenőrizheted?

- [web/parse.js](web/parse.js): a kiolvasók. Csak előre felsorolt mezőket olvasnak, minden más adat figyelmen kívül marad. Itt készül a sorozatszám lenyomata és a riport szerkezete is.
- [web/seller.js](web/seller.js): a varázsló. Hálózati kérés kizárólag a `send()` függvényben van, a Küldés gomb után.
- [web/index.html](web/index.html): az oldal harmadik fél scriptjét nem tölti be, csak a saját fájljait.
- [backend/Code.gs](backend/Code.gs): a fogadó Google Apps Script. Meghívó nélkül semmit nem fogad el, a Táblában csak kódot, címkét, lejáratot és állapotot tárol, az eredményt emailben küldi.

Az Apps Script telepített változata nem ellenőrizhető kívülről, csak a repóban lévő fájl.

### A sorozatszám kezelése

A sorozatszám alapból elmegy a vásárlónak, hogy az Apple lefedettség-ellenőrzőjén ellenőrizhesse a modellt. Az eladó az előnézetben látja, és kikapcsolhatja. Ilyenkor csak a `SHA-256(meghívókód + ":" + sorozatszám)` első 16 karaktere és a sorozatszám utolsó 4 karaktere megy el. A meghívókód csak az eladónál és a vásárlónál van meg, a levélből ezért a sorozatszám nem fejthető vissza. Amikor az eszköz megérkezik, a vásárló kiszámolhatja ugyanezt a kapott készülék sorozatszámából, és így ellenőrizheti, hogy ugyanaz az eszköz érkezett-e meg. A levél tárgyában a sorozatszám sosem szerepel, csak a lenyomat.

## Hogyan működik?

Két mód van:

1. **Eladói varázsló** ([web/](web/)): böngészőben fut, telepítés nélkül. A Mac-nál az eladó egy csak olvasó Terminál-parancs kimenetét illeszti be, iPaden/iPhone-on az akkuadatot a Beállításokból vagy a rendszer analitikai fájljából adja meg. Az adatok az eladó saját bevallásán alapulnak, ezért **nem hitelesített mérésnek** számítanak.
2. **Átvételi program** ([tool/](tool/), [web/receiver/](web/receiver/)): a vásárló számítógépén fut, USB-n olvassa ki az iPad adatait (`pymobiledevice3`). Ez a hitelesített mérés, mert az adatot a készülék adja, nem az eladó böngészője.

Az oldal az eladót semmire nem kéri, hogy bekapcsoljon az eszközén, és semmit nem küld az Apple-nek. Ha az eszközön nincs az akkumulátor adatát tartalmazó napló, az eladó ezt egy gombbal jelzi, és a riportban az akku adata "USB-s méréssel pótlandó" jelölést kap: ilyenkor az eladó a saját számítógépére kötve méri meg az eszközt.

Adatút az eladói módban: böngésző, Google Apps Script, email a vásárlónak.

## Állapot

- A varázsló iPad-fájl kiolvasója feltételezett mezőnevekre épül (`Last_Value_CycleCount`, `MaximumCapacityPercent`), valódi fájllal még ellenőrizendő.
- A Mac-parancs `system_profiler` kulcsnevei valódi Macen még ellenőrizendők.
- A böngészős hardverteszt (kamera, hang, érintés) az eladói varázslóban még nincs benne.
- A varázsló a Safari 9.1-et (iOS 9.3.5) és az újabbakat célozza, ezért csak ES5-öt használ, `fetch` és `TextEncoder` nélkül. Az iOS 9.3.5 menünevei valódi iPaden ellenőrizve vannak, a többi rendszeré az Apple magyar oldalairól és útmutatókból származik, valódi eszközön még ellenőrizendők.

## Fejlesztés

A böngészős kiolvasók tesztje:

```
node --test tests/seller_parse.test.js
```

Helyi kipróbálás:

```
python3 -m http.server 8000 --directory web
```

Ezután a `http://localhost:8000/` címen nyílik meg az oldal. A meghívókód mezőbe a `DEMO` szót írva próbaüzem indul: a Küldés gomb nem küld el semmit, hanem megmutatja, mi ment volna el. Az eladó a sima címet nyitja meg, és a 9 számjegyű meghívókódot a nyitóoldalon írja be. A címhez fűzött `#KÓD` csak előtölti a mezőt.

A Python rész függőségei: [requirements.txt](requirements.txt). A tesztek: [tests/test_core.py](tests/test_core.py).

## Telepítés

1. Hozz létre egy Google Táblát, nyisd meg a Bővítmények > Apps Script menüt, és másold be a [backend/Code.gs](backend/Code.gs) és a [backend/appsscript.json](backend/appsscript.json) tartalmát.
2. Telepítsd webalkalmazásként (futtatás: te, hozzáférés: bárki). A kapott `/exec` címet írd be a [web/config.js](web/config.js) és a [tool/ipad_audit/config.py](tool/ipad_audit/config.py) fájlba.
3. A Tábla "iPad audit" menüjének "Új meghívó" pontja ad egyszer használható, 72 órás kódot.
4. A [.gitlab-ci.yml](.gitlab-ci.yml) a `web/` mappát GitLab Pagesre publikálja.

A `/exec` cím nem titok, a védelmet a meghívókód és a napi levélkorlát adja.

## Biztonsági bejelentés

Ha hibát vagy adatvédelmi problémát találsz, nyiss egy bizalmas (confidential) issue-t a GitLab repóban.

## Licenc

[MIT](LICENSE)
