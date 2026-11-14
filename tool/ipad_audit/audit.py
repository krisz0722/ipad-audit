"""A webes teszt követése, személyes adatok nélküli terminal-loggal."""
import time

from ipad_audit.backend import BackendError


STEP_NAMES = {
    "usb": "USB-adatok mentése", "start": "Webes teszt indítása",
    "details": "Eszközadatok", "touch": "Touch teszt", "motion": "Mozgásteszt",
    "audio": "Hangteszt", "rear": "Hátlapi kamera", "front": "Előlapi kamera",
    "display": "Kijelző", "buttons": "Fizikai gombok", "keyboard": "Billentyűzet", "pointer": "Egér és trackpad",
    "review": "Riport előnézete", "skip": "Teszt kihagyása", "error": "Webes hiba",
    "finish": "Összesített riport mentése", "cancel": "Teszt megszakítása",
}
STATUS_NAMES = {
    "started": "elindult", "ok": "rendben", "warn": "figyelmeztetés", "bad": "hibás eredmény",
    "skipped": "kihagyva", "unavailable": "nem érhető el", "error": "hiba",
}


def _email(backend, code, sid, email, notify):
    if not email:
        return
    try:
        result = backend.audit_email(code, sid, email)
        if result.get("emailSent"):
            notify("Az összesített eladói email küldését a szerver visszaigazolta.")
        else:
            notify("Az eladói email küldése nem igazolt. Az eredmények a Sheetben megmaradtak.")
    except BackendError as error:
        notify("Az eladói email küldése nem igazolt: " + str(error))


def watch(backend, code, sid, email, notify, timeout=1800, interval=3, clock=time.monotonic, wait=time.sleep):
    started = clock()
    after = 0
    disconnected = False
    notify("A program nyitva marad. A webes tesztet az iPaden folytasd; itt megjelennek a lépések.")
    try:
        while clock() - started < timeout:
            try:
                result = backend.audit_status(code, sid, after)
                if result.get("state") not in ("running", "completed", "interrupted"):
                    raise BackendError("Ismeretlen tesztállapot.")
                if disconnected:
                    notify("A státuszkapcsolat helyreállt.")
                    disconnected = False
                for event in result.get("events", []):
                    sequence = event.get("seq", 0)
                    if not isinstance(sequence, int) or sequence <= after:
                        continue
                    elapsed = max(0, int(clock() - started))
                    notify("[%02d:%02d] %s: %s" % (
                        elapsed // 60, elapsed % 60,
                        STEP_NAMES.get(event.get("step"), "Tesztlépés"),
                        STATUS_NAMES.get(event.get("status"), "állapotfrissítés"),
                    ))
                    after = sequence
                if result["state"] != "running":
                    notify("A teszt véget ért. Az eredmények a private Sheetben vannak.")
                    _email(backend, code, sid, email, notify)
                    return result["state"]
            except BackendError:
                if not disconnected:
                    notify("A státuszkapcsolat megszakadt. Várakozom az újracsatlakozásra; ez nem teszteredmény.")
                    disconnected = True
            wait(interval)
    except KeyboardInterrupt:
        notify("A teszt követését megszakítottad.")
    else:
        notify("Lejárt a teszt követésére szánt idő.")
    try:
        result = backend.audit_status(code, sid)
        if result.get("state") == "running":
            backend.audit_event(code, sid, result["seq"] + 1, "cancel", "error")
        _email(backend, code, sid, email, notify)
    except BackendError:
        notify("A lezárást nem sikerült elmenteni. Csak a korábban visszaigazolt adatok vannak a Sheetben.")
    return "interrupted"