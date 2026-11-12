"""USB-s kiolvasó: az eredményt helyben megnyitott weboldalon jeleníti meg."""
import asyncio
import argparse
import re
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
        "hardware_platform": _text(info.get("HardwarePlatform"), 20),
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
        ("hardware_platform", f["hardware_platform"]),
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
    raw = {"info": {}, "disk": {}}
    nvram = lockdown.all_values.get("NonVolatileRAM") or {}
    if isinstance(nvram, dict):
        raw["info"]["NonVolatileRAM"] = {"fm-activation-locked": nvram.get("fm-activation-locked")}
    for key in ("ProductType", "ProductVersion", "SerialNumber", "HardwarePlatform"):
        try:
            raw["info"][key] = await lockdown.get_value(key=key)
        except Exception:
            pass
    try:
        raw["disk"]["TotalDiskCapacity"] = await lockdown.get_value(domain="com.apple.disk_usage", key="TotalDiskCapacity")
    except Exception:
        pass
    async with DiagnosticsService(lockdown=lockdown) as diag:
        battery = await device._entry(diag, device.ENTRIES["bat"]) or {}
        raw["bat"] = {key: battery[key] for key in ("CycleCount", "DesignCapacity", "AppleRawMaxCapacity", "NominalChargeCapacity") if key in battery}
    return raw


def pause():
    """Windowson a duplakattintással indított ablak a kilépéskor azonnal bezárulna, ezért Enterre várunk."""
    if getattr(sys, "frozen", False) and sys.stdin and sys.stdin.isatty() and sys.stdout.isatty():
        try:
            input("\nNyomj Entert az ablak bezárásához...")
        except EOFError:
            pass


def usb_sections(raw):
    values = facts(raw)
    labels = {
        "model": "Modellazonosító", "model_name": "Modell", "os": "Rendszerverzió",
        "serial": "Sorozatszám", "hardware_platform": "Hardverplatform", "storage_gb": "Tárhely (GB)",
        "cycles": "Töltési ciklusok", "design_capacity": "Tervezett kapacitás (mAh)",
        "max_capacity": "Maximális kapacitás (mAh)", "capacity_percent": "Kapacitás (%)",
        "activation_lock": "Aktiválási zár"
    }
    rows = []
    for key, label in labels.items():
        value = values[key]
        if key == "activation_lock":
            value = {"on": "bekapcsolva", "off": "kikapcsolva"}.get(value)
        rows.append({"label": label, "value": str(value) if value is not None else "nem olvasható ki",
                     "status": "info" if value is not None else "nodata", "tag": "USB-ből"})
    return [{"title": "USB-s kiolvasás", "rows": rows}]


def main(argv=None):
    from ipad_audit import config, reader_web
    from ipad_audit.backend import Backend, BackendError

    parser = argparse.ArgumentParser()
    parser.add_argument("--code", default="")
    args = parser.parse_args(argv)
    code = re.sub(r"[\s-]", "", args.code or input("A vásárlótól kapott meghívókód: ")).upper()
    if not re.fullmatch(r"(?:[0-9]{9}|[0-9A-Z]{12})", code):
        print("Hibás meghívókód.", file=sys.stderr)
        return 1
    print("A program a modellt, serialt, hardverplatformot, rendszerverziót, tárhelyet, akkumulátoradatokat és az Aktiválási zár jelzését olvassa ki. A kiolvasás után a szerver automatikusan emailben elküldi ezeket a vásárlónak.", file=sys.stderr)
    if input("Beleegyezel a kiolvasásba és az automatikus küldésbe? [igen/nem]: ").strip().lower() not in ("igen", "yes"):
        return 0

    def notify(message):
        print(message, file=sys.stderr)

    print("USB-kiolvasás, majd automatikus riportküldés.", file=sys.stderr)
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
    print("\nEzt találtuk az eszközödön:", file=sys.stderr)
    for line in summary_lines(raw):
        print("  " + line, file=sys.stderr)
    sent = False
    try:
        Backend(config.BACKEND_URL).report(code, "usb", facts(raw)["serial"] or "ismeretlen", usb_sections(raw))
        sent = True
        print("A szerver elküldte a USB-riportot a vásárlónak.", file=sys.stderr)
    except BackendError as error:
        print("A USB-email küldése nem igazolt: " + str(error), file=sys.stderr)
    reader_web.open_page(build_block(raw), code=code, usb_sent=sent)
    return 0 if sent else 1


if __name__ == "__main__":
    sys.exit(main())
