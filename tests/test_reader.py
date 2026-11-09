import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

from ipad_audit import reader  # noqa: E402

# Kitalált, nyilvánvalóan hamis adatok.
RAW = {
    "info": {"ProductType": "iPad2,5", "ProductVersion": "9.3.5", "SerialNumber": "DMPS00000FAK",
             "UniqueDeviceID": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "DeviceName": "Valaki iPadje",
             "InternationalMobileEquipmentIdentity": "490154203237518", "WiFiAddress": "02:00:00:00:55:73",
             "NonVolatileRAM": {"fm-activation-locked": b"NO"}},
    "bat": {"CycleCount": 244, "DesignCapacity": 4490, "AppleRawMaxCapacity": 3802, "Temperature": 2830},
    "disk": {"TotalDiskCapacity": 16000000000},
}


def test_block_has_only_listed_fields():
    block = reader.build_block(RAW)
    lines = block.splitlines()
    assert lines[0] == "IPAD-AUDIT-USB 1" and lines[-1] == "END"
    keys = [line.split(":")[0] for line in lines[1:-1]]
    assert keys == ["model", "model_name", "os", "serial", "storage_gb", "cycles", "design_capacity",
                    "max_capacity", "capacity_percent", "activation_lock"]


def test_block_values():
    block = reader.build_block(RAW)
    assert "model_name: iPad mini 1" in block
    assert "os: 9.3.5" in block
    assert "cycles: 244" in block
    assert "capacity_percent: 84.7" in block
    assert "storage_gb: 16" in block
    assert "activation_lock: off" in block


def test_block_never_contains_identifiers():
    block = reader.build_block(RAW)
    for secret in ("a1b2c3d4", "Valaki iPadje", "490154203237518", "55:73", "Temperature", "2830"):
        assert secret not in block


def test_missing_battery_is_left_out():
    block = reader.build_block({"info": RAW["info"]})
    assert "cycles" not in block and "capacity_percent" not in block
    assert block.startswith("IPAD-AUDIT-USB 1") and block.endswith("END")


def test_unknown_lock_state():
    block = reader.build_block({"info": {"ProductType": "iPad2,5"}})
    assert "activation_lock: unknown" in block


def test_reader_has_no_network_code():
    path = os.path.join(os.path.dirname(__file__), "..", "tool", "ipad_audit", "reader.py")
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    forbidden = re.compile(r"^\s*(import|from)\s+(urllib|requests|http|socket|ssl|httpx|aiohttp|backend|ipad_audit\.backend)\b", re.M)
    assert not forbidden.search(source)
    assert "backend" not in source.replace("Hálózat", "")


def test_clipboard_command_per_platform():
    assert reader.clipboard_command("win32") == ["clip"]
    assert reader.clipboard_command("darwin") == ["pbcopy"]
    assert reader.clipboard_command("linux", which=lambda name: "/usr/bin/" + name if name == "wl-copy" else None) == ["wl-copy"]
    assert reader.clipboard_command("linux", which=lambda name: "/usr/bin/" + name if name == "xclip" else None) == ["xclip", "-selection", "clipboard"]
    assert reader.clipboard_command("linux", which=lambda name: None) is None


def test_copy_without_clipboard_tool_is_false():
    # A valódi vágólaphoz a teszt nem nyúlhat, ezért a parancskeresést lecseréljük.
    original = reader.clipboard_command
    reader.clipboard_command = lambda platform, which=None: None
    try:
        assert reader.copy_to_clipboard("x") is False
    finally:
        reader.clipboard_command = original


def test_pause_does_nothing_when_not_frozen():
    reader.pause()
