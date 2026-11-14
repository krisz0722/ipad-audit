import asyncio
import pytest
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

from ipad_audit import reader  # noqa: E402

AUDIT_SID = "0123456789ABCDEF0123456789ABCDEF"


@pytest.fixture(autouse=True)
def mock_audit_backend(monkeypatch):
    from ipad_audit import audit, battery_test
    from ipad_audit.backend import Backend

    calls = []
    monkeypatch.setattr(reader.secrets, "token_hex", lambda length: AUDIT_SID.lower())
    monkeypatch.setattr(Backend, "audit_begin", lambda self, *args, **options: calls.append(("begin", args, options)) or {"ok": True})
    monkeypatch.setattr(Backend, "audit_event", lambda self, *args, **options: calls.append(("event", args, options)) or {"ok": True})
    monkeypatch.setattr(Backend, "audit_link", lambda self, *args, **options: calls.append(("link", args, options)) or {"ok": True, "linkSent": True})
    monkeypatch.setattr(battery_test, "run_interactive", lambda *args, **options: None)
    monkeypatch.setattr(audit, "watch", lambda *args, **options: calls.append(("watch", args, options)) or "completed")
    return calls

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


@pytest.mark.parametrize("code", ["123456789", "DEMOFAKE1234"])
@pytest.mark.parametrize("consent", ["igen", "", "  "])
def test_main_prints_device_url_without_opening_computer_browser(monkeypatch, capsys, code, consent, mock_audit_backend):
    from ipad_audit import reader_web
    from ipad_audit.backend import Backend
    import webbrowser

    async def read(notify):
        return RAW

    monkeypatch.setattr(reader, "read_raw", read)
    monkeypatch.setattr(reader_web, "open_on_device", lambda code, **options: False)
    monkeypatch.setattr(reader_web, "open_page", lambda *args, **options: pytest.fail("computer page opened"))
    monkeypatch.setattr(reader_web, "create_server", lambda *args, **options: pytest.fail("local server started"))
    monkeypatch.setattr(webbrowser, "open", lambda *args, **options: pytest.fail("computer browser opened"))
    answers = iter([consent, ""])
    prompts = []

    def answer(prompt):
        prompts.append(prompt)
        return next(answers)

    monkeypatch.setattr("builtins.input", answer)
    monkeypatch.setattr(Backend, "report", lambda *args, **options: pytest.fail("old email API used"))
    assert reader.main(["--code", code]) == 0
    assert "Enter: igen" in prompts[0]
    output = capsys.readouterr()
    assert "A WEBES TESZTET AZ IPADEN VAGY IPHONE-ON FOLYTASD" in output.err
    assert output.err.count("=" * 64) == 3
    assert reader_web.public_seller_url(code, sid=AUDIT_SID) in output.err.splitlines()
    assert "127.0.0.1" not in output.out + output.err
    assert mock_audit_backend[0] == ("begin", (code, AUDIT_SID), {"email_requested": False})
    assert mock_audit_backend[1][1] == (code, AUDIT_SID, 1, "usb", "ok", reader.usb_sections(RAW))
    assert mock_audit_backend[2][0] == "watch"
    assert "DMPS00000FAK" not in output.out + output.err


def test_main_offers_copy_before_read_and_does_not_print_email(monkeypatch, capsys):
    from ipad_audit import reader_web
    from ipad_audit.backend import Backend

    events = []
    answers = iter(["igen", "hibas", "seller+audit@example.test"])

    def answer(prompt):
        events.append("input")
        return next(answers)

    async def read(notify):
        events.append("read")
        return RAW

    def persist(self, *args, **options):
        events.append("save")
        assert "seller+audit@example.test" not in str((args, options))
        return {"ok": True}

    def watch(backend, code, sid, email, notify, **options):
        events.append("watch")
        assert email == "seller+audit@example.test"
        return "completed"

    def open_on_device(code, **options):
        events.append("device")
        return False

    monkeypatch.setattr("builtins.input", answer)
    monkeypatch.setattr(reader, "read_raw", read)
    from ipad_audit import audit
    monkeypatch.setattr(Backend, "audit_event", persist)
    monkeypatch.setattr(audit, "watch", watch)
    monkeypatch.setattr(reader_web, "open_page", lambda *args, **options: pytest.fail("computer browser opened"))
    monkeypatch.setattr(reader_web, "open_on_device", open_on_device)
    assert reader.main(["--code", "123456789"]) == 0
    assert events == ["input", "input", "input", "read", "save", "device", "watch"]
    output = capsys.readouterr()
    assert "Email még nem ment el" in output.err
    assert "seller+audit@example.test" not in output.out + output.err


