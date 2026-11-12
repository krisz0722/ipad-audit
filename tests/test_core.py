import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

from ipad_audit import report  # noqa: E402
from ipad_audit.main import camera_result  # noqa: E402
from ipad_audit.signals import Signals  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "tool", "ipad_audit")


def test_real_log_lines():
    s = Signals()
    for line in ["Home page:0xC usage:0x40 downEvent:1 phase:0x1 began",
                 "Lock page:0xC usage:0x30 downEvent:1 down",
                 "VolumeIncrement page:0xC usage:0xE9 downEvent:1 down",
                 "VolumeDecrement page:0xC usage:0xEA downEvent:1 down",
                 "Headphone state changed [1, 0]",
                 "Headphone state changed [0, 0]",
                 "Acc (type 0): 0.019333 0.032257 -1.012024",
                 "Acc (type 0): 0.819333 0.032257 -0.012024",
                 "__WiFiLQAMgrLogStats(X:Stationary): Rssi: -54 Channel: 40"]:
        s.feed(line)
    assert set(s.events) == {"home", "lock", "vol_up", "vol_down", "jack_in", "jack_out"}
    assert round(s.acc_range(), 2) == 1.0
    assert s.rssi == [-54]


def test_release_is_not_a_press():
    s = Signals()
    s.feed("Home page:0xC usage:0x40 downEvent:0 up")
    s.feed("VolumeDecrement page:0xC usage:0xEA downEvent:0 up")
    assert s.events == {}


def test_jack_out_needs_jack_in():
    s = Signals()
    s.feed("Headphone state changed [0, 0]")
    assert s.events == {}


RAW = {
    "info": {"ProductType": "iPad5,4", "HardwareModel": "J82AP", "ModelNumber": "MNW12", "RegionInfo": "FD/A",
             "SerialNumber": "DMPS00000FAK", "ProductVersion": "15.8.5", "BuildVersion": "19H394",
             "UniqueDeviceID": "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678", "DeviceName": "Valaki iPadje",
             "InternationalMobileEquipmentIdentity": "490154203237518", "WiFiAddress": "02:00:00:00:55:73",
             "BluetoothAddress": "02:00:00:00:55:74", "BasebandVersion": "11.61.01", "BasebandStatus": "BBInfoAvailable",
             "SIMStatus": "kCTSIMSupportSIMStatusNotInserted", "NonVolatileRAM": {"fm-activation-locked": b"YES"}},
    "bat": {"CycleCount": 90, "DesignCapacity": 7340, "AppleRawMaxCapacity": 6669, "NominalChargeCapacity": 7200,
            "Temperature": 2830, "Voltage": 4208, "Amperage": 1281,
            "AdapterDetails": {"Watts": 12, "Description": "usb host"},
            "BatteryData": {"MaxCapacity": 6938, "Qmax": [7543], "ManufactureDate": "1649",
                            "LifetimeData": {"MaximumTemperature": 449, "MinimumTemperature": -43,
                                             "MaximumPackVoltage": 4345, "MinimumPackVoltage": 2727}}},
    "battery": {"BatteryCurrentCapacity": 86, "BatteryIsCharging": True},
    "disk": {"TotalDiskCapacity": 32000000000, "TotalDataCapacity": 25357631488, "AmountDataAvailable": 20300000000},
    "backup": {"CloudBackupEnabled": True},
    "gestalt": {"RearFacingCameraModuleSerialNumber": "F0000000000000001",
                "FrontFacingCameraModuleSerialNumber": "F0000000000000002"},
    "nand": {"AppleNANDStatus": "Ready"},
    "profiles": 0,
    "logs": {"total": 150, "panics": 0},
    "battery_log": {"firmware": 95, "original": 1, "upo": 0},
}


def test_report_values():
    sections = report.usb_sections(RAW)
    assert report.find_value(sections, "Ciklusszám") == "90"
    assert "90.9%" in report.find_value(sections, "Valós kapacitás (nyers)")
    assert report.find_value(sections, "Akku gyártása (kód szerint)") == "2016, 49. hét"
    assert report.find_value(sections, "Aktivációs zár (Find My)").startswith("BE")


def test_battery_origin_is_not_verified_by_log_flag():
    for original in (0, 1):
        section = report.battery_section({"battery_log": {"original": original}})
        origin = next(row for row in section["rows"] if row["label"] == "Akku eredete")
        assert origin["value"] == f"nem igazolt (rendszernapló OriginalBattery: {original})"
        assert origin["status"] == report.WARN


def test_missing_or_invalid_battery_origin_is_unknown():
    for original in (None, 2, -1, "1", True, False):
        section = report.battery_section({"battery_log": {"original": original}})
        origin = next(row for row in section["rows"] if row["label"] == "Akku eredete")
        assert origin["value"] == "nincs adat"
        assert origin["status"] == report.NODATA


def test_privacy_mask():
    text = str(report.usb_sections(RAW))
    for secret in ("a1b2c3d4", "Valaki iPadje", "490154203237518", "55:73", "55:74", "F0000000000000001"):
        assert secret not in text
    assert "DMPS00000FAK" in text


def test_missing_single_camera_is_unknown():
    raw = dict(RAW, gestalt={"FrontFacingCameraModuleSerialNumber": "F0000000000000002"})
    sections = report.usb_sections(raw)
    assert report.find_value(sections, "Hátlapi kameramodul") == "nincs adat"
    assert "működés nem ellenőrzött" in report.find_value(sections, "Előlapi kameramodul")


def test_no_camera_data_is_not_fault():
    sections = report.usb_sections(dict(RAW, gestalt={}))
    assert report.find_value(sections, "Hátlapi kameramodul") == "nincs adat"


def test_skipped_camera_test_is_unknown():
    result = camera_result({"skipped": True}, None, None, "back")
    assert result["status"] == report.NODATA


def test_camera_with_missing_activity_signal_is_unknown():
    class Board:
        def check(self, code, received_at):
            return received_at

    result = camera_result({"code": "test", "_seen_at": 100}, Board(), Signals(), "back")
    assert result["status"] == report.NODATA


def test_invalid_camera_code_does_not_prove_hardware_failure():
    class Board:
        def check(self, code, received_at):
            return None

    result = camera_result({"code": "test", "_seen_at": 100}, Board(), Signals(), "back")
    assert result["status"] == report.WARN


def test_no_destructive_device_calls():
    pattern = re.compile(r"\.(restart|shutdown|sleep|clear|enter_recovery|erase)\(|erase\s*=\s*True")
    for name in os.listdir(ROOT):
        if name.endswith(".py"):
            with open(os.path.join(ROOT, name), encoding="utf-8") as handle:
                text = handle.read().replace("asyncio.sleep(", "").replace("time.sleep(", "").replace("server.shutdown(", "")
            assert not pattern.search(text), name
