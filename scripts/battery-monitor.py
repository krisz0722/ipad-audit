#!/usr/bin/env python3
"""Ultra-könnyű, dedikált akkumulátor és hőmérséklet-figyelő iPadhez profil-kiértékeléssel.

Kizárólag az AppleARMPMUCharger IORegistry bejegyzést kérdezi le a megadott időközönként.
Semmilyen háttérbeli syslog streamelést (OsTraceService), gombfigyelést vagy audio
lekérdezést nem végez, így 0% járulékos terhelést ró az iPad processzorára és USB vezérlőjére.
"""
import argparse
import asyncio
import csv
import datetime
import os
import sys
import time

from pymobiledevice3.exceptions import (
    ConnectionFailedError,
    NoDeviceConnectedError,
    PairingDialogResponsePendingError,
    PasswordRequiredError,
    UserDeniedPairingError,
)
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.diagnostics import DiagnosticsService

PROFILES = {
    "youtube60": {
        "id": "1",
        "name": "1080p 60fps videó (YouTube / szoftveres CPU stressz)",
        "description": "Nagy fényerő, szoftveres VP9 CPU dekódolás (A8X maximális terhelés)",
        "instructions": (
            "1. Nyisd meg a YouTube-ot az iPaden egy 1080p 60fps videóval.\n"
            "2. Állítsd a kijelző fényerejét maximumra (100%).\n"
            "3. Indítsd el a videó lejátszását."
        ),
        "expected_temp_max": 41.0,
        "expected_current_min": -1450,
        "expected_current_max": -1000,
        "advice_pass": "A processzor és a hűtés stabilan elviselte a maximális szoftveres CPU terhelést.",
        "advice_warn": "A hőmérséklet vagy áramfelvétel kissé magasabb a vártnál, de a hardver elviselte.",
        "advice_fail": "A hőmérséklet átlépte a 41.0 °C-ot, fennáll a thermal throttling vagy túlmelegedés kockázata.",
    },
    "mp4": {
        "id": "2",
        "name": "Normál helyi MP4 videó (H.264 hardveres dekódolás)",
        "description": "50% fényerő, hardveres VPU gyorsítás, alacsony processzorterhelés",
        "instructions": (
            "1. Nyiss meg egy kamerával felvett vagy letöltött MP4 videót a Fotók appban.\n"
            "2. Állítsd a kijelző fényerejét kb. 50%-ra.\n"
            "3. Indítsd el a videó lejátszását."
        ),
        "expected_temp_max": 32.5,
        "expected_current_min": -850,
        "expected_current_max": -300,
        "advice_pass": "A hardveres videódekóder és a hűtés hibátlanul működik, a processzor hideg maradt.",
        "advice_warn": "A hőmérséklet 32.5 °C fölé emelkedett; ellenőrizd a háttérben futó egyéb appokat.",
        "advice_fail": "Váratlanul magas melegedés normál hardveres videónál!",
    },
    "idle": {
        "id": "3",
        "name": "Üresjárat / Készenlét (Nyugalmi állapot)",
        "description": "Bekapcsolt kijelző közepes fényerőn, semmilyen alkalmazás nem fut",
        "instructions": (
            "1. Zárj be minden alkalmazást az alkalmazásváltóban.\n"
            "2. Hagyd az iPadet a Főképernyőn közepes fényerőn, ne érj hozzá."
        ),
        "expected_temp_max": 28.5,
        "expected_current_min": -450,
        "expected_current_max": -100,
        "advice_pass": "A nyugalmi áramfelvétel és a hőmérséklet normális, nincs belső szivárgási hiba.",
        "advice_warn": "A nyugalmi áramfelvétel enyhén emelkedett, háttérfolyamatok futhatnak.",
        "advice_fail": "Jelentős melegedés vagy magas áramfelvétel üresjáratban (belső szivárgás gyanúja)!",
    },
    "custom": {
        "id": "4",
        "name": "Egyéni / Szabad mérés (Nincsenek rögzített határok)",
        "description": "Bármilyen tetszőleges feladat (GarageBand, játékok, stb.) mérése",
        "instructions": "Indítsd el a kívánt alkalmazást vagy munkafolyamatot az iPaden.",
        "expected_temp_max": 42.0,
        "expected_current_min": None,
        "expected_current_max": None,
        "advice_pass": "Mérés sikeresen befejeződött a biztonságos hőtartományban.",
        "advice_warn": "A hőmérséklet elérte a 42.0 °C-ot, az iOS thermal throttling léphetett életbe.",
        "advice_fail": "Kritikus hőmérséklet (45 °C felett)!",
    },
}


