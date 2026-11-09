"""Hardveres események felismerése az iPad élő rendszernaplójából.

A minták egy valódi iPad Air 2-n (iPadOS 15.8.5) mért naplósorokból származnak.
Más iOS-verzión hiányozhatnak, ezért a hiányuk "nem mérhető", nem hardverhiba.
"""
import re
import threading
import time

_EVENTS = (
    ("home", re.compile(r"\bHome page:0xC usage:0x40 downEvent:1")),
    ("lock", re.compile(r"\bLock page:0xC usage:0x30 downEvent:1")),
    ("vol_up", re.compile(r"\bVolumeIncrement page:0xC usage:0xE9 downEvent:1")),
    ("vol_down", re.compile(r"\bVolumeDecrement page:0xC usage:0xEA downEvent:1")),
    ("jack_in", re.compile(r"Headphone state changed \[1\b")),
    ("jack_out", re.compile(r"Headphone state changed \[0\b")),
)
_ACC = re.compile(r"Acc \(type 0\): (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)")
_RSSI = re.compile(r"\bRssi: (-\d+)")


class Signals:
    """A naplóból és a kamera/hang jelzőkből gyűjtött megfigyelések."""

    def __init__(self):
        self._lock = threading.Lock()
        self.events = {}
        self.acc_min = [None, None, None]
        self.acc_max = [None, None, None]
        self.acc_count = 0
        self.rssi = []
        self.flag_times = {"back": [], "front": [], "audio": []}

    def feed(self, message, now=None):
        now = time.time() if now is None else now
        with self._lock:
            for name, pattern in _EVENTS:
                if name in self.events:
                    continue
                if pattern.search(message):
                    # A kihúzás csak bedugás után számít, különben a rendszer
                    # induláskori állapotjelzése is elfogadott lenne.
                    if name == "jack_out" and "jack_in" not in self.events:
                        continue
                    self.events[name] = now
            match = _ACC.search(message)
            if match:
                self.acc_count += 1
                for i in range(3):
                    value = float(match.group(i + 1))
                    if self.acc_min[i] is None or value < self.acc_min[i]:
                        self.acc_min[i] = value
                    if self.acc_max[i] is None or value > self.acc_max[i]:
                        self.acc_max[i] = value
            match = _RSSI.search(message)
            if match and len(self.rssi) < 1000:
                self.rssi.append(int(match.group(1)))

    def flag(self, name, now=None):
        with self._lock:
            self.flag_times[name].append(time.time() if now is None else now)

    def flag_seen(self, name, start, end):
        with self._lock:
            return any(start <= t <= end for t in self.flag_times[name])

    def acc_range(self):
        """Az egyes tengelyek legnagyobb kitérése g-ben, adat nélkül None."""
        with self._lock:
            if self.acc_count == 0:
                return None
            return max(self.acc_max[i] - self.acc_min[i] for i in range(3))
