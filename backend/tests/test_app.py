import os, tempfile, hashlib
from pathlib import Path

workspace = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = "sqlite:///" + workspace.name + "/test.db"
os.environ["STORAGE_MODE"] = "local"
os.environ["LOCAL_EVIDENCE_DIR"] = workspace.name + "/evidence"
os.environ["OPERATOR_PASSWORD"] = "SentinelDemo!2026"
os.environ["VIEWER_PASSWORD"] = "ViewerDemo!2026"
os.environ["SEED_DEMO"] = "false"
os.environ["LLM_PROVIDER"] = "rules"
os.environ["VECTOR_ENABLED"] = "false"
from fastapi.testclient import TestClient
from app.main import app
from app.rules import assess
from app.data import scenarios


def headers(client, who="operator"):
    password = "SentinelDemo!2026" if who == "operator" else "ViewerDemo!2026"
    r = client.post("/api/auth/login", json={"username": who, "password": password})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_rules_cover_all_modules_and_stale_context():
    rows = scenarios()
    assert [assess(x)["severity"] for x in rows] == [
        "High",
        "Critical",
        "High",
        "Critical",
        "High",
        "High",
    ]
    fresh = assess(rows[1])["score"]
    rows[1]["metrics"]["age_seconds"] = 700
    assert assess(rows[1])["score"] == fresh - 25
    high = assess(rows[3])["score"]
    rows[3]["metrics"]["maintenance"] = True
    assert assess(rows[3])["score"] == high - 30


def test_workflow_dedup_permissions_evidence_correlation_and_assistant():
    with TestClient(app) as c:
        assert c.get("/api/events").status_code == 403
        assert (
            c.post(
                "/api/auth/login", json={"username": "operator", "password": "bad"}
            ).status_code
            == 401
        )
        op = headers(c)
        view = headers(c, "viewer")
        p = scenarios()[0]
        first = c.post("/api/events", headers=op, json=p)
        assert first.status_code == 200
        e = first.json()["event"]
        eid = e["id"]
        assert first.json()["duplicate"] is False
        assert c.post("/api/events", headers=op, json=p).json()["duplicate"] is True
        assert c.post("/api/events", headers=view, json=p).status_code == 403
        assert (
            c.patch(
                "/api/events/" + eid,
                headers=op,
                json={"status": "Resolved", "note": "invalid jump"},
            ).status_code
            == 409
        )
        for state in ["Acknowledged", "Investigating", "Escalated", "Resolved"]:
            r = c.patch(
                "/api/events/" + eid,
                headers=op,
                json={"status": state, "note": "Reviewed by training operator"},
            )
            assert r.status_code == 200
        assert len(c.get("/api/events/" + eid + "/audit", headers=view).json()) == 5
        evidence = c.get("/api/events/" + eid + "/evidence", headers=view)
        assert hashlib.sha256(evidence.content).hexdigest() == e["evidence_hash"]
        second = scenarios()[2]
        c.post("/api/events", headers=op, json=second)
        assert len(c.get("/api/events/" + eid + "/related", headers=view).json()) == 1
        a = c.post(
            "/api/assistant",
            headers=view,
            json={"question": "How to review this report?", "event_id": eid},
        )
        assert (
            a.status_code == 200
            and a.json()["sources"]
            and a.json()["provider"] == "Rules / extractive demo"
        )
        # Tampering is detected before evidence is returned.
        Path(workspace.name + "/evidence/" + e["evidence_key"]).write_text("tampered")
        assert (
            c.get("/api/events/" + eid + "/evidence", headers=view).status_code == 409
        )


def test_untrusted_manual_input_and_invalid_metrics():
    with TestClient(app) as c:
        op = headers(c)
        p = scenarios()[3]
        p["source_event_id"] = "untrusted-case"
        e = c.post("/api/events", headers=op, json=p).json()["event"]
        assert not e["verified_source"] and e["simulated"]
        p["metrics"] = {"failed_logins": -1}
        assert c.post("/api/events", headers=op, json=p).status_code == 422
        p["metrics"] = {"network_anomaly": "false"}
        assert c.post("/api/events", headers=op, json=p).status_code == 422
        p["metrics"] = {}
        p["observed_at"] = "2099-01-01T10:00:00+00:00"
        assert c.post("/api/events", headers=op, json=p).status_code == 422
