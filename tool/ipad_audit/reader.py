"""Hálózat nélküli kiolvasó az eladónak.

Csak olvas, és csak a felsorolt mezőket írja ki a képernyőre egy rövid szövegblokkba. Nem csatlakozik az
internetre és semmit nem küld el: az eredményt az eladó másolja be a weboldalra, ahol az előnézetben
látja, mi megy tovább. UDID-t, IMEI-t, MAC-címet, eszköznevet nem olvas ki.
"""
import asyncio
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


def build_block(raw):
    """A nyers eszközadatból előállítja a kiírandó blokkot. Más mező nem kerülhet bele."""
    info = raw.get("info") or {}
    bat = raw.get("bat") or {}
    disk = raw.get("disk") or {}

    design = _int(bat.get("DesignCapacity"))
    max_capacity = _int(bat.get("AppleRawMaxCapacity")) or _int(bat.get("NominalChargeCapacity"))
    percent = round(max_capacity * 100.0 / design, 1) if design and max_capacity else None
    total = _int(disk.get("TotalDiskCapacity"))
    product = _text(info.get("ProductType"), 20)
    serial = re.sub(r"[^A-Za-z0-9]", "", str(info.get("SerialNumber") or ""))[:14] or None

    fields = [
        ("model", product),
        ("model_name", MODELS.get(product)),
        ("os", _text(info.get("ProductVersion"), 20)),
        ("serial", serial),
        ("storage_gb", round(total / 1e9) if total else None),
        ("cycles", _int(bat.get("CycleCount"))),
        ("design_capacity", design),
        ("max_capacity", max_capacity),
        ("capacity_percent", percent),
        ("activation_lock", _lock(info)),
    ]
    lines = [HEADER] + ["%s: %s" % (key, value) for key, value in fields if value not in (None, "")] + [FOOTER]
    return "\n".join(lines)


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


def main():
    def notify(message):
        print(message, file=sys.stderr)

    print("iPad akku-kiolvasó. Csak olvas, semmit nem küld el.", file=sys.stderr)
    raw = asyncio.run(read_raw(notify))
    print(build_block(raw))


if __name__ == "__main__":
    main()
