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


def build_section(signals, confirmed=None):
    """Összefoglaló riportszakasz az érzékelt vagy megerősített fizikai gombokból."""
    if confirmed == "ok":
        value = "Hangerő és bekapcsoló gombok működnek (eladó jóváhagyta)"
        status = "ok"
    elif confirmed == "bad":
        value = "a gombok hibásak vagy beragadtak (eladó visszajelzése)"
        status = "bad"
    else:
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


async def collect_buttons(lockdown, notify, timeout=12, signals=None, clock=time.monotonic, wait=asyncio.sleep, ask=None):
    """Gombok figyelése az élő syslogon keresztül, kódhiány esetén megerősítési lehetőséggel."""
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
    notify("(A terminál azonnal kiírja, ha a rendszer továbbítja a jelet. Figyelés: legfeljebb %d mp.)" % int(timeout))

    try:
        while clock() - started < timeout:
            for key, name in BUTTON_NAMES.items():
                if key in live_signals.events and key not in reported:
                    reported.add(key)
                    notify("  [USB gomb] %s megnyomva" % name)
            has_vol = "vol_up" in reported and "vol_down" in reported
            has_lock_or_home = "lock" in reported or "home" in reported
            if (has_vol and has_lock_or_home) or len(reported) >= len(BUTTON_NAMES):
                notify("Minden fizikai gomb érzékelve!")
                break
            await wait(0.2)
    finally:
        syslog_task.cancel()
        try:
            await syslog_task
        except (asyncio.CancelledError, Exception):
            pass

    if reported:
        return build_section(live_signals)

    if ask and callable(ask):
        notify("\nA rendszernaplóban az iPadOS biztonsági korlátozásai miatt nem jelentek meg a gombkódok.")
        while True:
            ans = ask("Működnek a hangerő- és a bekapcsoló gombok az iPaden (megjelenik a hangerőcsík, lezár a képernyő)? [Igen/nem, Enter: igen]: ").strip().lower()
            if ans in ("", "igen", "yes", "i", "y"):
                return build_section(live_signals, confirmed="ok")
            elif ans in ("nem", "no", "n"):
                return build_section(live_signals, confirmed="bad")
            notify("Kérlek válaszolj 'igen'-nel vagy 'nem'-mel.")

    return build_section(live_signals)


def run_interactive(backend=None, code=None, sid=None, notify=print, lockdown_factory=None, clock=time.monotonic, wait=asyncio.sleep, timeout=12, ask=None):
    """Kötelező gombellenőrzés USB-n és összefoglaló szakasz készítése."""
    if callable(backend) and notify == print and code is None and sid is None:
        notify = backend
        backend = None
    from ipad_audit import device

    async def _run():
        if lockdown_factory:
            try:
                lockdown = await lockdown_factory(notify)
            except TypeError:
                lockdown = await lockdown_factory()
        else:
            lockdown = await device.connect(notify)
        return await collect_buttons(lockdown, notify, clock=clock, wait=wait, timeout=timeout, ask=ask)

    try:
        section = asyncio.run(_run())
    except (TimeoutError, KeyboardInterrupt):
        notify("\nA gombok ellenőrzése megszakadt.")
        return None
    except Exception as error:
        notify("Hiba a gombok USB-s figyelése közben: " + str(error))
        return None

    if section:
        notify(format_summary(section))
    return section