def choose_profile(profile_arg=None, ask=input):
    """Kiválasztja a profilt argumentumból vagy interaktív menüből."""
    if profile_arg:
        key = profile_arg.strip().lower()
        if key in PROFILES:
            return key
        for p_k, p_v in PROFILES.items():
            if p_v["id"] == key:
                return p_k
        print(f"Ismeretlen profil: '{profile_arg}'. Alapértelmezett 'youtube60' használata.", file=sys.stderr)
        return "youtube60"

    print("\n--- Válassz mérési profilt ---")
    for key, p in PROFILES.items():
        is_def = " [Alapértelmezett, Enter]" if key == "youtube60" else ""
        print(f"  [{p['id']}] {p['name']}{is_def}")
        print(f"      {p['description']}")

    try:
        choice = ask("Választás [1-4, Enter: 1]: ").strip().lower()
    except (EOFError, StopIteration, KeyboardInterrupt):
        return "youtube60"

    if choice in ("", "1", "youtube60"):
        return "youtube60"
    if choice in ("2", "mp4"):
        return "mp4"
    if choice in ("3", "idle"):
        return "idle"
    if choice in ("4", "custom"):
        return "custom"

    return "youtube60"


def parse_sample(bat, elapsed_sec):
    """Kinyeri a szükséges numerikus akkumulátor-értékeket."""
    raw_temp = bat.get("Temperature")
    temp_c = round(raw_temp / 100.0, 1) if isinstance(raw_temp, int) else None

    level = bat.get("CurrentCapacity")
    if not isinstance(level, int):
        level = bat.get("AppleRawCurrentCapacity")

    voltage = bat.get("Voltage")
    voltage_mv = voltage if isinstance(voltage, int) else None

    current = bat.get("InstantAmperage")
    if current is None:
        current = bat.get("Amperage")
    current_ma = current if isinstance(current, int) else None

    charging = bat.get("IsCharging")
    if not isinstance(charging, bool):
        charging = None

    cycles = bat.get("CycleCount")
    cycles_val = cycles if isinstance(cycles, int) else None

    return {
        "elapsed_sec": int(elapsed_sec),
        "timestamp": datetime.datetime.now().strftime("%H:%M:%S"),
        "temp_c": temp_c,
        "level": level,
        "voltage_mv": voltage_mv,
        "current_ma": current_ma,
        "charging": charging,
        "cycles": cycles_val,
    }


def format_row(sample, initial_temp):
    ts = sample["timestamp"]
    elapsed = str(datetime.timedelta(seconds=sample["elapsed_sec"]))

    if sample["temp_c"] is not None:
        temp_str = f"{sample['temp_c']:.1f} °C"
        if initial_temp is not None:
            delta = sample["temp_c"] - initial_temp
            sign = "+" if delta >= 0 else ""
            delta_str = f"{sign}{delta:.1f} °C"
        else:
            delta_str = "  0.0 °C"
    else:
        temp_str = "n/a"
        delta_str = "n/a"

    level_str = f"{sample['level']}%" if sample["level"] is not None else "n/a"
    volt_str = f"{sample['voltage_mv']} mV" if sample["voltage_mv"] is not None else "n/a"
    curr_str = f"{sample['current_ma']:+d} mA" if sample["current_ma"] is not None else "n/a"
    chg_str = "igen" if sample["charging"] is True else ("nem" if sample["charging"] is False else "n/a")

    return f"{ts} ({elapsed}) | {temp_str:>8} ({delta_str:>8}) | {level_str:>5} | {volt_str:>8} | {curr_str:>9} | töltés: {chg_str}"


