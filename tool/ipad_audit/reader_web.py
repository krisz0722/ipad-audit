import asyncio
import http.server
import ipaddress
import json
import mimetypes
import re
import secrets
import socket
import sys
import time
import uuid
import webbrowser
from pathlib import Path
from urllib.parse import urlsplit


WEB_FILES = frozenset(("index.html", "style.css", "config.js", "parse.js", "example.js", "seller.js"))
SELLER_URL = "https://apple.audit.kokocloud.space/"


def web_directory():
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
    return base / "web"


def seller_base_url(dev=False, base_url=""):
    if not base_url:
        if not dev:
            return SELLER_URL
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
                route.connect(("192.0.2.1", 9))
                address = ipaddress.ip_address(route.getsockname()[0])
                if address.is_loopback or address.is_unspecified:
                    raise ValueError("Nincs helyi hálózati cím.")
            base_url = "http://%s:8766/" % address
        except (OSError, ValueError) as error:
            raise ValueError("A dev hálózati cím nem állapítható meg. Add meg a dev szerver iPadről elérhető címét a --web-url argumentummal.") from error
    parsed = urlsplit(base_url)
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or re.search(r"[\x00-\x20\x7f]", base_url)
    ):
        raise ValueError("A webes alapcím HTTP vagy HTTPS URL legyen, kód és query nélkül.")
    parsed.port
    return parsed._replace(path=parsed.path.rstrip("/") + "/").geturl()


def public_seller_url(code, base_url=SELLER_URL, sid=""):
    if not re.fullmatch(r"(?:[0-9]{9}|[0-9A-Z]{12})", code):
        raise ValueError("Hibás meghívókód.")
    if sid and not re.fullmatch(r"[0-9A-F]{32}", sid):
        raise ValueError("Hibás tesztazonosító.")
    return seller_base_url(base_url=base_url) + "#" + code + ("." + sid if sid else "")


async def _open_device_page(url):
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.webinspector import SAFARI, WebinspectorService, WirTypes
    from pymobiledevice3.services.web_protocol.session_protocol import SessionProtocol

    class CancellationSafeWebinspectorService(WebinspectorService):
        async def _await_or_raise_disabled(self, coro, disabled_task):
            """Drain the library's handshake task before its connection closes."""
            operation = asyncio.create_task(coro)
            try:
                completed_tasks, _ = await asyncio.wait(
                    {operation, disabled_task}, return_when=asyncio.FIRST_COMPLETED
                )
                if disabled_task in completed_tasks:
                    operation.cancel()
                    await disabled_task
                return await operation
            finally:
                if not operation.done():
                    operation.cancel()
                await asyncio.gather(operation, return_exceptions=True)

    async with await create_using_usbmux(autopair=False) as lockdown:
        inspector = CancellationSafeWebinspectorService(lockdown)
        try:
            await inspector.connect()
            application = await inspector.open_app(SAFARI, timeout=3)
            available_pages = await inspector.get_open_application_pages(timeout=0.25)
            for entry in available_pages:
                if entry.application.id_ != application.id_:
                    continue
                page = entry.page
                if page.type_ not in (WirTypes.WEB, WirTypes.WEB_PAGE):
                    continue
                target_base = urlsplit(url)._replace(fragment="").geturl()
                if page.web_url != "about:blank" and not page.web_url.startswith(target_base):
                    continue
                protocol = SessionProtocol(inspector, str(uuid.uuid4()).upper(), application, page, method_prefix="")
                await inspector.setup_inspector_socket(protocol.id_, application.id_, page.id_)
                response = await protocol.send_receive("Page.navigate", url=url)
                return isinstance(response, dict) and not response.get("error") and not response.get("errorText")
        finally:
            await inspector.close()
    return False


def open_on_device(code, timeout=8, base_url=SELLER_URL, sid=""):
    try:
        url = public_seller_url(code, base_url=base_url, sid=sid)
        return asyncio.run(asyncio.wait_for(_open_device_page(url), timeout))
    except Exception:
        return False


def create_server(block, directory=None, code="", usb_sent=False):
    directory = Path(directory) if directory is not None else web_directory()
    prefix = "/" + secrets.token_urlsafe(32) + "/"
    expires = time.monotonic() + 1800

    class Handler(http.server.BaseHTTPRequestHandler):
        def setup(self):
            self.request.settimeout(10)
            super().setup()

        def log_message(self, format, *args):
            pass

        def do_GET(self):
            if time.monotonic() >= expires:
                self.send_error(410)
                return
            if self.headers.get("Host") != "127.0.0.1:%s" % self.server.server_port:
                self.send_error(403)
                return
            path = urlsplit(self.path).path
            if not path.startswith(prefix):
                self.send_error(404)
                return
            name = path[len(prefix):] or "index.html"
            if name in WEB_FILES:
                try:
                    content = (directory / name).read_bytes()
                except OSError:
                    self.send_error(404)
                    return
                if name == "index.html":
                    marker = b'<script src="seller.js"></script>'
                    if content.count(marker) != 1:
                        self.send_error(500)
                        return
                    payload = json.dumps({"block": block, "code": code, "sent": bool(usb_sent)}, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
                    script = ('<script>window.USB_READER_DATA=' + payload + ';window.USB_READER_BLOCK=window.USB_READER_DATA.block;</script>\n').encode("ascii")
                    content = content.replace(marker, script + marker)
                content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()
            self.wfile.write(content)
            self.server.last_activity = time.monotonic()

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.last_activity = time.monotonic()
    return server, "http://127.0.0.1:%s%s" % (server.server_port, prefix)


def open_page(block, code="", usb_sent=False):
    server, url = create_server(block, code=code, usb_sent=usb_sent)
    server.timeout = 1
    try:
        if not webbrowser.open(url):
            print("A böngésző nem nyílt meg. Nyisd meg ezt a helyi címet: " + url, file=sys.stderr)
        else:
            print("A weboldal megnyílik a böngészőben. A programot hagyd futni a folyamat végéig.", file=sys.stderr)
        while time.monotonic() - server.last_activity < 1800:
            server.handle_request()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()