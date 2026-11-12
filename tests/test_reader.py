import asyncio
import pytest
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

from ipad_audit import reader  # noqa: E402

# Kitalált, nyilvánvalóan hamis adatok.
RAW = {
    "info": {"ProductType": "iPad2,5", "ProductVersion": "9.3.5", "SerialNumber": "DMPS00000FAK", "HardwarePlatform": "s5l8942x",
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
    assert keys == ["model", "model_name", "os", "serial", "hardware_platform", "storage_gb", "cycles", "design_capacity",
                    "max_capacity", "capacity_percent", "activation_lock"]


def test_block_values():
    block = reader.build_block(RAW)
    assert "model_name: iPad mini 1" in block
    assert "os: 9.3.5" in block
    assert "serial: DMPS00000FAK" in block
    assert "hardware_platform: s5l8942x" in block
    assert "cycles: 244" in block
    assert "capacity_percent: 84.7" in block
    assert "storage_gb: 16" in block
    assert "activation_lock: off" in block


def test_read_raw_requests_only_listed_fields(monkeypatch):
    from ipad_audit import device
    from pymobiledevice3.services import diagnostics

    requests = []

    class Lockdown:
        all_values = {"NonVolatileRAM": {"fm-activation-locked": b"NO", "unrelated": "PRIVATE"},
                      "DeviceName": "PRIVATE"}

        async def get_value(self, domain=None, key=None):
            requests.append((domain, key))
            return {"ProductType": "iPad2,5", "ProductVersion": "9.3.5",
                    "SerialNumber": "DMPS00000FAK", "HardwarePlatform": "s5l8942x", "TotalDiskCapacity": 16000000000}[key]

    class Diagnostics:
        def __init__(self, lockdown):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    async def connect(notify):
        return Lockdown()

    async def entry(diag, names):
        return {"CycleCount": 244, "SerialNumber": "PRIVATE"}

    monkeypatch.setattr(device, "connect", connect)
    monkeypatch.setattr(device, "_entry", entry)
    monkeypatch.setattr(diagnostics, "DiagnosticsService", Diagnostics)
    raw = asyncio.run(reader.read_raw(lambda message: None))
    assert requests == [(None, "ProductType"), (None, "ProductVersion"), (None, "SerialNumber"), (None, "HardwarePlatform"),
                        ("com.apple.disk_usage", "TotalDiskCapacity")]
    assert raw["info"]["SerialNumber"] == "DMPS00000FAK"
    assert raw["info"]["NonVolatileRAM"] == {"fm-activation-locked": b"NO"}
    assert reader.facts(raw)["activation_lock"] == "off"
    assert raw["bat"] == {"CycleCount": 244}


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


def test_summary_is_readable_and_has_no_identifiers():
    text = "\n".join(reader.summary_lines(RAW))
    assert "iPad mini 1" in text and "9.3.5" in text and "16 GB" in text
    assert "244 töltési ciklus" in text and "84.7%" in text
    assert "Aktiválási zár: kikapcsolva" in text
    for secret in ("DMPS00000FAK", "a1b2c3d4", "Valaki iPadje", "490154203237518", "55:73", "2830"):
        assert secret not in text


def test_summary_warns_on_worn_battery():
    worn = dict(RAW, bat={"CycleCount": 900, "DesignCapacity": 4490, "AppleRawMaxCapacity": 3000})
    assert "Figyelem" in "\n".join(reader.summary_lines(worn))
    assert "Figyelem" not in "\n".join(reader.summary_lines(RAW))


def test_summary_without_battery_and_lock_state():
    text = "\n".join(reader.summary_lines({"info": {"ProductType": "iPad2,5"}}))
    assert "nem sikerült kiolvasni" in text and "nem olvasható ki" in text


def test_usb_email_contains_only_whitelisted_facts():
    path = os.path.join(os.path.dirname(__file__), "..", "tool", "ipad_audit", "reader.py")
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    assert "device.collect(" not in source
    text = str(reader.usb_sections(RAW))
    assert "DMPS00000FAK" in text
    for private in ("a1b2c3d4", "Valaki iPadje", "490154203237518", "55:73"):
        assert private not in text


def test_main_opens_web_page_with_read_data(monkeypatch, capsys):
    from ipad_audit import reader_web
    from ipad_audit.backend import Backend

    opened = []

    async def read(notify):
        return RAW

    monkeypatch.setattr(reader, "read_raw", read)
    monkeypatch.setattr(reader_web, "open_page", lambda block, **options: opened.append((block, options)))
    monkeypatch.setattr("builtins.input", lambda prompt: "igen")
    sent = []
    monkeypatch.setattr(Backend, "report", lambda self, *args: sent.append(args))
    reader.main(["--code", "123456789"])
    output = capsys.readouterr()
    assert opened == [(reader.build_block(RAW), {"code": "123456789", "usb_sent": True})]
    assert sent[0][:3] == ("123456789", "usb", "DMPS00000FAK")
    assert "DMPS00000FAK" not in output.out + output.err


def test_pause_does_nothing_when_not_frozen():
    reader.pause()


def test_local_web_handoff_is_private_and_reloadable(tmp_path):
    import threading
    from urllib.error import HTTPError
    from urllib.request import urlopen

    from ipad_audit import reader_web

    (tmp_path / "index.html").write_text('<script src="seller.js"></script>', encoding="utf-8")
    server, url = reader_web.create_server(reader.build_block(RAW), tmp_path)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        assert "DMPS00000FAK" not in url
        with urlopen(url) as response:
            assert b"serial: DMPS00000FAK" in response.read()
            assert response.headers["Cache-Control"] == "no-store"
        with urlopen(url) as response:
            assert b"serial: DMPS00000FAK" in response.read()
        try:
            urlopen(url + "../index.html")
            assert False, "unexpected path accepted"
        except HTTPError as error:
            assert error.code == 404
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_no_consent_does_not_read_or_send(monkeypatch):
    monkeypatch.setattr("builtins.input", lambda prompt: "nem")
    monkeypatch.setattr(reader, "read_raw", lambda notify: pytest.fail("reading without consent"))
    assert reader.main(["--code", "123456789"]) == 0


def test_local_web_missing_marker_is_rejected(tmp_path):
    import threading
    from urllib.error import HTTPError
    from urllib.request import urlopen
    from ipad_audit import reader_web

    (tmp_path / "index.html").write_text("<html></html>", encoding="utf-8")
    server, url = reader_web.create_server(reader.build_block(RAW), tmp_path)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with pytest.raises(HTTPError) as error:
            urlopen(url)
        assert error.value.code == 500
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
