"""
Backend MonPlant - Avisos do Supervisor

Este arquivo cria os lembretes automaticamente no BACKEND.
A página AvisosSupervisor.tsx apenas exibe/confirma os avisos.

Como usar no main.py:
    from avisos_supervisor_backend import router as avisos_supervisor_router
    app.include_router(avisos_supervisor_router)

Endpoints:
    GET  /api/avisos-supervisor
    GET  /api/avisos-supervisor/unread
    POST /api/avisos-supervisor/{reminder_id}/confirmar
"""

from __future__ import annotations

import hashlib
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

try:
    import psycopg2
    import psycopg2.extras
except Exception as exc:  # pragma: no cover
    psycopg2 = None

router = APIRouter(prefix="/api/avisos-supervisor", tags=["Avisos Supervisor"])

HOURLY_MINUTE = int(os.getenv("MP_REMINDER_HOURLY_MINUTE", "5"))
RANDOM_MIN_MINUTES = int(os.getenv("MP_REMINDER_RANDOM_MIN", "40"))
RANDOM_MAX_MINUTES = int(os.getenv("MP_REMINDER_RANDOM_MAX", "90"))
MAX_ITEMS_RETURN = int(os.getenv("MP_REMINDER_MAX_ITEMS", "120"))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_conn():
    if psycopg2 is None:
        raise RuntimeError("Instale psycopg2-binary no backend.")

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL não configurado.")

    return psycopg2.connect(database_url, cursor_factory=psycopg2.extras.RealDictCursor)


def owner_from_authorization(authorization: Optional[str]) -> str:
    """
    Mantém isolamento por usuário/token sem depender do nome exato da função de auth existente.
    Se o seu main.py já tiver require_user/current_user, pode trocar esta função pelo user.id real.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Token ausente.")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Token inválido.")

    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]


def ensure_tables() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS mp_supervisor_reminder_state (
                    owner_id TEXT PRIMARY KEY,
                    next_random_at TIMESTAMPTZ NULL,
                    last_hourly_slot TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS mp_supervisor_reminders (
                    id BIGSERIAL PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    scheduled_for TIMESTAMPTZ NOT NULL,
                    slot_key TEXT NULL,
                    status TEXT NOT NULL DEFAULT 'pendente',
                    confirmed_at TIMESTAMPTZ NULL,
                    confirmed_by TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ux_mp_supervisor_reminders_hourly_slot
                ON mp_supervisor_reminders(owner_id, type, slot_key)
                WHERE type = 'producao_horaria' AND slot_key IS NOT NULL;
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS ix_mp_supervisor_reminders_owner_created
                ON mp_supervisor_reminders(owner_id, created_at DESC);
                """
            )
        conn.commit()


def get_or_create_state(cur, owner_id: str) -> Dict[str, Any]:
    cur.execute("SELECT * FROM mp_supervisor_reminder_state WHERE owner_id = %s", (owner_id,))
    row = cur.fetchone()
    if row:
        return dict(row)

    next_random_at = utcnow() + timedelta(minutes=random.randint(RANDOM_MIN_MINUTES, RANDOM_MAX_MINUTES))
    cur.execute(
        """
        INSERT INTO mp_supervisor_reminder_state(owner_id, next_random_at)
        VALUES (%s, %s)
        RETURNING *
        """,
        (owner_id, next_random_at),
    )
    return dict(cur.fetchone())


def slot_key_hourly(base: datetime) -> str:
    return base.strftime("%Y-%m-%d-%H")


def previous_hour_range(base: datetime) -> str:
    end = base.replace(minute=0, second=0, microsecond=0)
    start = end - timedelta(hours=1)
    return f"{start:%H}:00–{end:%H}:00"


def insert_reminder(
    cur,
    *,
    owner_id: str,
    reminder_type: str,
    title: str,
    message: str,
    scheduled_for: datetime,
    slot_key: Optional[str] = None,
) -> None:
    cur.execute(
        """
        INSERT INTO mp_supervisor_reminders
            (owner_id, type, title, message, scheduled_for, slot_key, status)
        VALUES
            (%s, %s, %s, %s, %s, %s, 'pendente')
        ON CONFLICT DO NOTHING
        """,
        (owner_id, reminder_type, title, message, scheduled_for, slot_key),
    )