@pytest.mark.parametrize("state, exit_code", [("completed", 0), ("interrupted", 1)])
def test_main_waits_for_web_result_without_claiming_early_email(monkeypatch, capsys, state, exit_code):
    from ipad_audit import reader_web
    from ipad_audit import audit
    from ipad_audit.backend import Backend

    answers = iter(["igen", "seller@example.test"])

    async def read(notify):
        return RAW

    monkeypatch.setattr("builtins.input", lambda prompt: next(answers))
    monkeypatch.setattr(reader, "read_raw", read)
    monkeypatch.setattr(Backend, "report", lambda *args, **options: pytest.fail("old email API used"))
    monkeypatch.setattr(audit, "watch", lambda *args, **options: state)
    monkeypatch.setattr(reader_web, "open_page", lambda *args, **options: pytest.fail("computer browser opened"))
    monkeypatch.setattr(reader_web, "open_on_device", lambda code, **options: False)
    assert reader.main(["--code", "123456789"]) == exit_code
    assert "elküldtük" not in capsys.readouterr().err


def test_main_sends_continuation_link_via_audit_link_when_email_requested(monkeypatch, capsys, mock_audit_backend):
    from ipad_audit import reader_web

    answers = iter(["igen", "seller@example.test"])
    monkeypatch.setattr("builtins.input", lambda prompt: next(answers))

    async def read(notify):
        return RAW

    monkeypatch.setattr(reader, "read_raw", read)
    monkeypatch.setattr(reader_web, "open_on_device", lambda *args, **options: False)
    assert reader.main(["--code", "123456789"]) == 0
    output = capsys.readouterr()
    assert "A folytatólinket kiküldtük az emailcímedre" in output.err
    link_calls = [call for call in mock_audit_backend if call[0] == "link"]
    assert len(link_calls) == 1
    assert link_calls[0][1] == ("123456789", AUDIT_SID, "seller@example.test")


def test_main_failed_delivery_prints_link_without_opening_any_browser(monkeypatch, capsys):
    from ipad_audit import reader_web
    from ipad_audit.backend import Backend, BackendError

    answers = iter(["igen", ""])

    async def read(notify):
        return RAW

    def report(self, *args, **options):
        raise BackendError("A teszt backend nem érhető el.")

    monkeypatch.setattr("builtins.input", lambda prompt: next(answers))
    monkeypatch.setattr(reader, "read_raw", read)
    monkeypatch.setattr(Backend, "audit_event", report)
    monkeypatch.setattr(reader_web, "open_on_device", lambda *args: pytest.fail("Safari opened after failed delivery"))
    monkeypatch.setattr(reader_web, "open_page", lambda *args, **options: pytest.fail("computer browser opened"))
    assert reader.main(["--code", "123456789"]) == 1
    output = capsys.readouterr()
    assert "A USB-adatok mentése nem igazolt" in output.err


def test_backend_client_only_adds_copy_email_when_requested(monkeypatch):
    from ipad_audit.backend import Backend

    backend = Backend("https://example.test/audit")
    posted = []

    def post(payload):
        posted.append(payload)
        return {"ok": True, "kind": "usb"}

    monkeypatch.setattr(backend, "post", post)
    backend.report("123456789", "usb", "DMPS00000FAK", reader.usb_sections(RAW))
    backend.report("123456789", "usb", "DMPS00000FAK", reader.usb_sections(RAW), copy_email="seller@example.test")
    assert "copyEmail" not in posted[0]
    assert posted[1]["copyEmail"] == "seller@example.test"


def test_main_opens_safari_after_save_and_keeps_watching_without_computer_browser(monkeypatch):
    from ipad_audit import reader_web
    from ipad_audit import audit
    from ipad_audit.backend import Backend

    answers = iter(["igen", "seller@example.test"])
    events = []

    async def read(notify):
        events.append("read")
        return RAW

    def persist(self, *args, **options):
        events.append("save")
        return {"ok": True}

    def open_on_device(code, **options):
        events.append("device")
        assert code == "123456789"
        assert options == {"base_url": reader_web.SELLER_URL, "sid": AUDIT_SID}
        return True

    def watch(*args, **options):
        events.append("watch")
        return "completed"

    monkeypatch.setattr("builtins.input", lambda prompt: next(answers))
    monkeypatch.setattr(reader, "read_raw", read)
    monkeypatch.setattr(Backend, "audit_event", persist)
    monkeypatch.setattr(audit, "watch", watch)
    monkeypatch.setattr(reader_web, "open_on_device", open_on_device)
    monkeypatch.setattr(reader_web, "open_page", lambda *args, **options: pytest.fail("computer browser opened"))
    assert reader.main(["--code", "123456789"]) == 0
    assert events == ["read", "save", "device", "watch"]


