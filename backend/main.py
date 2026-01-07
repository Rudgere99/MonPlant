from fastapi import FastAPI, HTTPException, Depends, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from datetime import date, datetime, timedelta, timezone
from typing import Optional, List, Any, Dict
from zoneinfo import ZoneInfo
import os
import base64
import json
import hmac
import hashlib
import re

from passlib.context import CryptContext

from db import get_conn
from auth_dep import require_owner_id

app = FastAPI(title="MonPlant API", version="1.0.0")

# =========================
# CORS (resolve OPTIONS 400)
# =========================
ALLOWED_ORIGINS = ["*"]  # depois você trava na URL do Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Helpers gerais
# =========================
TZ_BR = ZoneInfo("America/Sao_Paulo")


def now_br() -> datetime:
    return datetime.now(TZ_BR)


def br_today() -> date:
    return now_br().date()


def br_yesterday() -> date:
    return (now_br() - timedelta(days=1)).date()


def parse_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


# =========================
# Token simples (HMAC) - já estava no seu main
# =========================
SECRET = os.getenv("AUTH_SECRET", "DEV_SECRET_CHANGE_ME")
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "2592000"))  # 30 dias


def _b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def _sign(payload_b64: str) -> str:
    sig = hmac.new(SECRET.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return _b64url_encode(sig)


def encode_token(payload: Dict[str, Any]) -> str:
    payload_b = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload_b64 = _b64url_encode(payload_b)
    sig_b64 = _sign(payload_b64)
    return f"{payload_b64}.{sig_b64}"


def decode_token(token: str) -> Dict[str, Any]:
    try:
        payload_b64, sig_b64 = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="Token inválido")

    if not hmac.compare_digest(_sign(payload_b64), sig_b64):
        raise HTTPException(status_code=401, detail="Token inválido")

    payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    exp = int(payload.get("exp", 0))
    if exp and datetime.now(timezone.utc).timestamp() > exp:
        raise HTTPException(status_code=401, detail="Token expirado")

    return payload


def get_optional_user(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    token = parse_bearer(authorization)
    if not token:
        return None
    try:
        return decode_token(token)
    except Exception:
        return None


# =========================
# Retroativo (bloqueio por dia)
# - Mantém a lógica que você já tinha
# =========================
def block_retro(day: date, x_dev_key: Optional[str]) -> None:
    # Dev key libera retroativo (pra sua página DEV / Dev Dash)
    dev_key_env = os.getenv("DEV_KEY", "")
    if dev_key_env and x_dev_key and x_dev_key == dev_key_env:
        return

    # regra: não pode editar dia anterior (só hoje)
    if day < br_today():
        raise HTTPException(status_code=403, detail="Retroativo não pode ser editado (somente hoje).")


# =========================
# Auth / Users / Logs
# (mantido do seu main — não mexi aqui além do necessário)
# =========================
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class LoginOut(BaseModel):
    token: str
    user: Dict[str, Any]


def log_action(
    *,
    owner_id: str,
    user_id: Optional[str],
    action: str,
    entity: str,
    entity_id: Optional[str],
    request: Request,
    payload: Optional[Dict[str, Any]] = None,
):
    try:
        ip = request.headers.get("x-forwarded-for") or request.client.host
        ua = request.headers.get("user-agent")
    except Exception:
        ip, ua = None, None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_logs(user_id, action, entity, entity_id, ip, user_agent, payload)
            values (%s,%s,%s,%s,%s,%s,%s)
            """,
            (user_id, action, entity, entity_id, ip, ua, json.dumps(payload) if payload else None),
        )
        conn.commit()


@app.post("/auth/login")
def auth_login(body: LoginIn, request: Request):
    email = body.email.strip().lower()
    plain = body.password

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, full_name, sector, user_type, email, password_hash, is_active
            from public.bv_users
            where email=%s
            """,
            (email,),
        )
        u = cur.fetchone()

    if not u or not u.get("is_active"):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    stored = (u.get("password_hash") or "").strip()

    ok = False

    # suporte legado: DEV_PLAIN:senha
    if stored.startswith("DEV_PLAIN:"):
        legacy_plain = stored.split(":", 1)[1] if ":" in stored else ""
        ok = (plain == legacy_plain)
        if ok:
            # migra para bcrypt automaticamente
            new_hash = pwd.hash(plain)
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "update public.bv_users set password_hash=%s where id=%s",
                    (new_hash, u["id"]),
                )
                conn.commit()
    else:
        try:
            ok = pwd.verify(plain, stored)
        except Exception:
            ok = False

    if not ok:
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    exp = int((datetime.now(timezone.utc) + timedelta(seconds=TOKEN_TTL_SECONDS)).timestamp())
    payload = {
        "uid": str(u["id"]),
        "email": u["email"],
        "name": u["full_name"],
        "type": u["user_type"],
        "exp": exp,
    }
    token = encode_token(payload)

    log_action(
        owner_id="shared",
        user_id=str(u["id"]),
        action="login",
        entity="auth",
        entity_id=None,
        request=request,
        payload={"email": u["email"]},
    )

    return {
        "token": token,
        "user": {
            "id": str(u["id"]),
            "full_name": u["full_name"],
            "sector": u["sector"],
            "user_type": u["user_type"],
            "email": u["email"],
        },
    }