def run_due_calculation(owner_id: str) -> None:
    """
    Cálculo automático centralizado no backend.
    É chamado ao abrir/pesquisar avisos e pelo endpoint /unread.
    """
    ensure_tables()
    now = utcnow()

    with get_conn() as conn:
        with conn.cursor() as cur:
            state = get_or_create_state(cur, owner_id)
            current_slot = slot_key_hourly(now)

            # Lembrete horário: dispara uma vez por hora a partir do minuto configurado.
            if now.minute >= HOURLY_MINUTE and state.get("last_hourly_slot") != current_slot:
                scheduled = now.replace(minute=HOURLY_MINUTE, second=0, microsecond=0)
                range_text = previous_hour_range(scheduled)
                insert_reminder(
                    cur,
                    owner_id=owner_id,
                    reminder_type="producao_horaria",
                    title=f"Enviar produção da última hora ({range_text})",
                    message=(
                        "Lembrete automático do sistema: enviar nos grupos de WhatsApp "
                        f"a produção da última hora ({range_text}). Depois confirme este aviso."
                    ),
                    scheduled_for=scheduled,
                    slot_key=current_slot,
                )
                cur.execute(
                    """
                    UPDATE mp_supervisor_reminder_state
                    SET last_hourly_slot = %s, updated_at = NOW()
                    WHERE owner_id = %s
                    """,
                    (current_slot, owner_id),
                )

            # Lembrete aleatório: pergunta impacto/baixa produção em intervalo variável.
            next_random_at = state.get("next_random_at")
            if not next_random_at or now >= next_random_at:
                insert_reminder(
                    cur,
                    owner_id=owner_id,
                    reminder_type="impacto_aleatorio",
                    title="Confirmar impacto ou baixa produção",
                    message=(
                        "Lembrete automático do sistema: perguntar ao supervisor se houve "
                        "impacto operacional, baixa produção, parada relevante ou condição "
                        "que precise entrar no boletim do turno."
                    ),
                    scheduled_for=now,
                    slot_key=None,
                )
                new_next = now + timedelta(minutes=random.randint(RANDOM_MIN_MINUTES, RANDOM_MAX_MINUTES))
                cur.execute(
                    """
                    UPDATE mp_supervisor_reminder_state
                    SET next_random_at = %s, updated_at = NOW()
                    WHERE owner_id = %s
                    """,
                    (new_next, owner_id),
                )

        conn.commit()


class ReminderOut(BaseModel):
    id: int
    type: str
    title: str
    message: str
    scheduled_for: datetime
    created_at: datetime
    status: str
    confirmed_at: Optional[datetime] = None
    confirmed_by: Optional[str] = None


@router.get("")
def list_reminders(authorization: Optional[str] = Header(default=None)):
    owner_id = owner_from_authorization(authorization)
    run_due_calculation(owner_id)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, type, title, message, scheduled_for, created_at, status, confirmed_at, confirmed_by
                FROM mp_supervisor_reminders
                WHERE owner_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (owner_id, MAX_ITEMS_RETURN),
            )
            rows: List[Dict[str, Any]] = [dict(r) for r in cur.fetchall()]

            cur.execute(
                """
                SELECT COUNT(*) AS total
                FROM mp_supervisor_reminders
                WHERE owner_id = %s AND status = 'pendente'
                """,
                (owner_id,),
            )
            pending_count = int(cur.fetchone()["total"] or 0)

    return {
        "unread": pending_count > 0,
        "pending_count": pending_count,
        "items": rows,
    }


@router.get("/unread")
def unread_status(authorization: Optional[str] = Header(default=None)):
    owner_id = owner_from_authorization(authorization)
    run_due_calculation(owner_id)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS total
                FROM mp_supervisor_reminders
                WHERE owner_id = %s AND status = 'pendente'
                """,
                (owner_id,),
            )
            pending_count = int(cur.fetchone()["total"] or 0)

    return {"unread": pending_count > 0, "pending_count": pending_count}


@router.post("/{reminder_id}/confirmar")
def confirm_reminder(
    reminder_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None),
):
    owner_id = owner_from_authorization(authorization)
    confirmed_by = request.headers.get("x-user-email") or "operador"
    ensure_tables()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE mp_supervisor_reminders
                SET status = 'confirmado', confirmed_at = NOW(), confirmed_by = %s
                WHERE id = %s AND owner_id = %s
                RETURNING id
                """,
                (confirmed_by, reminder_id, owner_id),
            )
            updated = cur.fetchone()
        conn.commit()

    if not updated:
        raise HTTPException(status_code=404, detail="Lembrete não encontrado.")

    return {"ok": True, "id": reminder_id}