@pytest.mark.parametrize("arguments, expected_url", [
    (["--dev"], "http://192.168.50.20:8766/"),
    (["--dev", "--web-url", "http://192.168.50.30:9000/web/"], "http://192.168.50.30:9000/web/"),
])
def test_main_dev_mode_uses_same_url_for_safari_and_terminal(monkeypatch, capsys, arguments, expected_url):
    from ipad_audit import reader_web
    from ipad_audit.backend import Backend

    answers = iter(["", ""])
    targets = []

    async def read(notify):
        return RAW

    def resolve_url(dev=False, base_url=""):
        return base_url or ("http://192.168.50.20:8766/" if dev else reader_web.SELLER_URL)

    def open_on_device(code, **options):
        targets.append((code, options["base_url"]))
        return False

    monkeypatch.setattr("builtins.input", lambda prompt: next(answers))
    monkeypatch.setattr(reader, "read_raw", read)
    monkeypatch.setattr(reader_web, "seller_base_url", resolve_url)
    monkeypatch.setattr(reader_web, "open_on_device", open_on_device)
    monkeypatch.setattr(reader_web, "open_page", lambda *args, **options: pytest.fail("computer browser opened"))
    assert reader.main(["--code", "123456789"] + arguments) == 0
    output = capsys.readouterr()
    assert expected_url + "#123456789." + AUDIT_SID in output.err.splitlines()
    assert reader_web.SELLER_URL not in output.out + output.err
    assert targets == [("123456789", expected_url)]


def test_seller_url_uses_production_only_outside_dev(monkeypatch):
    from ipad_audit import reader_web

    class Route:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def connect(self, address):
            assert address == ("192.0.2.1", 9)

        def getsockname(self):
            return ("192.168.50.20", 50000)

    monkeypatch.setattr(reader_web.socket, "socket", lambda *args: Route())
    assert reader_web.seller_base_url() == reader_web.SELLER_URL
    dev_url = reader_web.seller_base_url(dev=True)
    assert dev_url == "http://192.168.50.20:8766/"
    assert reader_web.public_seller_url("123456789", dev_url) == dev_url + "#123456789"
    assert reader_web.seller_base_url(dev=True, base_url="http://192.168.50.30:9000/web") == "http://192.168.50.30:9000/web/"


@pytest.mark.parametrize("base_url", [
    "file:///tmp/audit/", "javascript:alert(1)", "http://", "http://host:invalid/",
    "https://example.test/#123456789", "https://example.test/?code=123456789",
    "https://user:pass@example.test/", "https://example.test/\n",
])
def test_seller_base_url_rejects_invalid_addresses(base_url):
    from ipad_audit import reader_web

    with pytest.raises(ValueError):
        reader_web.seller_base_url(base_url=base_url)


def test_dev_url_never_falls_back_to_production_when_offline(monkeypatch):
    from ipad_audit import reader_web

    def offline(*args):
        raise OSError("no route")

    monkeypatch.setattr(reader_web.socket, "socket", offline)
    with pytest.raises(ValueError, match="--web-url"):
        reader_web.seller_base_url(dev=True)


@pytest.mark.parametrize("page_url, allowed", [
    ("https://apple.audit.kokocloud.space/#987654321", True),
    ("about:blank", True),
    ("https://personal.example.test/", False),
    ("https://apple.audit.kokocloud.space.evil.example.test/", False),
])
def test_device_browser_only_navigates_audit_or_blank_tab(monkeypatch, page_url, allowed):
    from types import SimpleNamespace
    from ipad_audit import reader_web
    from pymobiledevice3 import lockdown
    from pymobiledevice3.services import webinspector
    from pymobiledevice3.services.web_protocol.session_protocol import SessionProtocol

    events = []
    application = SimpleNamespace(id_="fake-safari")
    page = SimpleNamespace(id_=1, type_=webinspector.WirTypes.WEB, web_url=page_url)

    class Lockdown:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            events.append("lockdown_closed")

    async def connect(**options):
        assert options == {"autopair": False}
        return Lockdown()

    class Inspector:
        def __init__(self, connection):
            pass

        async def connect(self):
            events.append("connected")

        async def close(self):
            events.append("inspector_closed")

        async def open_app(self, bundle, timeout):
            assert bundle == "com.apple.mobilesafari"
            return application

        async def get_open_application_pages(self, timeout):
            return [SimpleNamespace(application=application, page=page)]

        async def setup_inspector_socket(self, session_id, app_id, page_id):
            assert app_id == application.id_
            assert page_id == page.id_

    async def send_receive(protocol, command, **options):
        assert protocol.method_prefix == ""
        assert command == "Page.navigate"
        assert options == {"url": "https://apple.audit.kokocloud.space/#123456789"}
        events.append("navigate")
        return {"frameId": "fake-frame"}

    monkeypatch.setattr(lockdown, "create_using_usbmux", connect)
    monkeypatch.setattr(webinspector, "WebinspectorService", Inspector)
    monkeypatch.setattr(SessionProtocol, "send_receive", send_receive)
    result = reader_web.open_on_device("123456789")
    assert result is allowed
    assert ("navigate" in events) is allowed
    assert events[-2:] == ["inspector_closed", "lockdown_closed"]


