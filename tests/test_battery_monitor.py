import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import importlib.util
spec = importlib.util.spec_from_file_location("battery_monitor", os.path.join(os.path.dirname(__file__), "..", "scripts", "battery-monitor.py"))
battery_monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(battery_monitor)


def test_parse_sample_extracts_correct_fields():
    raw_bat = {
        "Temperature": 3680,
        "CurrentCapacity": 55,
        "Voltage": 3840,
        "InstantAmperage": -1150,
        "IsCharging": False,
        "CycleCount": 91,
    }
    sample = battery_monitor.parse_sample(raw_bat, elapsed_sec=10)
    assert sample["elapsed_sec"] == 10
    assert sample["temp_c"] == 36.8
    assert sample["level"] == 55
    assert sample["voltage_mv"] == 3840
    assert sample["current_ma"] == -1150
    assert sample["charging"] is False
    assert sample["cycles"] == 91


def test_format_row_calculates_delta_temperature():
    sample = {
        "timestamp": "12:00:05",
        "elapsed_sec": 5,
        "temp_c": 37.5,
        "level": 60,
        "voltage_mv": 3900,
        "current_ma": -1200,
        "charging": False,
        "cycles": 90,
    }
    row = battery_monitor.format_row(sample, initial_temp=36.0)
    assert "37.5 °C" in row
    assert "+1.5 °C" in row
    assert "60%" in row
    assert "3900 mV" in row
    assert "-1200 mA" in row
    assert "töltés: nem" in row


def test_print_summary_computes_stats(capsys):
    samples = [
        {"elapsed_sec": 0, "temp_c": 35.0, "level": 60, "voltage_mv": 3900, "current_ma": -1000},
        {"elapsed_sec": 5, "temp_c": 36.5, "level": 60, "voltage_mv": 3880, "current_ma": -1100},
        {"elapsed_sec": 10, "temp_c": 37.0, "level": 59, "voltage_mv": 3860, "current_ma": -1200},
    ]
    battery_monitor.print_summary(samples)
    out = capsys.readouterr().out
    assert "35.0 °C -> 37.0 °C" in out
    assert "+2.0 °C" in out
    assert "Csúcsérték:          37.0 °C" in out
    assert "60% -> 59%" in out
    assert "-1100 mA" in out


def test_choose_profile_resolves_keys_and_defaults():
    assert battery_monitor.choose_profile("mp4") == "mp4"
    assert battery_monitor.choose_profile("2") == "mp4"
    assert battery_monitor.choose_profile("idle") == "idle"
    assert battery_monitor.choose_profile("unknown") == "youtube60"
    assert battery_monitor.choose_profile(None, ask=lambda prompt: "") == "youtube60"
    assert battery_monitor.choose_profile(None, ask=lambda prompt: "3") == "idle"


def test_evaluate_profile_verdicts():
    # Pass on youtube60
    samples_pass = [
        {"temp_c": 37.0, "current_ma": -1200},
        {"temp_c": 38.5, "current_ma": -1250},
    ]
    res_pass = battery_monitor.evaluate_profile(samples_pass, "youtube60")
    assert res_pass["status"] == "PASS"

    # Fail on mp4 when temperature exceeds threshold (max expected: 32.5 C)
    samples_fail = [
        {"temp_c": 36.0, "current_ma": -600},
        {"temp_c": 37.5, "current_ma": -650},
    ]
    res_fail = battery_monitor.evaluate_profile(samples_fail, "mp4")
    assert res_fail["status"] == "FAIL"
    assert "jóval meghaladta" in res_fail["reasons"][0]



def test_evaluate_profile_flags_charging_instead_of_in_range():
    samples = [
        {"temp_c": 30.0, "current_ma": 350},
        {"temp_c": 31.0, "current_ma": 450},
    ]
    res = battery_monitor.evaluate_profile(samples, "youtube60")
    assert res["status"] == "PASS"
    assert any("nettó töltés" in reason for reason in res["reasons"])
    assert not any("a várt tartományban" in reason for reason in res["reasons"])


def test_evaluate_profile_flags_too_low_load():
    samples = [
        {"temp_c": 30.0, "current_ma": -300},
        {"temp_c": 30.5, "current_ma": -400},
    ]
    res = battery_monitor.evaluate_profile(samples, "youtube60")
    assert any("kisebb volt a vártnál" in reason for reason in res["reasons"])