def evaluate_profile(samples, profile_key):
    """Kiértékeli a mért eredményeket a kiválasztott profil elvárásai szerint."""
    profile = PROFILES.get(profile_key, PROFILES["custom"])
    if not samples:
        return {"status": "NODATA", "title": profile["name"], "message": "Nincs elegendő adat az értékeléshez."}

    temps = [s["temp_c"] for s in samples if s["temp_c"] is not None]
    currents = [s["current_ma"] for s in samples if s["current_ma"] is not None]

    t_max = max(temps) if temps else None
    avg_curr = round(sum(currents) / len(currents)) if currents else None

    status = "PASS"
    reasons = []

    exp_temp = profile.get("expected_temp_max")
    if exp_temp is not None and t_max is not None:
        if t_max > exp_temp + 2.0:
            status = "FAIL"
            reasons.append(f"A csúcshőmérséklet ({t_max:.1f} °C) jóval meghaladta a limitet (max. {exp_temp:.1f} °C).")
        elif t_max > exp_temp:
            if status != "FAIL":
                status = "WARN"
            reasons.append(f"A csúcshőmérséklet ({t_max:.1f} °C) kissé a megadott limit (max. {exp_temp:.1f} °C) felett volt.")
        else:
            reasons.append(f"A csúcshőmérséklet ({t_max:.1f} °C) a megengedett határon (max. {exp_temp:.1f} °C) belül maradt.")

    exp_curr_min = profile.get("expected_current_min")
    exp_curr_max = profile.get("expected_current_max")
    if avg_curr is not None and avg_curr > 0:
        reasons.append(
            f"Az átlagos áram ({avg_curr:+d} mA) pozitív volt: az iPad nettó töltés alatt állt, "
            "ezért az áramfelvétel nem értékelhető."
        )
    elif exp_curr_min is not None and avg_curr is not None:
        if avg_curr < exp_curr_min - 250:
            if status != "FAIL":
                status = "WARN"
            reasons.append(f"Az átlagos áramfelvétel ({avg_curr:+d} mA) meghaladta a várt értéket ({exp_curr_min} mA).")
        elif exp_curr_max is not None and avg_curr > exp_curr_max + 250:
            reasons.append(
                f"Az átlagos áramfelvétel ({avg_curr:+d} mA) kisebb volt a vártnál ({exp_curr_max} mA): "
                "a terhelés valószínűleg nem a profil szerinti volt."
            )
        else:
            reasons.append(f"Az átlagos áramfelvétel ({avg_curr:+d} mA) a várt tartományban volt.")

    if status == "PASS":
        summary_text = profile["advice_pass"]
    elif status == "WARN":
        summary_text = profile["advice_warn"]
    else:
        summary_text = profile["advice_fail"]

    return {
        "status": status,
        "title": profile["name"],
        "t_max": t_max,
        "avg_curr": avg_curr,
        "reasons": reasons,
        "summary": summary_text,
    }


def print_summary(samples, profile_key="youtube60"):
    if not samples:
        print("\nNem érkezett érvényes minta.")
        return

    temps = [s["temp_c"] for s in samples if s["temp_c"] is not None]
    levels = [s["level"] for s in samples if s["level"] is not None]
    volts = [s["voltage_mv"] for s in samples if s["voltage_mv"] is not None]
    currents = [s["current_ma"] for s in samples if s["current_ma"] is not None]

    duration = str(datetime.timedelta(seconds=samples[-1]["elapsed_sec"]))
    print("\n" + "=" * 72)
    print("  AKKUMULÁTOR HŐMÉRSÉKLET-FIGYELÉS ÖSSZEFOGLALÓ")
    print("=" * 72)
    print(f"  Mérés időtartama:    {duration} ({len(samples)} minta)")

    if temps:
        t_start = temps[0]
        t_end = temps[-1]
        t_max = max(temps)
        t_min = min(temps)
        delta = t_end - t_start
        sign = "+" if delta >= 0 else ""
        print(f"  Hőmérséklet:         {t_start:.1f} °C -> {t_end:.1f} °C (változás: {sign}{delta:.1f} °C)")
        print(f"  Csúcsérték:          {t_max:.1f} °C (minimum: {t_min:.1f} °C)")

    if levels:
        drop = levels[0] - levels[-1]
        print(f"  Töltöttség:          {levels[0]}% -> {levels[-1]}% (merülés: {drop}%)")

    if volts:
        print(f"  Feszültség:          {min(volts)} mV - {max(volts)} mV (ingadozás: {max(volts) - min(volts)} mV)")

    if currents:
        avg_curr = round(sum(currents) / len(currents))
        print(f"  Átlagos áram:        {avg_curr:+d} mA (min: {min(currents):+d} mA, max: {max(currents):+d} mA)")

    eval_result = evaluate_profile(samples, profile_key)
    print("-" * 72)
    print(f"  PROFIL ÉRTÉKELÉS:    {eval_result['title']}")
    status_label = f"[{eval_result['status']}]"
    print(f"  Eredmény:            {status_label}")
    for reason in eval_result.get("reasons", []):
        print(f"    - {reason}")
    print(f"  Értékelés:           {eval_result['summary']}")
    print("=" * 72)


