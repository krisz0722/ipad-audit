"""Interaktív akkumulátor-terhelésteszt (1080p60 videó mellett, 1 mp-es mintavétellel és Google Sheet szinkronnal)."""
import asyncio
import time

from ipad_audit.backend import BackendError

BUTTON_LABELS = {
    "vol_up": "Hangerő fel megnyomva",
    "vol_down": "Hangerő le megnyomva",
    "home": "Home gomb megnyomva",
    "lock": "Bekapcsoló gomb megnyomva",
    "jack_in": "Fülhallgató csatlakoztatva",
    "jack_out": "Fülhallgató kihúzva",
}


def _int(value, minimum, maximum):
    if isinstance(value, int) and not isinstance(value, bool) and minimum <= value <= maximum:
        return value
    return None


def extract_sample(sec, level, charging, bat, audio_running=None):
    """A nyers akkumulátor-értékekből kiszűri az engedélyezett numerikus mezőket."""
    bat = bat or {}
    lvl = _int(level, 0, 100)
    if lvl is None:
        lvl = _int(bat.get("CurrentCapacity"), 0, 100)
    chg = charging if isinstance(charging, bool) else (
        bat.get("IsCharging") if isinstance(bat.get("IsCharging"), bool) else None
    )
    voltage = _int(bat.get("Voltage"), 2000, 6000)
    raw_temp = _int(bat.get("Temperature"), -2000, 10000)
    temp_c = round(raw_temp / 100.0, 1) if raw_temp is not None else None
    cycles = _int(bat.get("CycleCount"), 0, 10000)
    current = _int(bat.get("InstantAmperage"), -10000, 10000)
    if current is None:
        current = _int(bat.get("Amperage"), -10000, 10000)
    sample = {
        "sec": int(sec),
        "level": lvl,
        "voltageMv": voltage,
        "tempC": temp_c,
        "cycles": cycles,
        "charging": chg,
        "currentMa": current,
    }
    if isinstance(audio_running, bool):
        sample["audioRunning"] = audio_running
    return sample


async def read_sample(lockdown, diag, sec):
    """Egyetlen másodperces minta kiolvasása a meglévő USB-kapcsolaton."""
    from ipad_audit import device

    level = None
    charging = None
    try:
        level = await lockdown.get_value(domain="com.apple.mobile.battery", key="BatteryCurrentCapacity")
    except Exception:
        pass
    try:
        charging = await lockdown.get_value(domain="com.apple.mobile.battery", key="BatteryIsCharging")
    except Exception:
        pass
    bat = await device._entry(diag, device.ENTRIES["bat"]) or {}
    audio = await device._entry(diag, device.ENTRIES["audio"]) or {}
    audio_running = bool(audio.get("is running")) if isinstance(audio, dict) and "is running" in audio else None
    return extract_sample(sec, level, charging, bat, audio_running=audio_running)


async def read_hw_diagnostics(lockdown, diag):
    """Azonosítók nélküli USB hardver- és hálózati állapot kiolvasása (SIM, modem, NAND, Touch ID, érintővezérlő)."""
    from ipad_audit import device

    diag_info = {}
    for key in ("SIMStatus", "BasebandStatus", "BasebandVersion"):
        try:
            val = await lockdown.get_value(key=key)
            if val is not None:
                diag_info[key] = str(val)[:40]
        except Exception:
            pass
    nand = await device._entry(diag, device.ENTRIES["nand"]) or {}
    if isinstance(nand, dict) and nand.get("AppleNANDStatus"):
        diag_info["nand_status"] = str(nand["AppleNANDStatus"])[:30]
    touch = await device._entry(diag, device.ENTRIES["touch"]) or {}
    if isinstance(touch, dict) and touch.get("Sensor Rows"):
        diag_info["touch_matrix"] = "%s x %s (reset: %s)" % (
            touch.get("Sensor Rows"),
            touch.get("Sensor Columns"),
            touch.get("ResetCount", 0),
        )
    mesa = await device._entry(diag, device.ENTRIES["mesa"]) or {}
    if isinstance(mesa, dict) and mesa:
        diag_info["touch_id"] = "érzékelve"
    return diag_info


def format_header(minutes, interval):
    return "\n".join([
        "",
        "=== iPad akkumulátor-terhelésteszt ===",
        "Mérési idő: %d perc, mintavétel: %ds (1080p60 videó terhelés)" % (minutes, interval),
        "%-8s | %-6s | %-9s | %-8s | %-8s | %-8s | %-10s"
        % ("Idő", "Szint", "Fesz(mV)", "Hőm(°C)", "Ciklus", "Tölt?", "Áram(mA)"),
        "-" * 74,
    ])


