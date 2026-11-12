"""A fogadó (Google Apps Script) elérése."""
import json
import ssl
import urllib.parse
import urllib.request

import certifi


class BackendError(Exception):
    pass


class Backend:
    def __init__(self, url):
        self.url = url
        self.context = ssl.create_default_context(cafile=certifi.where())

    def _read(self, request):
        try:
            with urllib.request.urlopen(request, timeout=30, context=self.context) as response:
                return json.loads(response.read().decode("utf-8"))
        except (OSError, ValueError) as error:
            raise BackendError(f"A fogadó nem érhető el: {error}")

    def post(self, payload):
        data = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "text/plain;charset=utf-8"}
        return self._read(urllib.request.Request(self.url, data=data, headers=headers, method="POST"))

    def start(self, code):
        result = self.post({"action": "start", "code": code})
        if not result.get("ok"):
            raise BackendError(result.get("error") or "A meghívókód nem érvényes.")
        return result["sid"]

    def step(self, sid, name, data):
        return self.post({"action": "step", "sid": sid, "name": name, "data": data})

    def steps(self, sid):
        query = urllib.parse.urlencode({"s": sid})
        result = self._read(urllib.request.Request(f"{self.url}?{query}"))
        if not result.get("ok"):
            raise BackendError(result.get("error") or "A session nem érvényes.")
        return result.get("steps") or {}

    def finish(self, sid, serial, sections):
        result = self.post({"action": "finish", "sid": sid, "serial": serial, "sections": sections})
        if not result.get("ok"):
            raise BackendError(result.get("error") or "A riport küldése nem sikerült.")

    def report(self, code, kind, serial, sections):
        result = self.post({"action": "report", "code": code, "kind": kind, "serial": serial, "sections": sections})
        if not result.get("ok"):
            raise BackendError(result.get("error") or "A riport küldése nem sikerült.")
        return result
