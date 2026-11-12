import hashlib, json, secrets, uuid, math
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Literal
import jwt, httpx
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from .config import settings as s
from .models import Base, engine, Session, Event, Audit
from .rules import CATEGORIES, TRANSITIONS, assess
from .data import scenarios
from .services import (
    store_evidence,
    read_evidence,
    assistant_answer,
    index_sops,
    object_client,
    vector_client,
)


def now():
    return datetime.now(timezone.utc).isoformat()


def audit(db, eid, actor, action, note):
    db.add(Audit(event_id=eid, actor=actor, action=action, note=note, created_at=now()))


def serial(e):
    return {
        "id": e.id,
        **e.payload,
        **e.assessment,
        "status": e.status,
        "owner": e.owner,
        "created_at": e.created_at,
        "evidence_key": e.evidence_key,
        "evidence_hash": e.evidence_hash,
    }


def ingest(payload, actor):
    key = hashlib.sha256(
        json.dumps([payload["source"], payload["source_event_id"]]).encode()
    ).hexdigest()
    with Session() as db:
        old = db.scalar(select(Event).where(Event.dedup == key))
        if old:
            return serial(old), True
        eid = "EVT-" + uuid.uuid4().hex[:8].upper()
        object_key = eid + "/original.json"
        digest = store_evidence(object_key, payload)
        e = Event(
            id=eid,
            dedup=key,
            payload=payload,
            assessment=assess(payload),
            status="New",
            owner="Unassigned",
            created_at=now(),
            evidence_key=object_key,
            evidence_hash=digest,
        )
        db.add(e)
        audit(
            db,
            eid,
            actor,
            "Ingested",
            "Evidence preserved; automatic rule assessment recorded",
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            old = db.scalar(select(Event).where(Event.dedup == key))
            return serial(old), True
        return serial(e), False


@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    if s.seed_demo:
        for row in scenarios():
            ingest(row, "demo-seeder")
    yield


app = FastAPI(
    title="Sentinel Threat Operations — interview demo",
    version="1.0.0",
    lifespan=lifespan,
)
security = HTTPBearer()


def user(token: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(token.credentials, s.jwt_secret, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Session expired or invalid")


def operator(u=Depends(user)):
    if u.get("role") != "operator":
        raise HTTPException(403, "Operator role required")
    return u


class Login(BaseModel):
    username: Literal["operator", "viewer"]
    password: str = Field(max_length=200)


@app.post("/api/auth/login")
def login(body: Login):
    expected = s.operator_password if body.username == "operator" else s.viewer_password
    if not secrets.compare_digest(body.password, expected):
        raise HTTPException(401, "Invalid credentials")
    return {
        "token": jwt.encode(
            {
                "sub": body.username,
                "role": body.username,
                "exp": datetime.now(timezone.utc) + timedelta(hours=4),
            },
            s.jwt_secret,
            algorithm="HS256",
        ),
        "role": body.username,
    }


class InputEvent(BaseModel):
    category: Literal[
        "Bomb threat",
        "Aerial alert",
        "Suspicious activity",
        "Cyberattack",
        "Emergency",
        "Early warning",
    ]
    title: str = Field(min_length=3, max_length=180)
    text: str = Field(min_length=5, max_length=15000)
    location: str = Field(default="Unknown", max_length=160)
    source: str = Field(default="Manual training report", max_length=160)
    source_event_id: str = Field(min_length=1, max_length=160)
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    simulated: bool = True
    verified_source: bool = False
    metrics: dict = Field(default_factory=dict)

    @field_validator("observed_at")
    @classmethod
    def timestamp(cls, v):
        if v.tzinfo is None:
            raise ValueError("Timezone is required")
        if v > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("Future timestamps are not accepted")
        return v

    @field_validator("metrics")
    @classmethod
    def metrics_valid(cls, v):
        bools = {
            "sensor_alert",
            "restricted_zone",
            "success_after_failures",
            "network_anomaly",
            "confirmed",
            "warning_sign",
            "maintenance",
        }
        counts = {
            "age_seconds",
            "dwell_seconds",
            "failed_logins",
            "independent_reports",
        }
        for k, x in v.items():
            if k in bools and type(x) is bool:
                continue
            if (
                k in counts
                and type(x) in (int, float)
                and math.isfinite(x)
                and 0 <= x <= 1e9
            ):
                continue
            raise ValueError("Unknown metric or invalid value: " + k)
        return v


@app.get("/api/events")
def events(u=Depends(user)):
    with Session() as db:
        return [
            serial(e)
            for e in db.scalars(select(Event).order_by(Event.created_at.desc())).all()
        ]


@app.post("/api/events")
def create(body: InputEvent, u=Depends(operator)):
    # Manual reports cannot attest connector trust. All inputs remain labelled demo data.
    payload = body.model_dump(mode="json")
    payload["verified_source"] = False
    payload["simulated"] = True
    try:
        event, duplicate = ingest(payload, u["sub"])
        return {"event": event, "duplicate": duplicate}
    except Exception:
        raise HTTPException(
            503, "Evidence/database write failed; event was not accepted"
        )


@app.get("/api/scenarios")
def scenario_list(u=Depends(user)):
    return scenarios()


@app.post("/api/scenarios/{index}")
def simulate(index: int, u=Depends(operator)):
    data = scenarios()
    if not 0 <= index < len(data):
        raise HTTPException(404, "Scenario not found")
    payload = data[index]
    payload["source_event_id"] = "sim-" + uuid.uuid4().hex
    payload["observed_at"] = now()
    event, _ = ingest(payload, u["sub"])
    return event


class Update(BaseModel):
    status: str
    note: str = Field(min_length=3, max_length=2000)


@app.patch("/api/events/{eid}")
def update(eid: str, body: Update, u=Depends(operator)):
    with Session() as db:
        e = db.get(Event, eid, with_for_update=True)
        if not e:
            raise HTTPException(404, "Event not found")
        if body.status not in TRANSITIONS[e.status]:
            raise HTTPException(409, "Invalid status transition")
        previous = e.status
        e.status = body.status
        e.owner = u["sub"]
        audit(
            db,
            eid,
            u["sub"],
            body.status,
            previous + " → " + body.status + ": " + body.note,
        )
        db.commit()
        return serial(e)


@app.get("/api/events/{eid}/audit")
def history(eid: str, u=Depends(user)):
    with Session() as db:
        return [
            {
                "actor": a.actor,
                "action": a.action,
                "note": a.note,
                "created_at": a.created_at,
            }
            for a in db.scalars(
                select(Audit).where(Audit.event_id == eid).order_by(Audit.id)
            ).all()
        ]


@app.get("/api/events/{eid}/related")
def related(eid: str, u=Depends(user)):
    with Session() as db:
        e = db.get(Event, eid)
        if not e:
            raise HTTPException(404, "Event not found")
        t = datetime.fromisoformat(e.payload["observed_at"])
        loc = e.payload["location"].strip().lower()
        matches = []
        for x in db.scalars(select(Event)).all():
            if (
                x.id != eid
                and x.payload.get("simulated", True) == e.payload.get("simulated", True)
                and loc not in ("unknown", "")
                and x.payload["location"].strip().lower() == loc
                and abs(
                    (
                        datetime.fromisoformat(x.payload["observed_at"]) - t
                    ).total_seconds()
                )
                <= 1800
            ):
                matches.append(
                    {
                        **serial(x),
                        "correlation_reason": "Same reported location within 30 minutes; relationship unverified",
                    }
                )
        return matches


@app.get("/api/events/{eid}/evidence")
def evidence(eid: str, u=Depends(user)):
    with Session() as db:
        e = db.get(Event, eid)
        if not e:
            raise HTTPException(404, "Event not found")
        try:
            blob = read_evidence(e.evidence_key)
        except Exception:
            raise HTTPException(503, "Evidence storage unavailable")
        if hashlib.sha256(blob).hexdigest() != e.evidence_hash:
            raise HTTPException(409, "Evidence integrity check failed")
        return Response(blob, media_type="application/json")


class Ask(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    event_id: str | None = None


@app.post("/api/assistant")
def ask(body: Ask, u=Depends(user)):
    with Session() as db:
        context = {}
        if body.event_id:
            e = db.get(Event, body.event_id)
            if not e:
                raise HTTPException(404, "Event not found")
            context = serial(e)
        try:
            result = assistant_answer(body.question, context)
        except Exception:
            raise HTTPException(
                503,
                "Assistant unavailable. Check selected provider, model and indexing; rule alerts remain available.",
            )
        audit(
            db, body.event_id or "assistant", u["sub"], "Assistant query", body.question
        )
        db.commit()
        return result


@app.post("/api/knowledge/index")
def index(u=Depends(operator)):
    try:
        return index_sops()
    except Exception:
        raise HTTPException(
            503, "Indexing failed; verify Milvus and pull the embedding model"
        )


@app.get("/api/health")
def health():
    return {"status": "ok", "application": "Sentinel", "demo": True}


@app.get("/api/system")
def system(u=Depends(user)):
    checks = []
    try:
        with engine.connect() as c:
            c.exec_driver_sql("SELECT 1")
        dbstate = "Connected"
    except Exception:
        dbstate = "Unavailable"
    checks.append(
        {
            "name": (
                "PostgreSQL"
                if not s.database_url.startswith("sqlite")
                else "SQLite (local demo)"
            ),
            "status": dbstate,
        }
    )
    try:
        if s.storage_mode == "minio":
            object_client().list_buckets()
        state = "Connected" if s.storage_mode == "minio" else "Local filesystem demo"
    except Exception:
        state = "Unavailable"
    checks.append({"name": "MinIO evidence", "status": state})
    try:
        if s.vector_enabled:
            vector_client().list_collections()
        state = "Connected" if s.vector_enabled else "Disabled — lexical fallback"
    except Exception:
        state = "Unavailable"
    checks.append({"name": "Milvus vectors", "status": state})
    try:
        if s.llm_provider == "ollama":
            r = httpx.get(s.ollama_url + "/api/tags", timeout=3)
            r.raise_for_status()
            names = [m["name"] for m in r.json().get("models", [])]
            state = "Connected" if s.llm_model in names else "Model not pulled"
        else:
            state = (
                "Rules demo"
                if s.llm_provider == "rules"
                else "External Groq configured (not probed)"
            )
    except Exception:
        state = "Unavailable"
    checks.append({"name": "AI provider: " + s.llm_provider, "status": state})
    return {
        "checks": checks,
        "model": s.llm_model,
        "embedding_model": s.embedding_model,
        "external_llm_allowed": s.allow_external_llm,
    }

from .live import router as live_router
app.include_router(live_router)
