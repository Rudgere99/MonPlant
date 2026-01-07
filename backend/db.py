import os
from typing import Generator, Optional, Any, Dict

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, Boolean, DateTime, BigInteger, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from datetime import datetime, timezone

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL não configurada")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class BVUser(Base):
    __tablename__ = "bv_users"

    id = Column(UUID(as_uuid=True), primary_key=True)
    full_name = Column(String, nullable=False)
    sector = Column(String, nullable=False)
    user_type = Column(String, nullable=False)  # apontador | controlador | dev
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True))


class BVLog(Base):
    __tablename__ = "bv_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("bv_users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String, nullable=False)
    entity = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    payload = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def db_ping() -> bool:
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
