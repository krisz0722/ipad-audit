"""Hálózat nélküli kiolvasó az eladónak.

Csak olvas, és csak a felsorolt mezőket írja ki a képernyőre egy rövid szövegblokkba. Nem csatlakozik az
internetre és semmit nem küld el: az eredményt az eladó másolja be a weboldalra, ahol az előnézetben
látja, mi megy tovább. UDID-t, IMEI-t, MAC-címet, eszköznevet nem olvas ki.
"""
import asyncio
import re
import shutil
import subprocess
import sys

from ipad_audit.report import MODELS

HEADER = "IPAD-AUDIT-USB 1"
FOOTER = "END"


def _int(value):
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _text(value, limit=40):
    if isinstance(value, bytes):
        value = value.decode("utf-8", "replace")
    if value is None:
        return None
    cleaned = re.sub(r"[^\x20-\x7e]", "", str(value)).strip()[:limit]
    return cleaned or None


def _lock(info):
    state = (info.get("NonVolatileRAM") or {}).get("fm-activation-locked")
    if isinstance(state, bytes):
        state = state.decode("utf-8", "replace")
    state = str(state or "").strip().upper()
    return {"YES": "on", "NO": "off"}.get(state, "unknown")


def facts(raw):
    """A nyers eszközadatból kiszámolja a kiírható tényeket. Csak ezek kerülhetnek bármilyen kimenetbe."""
    info = raw.get("info") or {}
    bat = raw.get("bat") or {}
    disk = raw.get("disk") or {}

    design = _int(bat.get("DesignCapacity"))
    max_capacity = _int(bat.get("AppleRawMaxCapacity")) or _int(bat.get("NominalChargeCapacity"))
    percent = round(max_capacity * 100.0 / design, 1) if design and max_capacity else None
    total = _int(disk.get("TotalDiskCapacity"))
    product = _text(info.get("ProductType"), 20)
    serial = re.sub(r"[^A-Za-z0-9]", "", str(info.get("SerialNumber") or ""))[:14] or None

    return {
        "model": product,
        "model_name": MODELS.get(product),
        "os": _text(info.get("ProductVersion"), 20),
        "serial": serial,
        "storage_gb": round(total / 1e9) if total else None,
        "cycles": _int(bat.get("CycleCount")),
        "design_capacity": design,
        "max_capacity": max_capacity,
        "capacity_percent": percent,
        "activation_lock": _lock(info),
    }


def build_block(raw):
    """A nyers eszközadatból előállítja a kiírandó blokkot. Más mező nem kerülhet bele."""
    f = facts(raw)
    fields = [
        ("model", f["model"]),
        ("model_name", f["model_name"]),
        ("os", f["os"]),
        ("serial", f["serial"]),
        ("storage_gb", f["storage_gb"]),
        ("cycles", f["cycles"]),
        ("design_capacity", f["design_capacity"]),
        ("max_capacity", f["max_capacity"]),
        ("capacity_percent", f["capacity_percent"]),
        ("activation_lock", f["activation_lock"]),
    ]
    lines = [HEADER] + ["%s: %s" % (key, value) for key, value in fields if value not in (None, "")] + [FOOTER]
    return "\n".join(lines)


def summary_lines(raw):
    """Érthető összegzés az eladónak: mit talált a program. Sorozatszámot és azonosítót nem ír ki."""
    f = facts(raw)
    lines = []
    name = f["model_name"] or f["model"]
    device = ", ".join(part for part in (name, ("rendszer: " + f["os"]) if f["os"] else None,
                                         ("%s GB tárhely" % f["storage_gb"]) if f["storage_gb"] else None) if part)
    if device:
        lines.append("Az eszközöd: " + device)
    if f["cycles"] is not None:
        wear = ("az eredeti kapacitás %s%%-a maradt" % f["capacity_percent"]) if f["capacity_percent"] is not None else "a kapacitás nem olvasható ki"
        lines.append("Akkumulátor: %s töltési ciklus, %s" % (f["cycles"], wear))
        if f["capacity_percent"] is not None and f["capacity_percent"] < 80:
            lines.append("  Figyelem: 80% alatti kapacitásnál az akku már érezhetően gyengébb, a vevő ezt látni fogja.")
    else:
        lines.append("Akkumulátor: ezen az eszközön nem sikerült kiolvasni.")
    lock = {"on": "BEKAPCSOLVA (ki kell jelentkezni az Apple-fiókból)", "off": "kikapcsolva"}.get(f["activation_lock"], "ezen a rendszeren nem olvasható ki")
    lines.append("Aktiválási zár: " + lock)
    return lines


async def read_raw(notify):
    """Az eszköz olvasása. Kizárólag olvasó műveletek, a pymobiledevice3 könyvtárral."""
    from pymobiledevice3.services.diagnostics import DiagnosticsService

    from ipad_audit import device

    lockdown = await device.connect(notify)
    raw = {"info": dict(lockdown.all_values)}
    try:
        raw["disk"] = await lockdown.get_value(domain="com.apple.disk_usage")
    except Exception:
        raw["disk"] = {}
    async with DiagnosticsService(lockdown=lockdown) as diag:
        raw["bat"] = await device._entry(diag, device.ENTRIES["bat"])
    return raw


def clipboard_command(platform, which=shutil.which):
    """A vágólapra másoló rendszerparancs, vagy None, ha nincs ilyen."""
    if platform.startswith("win"):
        return ["clip"]
    if platform == "darwin":
        return ["pbcopy"]
    for command in (["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]):
        if which(command[0]):
            return command
    return None


def copy_to_clipboard(text, platform=sys.platform):
    """Csak a helyi vágólapra másol, hálózatot nem használ."""
    command = clipboard_command(platform)
    if not command:
        return False
    try:
        subprocess.run(command, input=text.encode("ascii", "replace"), check=True, timeout=10)
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def pause():
    """Windowson a duplakattintással indított ablak a kilépéskor azonnal bezárulna, ezért Enterre várunk."""
    if getattr(sys, "frozen", False) and sys.stdin and sys.stdin.isatty() and sys.stdout.isatty():
        try:
            input("\nNyomj Entert az ablak bezárásához...")
        except EOFError:
            pass


def main():
    def notify(message):
        print(message, file=sys.stderr)

    print("iPad akku-kiolvasó. Csak olvas, semmit nem küld el.", file=sys.stderr)
    try:
        raw = asyncio.run(read_raw(notify))
    except (TimeoutError, KeyboardInterrupt):
        print("\nNem sikerült kapcsolódni az eszközhöz. Ellenőrizd a kábelt, oldd fel az eszközt, és koppints a Megbízom gombra, majd indítsd újra a programot.", file=sys.stderr)
        pause()
        sys.exit(1)
    except Exception as error:
        print("\nHiba történt: %s" % _text(error, 120), file=sys.stderr)
        print("Windowson ellenőrizd, hogy az iTunes vagy az Apple Devices alkalmazás telepítve van-e.", file=sys.stderr)
        pause()
        sys.exit(1)
    block = build_block(raw)
    print(block)
    print("\nEzt találtuk az eszközödön:", file=sys.stderr)
    for line in summary_lines(raw):
        print("  " + line, file=sys.stderr)
    if copy_to_clipboard(block):
        print("\nA fenti szöveg a vágólapra került. Illeszd be a weboldalon.", file=sys.stderr)
    else:
        print("\nMásold ki a fenti szöveget (az IPAD-AUDIT-USB sortól az END sorig), és illeszd be a weboldalon.", file=sys.stderr)
    pause()


if __name__ == "__main__":
    main()