# =========================
# Plant Production (helpers)
# =========================
def _canon_period(p: str) -> str:
    """
    Normaliza periodos:
    - aceita '00-01' e devolve '00:00-01:00'
    - aceita '00:00-01:00' e devolve igual
    """
    if p is None:
        return ""
    s = str(p).strip()
    if not s:
        return ""

    # HH-HH
    m = re.fullmatch(r"(\d{2})-(\d{2})", s)
    if m:
        a, b = m.group(1), m.group(2)
        return f"{a}:00-{b}:00"

    # HH:MM-HH:MM
    m = re.fullmatch(r"(\d{2}):(\d{2})-(\d{2}):(\d{2})", s)
    if m:
        a_h, a_m, b_h, b_m = m.groups()
        return f"{a_h}:{a_m}-{b_h}:{b_m}"

    # variações raras
    m = re.fullmatch(r"(\d{2}):(\d{2})-(\d{2})", s)
    if m:
        a_h, a_m, b_h = m.groups()
        return f"{a_h}:{a_m}-{b_h}:00"

    m = re.fullmatch(r"(\d{2})-(\d{2}):(\d{2})", s)
    if m:
        a_h, b_h, b_m = m.groups()
        return f"{a_h}:00-{b_h}:{b_m}"

    return s


def _periods24() -> List[str]:
    out = []
    for h in range(24):
        h2 = (h + 1) % 24
        out.append(f"{h:02d}:00-{h2:02d}:00")
    return out


# =========================
# Plant Production (mantido)
# =========================
class PlantRow(BaseModel):
    period: str
    ton: Optional[float] = None
    freq: Optional[float] = None


class PlantDayUpsert(BaseModel):
    obs: Optional[str] = ""
    rows: List[PlantRow] = Field(default_factory=list)


@app.get("/api/plant-production/{day}")
def get_plant_day(day: date, owner_id: str = Depends(require_owner_id)):
    periods = _periods24()

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select obs, updated_at
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s
            """,
            (owner_id, day),
        )
        daily = cur.fetchone()

        cur.execute(
            """
            select period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s
            order by period
            """,
            (owner_id, day),
        )
        rows_db = cur.fetchall() or []

    if not daily and not rows_db:
        raise HTTPException(status_code=404, detail="Not found")

    obs = (daily["obs"] if daily else "") or ""
    updated_at = daily["updated_at"].isoformat() if (daily and daily["updated_at"]) else None

    # normaliza periodos e garante 24 faixas
    map_rows: Dict[str, Dict[str, Any]] = {}
    for r in rows_db:
        p = _canon_period(r.get("period"))
        map_rows[p] = {"period": p, "ton": r.get("ton"), "freq": r.get("freq")}

    rows = [map_rows.get(p, {"period": p, "ton": None, "freq": None}) for p in periods]

    return {
        "day": str(day),
        "obs": obs,
        "rows": rows,
        "updated_at": updated_at,
    }


@app.put("/api/plant-production/{day}")
def put_plant_day(
    day: date,
    body: PlantDayUpsert,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    # ✅ agora permite lançar 23:00-00:00 logo após meia-noite (mantém sua lógica)
    block_retro(day, x_dev_key)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plant_production_daily(owner_id, day, obs, updated_at)
            values (%s,%s,%s,now())
            on conflict (owner_id, day) do update
              set obs=excluded.obs,
                  updated_at=now()
            """,
            (owner_id, day, (body.obs or "").strip()),
        )

        cur.execute(
            "delete from public.bv_plant_production_rows where owner_id=%s and day=%s",
            (owner_id, day),
        )

        for r in body.rows or []:
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, period, ton, freq)
                values (%s,%s,%s,%s,%s)
                """,
                (owner_id, day, _canon_period(r.period), r.ton, r.freq),
            )

        conn.commit()

    log_action(
        owner_id=owner_id,
        user_id=user_id,
        action="upsert",
        entity="plant_production",
        entity_id=str(day),
        request=request,
        payload={"day": str(day)},
    )

    return {"ok": True, "day": str(day)}


@app.get("/api/plant-production/last7days")
def plant_last7(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, coalesce(sum(coalesce(ton,0)),0) as total_ton
            from public.bv_plant_production_rows
            where owner_id=%s
            group by day
            order by day desc
            limit 7
            """,
            (owner_id,),
        )
        rows = cur.fetchall() or []

    rows = list(reversed(rows))
    return [{"day": str(r["day"]), "total_ton": float(r["total_ton"] or 0)} for r in rows]


