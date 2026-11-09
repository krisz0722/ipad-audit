"""A riport sorainak előállítása. Csak adatfeldolgozás, eszközt nem érint."""

OK, WARN, BAD, INFO, NODATA = "ok", "warn", "bad", "info", "nodata"
USB, MEASURED, SELF = "USB", "MÉRT", "BEMONDÁS"

ICONS = {OK: "✅", WARN: "⚠️", BAD: "❌", INFO: "ℹ️", NODATA: "❔"}

MODELS = {
    "iPad2,5": "iPad mini 1", "iPad2,6": "iPad mini 1", "iPad2,7": "iPad mini 1",
    "iPad4,1": "iPad Air 1", "iPad4,2": "iPad Air 1", "iPad4,3": "iPad Air 1",
    "iPad4,4": "iPad mini 2", "iPad4,5": "iPad mini 2", "iPad4,6": "iPad mini 2",
    "iPad4,7": "iPad mini 3", "iPad4,8": "iPad mini 3", "iPad4,9": "iPad mini 3",
    "iPad5,1": "iPad mini 4", "iPad5,2": "iPad mini 4",
    "iPad5,3": "iPad Air 2", "iPad5,4": "iPad Air 2",
    "iPad6,11": "iPad 5. gen", "iPad6,12": "iPad 5. gen",
    "iPad7,5": "iPad 6. gen", "iPad7,6": "iPad 6. gen",
    "iPad7,11": "iPad 7. gen", "iPad7,12": "iPad 7. gen",
    "iPad11,1": "iPad mini 5", "iPad11,2": "iPad mini 5",
    "iPad11,3": "iPad Air 3", "iPad11,4": "iPad Air 3",
    "iPad11,6": "iPad 8. gen", "iPad11,7": "iPad 8. gen",
    "iPad12,1": "iPad 9. gen", "iPad12,2": "iPad 9. gen",
    "iPad13,1": "iPad Air 4", "iPad13,2": "iPad Air 4",
    "iPad14,1": "iPad mini 6", "iPad14,2": "iPad mini 6",
}


def row(label, value, status=INFO, tag=USB):
    if value in (None, ""):
        return {"label": label, "value": "nincs adat", "status": NODATA, "tag": tag}
    return {"label": label, "value": str(value), "status": status, "tag": tag}


def mask_mac(value):
    if not value:
        return None
    return ":".join(value.split(":")[:3]) + ":xx:xx:xx"


def mask_tail(value):
    if not value:
        return None
    return "..." + str(value)[-4:]


