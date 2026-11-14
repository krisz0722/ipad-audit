"""Fizikai gombok (Hangerő fel, Hangerő le, Home, Bekapcsoló/Lock) USB-s élő ellenőrzése."""
import asyncio
import time

from ipad_audit.backend import BackendError
from ipad_audit.signals import Signals

BUTTON_NAMES = {
    "vol_up": "Hangerő fel (+)",
    "vol_down": "Hangerő le (-)",
    "home": "Kezdőképernyő (Home) gomb",
    "lock": "Bekapcsoló (Lock) gomb",
}

BUTTON_ORDER = ("vol_up", "vol_down", "lock", "home")


def build_section(signals):
    """Összefoglaló riportszakasz az érzékelt fizikai gombokból."""
    events = signals.events if signals else {}
    pressed = [BUTTON_NAMES[k] for k in BUTTON_ORDER if k in events]
    status = "ok" if pressed else "nodata"
    value = ", ".join(pressed) if pressed else "nem érzékelt gombnyomást a mérés alatt"
    rows = [
        {
            "label": "Fizikai gombok (USB)",
            "value": value,
            "status": status,
            "tag": "USB-ből",
        }
    ]
    return {"title": "Fizikai gombok (USB)", "rows": rows}


def format_summary(section):
    lines = ["", "=== FIZIKAI GOMBOK ELLENŐRZÉSE (USB) ==="]
    for row in section.get("rows", []):
        lines.append("  %-26s %s" % (row["label"] + ":", row["value"]))
    return "\n".join(lines)


async def collect_buttons(lockdown, notify, timeout=20, signals=None, clock=time.monotonic, wait=asyncio.sleep):
    """Gombok figyelése az élő syslogon keresztül."""
    from ipad_audit import device

    live_signals = signals or Signals()
    syslog_task = asyncio.create_task(device.watch_syslog(lockdown, live_signals))
    reported = set()
    started = clock()
    notify("\n--- Fizikai gombok ellenőrzése (USB) ---")
    notify("Nyomd meg sorban a gombokat az iPaden:")
    notify("  - Hangerő fel (+)")
    notify("  - Hangerő le (-)")
    notify("  - Bekapcsoló (Lock) gomb")
    notify("  - Kezdőképernyő (Home - ha van az eszközön)")
    notify("(A terminál azonnal kiírja, amit érzékel. Időkorlát: %d másodperc.)" % int(timeout))

    try:
        while clock() - started < timeout:
            for key, name in BUTTON_NAMES.items():
                if key in live_signals.events and key not in reported:
                    reported.add(key)
                    notify("  [USB gomb] %s megnyomva" % name)
            if len(reported) >= len(BUTTON_NAMES):
                notify("Minden fizikai gomb érzékelve!")
                break
            await wait(0.2)
    finally:
        syslog_task.cancel()
        try:
            await syslog_task
        except (asyncio.CancelledError, Exception):
            pass

    return build_section(live_signals)


def run_interactive(backend, code, sid, notify, lockdown_factory=None, clock=time.monotonic, wait=asyncio.sleep, timeout=20):
    """Kötelező gombellenőrzés USB-n és mentés a Sheetbe."""
    from ipad_audit import device

    async def _run():
        if lockdown_factory:
            try:
                lockdown = await lockdown_factory(notify)
            except TypeError:
                lockdown = await lockdown_factory()
        else:
            lockdown = await device.connect(notify)
        return await collect_buttons(lockdown, notify, clock=clock, wait=wait, timeout=timeout)

    try:
        section = asyncio.run(_run())
    except (TimeoutError, KeyboardInterrupt):
        notify("\nA gombok ellenőrzése megszakadt.")
        return None
    except Exception as error:
        notify("Hiba a gombok USB-s figyelése közben: " + str(error))
        return None

    notify(format_summary(section))
    if backend and code and sid:
        try:
            status = "ok" if section["rows"][0]["status"] == "ok" else "bad"
            backend.audit_event(code, sid, 2, "buttons", status, [section])
            notify("A gombellenőrzés eredményét a Sheetbe mentettük.")
        except BackendError as error:
            notify("A gombellenőrzés mentése átmenetileg sikertelen: " + str(error))
    return section
