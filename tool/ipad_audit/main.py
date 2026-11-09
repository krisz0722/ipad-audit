"""Belépési pont: USB-audit, élő teszt, riport küldése."""
import argparse
import asyncio
import logging
import os
import sys
import time
import webbrowser

from ipad_audit import config, device, report
from ipad_audit.backend import Backend, BackendError
from ipad_audit.challenge import Board, serve
from ipad_audit.signals import Signals

TEST_TIMEOUT = 25 * 60
USB_EVENTS = ("home", "lock", "vol_up", "vol_down", "jack_in", "jack_out")

INTRO = """iPad hardver-audit

A program kiolvassa a rádugott iPad hardveradatait, és végigvezet egy rövid teszten.
Az iPaden nem módosít semmit, csak a "Megbízom" párosítás marad rajta.
Elküldött adatok: sorozatszám, akku- és hardverállapot, teszteredmények.
Nem küldi el: UDID, eszköznév, teljes IMEI és MAC, fotó, hangfelvétel.
"""


def camera_result(step, board, signals, flag):
    """Kamera akkor jó, ha friss kódot olvasott, és közben ez az iPad kamerája futott."""
    if step is None:
        return None
    if step.get("skipped"):
        return {"text": "nem sikerült a beolvasás", "status": report.BAD}
    received_at = step.get("_seen_at", time.time())
    issued = board.check(step.get("code"), received_at)
    if issued is None:
        return {"text": "érvénytelen vagy lejárt kód", "status": report.BAD}
    if not signals.flag_seen(flag, issued - 30, received_at + 5):
        return {"text": "a kód jó, de ezen az iPaden nem futott a kamera", "status": report.BAD}
    return {"text": "friss kódot olvasott, a kamera futott ezen az iPaden", "status": report.OK}


async def live_test(lockdown, backend, sid, web_url):
    signals = Signals()
    link = f"{web_url}#{sid}"
    board = Board(link)
    server, local = serve(board)
    tasks = [asyncio.ensure_future(device.watch_syslog(lockdown, signals)),
             asyncio.ensure_future(device.watch_flags(lockdown, signals))]
    print(f"\nA számítógépen megnyílik a kódoldal: {local}")
    print("Hagyd nyitva, és kövesd az iPad képernyőjét.")
    webbrowser.open(local)

    loop = asyncio.get_event_loop()
    sent = set()
    seen = {}
    deadline = time.time() + TEST_TIMEOUT
    try:
        while time.time() < deadline:
            try:
                steps = await loop.run_in_executor(None, backend.steps, sid)
            except BackendError:
                await asyncio.sleep(3)
                continue
            for name, data in steps.items():
                if name not in seen and isinstance(data, dict):
                    data["_seen_at"] = time.time()
                    seen[name] = data
            if "page_open" in seen:
                board.enable_nonces()
            for name in USB_EVENTS:
                if name in signals.events and name not in sent:
                    await loop.run_in_executor(None, backend.step, sid, f"usb_{name}", {"ok": True})
                    sent.add(name)
            if "page_done" in seen:
                break
            await asyncio.sleep(1.5)
        else:
            print("Lejárt a tesztidő, a riport a részeredményekkel készül el.")
    finally:
        for task in tasks:
            task.cancel()
        server.shutdown()

    cameras = {"cam_rear": camera_result(seen.get("cam_rear"), board, signals, "back"),
               "cam_front": camera_result(seen.get("cam_front"), board, signals, "front")}
    return report.live_section(seen, signals, cameras)


async def run(args):
    print(INTRO)
    backend = Backend(args.backend)
    code = args.code or input("Meghívókód: ").strip()
    sid = backend.start(code)
    print("A meghívó érvényes.\n")

    lockdown = await device.connect(print)
    print("iPad csatlakoztatva, adatok lekérdezése...")
    raw = await device.collect(lockdown, print)
    sections = report.usb_sections(raw)
    report.print_report(sections)

    live = await live_test(lockdown, backend, sid, args.web)
    sections.append(live)
    report.print_report([live])

    serial = report.find_value(sections, "Sorozatszám") or "ismeretlen"
    backend.finish(sid, serial, sections)
    print("\nKész, a riportot elküldtem.")


def main():
    logging.disable(logging.CRITICAL)
    if getattr(sys, "frozen", False):
        os.chdir(os.path.dirname(sys.executable))
    parser = argparse.ArgumentParser(description="iPad hardver-audit")
    parser.add_argument("--code", help="meghívókód")
    parser.add_argument("--backend", default=config.BACKEND_URL)
    parser.add_argument("--web", default=config.WEB_URL)
    args = parser.parse_args()
    exit_code = 0
    try:
        asyncio.run(run(args))
    except BackendError as error:
        print(f"\nHiba: {error}")
        exit_code = 1
    except (KeyboardInterrupt, TimeoutError) as error:
        print(f"\nMegszakítva. {error}")
        exit_code = 1
    if getattr(sys, "frozen", False):
        input("\nA bezáráshoz nyomj Entert...")
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
