"""Helyi oldal a számítógépen: QR-kód a tesztoldalhoz, utána változó kamerakód."""
import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import segno

ROTATE_SECONDS = 4
FRESH_SECONDS = 30
PREFIX = "IPA1:"

PAGE = """<!doctype html><html lang="hu"><meta charset="utf-8"><title>iPad teszt</title>
<style>body{margin:0;background:#fff;color:#111;font:20px system-ui,sans-serif;text-align:center}
#t{padding:18px 16px 8px;font-weight:600}#l{font-size:17px;color:#444;word-break:break-all;padding:0 16px}
#q svg{width:min(78vh,92vw);height:auto}</style>
<div id=t></div><div id=q></div><div id=l></div><script>
async function f(){try{const s=await(await fetch('/state')).json();
t.textContent=s.title;l.textContent=s.link||'';if(q.dataset.v!==s.value){q.innerHTML=s.svg;q.dataset.v=s.value}}catch(e){}}
f();setInterval(f,1000)</script></html>"""


def _svg(text):
    return segno.make(text, error="m").svg_inline(scale=8, border=4)


class Board:
    def __init__(self, link):
        self.link = link
        self.lock = threading.Lock()
        self.issued = {}
        self.show_nonces = False
        self.current = None
        self.current_at = 0
        self._svg_cache = (None, None)

    def _rotate(self, now):
        if self.current is None or now - self.current_at >= ROTATE_SECONDS:
            self.current = secrets.token_hex(8)
            self.current_at = now
            self.issued[self.current] = now

    def snapshot(self):
        with self.lock:
            if self.show_nonces:
                self._rotate(time.time())
                value = PREFIX + self.current
                title = "Tartsd az iPad kameráját erre a kódra"
                link = ""
            else:
                value = self.link
                title = "Nyisd meg ezt az iPaden: olvasd be a kóddal, vagy írd be a linket"
                link = self.link
            if self._svg_cache[0] != value:
                self._svg_cache = (value, _svg(value))
            return {"title": title, "link": link, "value": value, "svg": self._svg_cache[1]}

    def enable_nonces(self):
        with self.lock:
            self.show_nonces = True

    def check(self, decoded, now=None):
        """A beolvasott kód ettől a programtól jött-e, és friss-e."""
        now = time.time() if now is None else now
        if not isinstance(decoded, str) or not decoded.startswith(PREFIX):
            return None
        with self.lock:
            issued = self.issued.get(decoded[len(PREFIX):])
        if issued is None or now - issued > FRESH_SECONDS:
            return None
        return issued


def serve(board):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/state":
                body = json.dumps(board.snapshot()).encode()
                kind = "application/json"
            else:
                body = PAGE.encode()
                kind = "text/html; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/"