# =========================
# Stops (mantido + log)
# =========================
class StopIn(BaseModel):
    id: Optional[int] = None
    day: date
    eq: str
    tipo: str
    atividade: str
    start: str
    end: str
    hours: float = 0.0
    note: Optional[str] = ""


@app.get("/api/stops")
def list_stops(day: date = Query(...), owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, day, eq, tipo, atividade, start, "end", hours, note, created_at
            from public.bv_stops
            where owner_id=%s and day=%s
            order by id desc
            """,
            (owner_id, day),
        )
        rows = cur.fetchall() or []
    return rows


@app.post("/api/stops")
def upsert_stop(
    body: StopIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    block_retro(body.day, x_dev_key)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        if body.id:
            cur.execute(
                """
                update public.bv_stops
                set eq=%s, tipo=%s, atividade=%s, start=%s, "end"=%s, hours=%s, note=%s
                where owner_id=%s and id=%s
                """,
                (
                    body.eq,
                    body.tipo,
                    body.atividade,
                    body.start,
                    body.end,
                    body.hours,
                    body.note,
                    owner_id,
                    body.id,
                ),
            )
            entity_id = str(body.id)
            action = "update"
        else:
            cur.execute(
                """
                insert into public.bv_stops(owner_id, day, eq, tipo, atividade, start, "end", hours, note)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                returning id
                """,
                (
                    owner_id,
                    body.day,
                    body.eq,
                    body.tipo,
                    body.atividade,
                    body.start,
                    body.end,
                    body.hours,
                    body.note,
                ),
            )
            new_id = cur.fetchone()["id"]
            entity_id = str(new_id)
            action = "insert"

        conn.commit()

    log_action(
        owner_id=owner_id,
        user_id=user_id,
        action=action,
        entity="stops",
        entity_id=entity_id,
        request=request,
        payload={"day": str(body.day), "eq": body.eq, "tipo": body.tipo, "atividade": body.atividade},
    )

    return {"ok": True, "id": int(entity_id)}


@app.delete("/api/stops/{stop_id}")
def delete_stop(
    stop_id: int,
    day: date = Query(...),
    request: Request = None,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    block_retro(day, x_dev_key)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "delete from public.bv_stops where owner_id=%s and id=%s",
            (owner_id, stop_id),
        )
        conn.commit()

    if request is not None:
        log_action(
            owner_id=owner_id,
            user_id=user_id,
            action="delete",
            entity="stops",
            entity_id=str(stop_id),
            request=request,
            payload={"day": str(day)},
        )

    return {"ok": True, "id": int(stop_id)}


# =========================
# Horimetros (mantido + log)
# =========================
class HorimetroIn(BaseModel):
    id: Optional[int] = None
    day: date
    eq: str
    horimetro_ini: float
    horimetro_fim: float


@app.get("/api/horimetros/last-by-eq")
def hor_last_by_eq(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select distinct on (eq) eq, day, horimetro_ini, horimetro_fim, created_at
            from public.bv_horimetros
            where owner_id=%s
            order by eq, day desc, created_at desc
            """,
            (owner_id,),
        )
        rows = cur.fetchall() or []
    return rows


@app.post("/api/horimetros")
def upsert_horimetro(
    body: HorimetroIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    block_retro(body.day, x_dev_key)

    if body.horimetro_fim < body.horimetro_ini:
        raise HTTPException(status_code=400, detail="horimetro_fim deve ser >= horimetro_ini")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        if body.id:
            cur.execute(
                """
                update public.bv_horimetros
                set eq=%s, day=%s, horimetro_ini=%s, horimetro_fim=%s
                where owner_id=%s and id=%s
                """,
                (
                    body.eq,
                    body.day,
                    body.horimetro_ini,
                    body.horimetro_fim,
                    owner_id,
                    body.id,
                ),
            )
            entity_id = str(body.id)
            action = "update"
        else:
            cur.execute(
                """
                insert into public.bv_horimetros(owner_id, day, eq, horimetro_ini, horimetro_fim)
                values (%s,%s,%s,%s,%s)
                returning id
                """,
                (
                    owner_id,
                    body.day,
                    body.eq,
                    body.horimetro_ini,
                    body.horimetro_fim,
                ),
            )
            new_id = cur.fetchone()["id"]
            entity_id = str(new_id)
            action = "insert"

        conn.commit()

    log_action(
        owner_id=owner_id,
        user_id=user_id,
        action=action,
        entity="horimetros",
        entity_id=entity_id,
        request=request,
        payload={"day": str(body.day), "eq": body.eq},
    )

    return {"ok": True, "id": int(entity_id)}


@app.get("/health")
def health():
    return {"ok": True, "ts": datetime.now(timezone.utc).isoformat()}
