from sqlalchemy import create_engine, String, Text, JSON, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_engine(
    settings.database_url,
    connect_args=(
        {"check_same_thread": False}
        if settings.database_url.startswith("sqlite")
        else {}
    ),
    pool_pre_ping=True,
)
Session = sessionmaker(engine, expire_on_commit=False)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    dedup: Mapped[str] = mapped_column(String(64), unique=True)
    payload: Mapped[dict] = mapped_column(JSON)
    assessment: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(24), default="New")
    owner: Mapped[str] = mapped_column(String(80), default="Unassigned")
    created_at: Mapped[str] = mapped_column(String(40))
    evidence_key: Mapped[str] = mapped_column(Text)
    evidence_hash: Mapped[str] = mapped_column(String(64))


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(40))
    actor: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(40))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String(40))