def format_row(sample):
    sec = max(0, int(sample.get("sec", 0)))
    ts = "%02d:%02d" % (sec // 60, sec % 60)
    lvl = ("%d%%" % sample["level"]) if sample.get("level") is not None else "?"
    volt = str(sample["voltageMv"]) if sample.get("voltageMv") is not None else "?"
    temp = ("%.1f" % sample["tempC"]) if sample.get("tempC") is not None else "?"
    cyc = str(sample["cycles"]) if sample.get("cycles") is not None else "?"
    chg = "IGEN" if sample.get("charging") is True else ("nem" if sample.get("charging") is False else "?")
    amp = str(sample["currentMa"]) if sample.get("currentMa") is not None else "?"
    return "%-8s | %-6s | %-9s | %-8s | %-8s | %-8s | %-10s" % (ts, lvl, volt, temp, cyc, chg, amp)


def build_section(samples, minutes, interval, signals=None, hw_diag=None):
    """Összefoglaló riportszakasz a másodperces mintákból és az USB-s hardverfigyelésből."""
    levels = [s["level"] for s in samples if s.get("level") is not None]
    voltages = [s["voltageMv"] for s in samples if s.get("voltageMv") is not None]
    temps = [s["tempC"] for s in samples if s.get("tempC") is not None]
    currents = [s["currentMa"] for s in samples if s.get("currentMa") is not None]
    any_charging = any(s.get("charging") is True for s in samples)

    if levels:
        start_level = levels[0]
        end_level = levels[-1]
        drop = max(0, start_level - end_level)
        rate = round(drop / float(minutes), 2) if minutes > 0 else 0.0
        if drop <= 5:
            status = "ok"
            verdict = "0–5% merülés: valószínűleg rendben van"
        elif drop <= 10:
            status = "warn"
            verdict = "5–10% merülés: határeset, öregedés jele lehet"
        elif drop <= 15:
            status = "bad"
            verdict = "10–15% merülés: erős jel akkuhibára"
        else:
            status = "bad"
            verdict = "15% feletti merülés: súlyos cellahiba gyanúja"
        if any_charging:
            verdict += " (USB-töltés mellett mérve)"
        level_text = "%d%% -> %d%% (merülés: %d%%, %.2f%%/perc)" % (start_level, end_level, drop, rate)
    else:
        status = "nodata"
        verdict = "nem olvasható ki"
        level_text = "nem olvasható ki"

    if voltages:
        voltage_text = "%d – %d mV (ingadozás: %d mV)" % (
            min(voltages), max(voltages), max(voltages) - min(voltages)
        )
        voltage_status = "info"
    else:
        voltage_text = "nem olvasható ki"
        voltage_status = "nodata"

    if temps:
        temp_text = "%.1f °C -> %.1f °C (csúcs: %.1f °C)" % (temps[0], temps[-1], max(temps))
        temp_status = "warn" if max(temps) >= 42.0 else "ok"
    else:
        temp_text = "nem olvasható ki"
        temp_status = "nodata"

    charge_label = "igen" if any_charging else "nem"
    if currents:
        avg_current = round(sum(currents) / float(len(currents)))
        current_text = "átlag %d mA (min %d mA), USB-töltés: %s" % (avg_current, min(currents), charge_label)
    else:
        current_text = "USB-töltés: %s" % charge_label

    rows = [
        {
            "label": "Terhelés és időtartam",
            "value": "%d perc (%d minta, %d mp-enként, 1080p60 videó)" % (minutes, len(samples), interval),
            "status": "info",
            "tag": "USB terhelésteszt",
        },
        {
            "label": "Töltöttség változása",
            "value": level_text,
            "status": status,
            "tag": "USB terhelésteszt",
        },
        {
            "label": "Feszültség terhelés alatt",
            "value": voltage_text,
            "status": voltage_status,
            "tag": "USB terhelésteszt",
        },
        {
            "label": "Hőmérséklet",
            "value": temp_text,
            "status": temp_status,
            "tag": "USB terhelésteszt",
        },
        {
            "label": "Áramfelvétel és töltés",
            "value": current_text,
            "status": "info",
            "tag": "USB terhelésteszt",
        },
        {
            "label": "Értékelés",
            "value": verdict,
            "status": status,
            "tag": "USB terhelésteszt",
        },
    ]

    audio_samples = [s["audioRunning"] for s in samples if isinstance(s.get("audioRunning"), bool)]
    if audio_samples:
        active_count = sum(1 for a in audio_samples if a)
        rows.append({
            "label": "Videó / hangkimenet (USB)",
            "value": ("aktív (%d/%d mintában)" % (active_count, len(audio_samples)))
            if active_count > 0
            else "nem volt aktív hangkimenet a mérés alatt",
            "status": "ok" if active_count > 0 else "warn",
            "tag": "USB terhelésteszt",
        })

    if signals is not None:
        pressed = [label for key, label in BUTTON_LABELS.items() if key in signals.events]
        rows.append({
            "label": "Fizikai gombok (USB)",
            "value": ", ".join(pressed) if pressed else "nem nyomtak meg gombot a mérés alatt",
            "status": "ok" if pressed else "info",
            "tag": "USB terhelésteszt",
        })
        span = signals.acc_range()
        if span is not None:
            rows.append({
                "label": "Gyorsulásmérő (USB)",
                "value": "legnagyobb kitérés %.2f g" % span,
                "status": "ok" if span >= 0.3 else "warn",
                "tag": "USB terhelésteszt",
            })
        if signals.rssi:
            rows.append({
                "label": "Wi-Fi jelerősség (USB)",
                "value": "%d – %d dBm" % (min(signals.rssi), max(signals.rssi)),
                "status": "info",
                "tag": "USB terhelésteszt",
            })

    if hw_diag:
        sim_map = {
            "kCTSIMSupportSIMStatusReady": "SIM behelyezve, kész",
            "kCTSIMSupportSIMStatusNotInserted": "nincs SIM behelyezve",
            "kCTSIMSupportSIMStatusPINLocked": "SIM PIN-kódra vár",
        }
        net_parts = []
        if hw_diag.get("BasebandVersion"):
            net_parts.append("mobilmodem FW %s" % hw_diag["BasebandVersion"])
            if hw_diag.get("SIMStatus"):
                net_parts.append(sim_map.get(hw_diag["SIMStatus"], hw_diag["SIMStatus"]))
        else:
            net_parts.append("Wi-Fi modell (nincs mobilmodem)")
        rows.append({
            "label": "Mobilhálózat és SIM (USB)",
            "value": ", ".join(net_parts),
            "status": "info",
            "tag": "USB terhelésteszt",
        })
        hw_parts = []
        if hw_diag.get("nand_status"):
            hw_parts.append("NAND: %s" % hw_diag["nand_status"])
        if hw_diag.get("touch_matrix"):
            hw_parts.append("Érintővezérlő: %s" % hw_diag["touch_matrix"])
        if hw_diag.get("touch_id"):
            hw_parts.append("Touch ID: %s" % hw_diag["touch_id"])
        if hw_parts:
            rows.append({
                "label": "Belső vezérlők (USB)",
                "value": "; ".join(hw_parts),
                "status": "ok" if hw_diag.get("nand_status") in (None, "Ready") else "warn",
                "tag": "USB terhelésteszt",
            })

    return {"title": "Akkumulátor terhelésteszt", "rows": rows}


def format_summary(section):
    lines = ["", "=== AKKUMULÁTOR TERHELÉSTESZT ÖSSZEFOGLALÓ ==="]
    for row in section.get("rows", []):
        lines.append("  %-26s %s" % (row["label"] + ":", row["value"]))
    return "\n".join(lines)


async def collect_samples(
    minutes,
    interval,
    notify,
    on_batch,
    sampler=None,
    clock=time.monotonic,
    wait=asyncio.sleep,
    flush_interval=5,
    signals=None,
    hw_diag=None,
):
    """Másodpercenkénti mintavétel és kötegelt továbbítás a Google Sheetbe."""
    duration = int(minutes * 60)
    samples = []
    pending = []
    last_flush = clock()

    if sampler is None:
        from pymobiledevice3.services.diagnostics import DiagnosticsService
        from ipad_audit import device
        from ipad_audit.signals import Signals

        lockdown = await device.connect(notify)
        live_signals = signals or Signals()
        syslog_task = asyncio.create_task(device.watch_syslog(lockdown, live_signals))
        try:
            async with DiagnosticsService(lockdown=lockdown) as diag:
                diag_info = hw_diag if hw_diag is not None else await read_hw_diagnostics(lockdown, diag)

                async def _default_sampler(sec):
                    return await read_sample(lockdown, diag, sec)

                return await collect_samples(
                    minutes,
                    interval,
                    notify,
                    on_batch,
                    sampler=_default_sampler,
                    clock=clock,
                    wait=wait,
                    flush_interval=flush_interval,
                    signals=live_signals,
                    hw_diag=diag_info,
                )
        finally:
            syslog_task.cancel()
            await asyncio.gather(syslog_task, return_exceptions=True)

    notify(format_header(minutes, interval))
    started = clock()
    step_index = 0
    reported_buttons = set()
    reported_audio = False
    try:
        while True:
            elapsed = clock() - started
            sec = int(round(elapsed)) if step_index > 0 else 0
            if step_index > 0 and sec > duration:
                break
            sample = await sampler(sec)
            samples.append(sample)
            pending.append(sample)
            notify(format_row(sample))
            if sample.get("audioRunning") is True and not reported_audio:
                reported_audio = True
                notify("  [USB hardver] Hangkimenet aktív (videólejátszás érzékelve)")
            if signals is not None:
                for key, label in BUTTON_LABELS.items():
                    if key in signals.events and key not in reported_buttons:
                        reported_buttons.add(key)
                        notify("  [USB hardver] %s" % label)
            step_index += 1

            now = clock()
            if now - last_flush >= flush_interval:
                section = build_section(samples, minutes, interval, signals=signals, hw_diag=hw_diag)
                if on_batch(list(pending), section):
                    del pending[:]
                    last_flush = now

            next_target = step_index * interval
            if next_target > duration:
                break
            remaining = (started + next_target) - clock()
            if remaining > 0:
                await wait(remaining)
    except KeyboardInterrupt:
        notify("\nAz akkumulátor-terheléstesztet megszakítottad; az eddigi méréseket mentjük.")

    section = build_section(samples, minutes, interval, signals=signals, hw_diag=hw_diag)
    if pending:
        on_batch(list(pending), section)
    notify(format_summary(section))
    return section


def ask_config(ask=input, notify=print):
    """Bekéri a terhelésteszt idejét, a mintavételi intervallumot és a 1080p60 videó indítását."""
    notify("\n--- Akkumulátor-terhelésteszt és USB-s gomb/szenzor figyelés ---")
    while True:
        try:
            raw_minutes = ask("Hány percig fusson az akkumulátor-terhelésteszt? [Enter: 5 perc, 0: kihagyás]: ").strip().lower()
        except (EOFError, StopIteration):
            return None
        if raw_minutes in ("0", "n", "nem", "no", "kihagy", "skip"):
            return None
        if raw_minutes == "":
            minutes = 5
            break
        if raw_minutes.isdigit() and 1 <= int(raw_minutes) <= 60:
            minutes = int(raw_minutes)
            break
        notify("Kérlek 1 és 60 közötti egész számot adj meg (vagy 0-t a kihagyáshoz).")

    try:
        raw_interval = ask("Mintavételi intervallum másodpercben [Enter: 1]: ").strip()
    except (EOFError, StopIteration):
        raw_interval = ""
    if not raw_interval:
        interval = 1
    elif raw_interval.isdigit() and 1 <= int(raw_interval) <= 60:
        interval = int(raw_interval)
    else:
        notify("Érvénytelen érték, alapértelmezett 1 másodperc használata.")
        interval = 1

    notify(
        "\n>>> 1. NYISS MEG EGY VIDEÓT AZ IPADEN (LEHETŐLEG YOUTUBE 1080p 60fps, HANGGAL), <<<"
        "\n>>>    ÁLLÍTSD MAGASRA A FÉNYERŐT, ÉS INDÍTSD EL A LEJÁTSZÁST! <<<"
        "\n>>> 2. A MÉRÉS ALATT NYOMD MEG A HANGERŐ FEL, HANGERŐ LE ÉS HOME GOMBOKAT, <<<"
        "\n>>>    ÉS DÖNTSD MEG AZ IPADET (A TERMINÁL ÉLŐBEN KIÍRJA A VÁLASZOKAT)! <<<"
    )
    try:
        ready = ask("Ha a 1080p 60fps videó megy, nyomj Entert a mérés megkezdéséhez (0 = kihagyás)... ").strip().lower()
    except (EOFError, StopIteration):
        return None
    if ready in ("0", "n", "nem", "no", "kihagy", "skip"):
        return None
    return minutes, interval


def run_interactive(backend, code, sid, notify, ask=input, sampler=None, clock=time.monotonic, wait=asyncio.sleep):
    """Interaktívan elindítja az akkumulátor-terheléstesztet, és kötegelve frissíti a Google Sheetet."""
    config = ask_config(ask=ask, notify=notify)
    if not config:
        notify("Az akkumulátor-terhelésteszt kihagyva.")
        return None
    minutes, interval = config

    def on_batch(batch, section):
        try:
            backend.audit_battery(code, sid, batch, section)
            return True
        except BackendError as error:
            notify("A mentés átmenetileg sikertelen, újrapróbáljuk: " + str(error))
            return False

    return asyncio.run(
        collect_samples(
            minutes,
            interval,
            notify,
            on_batch,
            sampler=sampler,
            clock=clock,
            wait=wait,
        )
    )
