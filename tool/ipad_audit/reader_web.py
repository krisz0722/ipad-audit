import http.server
import json
import mimetypes
import secrets
import sys
import time
import webbrowser
from pathlib import Path
from urllib.parse import urlsplit


WEB_FILES = frozenset(("index.html", "style.css", "config.js", "parse.js", "example.js", "seller.js"))


def web_directory():
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2]))
    return base / "web"


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