async def connect_device(notify=print):
    notify("Csatlakozás az iPadhez USB-n keresztül...")
    for attempt in range(60):
        try:
            lockdown = await create_using_usbmux(autopair=True)
            notify(f"Eszköz csatlakoztatva: {lockdown.product_type} (iOS {lockdown.product_version})")
            return lockdown
        except (NoDeviceConnectedError, ConnectionFailedError):
            if attempt == 0 or attempt % 6 == 0:
                notify("Várakozás az iPad csatlakoztatására adatkábellel...")
        except (PairingDialogResponsePendingError, PasswordRequiredError):
            notify("Koppints a 'Megbízom' gombra az iPad kijelzőjén...")
        except UserDeniedPairingError:
            notify("A párosítás elutasítva. Húzd ki és dugd vissza az iPadet.")
        await asyncio.sleep(1.5)
    raise TimeoutError("Az iPad nem csatlakozott időben.")


async def run_monitor(args):
    profile_key = choose_profile(args.profile)
    profile = PROFILES[profile_key]

    print("\n" + "=" * 72)
    print(f"  KIVÁLASZTOTT PROFIL: {profile['name']}")
    print("=" * 72)
    print(f"  Leírás:   {profile['description']}")
    if profile.get("expected_temp_max"):
        print(f"  Elvárás:  Max. {profile['expected_temp_max']:.1f} °C, áramfelvétel: {profile.get('expected_current_min')} - {profile.get('expected_current_max')} mA")
    print(f"\nTeendők az iPaden:\n{profile['instructions']}")
    print("=" * 72)

    lockdown = await connect_device()
    samples = []
    initial_temp = None
    started_at = time.monotonic()
    max_seconds = int(args.minutes * 60) if args.minutes else None

    csv_writer = None
    csv_file = None
    if args.csv:
        csv_file = open(args.csv, "w", newline="", encoding="utf-8")
        fieldnames = ["elapsed_sec", "timestamp", "temp_c", "level", "voltage_mv", "current_ma", "charging", "cycles"]
        csv_writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
        csv_writer.writeheader()

    header = "Idő (Eltelt)        | Hőmérséklet (Változás) | Szint | Feszültség |   Áram    | Töltés"
    print("\n" + header)
    print("-" * len(header))

    try:
        async with DiagnosticsService(lockdown=lockdown) as diag:
            while True:
                now = time.monotonic()
                elapsed = now - started_at
                if max_seconds and elapsed >= max_seconds:
                    print(f"\nAz előre beállított időtartam ({args.minutes} perc) letelt.")
                    break

                try:
                    bat = await diag.ioregistry(name="AppleARMPMUCharger") or {}
                    if not bat:
                        bat = await diag.ioregistry(name="AppleSmartBattery") or {}
                except Exception as err:
                    print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] Olvasási hiba: {err}")
                    await asyncio.sleep(args.interval)
                    continue

                sample = parse_sample(bat, elapsed)
                if initial_temp is None and sample["temp_c"] is not None:
                    initial_temp = sample["temp_c"]

                samples.append(sample)
                print(format_row(sample, initial_temp))
                sys.stdout.flush()

                if csv_writer:
                    csv_writer.writerow(sample)
                    csv_file.flush()

                await asyncio.sleep(args.interval)

    except (KeyboardInterrupt, asyncio.CancelledError):
        print("\n\nMérés leállítva a felhasználó által.")
    finally:
        if csv_file:
            csv_file.close()
        print_summary(samples, profile_key=profile_key)


def main():
    parser = argparse.ArgumentParser(description="Dedikált, ultra-alacsony terhelésű iPad akkumulátor és hőmérséklet-figyelő")
    parser.add_argument("--profile", "-p", choices=list(PROFILES.keys()) + ["1", "2", "3", "4"], default=None, help="Mérési profil kiválasztása (alapértelmezett: youtube60)")
    parser.add_argument("--interval", "-i", type=float, default=5.0, help="Mintavételi intervallum másodpercben (alapértelmezett: 5.0 mp)")
    parser.add_argument("--minutes", "-m", type=float, default=None, help="Mérési időtartam korlát percben (alapértelmezett: végtelen, Ctrl+C-ig)")
    parser.add_argument("--csv", "-o", default=None, help="Eredmények mentése CSV fájlba")
    args = parser.parse_args()

    try:
        asyncio.run(run_monitor(args))
    except (KeyboardInterrupt, TimeoutError) as err:
        print(f"\n{err}")


if __name__ == "__main__":
    main()