def test_device_browser_receives_configured_dev_url(monkeypatch):
    from ipad_audit import reader_web

    opened = []

    async def open_page(url):
        opened.append(url)
        return True

    monkeypatch.setattr(reader_web, "_open_device_page", open_page)
    assert reader_web.open_on_device("123456789", base_url="http://192.168.50.20:8766/") is True
    assert opened == ["http://192.168.50.20:8766/#123456789"]


def test_device_browser_closes_connection_when_inspector_connect_fails(monkeypatch):
    from ipad_audit import reader_web
    from pymobiledevice3 import lockdown
    from pymobiledevice3.services import webinspector

    events = []

    class Lockdown:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            events.append("lockdown_closed")

    async def connect(**options):
        return Lockdown()

    class Inspector:
        def __init__(self, connection):
            pass

        async def connect(self):
            raise ConnectionError("Web Inspector unavailable")

        async def close(self):
            events.append("inspector_closed")

    monkeypatch.setattr(lockdown, "create_using_usbmux", connect)
    monkeypatch.setattr(webinspector, "WebinspectorService", Inspector)
    assert reader_web.open_on_device("123456789") is False
    assert events == ["inspector_closed", "lockdown_closed"]


def test_device_browser_timeout_and_invalid_code_are_safe(monkeypatch):
    from ipad_audit import reader_web

    async def blocked(url):
        await asyncio.Event().wait()

    monkeypatch.setattr(reader_web, "_open_device_page", blocked)
    assert reader_web.open_on_device("123456789", timeout=0.01) is False
    assert reader_web.open_on_device("not-a-code") is False


@pytest.mark.parametrize("outcome", ["timeout", "cancel_error", "receive_error", "disabled", "success"])
def test_device_browser_awaits_handshake_child_before_closing(monkeypatch, caplog, outcome):
    from types import SimpleNamespace
    from ipad_audit import reader_web
    from pymobiledevice3 import lockdown
    from pymobiledevice3.exceptions import ConnectionTerminatedError, WebInspectorNotEnabledError
    from pymobiledevice3.services import webinspector

    events = []

    class Lockdown:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            events.append("lockdown_closed")

    async def connect(**options):
        return Lockdown()

    class Inspector(webinspector.WebinspectorService):
        def __init__(self, connection):
            pass

        async def connect(self):
            receive_started = asyncio.Event()

            async def receive():
                try:
                    receive_started.set()
                    if outcome == "success":
                        return "connected"
                    if outcome == "receive_error":
                        raise ConnectionTerminatedError()
                    await asyncio.Event().wait()
                finally:
                    events.append("receive_finished")
                    if outcome == "cancel_error":
                        raise ConnectionTerminatedError()

            async def disabled():
                if outcome == "disabled":
                    await receive_started.wait()
                    raise WebInspectorNotEnabledError()
                await asyncio.Event().wait()

            disabled_task = asyncio.create_task(disabled())
            try:
                result = await self._await_or_raise_disabled(receive(), disabled_task)
                assert result == "connected"
                events.append("handshake_completed")
            finally:
                disabled_task.cancel()
                await asyncio.gather(disabled_task, return_exceptions=True)

        async def open_app(self, bundle, timeout):
            return SimpleNamespace(id_="fake-safari")

        async def get_open_application_pages(self, timeout):
            return []

        async def close(self):
            events.append("inspector_closed")

    monkeypatch.setattr(lockdown, "create_using_usbmux", connect)
    monkeypatch.setattr(webinspector, "WebinspectorService", Inspector)
    assert reader_web.open_on_device("123456789", timeout=0.01) is False
    expected = ["receive_finished"]
    if outcome == "success":
        expected.append("handshake_completed")
    assert events == expected + ["inspector_closed", "lockdown_closed"]
    assert "Task exception was never retrieved" not in caplog.text
    assert "unhandled exception during asyncio.run() shutdown" not in caplog.text


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


def test_extract_code():
    assert reader.extract_code("123456789") == "123456789"
    assert reader.extract_code("123 456 789") == "123456789"
    assert reader.extract_code("https://apple.audit.kokocloud.space/#123456789") == "123456789"
    assert reader.extract_code("https://apple.audit.kokocloud.space/#123456789.0123456789ABCDEF0123456789ABCDEF") == "123456789"
    assert reader.extract_code("DEMOFAKE1234") == "DEMOFAKE1234"
    assert reader.extract_code("") == ""
