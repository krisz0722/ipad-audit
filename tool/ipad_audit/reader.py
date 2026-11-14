"""USB-s kiolvasó: riportküldés után az eladandó eszközön folytatódik a teszt."""
import asyncio
import argparse
import re
import secrets
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
    from ipad_audit import audit, battery_test, config, reader_web
    from ipad_audit.backend import Backend, BackendError

    parser = argparse.ArgumentParser()
    parser.add_argument("--code", default="")
    parser.add_argument("--dev", action="store_true", help="A helyi dev szerver hálózati címét használja.")
    parser.add_argument("--web-url", default="", help="Az iPadről elérhető webes alapcím, meghívókód nélkül.")
    parser.add_argument("--monitor-timeout", type=float, default=1800, help="A webes teszt követésének időkorlátja másodpercben.")
    args = parser.parse_args(argv)
    try:
        web_url = reader_web.seller_base_url(dev=args.dev, base_url=args.web_url)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    code = re.sub(r"[\s-]", "", args.code or input("A vásárlótól kapott meghívókód: ")).upper()
    if not re.fullmatch(r"(?:[0-9]{9}|[0-9A-Z]{12})", code):
        print("Hibás meghívókód.", file=sys.stderr)
        return 1
    if args.monitor_timeout <= 0:
        print("A követési időkorlát legyen pozitív.", file=sys.stderr)
        return 1
    print("A program a modellt, serialt, hardverplatformot, rendszerverziót, tárhelyet, akkumulátoradatokat és az Aktiválási zár jelzését olvassa ki. Az eredményeket és a webes teszt lépéseit a vásárló private Sheetjébe mentjük. A vásárlónak nem küldünk emailt.", file=sys.stderr)
    print("Ezután megpróbálja az audit oldalát az iPad vagy iPhone Safarijában megnyitni. Ehhez engedélyezett Web Inspector és nyitott audit oldal vagy üres Safari tab szükséges; más oldalt nem irányítunk át.", file=sys.stderr)
    print("A Safari-megnyitási próba közben a könyvtár átmenetileg megkapja a nyitott inspectálható appok és tabok címét, URL-jét. Ezt nem mentjük, nem küldjük el; oldaltartalmat és böngészési előzményt nem kérünk le.", file=sys.stderr)
    if input("Beleegyezel a kiolvasásba és a tesztadatok Sheetbe mentésébe? [Igen/nem, Enter: igen]: ").strip().lower() not in ("", "igen", "yes"):
        return 0
    print("Szeretnéd a végén emailben megkapni az összesített riportot? Ha igen, add meg a címed; ha nem, nyomj Entert. A címet csak a program memóriájában tartjuk a teszt végéig.", file=sys.stderr)
    while True:
        copy_email = input("Email az összesített riporthoz (nem kötelező, Enter: nem kérem): ").strip()
        if not copy_email or (
            len(copy_email) <= 254
            and not re.search(r"[^\x21-\x7e]", copy_email)
            and re.fullmatch(r'[^\s@,;<>:"\\]+@[^\s@,;<>:"\\]+\.[^\s@,;<>:"\\]+', copy_email)
        ):
            break
        print("Hibás emailcím. Adj meg egyetlen címet, vagy hagyd üresen.", file=sys.stderr)

    def notify(message):
        print(message, file=sys.stderr)

    backend = Backend(config.BACKEND_URL)
    sid = secrets.token_hex(16).upper()
    try:
        backend.audit_begin(code, sid, email_requested=bool(copy_email))
    except BackendError as error:
        print("A tesztet nem sikerült elindítani: " + str(error), file=sys.stderr)
        print("Az új flow a repositoryban lévő Apps Script új deploymentjét igényli.", file=sys.stderr)
        pause()
        return 1
    print("USB-kiolvasás, majd mentés a private Sheetbe.", file=sys.stderr)
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
    try:
        backend.audit_event(code, sid, 1, "usb", "ok", usb_sections(raw))
        print("A USB-adatok mentését a szerver visszaigazolta. Email még nem ment el.", file=sys.stderr)
    except BackendError as error:
        print("A USB-adatok mentése nem igazolt: " + str(error), file=sys.stderr)
        pause()
        return 1
    battery_test.run_interactive(backend, code, sid, notify, ask=input)
    print("A webes teszteket az iPaden vagy iPhone-on kell elvégezni. Megpróbálom ott megnyitni a Safarit...", file=sys.stderr)
    if reader_web.open_on_device(code, base_url=web_url, sid=sid):
        print("A Safari elfogadta az audit oldal megnyitását. A programot hagyd nyitva a teszt végéig.", file=sys.stderr)
    else:
        print("A Safarit nem sikerült automatikusan megnyitni. Az alábbi linkkel folytasd az iPaden.", file=sys.stderr)
    heading = "A WEBES TESZTET AZ IPADEN VAGY IPHONE-ON FOLYTASD"
    if sys.stderr.isatty():
        heading = "\033[1m" + heading + "\033[0m"
    print("\n" + "=" * 64, file=sys.stderr)
    print(heading, file=sys.stderr)
    print("=" * 64, file=sys.stderr)
    print("Itt a számítógépes méréssel végeztünk! Az eladandó eszközön nyisd meg a Safarit, és látogass el ide:\n", file=sys.stderr)
    print(reader_web.public_seller_url(code, base_url=web_url), file=sys.stderr)
    print(reader_web.public_seller_url(code, base_url=web_url, sid=sid), file=sys.stderr)
    print("\nA link már tartalmazza a meghívókódot; a folyamat végén az iPaden is kérhetsz összesített emailriportot.", file=sys.stderr)
    print("A számítógépen nem nyitunk böngészőt.", file=sys.stderr)
    print("=" * 64 + "\n", file=sys.stderr)
    result = audit.watch(backend, code, sid, copy_email, notify, timeout=args.monitor_timeout)
    copy_email = ""
    pause()
    return 0 if result == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
