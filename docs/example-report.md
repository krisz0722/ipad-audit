# Példa riport

Ez egy **kitalált példa**: így néz ki az a riport, amit a vásárló kap, és amit az eladó a küldés előtt az előnézetben lát. Az adatok nem valódi eszközről valók.

A fájl a `web/example.js` adataiból készül a `scripts/make-example.js` szkripttel, ugyanazzal a függvénnyel (`buildSections`), amit az oldal is használ, és egy teszt őrzi, hogy mindig megegyezzen vele.

## Összegzés a vevőnek

| Adat | Érték | Forrás |
|---|---|---|
| Akkumulátor | ✅ a rendszerből kiolvasott érték, nehezen hamisítható |  |
| Modell | ℹ️ a sorozatszámmal az Apple lefedettség-ellenőrzőjén megnézhető: https://checkcoverage.apple.com/ |  |
| Aktiválási zár | ✅ kikapcsolva, az eszközből kiolvasva |  |
| Hardver (mért tesztek) | ✅ 5 rendben |  |

## Eszköz

| Adat | Érték | Forrás |
|---|---|---|
| Típus | ℹ️ iPad / iPhone | választotta |
| Modell | ℹ️ iPad Air 2 (példa) (iPad5,4) | USB-ből |
| Tárhely | ℹ️ 64 GB | USB-ből |
| Rendszerverzió | ℹ️ 15.8 | USB-ből |
| Sorozatszám | ℹ️ PELDA0000001 | az eladó jóváhagyta |

## Akkumulátor

| Adat | Érték | Forrás |
|---|---|---|
| Ciklusszám | ℹ️ 245 | USB-ből |
| Maximális kapacitás | ℹ️ 85% | USB-ből |

## Zárak és felügyelet

| Adat | Érték | Forrás |
|---|---|---|
| Apple-fiók (az eladó szerint) | ✅ kijelentkezett, a Keresés kikapcsolva | beírta |
| Aktiválási zár | ✅ kikapcsolva | USB-ből |

## Hardverteszt

| Adat | Érték | Forrás |
|---|---|---|
| Érintőképernyő | ✅ mind a 96 mező érzékelt, két ujjal is | mért |
| Mozgásérzékelők | ✅ mért mozgás: 14 és 12 m/s² tartomány, 87 °/s forgás | mért |
| Hangszóró és mikrofon | ✅ bal csatorna 4 / 4, jobb csatorna 4 / 4 hang hallatszott | mért |
| Hátlapi kamera | ✅ élő kép érkezik | mért |
| Előlapi kamera | ✅ élő kép érkezik | mért |
| Kijelző színei | ✅ az eladó nem látott hibát | bemondás |

## Az adatok jellege

| Adat | Érték | Forrás |
|---|---|---|
| Forrás | ℹ️ Az eladó a saját eszközén gyűjtötte egy böngészős varázslóval. Az összegzés mutatja, melyik adat olvasható ki a rendszerből, és melyik az eladó bevallása. |  |