def pct(a, b):
    return round(a * 100.0 / b, 1)


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _text(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    return value


def _threshold(value, good, warn):
    return OK if value >= good else (WARN if value >= warn else BAD)


def battery_section(raw):
    bat = raw.get("bat") or {}
    data = bat.get("BatteryData") or {}
    life = data.get("LifetimeData") or {}
    lvl = raw.get("battery") or {}
    log = raw.get("battery_log") or {}
    design = bat.get("DesignCapacity")
    cycles = bat.get("CycleCount")
    max_raw = bat.get("AppleRawMaxCapacity")
    source = "élő mérés"
    if max_raw is None and log.get("raw") is not None:
        max_raw, source = log["raw"], "rendszernapló"

    rows = [row("Töltöttség", f"{lvl.get('BatteryCurrentCapacity')}% (tölt: {'igen' if lvl.get('BatteryIsCharging') else 'nem'})"
                if lvl.get("BatteryCurrentCapacity") is not None else None)]
    if _is_int(cycles):
        rows.append(row("Ciklusszám", cycles, OK if cycles < 300 else (WARN if cycles < 800 else BAD)))
    else:
        rows.append(row("Ciklusszám", None))
    rows.append(row("Gyári kapacitás", f"{design} mAh" if design else None))
    if _is_int(max_raw) and design:
        p = pct(max_raw, design)
        rows.append(row("Valós kapacitás (nyers)", f"{max_raw} mAh = {p}% ({source})", _threshold(p, 85, 75)))
    else:
        rows.append(row("Valós kapacitás (nyers)", None))
    for label, value in (("Névleges kapacitás (NCC)", bat.get("NominalChargeCapacity")),
                         ("Gauge max. kapacitás", data.get("MaxCapacity"))):
        if _is_int(value) and design:
            rows.append(row(label, f"{value} mAh = {pct(value, design)}%"))
    qmax = data.get("Qmax")
    if isinstance(qmax, list) and qmax and design:
        rows.append(row("Qmax (kémiai kapacitás)", f"{qmax[0]} mAh = {pct(qmax[0], design)}%"))
    if log.get("firmware") is not None:
        rows.append(row("Akkuállapot (firmware)", f"{log['firmware']}%"))
    orig = log.get("original")
    if orig == 1:
        rows.append(row("Gyári akkucella", "igen (firmware szerint)", OK))
    elif orig == 0:
        rows.append(row("Gyári akkucella", "nem (firmware szerint)", WARN))
    upo = log.get("upo")
    if upo is not None:
        rows.append(row("Váratlan leállások", upo, OK if upo == 0 else WARN))
    mfg = _text(data.get("ManufactureDate"))
    if isinstance(mfg, str) and len(mfg) == 4 and mfg.isdigit():
        rows.append(row("Akku gyártása (kód szerint)", f"20{mfg[:2]}, {mfg[2:]}. hét"))
    if _is_int(bat.get("Temperature")):
        rows.append(row("Hőmérséklet most", f"{bat['Temperature'] / 100:.1f} °C"))
    if _is_int(bat.get("Voltage")):
        rows.append(row("Feszültség most", f"{bat['Voltage']} mV"))
    if _is_int(bat.get("Amperage")):
        rows.append(row("Áram most", f"{bat['Amperage']} mA (pozitív: töltés)"))
    adapter = bat.get("AdapterDetails") or {}
    if adapter.get("Watts"):
        rows.append(row("Töltő", f"{adapter['Watts']} W, {_text(adapter.get('Description')) or ''}".rstrip(", ")))
    if _is_int(life.get("MaximumTemperature")) and _is_int(life.get("MinimumTemperature")):
        rows.append(row("Élettartam hőmérséklet", f"{life['MinimumTemperature'] / 10:.1f} – {life['MaximumTemperature'] / 10:.1f} °C"))
    if _is_int(life.get("MaximumPackVoltage")):
        rows.append(row("Élettartam cellafesz.", f"{life.get('MinimumPackVoltage')} – {life['MaximumPackVoltage']} mV"))
    return {"title": "Akkumulátor és töltés", "rows": rows}


def usb_sections(raw):
    info = raw.get("info") or {}
    nvram = info.get("NonVolatileRAM") or {}
    disk = raw.get("disk") or {}
    backup = raw.get("backup") or {}
    product = info.get("ProductType")
    name = MODELS.get(product, product)
    region = _text(info.get("RegionInfo")) or ""
    sections = [{"title": "Azonosítás", "rows": [
        row("Modell", f"{name} ({product}, {info.get('HardwareModel')})" if product else None),
        row("Modellszám", f"{info.get('ModelNumber')}{region}" if info.get("ModelNumber") else None),
        row("Sorozatszám", info.get("SerialNumber")),
        row("Rendszer", f"iOS/iPadOS {info.get('ProductVersion')} ({info.get('BuildVersion')})"),
        row("Processzor", f"{info.get('CPUArchitecture')}, {info.get('HardwarePlatform')}"),
    ]}, battery_section(raw)]

    locked = _text(nvram.get("fm-activation-locked"))
    profiles = raw.get("profiles")
    activation = [row("Aktiválási állapot", info.get("ActivationState"))]
    if locked == "YES":
        activation.append(row("Aktivációs zár (Find My)", "BE - a fiók kilépése nélkül zárolt marad", WARN))
    elif locked == "NO":
        activation.append(row("Aktivációs zár (Find My)", "ki", OK))
    else:
        activation.append(row("Aktivációs zár (Find My)", None))
    if _is_int(profiles):
        activation.append(row("Telepített profilok", profiles, OK if profiles == 0 else WARN))
    else:
        activation.append(row("Telepített profilok", None))
    if "CloudBackupEnabled" in backup:
        activation.append(row("iCloud-mentés", "be" if backup["CloudBackupEnabled"] else "ki"))
    activation.append(row("Jelkód beállítva", "igen" if info.get("PasswordProtected") else "nem"))
    sections.append({"title": "Aktiválás és fiók", "rows": activation})

    sim_names = {
        "kCTSIMSupportSIMStatusReady": ("behelyezve, kész", OK),
        "kCTSIMSupportSIMStatusNotInserted": ("nincs behelyezve", INFO),
        "kCTSIMSupportSIMStatusPINLocked": ("PIN-kódra vár", INFO),
    }
    network = [row("Wi-Fi MAC", mask_mac(info.get("WiFiAddress"))),
               row("Bluetooth MAC", mask_mac(info.get("BluetoothAddress")))]
    if info.get("BasebandVersion"):
        network.append(row("Mobilmodem", f"{info.get('BasebandStatus')}, FW {info['BasebandVersion']}", OK))
        network.append(row("IMEI", mask_tail(info.get("InternationalMobileEquipmentIdentity"))))
        sim_text, sim_status = sim_names.get(info.get("SIMStatus"), (info.get("SIMStatus"), INFO))
        network.append(row("SIM", sim_text, sim_status))
    else:
        network.append(row("Mobilmodem", "nincs (Wi-Fi-s modell) vagy nem válaszolt"))
    sections.append({"title": "Hálózat és SIM", "rows": network})

    nand = raw.get("nand") or {}
    chars = nand.get("Device Characteristics") or {}
    storage = []
    for label, key in (("Teljes", "TotalDiskCapacity"), ("Felhasználói", "TotalDataCapacity"),
                       ("Szabad", "AmountDataAvailable")):
        value = disk.get(key)
        storage.append(row(label, f"{value / 1e9:.1f} GB" if _is_int(value) else None))
    state = nand.get("AppleNANDStatus")
    storage.append(row("NAND állapot", state, OK if state == "Ready" else WARN))
    if chars.get("vendor-name"):
        storage.append(row("NAND típus", f"{chars['vendor-name']} {chars.get('nand-marketing-name', '')}".strip()))
    sections.append({"title": "Tárhely", "rows": storage})

    gestalt = raw.get("gestalt") or {}
    rear = gestalt.get("RearFacingCameraModuleSerialNumber")
    front = gestalt.get("FrontFacingCameraModuleSerialNumber")
    hw = []
    if not rear and not front:
        hw += [row("Hátlapi kameramodul", None), row("Előlapi kameramodul", None)]
    else:
        # Ha csak az egyik hiányzik, az modul- vagy csatlakozóhiba jele.
        for label, value in (("Hátlapi kameramodul", rear), ("Előlapi kameramodul", front)):
            if value:
                hw.append(row(label, f"válaszol ({mask_tail(value)})", OK))
            else:
                hw.append(row(label, "NEM VÁLASZOL, valószínű hardverhiba", BAD))
    touch = raw.get("touch") or {}
    if touch.get("Sensor Rows"):
        hw.append(row("Érintővezérlő", f"{touch['Sensor Rows']} x {touch.get('Sensor Columns')} mátrix, resetek: {touch.get('ResetCount')}"))
    for label, key in (("Gyorsulásmérő", "accel"), ("Giroszkóp", "gyro"), ("Iránytű", "compass")):
        part = raw.get(key) or {}
        if part.get("model"):
            hw.append(row(label, f"{_text(part.get('manufacturer'))} {_text(part['model'])}"))
    mesa = raw.get("mesa") or {}
    if mesa:
        hw.append(row("Touch ID szenzor", f"érzékelve, kalibráció: {_text(mesa.get('MesaCalBlobSource'))}"))
    sections.append({"title": "Hardver-válasz", "rows": hw})

    logs = raw.get("logs")
    stability = []
    if logs is None or logs.get("total", 0) == 0:
        stability.append(row("Kernel pánikok", "nem sikerült naplót olvasni, ismeretlen", WARN))
    elif logs["panics"] == 0:
        stability.append(row("Kernel pánikok", 0, OK))
    else:
        stability.append(row("Kernel pánikok", logs["panics"], BAD))
    if logs:
        stability.append(row("Átnézett naplófájlok", logs.get("total")))
    sections.append({"title": "Stabilitás", "rows": stability})
    return sections


def _usb_event(signals, names, label):
    if signals is None:
        return row(label, "nem futott", NODATA, MEASURED)
    missing = [n for n in names if n not in signals.events]
    if missing:
        return row(label, "nem érkezett jel", WARN, MEASURED)
    return row(label, "jel megérkezett", OK, MEASURED)


def live_section(steps, signals, camera_results):
    """A tesztoldal eredményeiből és az USB-s megfigyelésekből készült sorok."""
    rows = []
    for key, label in (("cam_rear", "Hátlapi kamera"), ("cam_front", "Előlapi kamera")):
        result = camera_results.get(key)
        if result is None:
            rows.append(row(label, "nem futott", NODATA, MEASURED))
        else:
            rows.append(row(label, result["text"], result["status"], MEASURED))

    audio = steps.get("audio")
    if not audio or audio.get("skipped"):
        rows.append(row("Hangszóró és mikrofon", "nem futott", NODATA, MEASURED))
    else:
        for side, label in (("left", "Hang: bal csatorna"), ("right", "Hang: jobb csatorna")):
            part = audio.get(side) or {}
            expected, heard = part.get("expected") or [], part.get("heard") or []
            hit = sum(1 for e, h in zip(expected, heard) if h)
            total = len(expected)
            rows.append(row(label, f"{hit}/{total} hang visszamérve",
                            OK if total and hit == total else (WARN if hit else BAD), MEASURED))
        if signals is not None:
            rows.append(row("Hangkimenet (USB)", "futott" if signals.flag_times["audio"] else "nem futott",
                            OK if signals.flag_times["audio"] else WARN, MEASURED))

    motion = steps.get("motion")
    if not motion or motion.get("skipped"):
        rows.append(row("Mozgásszenzor (böngésző)", "nem futott", NODATA, MEASURED))
    else:
        rows.append(row("Mozgásszenzor (böngésző)", "döntés és forgás mérve" if motion.get("ok") else "nem érkezett elég adat",
                        OK if motion.get("ok") else WARN, MEASURED))
    if signals is not None:
        span = signals.acc_range()
        if span is None:
            rows.append(row("Gyorsulásmérő (USB)", "nincs naplóadat", NODATA, MEASURED))
        else:
            rows.append(row("Gyorsulásmérő (USB)", f"legnagyobb kitérés {span:.2f} g", OK if span >= 0.3 else WARN, MEASURED))

    touch = steps.get("touch")
    if not touch or touch.get("skipped"):
        rows.append(row("Érintés", "nem futott", NODATA, MEASURED))
    else:
        complete = touch.get("cells") == touch.get("total") and touch.get("multi")
        rows.append(row("Érintés", f"{touch.get('cells')}/{touch.get('total')} mező, több ujj: {'igen' if touch.get('multi') else 'nem'}",
                        OK if complete else BAD, MEASURED))

    jack = steps.get("jack")
    if jack and jack.get("skipped"):
        rows.append(row("Jack-aljzat", "nem volt füles", NODATA, MEASURED))
    else:
        rows.append(_usb_event(signals, ("jack_in", "jack_out"), "Jack-aljzat"))
    rows.append(_usb_event(signals, ("vol_up",), "Hangerő fel gomb"))
    rows.append(_usb_event(signals, ("vol_down",), "Hangerő le gomb"))
    rows.append(_usb_event(signals, ("lock",), "Bekapcsoló gomb"))
    rows.append(_usb_event(signals, ("home",), "Home gomb"))
    if signals is not None and signals.rssi:
        rows.append(row("Wi-Fi jelerősség", f"{min(signals.rssi)} – {max(signals.rssi)} dBm", INFO, MEASURED))

    display = steps.get("display")
    if display:
        rows.append(row("Kijelző (halott pixel, szín)", "hibát jelzett" if display.get("defect") else "nem jelzett hibát",
                        BAD if display.get("defect") else INFO, SELF))
    else:
        rows.append(row("Kijelző (halott pixel, szín)", "nem futott", NODATA, SELF))
    return {"title": "Élő hardverteszt", "rows": rows}


def find_value(sections, label):
    for section in sections:
        for item in section["rows"]:
            if item["label"] == label:
                return item["value"]
    return None


def print_report(sections):
    for section in sections:
        print(f"\n{section['title']}")
        for item in section["rows"]:
            pad = " " * max(1, 30 - len(item["label"]))
            print(f"  {item['label']}{pad}{ICONS[item['status']]}  [{item['tag']}] {item['value']}")
