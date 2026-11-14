"""Kommunikáció az iPaddel USB-n. Kizárólag olvasó műveletek."""
import asyncio
import os
import re
import tempfile
import shutil

from pymobiledevice3.exceptions import (
    ConnectionFailedError,
    NoDeviceConnectedError,
    PairingDialogResponsePendingError,
    PasswordRequiredError,
    UserDeniedPairingError,
)
from pymobiledevice3.lockdown import create_using_usbmux
from pymobiledevice3.services.crash_reports import CrashReportsManager
from pymobiledevice3.services.diagnostics import DiagnosticsService
from pymobiledevice3.services.misagent import MisagentService
from pymobiledevice3.services.os_trace import OsTraceService

ENTRIES = {
    "bat": ("AppleARMPMUCharger", "AppleSmartBattery"),
    "cam": ("AppleH6CamIn", "AppleH9CamIn", "AppleH10CamIn", "AppleH13CamIn"),
    "mesa": ("AppleMesaSEPDriver",),
    "nand": ("ASPStorage",),
    "touch": ("AppleMultitouchN1SPI", "AppleMultitouchSPI"),
    "accel": ("AppleOscarAccelerometer", "AppleSPUAccelerometer"),
    "gyro": ("AppleOscarGyro", "AppleSPUGyro"),
    "compass": ("AppleOscarCompass", "AppleSPUCompass"),
    "audio": ("AppleEmbeddedAudioDevice",),
}


async def connect(notify):
    """Addig próbál csatlakozni, amíg az eszköz meg nem jelenik és meg nem bízik a gépben."""
    from ipad_audit import windows_driver

    windows_driver.ensure_driver(notify)

    last = None
    for attempt in range(120):
        message = None
        try:
            lockdown = await create_using_usbmux(autopair=True)
            notify("iPad sikeresen észlelve.")
            return lockdown
        except (NoDeviceConnectedError, ConnectionFailedError):
            message = "Dugd rá az iPadet adatkábellel, és oldd fel a kijelzőjét..."
        except (PairingDialogResponsePendingError, PasswordRequiredError):
            message = 'Oldd fel az iPadet, és koppints a "Megbízom" gombra...'
        except UserDeniedPairingError:
            message = 'A "Ne bízz" gombot nyomtad. Húzd ki és dugd vissza az iPadet, majd válaszd a "Megbízom" gombot.'
        elapsed = int(attempt * 1.5)
        if message != last:
            notify(f"[{elapsed:02d}s] {message}")
            last = message
        elif attempt > 0 and attempt % 6 == 0:
            notify(f"[{elapsed:02d}s] Várakozás az iPad csatlakozására...")
        await asyncio.sleep(1.5)
    raise TimeoutError("Az iPad 3 percen belül nem csatlakozott.")


async def _entry(diag, names):
    for name in names:
        try:
            value = await diag.ioregistry(name=name)
        except Exception:
            value = None
        if value:
            return value
    return None


def _battery_log(root):
    """A legfrissebb Analytics naplóból olvassa az akkuértékeket."""
    candidates = []
    for folder, _, files in os.walk(root):
        for filename in files:
            if filename.startswith("Analytics") and ".ips" in filename:
                candidates.append((filename, os.path.join(folder, filename)))
    fields = {"raw": "AppleRawMaxCapacity", "firmware": "MaximumCapacityPercent",
              "original": "OriginalBattery", "upo": "LifetimeUPOCount"}
    for _, path in sorted(candidates, reverse=True):
        try:
            with open(path, "r", errors="ignore") as handle:
                text = handle.read()
        except OSError:
            continue
        if "AppleRawMaxCapacity" not in text:
            continue
        result = {}
        for key, field in fields.items():
            found = re.findall(r'"last_value_%s":(-?\d+)' % field, text)
            result[key] = int(found[-1]) if found else None
        return result
    return {}


def _log_stats(root):
    total = panics = 0
    for folder, _, files in os.walk(root):
        for filename in files:
            total += 1
            if "panic" in filename.lower() or os.path.basename(folder) == "Panics":
                panics += 1
    return {"total": total, "panics": panics}


async def collect(lockdown, notify):
    raw = {"info": dict(lockdown.all_values)}
    for key, domain in (("battery", "com.apple.mobile.battery"), ("disk", "com.apple.disk_usage"),
                        ("backup", "com.apple.mobile.backup")):
        try:
            raw[key] = await lockdown.get_value(domain=domain)
        except Exception:
            raw[key] = {}

    async with DiagnosticsService(lockdown=lockdown) as diag:
        for key, names in ENTRIES.items():
            raw[key] = await _entry(diag, names)
        try:
            raw["gestalt"] = await diag.mobilegestalt([
                "FrontFacingCameraModuleSerialNumber", "RearFacingCameraModuleSerialNumber"])
        except Exception:
            raw["gestalt"] = {}

    try:
        async with MisagentService(lockdown=lockdown) as misagent:
            raw["profiles"] = len(await misagent.copy_all())
    except Exception:
        raw["profiles"] = None

    notify("Naplók másolása az iPadről (legfeljebb 3 perc)...")
    tmp = tempfile.mkdtemp(prefix="ipad-audit-")
    try:
        try:
            async with CrashReportsManager(lockdown) as crash:
                # Az erase=False kötelező: különben törölné a naplókat az iPadről.
                await asyncio.wait_for(crash.pull(tmp, erase=False), 180)
        except Exception:
            pass
        raw["logs"] = _log_stats(tmp)
        raw["battery_log"] = _battery_log(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return raw


async def watch_syslog(lockdown, signals):
    while True:
        try:
            async for entry in OsTraceService(lockdown=lockdown).syslog():
                signals.feed(entry.message)
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(1)


async def watch_flags(lockdown, signals):
    """Másodpercenként megnézi, melyik kamera és a hangkimenet aktív-e."""
    while True:
        try:
            async with DiagnosticsService(lockdown=lockdown) as diag:
                while True:
                    cam = await _entry(diag, ENTRIES["cam"]) or {}
                    audio = await _entry(diag, ENTRIES["audio"]) or {}
                    if cam.get("BackCameraActive"):
                        signals.flag("back")
                    if cam.get("FrontCameraActive"):
                        signals.flag("front")
                    if audio.get("is running"):
                        signals.flag("audio")
                    await asyncio.sleep(1)
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(1)
