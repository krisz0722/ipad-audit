import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

from ipad_audit import button_test
from ipad_audit.backend import BackendError
from ipad_audit.signals import Signals


def test_build_section_formats_detected_buttons():
    signals = Signals()
    section_empty = button_test.build_section(signals)
    assert section_empty["title"] == "Fizikai gombok (USB)"
    assert section_empty["rows"][0]["status"] == "nodata"
    assert "nem érzékelt" in section_empty["rows"][0]["value"]

    signals.feed("VolumeIncrement page:0xC usage:0xE9 downEvent:1", now=1.0)
    signals.feed("VolumeDecrement page:0xC usage:0xEA downEvent:1", now=1.1)
    signals.feed("Lock page:0xC usage:0x30 downEvent:1", now=1.2)
    signals.feed("Home page:0xC usage:0x40 downEvent:1", now=1.3)

    section = button_test.build_section(signals)
    assert section["rows"][0]["status"] == "ok"
    assert "Hangerő fel (+)" in section["rows"][0]["value"]
    assert "Hangerő le (-)" in section["rows"][0]["value"]
    assert "Bekapcsoló (Lock) gomb" in section["rows"][0]["value"]
    assert "Kezdőképernyő (Home) gomb" in section["rows"][0]["value"]


def test_collect_buttons_stops_early_when_all_buttons_detected():
    messages = []
    signals = Signals()
    now = [0.0]

    signals.feed("VolumeIncrement page:0xC usage:0xE9 downEvent:1", now=0.1)
    signals.feed("VolumeDecrement page:0xC usage:0xEA downEvent:1", now=0.2)
    signals.feed("Lock page:0xC usage:0x30 downEvent:1", now=0.3)
    signals.feed("Home page:0xC usage:0x40 downEvent:1", now=0.4)

    class FakeLockdown:
        pass

    async def wait(seconds):
        now[0] += seconds

    section = asyncio.run(
        button_test.collect_buttons(
            FakeLockdown(),
            notify=messages.append,
            timeout=10,
            signals=signals,
            clock=lambda: now[0],
            wait=wait,
        )
    )
    assert section["rows"][0]["status"] == "ok"
    assert any("Minden fizikai gomb érzékelve" in msg for msg in messages)


def test_run_interactive_runs_directly_and_returns_section(monkeypatch):
    messages = []
    signals = Signals()
    signals.feed("VolumeIncrement page:0xC usage:0xE9 downEvent:1", now=0.1)

    async def fake_collect(lockdown, notify, **options):
        return button_test.build_section(signals)

    monkeypatch.setattr(button_test, "collect_buttons", fake_collect)

    class FakeLockdown:
        pass

    async def fake_connect(notify):
        return FakeLockdown()

    section = button_test.run_interactive(
        notify=messages.append,
        lockdown_factory=fake_connect,
    )
    assert section is not None
    assert section["title"] == "Fizikai gombok (USB)"
    assert section["rows"][0]["status"] == "ok"
    assert any("FIZIKAI GOMBOK ELLENŐRZÉSE" in msg for msg in messages)
