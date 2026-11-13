import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

from ipad_audit import audit
from ipad_audit.backend import Backend, BackendError


def test_watch_waits_for_web_and_only_emails_at_the_end():
    calls = []
    messages = []
    states = iter([
        {"state": "running", "events": [{"seq": 1, "step": "usb", "status": "ok"}]},
        {"state": "completed", "events": [{"seq": 1, "step": "usb", "status": "ok"}, {"seq": 2, "step": "finish", "status": "ok"}]},
    ])

    class Client:
        def audit_status(self, code, sid, after=0):
            calls.append(("status", after))
            return next(states)

        def audit_email(self, code, sid, email):
            calls.append(("email", email))
            return {"emailSent": True}

    result = audit.watch(Client(), "123456789", "A" * 32, "seller@example.test", messages.append, wait=lambda interval: None)
    assert result == "completed"
    assert calls == [("status", 0), ("status", 1), ("email", "seller@example.test")]
    assert sum("USB-adatok" in message for message in messages) == 1
    assert "seller@example.test" not in "\n".join(messages)


def test_watch_declined_email_and_recovers_from_network_failure():
    responses = iter([BackendError("offline"), {"state": "completed", "events": []}])
    messages = []

    class Client:
        def audit_status(self, *args):
            response = next(responses)
            if isinstance(response, Exception):
                raise response
            return response

        def audit_email(self, *args):
            pytest.fail("email sent without request")

    assert audit.watch(Client(), "123456789", "A" * 32, "", messages.append, wait=lambda interval: None) == "completed"
    assert any("megszakadt" in message for message in messages)
    assert any("helyreállt" in message for message in messages)


def test_timeout_saves_interrupted_state_and_requested_partial_email():
    calls = []

    class Client:
        def audit_status(self, *args):
            return {"state": "running", "seq": 3}

        def audit_event(self, *args):
            calls.append(args[2:])

        def audit_email(self, *args):
            calls.append("email")
            return {"emailSent": True}

    result = audit.watch(Client(), "123456789", "A" * 32, "seller@example.test", lambda message: None, timeout=0)
    assert result == "interrupted"
    assert calls == [(4, "cancel", "error"), "email"]


def test_new_backend_methods_never_send_recipient_before_final_email(monkeypatch):
    client = Backend("https://example.test/audit")
    requests = []

    def post(payload):
        requests.append(payload)
        return {"ok": True}

    monkeypatch.setattr(client, "post", post)
    client.audit_begin("123456789", "A" * 32, email_requested=True)
    client.audit_event("123456789", "A" * 32, 1, "usb", "ok", [])
    client.audit_status("123456789", "A" * 32)
    client.audit_email("123456789", "A" * 32, "seller@example.test")
    assert "seller@example.test" not in str(requests[:3])
    assert requests[0]["emailRequested"] is True
    assert requests[-1]["email"] == "seller@example.test"