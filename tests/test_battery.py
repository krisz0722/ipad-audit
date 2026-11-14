import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

from ipad_audit import battery_test
from ipad_audit.backend import Backend, BackendError


def test_extract_sample_filters_only_whitelisted_fields():
    raw_bat = {
        "Voltage": 3973,
        "Temperature": 3720,
        "CycleCount": 90,
        "InstantAmperage": -332,
        "SerialNumber": "PRIVATE_SERIAL",
        "DeviceName": "PRIVATE_NAME",
    }
    sample = battery_test.extract_sample(5, 69, True, raw_bat)
    assert sample == {
        "sec": 5,
        "level": 69,
        "voltageMv": 3973,
        "tempC": 37.2,
        "cycles": 90,
        "charging": True,
        "currentMa": -332,
    }
    assert "PRIVATE" not in str(sample)


def test_ask_config_prompts_for_minutes_interval_and_1080p60_video():
    messages = []
    answers = iter(["invalid", "5", "", ""])
    config = battery_test.ask_config(ask=lambda prompt: next(answers), notify=messages.append)
    assert config == (5, 1)
    assert any("1080p 60fps" in msg for msg in messages)

    assert battery_test.ask_config(ask=lambda prompt: "0", notify=lambda msg: None) is None


def test_collect_samples_batches_to_sheet_and_recovers_from_offline_flush():
    batches = []
    messages = []
    now = [0.0]

    def clock():
        return now[0]

    async def wait(seconds):
        now[0] += seconds

    async def sampler(sec):
        return {
            "sec": sec,
            "level": 69 - (1 if sec >= 2 else 0),
            "voltageMv": 3973 + sec,
            "tempC": 37.2 + round(sec * 0.1, 1),
            "cycles": 90,
            "charging": True,
            "currentMa": -300 + sec * 10,
        }

    fail_first = [True]

    def on_batch(batch, section):
        batches.append(([item["sec"] for item in batch], section["title"]))
        if fail_first[0]:
            fail_first[0] = False
            return False
        return True

    section = asyncio.run(
        battery_test.collect_samples(
            minutes=0.05,  # 3 seconds
            interval=1,
            notify=messages.append,
            on_batch=on_batch,
            sampler=sampler,
            clock=clock,
            wait=wait,
            flush_interval=2,
        )
    )
    assert section["title"] == "Akkumulátor terhelésteszt"
    assert batches[0] == ([0, 1, 2], "Akkumulátor terhelésteszt")
    assert batches[-1] == ([0, 1, 2, 3], "Akkumulátor terhelésteszt")
    rows = {row["label"]: row["value"] for row in section["rows"]}
    assert "69% -> 68%" in rows["Töltöttség változása"]
    assert "3973 – 3976 mV" in rows["Feszültség terhelés alatt"]
    assert "37.2 °C -> 37.5 °C" in rows["Hőmérséklet"]
    assert "USB-töltés: igen" in rows["Áramfelvétel és töltés"]
    assert any("00:00" in line and "3973" in line for line in messages)


def test_run_interactive_sends_audit_battery_to_backend(monkeypatch):
    sent = []
    messages = []
    now = [0.0]

    class FakeBackend:
        def audit_battery(self, code, sid, samples, section):
            if len(sent) == 0:
                sent.append(("error", [s["sec"] for s in samples]))
                raise BackendError("offline")
            sent.append(("ok", code, sid, [s["sec"] for s in samples], section["title"]))
            return {"ok": True}

    async def sampler(sec):
        return {
            "sec": sec,
            "level": 80,
            "voltageMv": 4010,
            "tempC": 35.0,
            "cycles": 100,
            "charging": False,
            "currentMa": -450,
        }

    async def wait(seconds):
        now[0] += seconds

    answers = iter(["1", "30", ""])
    section = battery_test.run_interactive(
        FakeBackend(),
        "123456789",
        "A" * 32,
        messages.append,
        ask=lambda prompt: next(answers),
        sampler=sampler,
        clock=lambda: now[0],
        wait=wait,
    )
    assert section is not None
    assert sent[0] == ("error", [0, 30])
    assert sent[1] == ("ok", "123456789", "A" * 32, [0, 30, 60], "Akkumulátor terhelésteszt")
    assert any("átmenetileg sikertelen" in msg for msg in messages)


def test_backend_audit_battery_method(monkeypatch):
    client = Backend("https://example.test/audit")
    requests = []
    monkeypatch.setattr(client, "post", lambda payload: requests.append(payload) or {"ok": True, "saved": 1})
    client.audit_battery(
        "123456789",
        "A" * 32,
        [{"sec": 0, "level": 75}],
        {"title": "Akkumulátor terhelésteszt", "rows": []},
    )
    assert requests[0]["action"] == "audit_battery"
    assert requests[0]["samples"] == [{"sec": 0, "level": 75}]
