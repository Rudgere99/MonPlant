from fastapi import FastAPI, HTTPException, Depends, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
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
# CORS
# =========================
# Defina CORS_ORIGINS no Railway (separado por vírgula) para produção.
# Ex: CORS_ORIGINS=https://mon-plant.vercel.app,https://monplant-production.up.railway.app
default_origins = [
    "https://mon-plant.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
_env = (os.getenv("CORS_ORIGINS") or "").strip()
env_origins = [o.strip() for o in _env.split(",") if o.strip()]
if env_origins:
    # Mescla com os defaults para não "sumir" com o domínio do Vercel em produção
    ALLOWED_ORIGINS = sorted(set(default_origins + env_origins))
else:
    ALLOWED_ORIGINS = default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,  # usamos Bearer token, sem cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.options("/{path:path}")
def cors_preflight(path: str):
    # garante resposta 200 no preflight do navegador
    return Response(status_code=200)

# =========================
# Helpers
# =========================
BR_TZ = ZoneInfo("America/Sao_Paulo")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

AUTH_SECRET = (os.getenv("AUTH_SECRET") or "CHANGE_ME_AUTH_SECRET").strip()
AUTH_TTL_HOURS = int(os.getenv("AUTH_TTL_HOURS") or "168")  # 7 dias


def now_local() -> datetime:
    return datetime.now(BR_TZ)


def today_local() -> date:
    return now_local().date()


def is_dev(dev_key: Optional[str]) -> bool:
    """
    Habilita bypass do bloqueio retroativo, usando header X-Dev-Key.
    Configure no Railway: DEV_KEY=uma_senha_forte
    """
    if not dev_key:
        return False
    expected = (os.getenv("DEV_KEY") or "").strip()
    return bool(expected) and dev_key.strip() == expected


def block_retro(d: date, dev_key: Optional[str] = None):
    """
    Regra (Brasil):
      - Bloqueia somente se for dia ANTERIOR ao "hoje"
      - EXCETO: permite editar "ontem" até um horário limite (útil para turno 19:00-07:00)
      - DEV: se X-Dev-Key bater, não bloqueia nada

    Configure no Railway (opcional):
      - RETRO_ALLOW_UNTIL_HOUR (default 7)  -> permite editar ontem até HH:59
    """
    if is_dev(dev_key):
        return

    tdy = today_local()
    if d >= tdy:
        return

    n = now_local()

    # ✅ janela para "ontem" (turno noturno cruzando meia-noite)
    allow_until_hour = int(os.getenv("RETRO_ALLOW_UNTIL_HOUR") or "7")  # 07:00
    if d == (tdy - timedelta(days=1)):
        if n.hour <= allow_until_hour:
            return

    raise HTTPException(status_code=403, detail="Dia anterior não pode ser editado.")


def parse_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None


# =========================
# Plant Production period normalizer
# =========================
def _period_std_from_h(h: int) -> str:
    return f"{h:02d}:00-{(h+1)%24:02d}:00"


def normalize_period(p: str) -> Optional[str]:
    """
    Aceita:
      - "00-01"
      - "23-00"
      - "00:00-01:00"
      - "00:00 - 01:00"
      - "00:00:00-01:00:00"
    Retorna sempre no padrão do banco: "HH:00-HH:00"
    """
    if not p:
        return None
    s = p.strip()
    s = re.sub(r"\s+", "", s)

    m = re.fullmatch(r"(\d{2})-(\d{2})", s)
    if m:
        h1 = int(m.group(1))
        h2 = int(m.group(2))
        if 0 <= h1 <= 23 and 0 <= h2 <= 23:
            return f"{h1:02d}:00-{h2:02d}:00"
        return None

    m = re.fullmatch(r"(\d{2}):(\d{2})(?::\d{2})?-(\d{2}):(\d{2})(?::\d{2})?", s)
    if m:
        h1 = int(m.group(1))
        m1 = int(m.group(2))
        h2 = int(m.group(3))
        m2 = int(m.group(4))
        if (0 <= h1 <= 23 and 0 <= h2 <= 23 and 0 <= m1 <= 59 and 0 <= m2 <= 59):
            return f"{h1:02d}:00-{h2:02d}:00"
        return None

    return None


# =========================
# Auth helpers (token HMAC simples)
# =========================
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


# =========================
# Stops Launch period normalizer (mantém padrão do front: "HH-HH")
# =========================
def normalize_period_launch(p: str | None) -> str | None:
    """
    Aceita:
      - "19-21"
      - "19:00-21:00"
      - "19:00 às 21:00" / "19:00 as 21:00"
      - "19 às 21" / "19 as 21"
    Retorna sempre: "HH-HH" (ex: "19-21")
    """
    if not p:
        return None

    s = str(p).strip().lower()

    # normalizações comuns
    s = s.replace("às", "-").replace("as", "-")
    s = s.replace("–", "-").replace("—", "-")
    s = s.replace(":", "")
    s = re.sub(r"\s+", "", s)

    # formatos aceitos após normalizar:
    # - 19-21
    # - 1900-2100
    m = re.fullmatch(r"(\d{2})(?:00)?-(\d{2})(?:00)?", s)
    if not m:
        return None

    h1 = int(m.group(1))
    h2 = int(m.group(2))

    if 0 <= h1 <= 23 and 0 <= h2 <= 23:
        return f"{h1:02d}-{h2:02d}"

    return None


def _sign(payload_b64: str) -> str:
    sig = hmac.new(AUTH_SECRET.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return _b64url(sig)


def create_token(user_id: str, user_type: str, email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=AUTH_TTL_HOURS)
    payload = {
        "uid": user_id,
        "typ": user_type,
        "em": email,
        "exp": int(exp.timestamp()),
        "v": 1,
    }
    payload_b = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload_b64 = _b64url(payload_b)
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



def require_supervisor_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")
    payload = decode_token(tok)
    if payload.get("typ") != "supervisor":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return payload


def bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    a = authorization.strip()
    if not a.lower().startswith("bearer "):
        return None
    return a.split(" ", 1)[1].strip()


def get_optional_user(authorization: Optional[str]) -> Optional[Dict[str, Any]]:
    tok = bearer_token(authorization)
    if not tok:
        return None
    try:
        return decode_token(tok)
    except Exception:
        return None


def require_dev_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")
    payload = decode_token(tok)
    if payload.get("typ") != "dev":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return payload


# =========================
# Logging helpers
# =========================
def log_action(
    *,
    action: str,
    request: Request,
    user_id: Optional[str] = None,
    entity: Optional[str] = None,
    entity_id: Optional[str] = None,
    payload: Optional[dict] = None,
):
    """
    Insere em public.bv_logs.
    Não pode quebrar o fluxo principal: se falhar, ignora.
    """
    try:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_logs(user_id, action, entity, entity_id, ip, user_agent, payload, created_at)
                values (%s,%s,%s,%s,%s,%s,%s, now())
                """,
                (
                    user_id,
                    action,
                    entity,
                    entity_id,
                    ip,
                    ua,
                    json.dumps(payload) if payload is not None else None,
                ),
            )
            conn.commit()
    except Exception:
        return

# =========================
# Stops Launch (MonPlant) - bv_launch.stops_day + bv_launch.stops_rows
# =========================
class StopLaunchRowIn(BaseModel):
    period: str  # "03-04"
    equipamento: Optional[str] = ""
    tipo_parada: Optional[str] = ""
    descricao: Optional[str] = ""
    minutos: int = 0


class StopLaunchDayUpsert(BaseModel):
    day: date
    rows: List[StopLaunchRowIn] = Field(default_factory=list)



# =========================
# Schemas
# =========================
class PlantRow(BaseModel):
    period: str
    ton: Optional[float] = None
    freq: Optional[float] = None


class PlantDayUpsert(BaseModel):
    obs: Optional[str] = ""
    rows: List[PlantRow] = Field(default_factory=list)


class StopIn(BaseModel):
    day: date
    turno: int  # 1|2
    data_inicio: str
    hora_inicio: str
    data_fim: str
    hora_fim: str
    equipamento: str
    tipo_parada: str
    atividade: str
    descricao: str
    tempo_parada_h: float


class HorimetroIn(BaseModel):
    day: date
    turno: int  # 1|2
    equipamento: str
    horimetro_ini: float
    horimetro_fim: float
    obs: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class DevCreateUserIn(BaseModel):
    full_name: str
    sector: str
    user_type: str  # apontador | controlador | dev
    email: EmailStr
    password: str


class DevUpdateUserIn(BaseModel):
    full_name: Optional[str] = None
    sector: Optional[str] = None
    user_type: Optional[str] = None  # apontador | controlador | dev
    is_active: Optional[bool] = None
    reset_password: Optional[str] = None  # se vier, troca senha


class NoticeCreateIn(BaseModel):
    title: str
    message: str


class NoticeOut(BaseModel):
    id: str
    title: str
    message: str
    is_active: bool
    created_at: str
    created_by: str
    read: bool
    read_at: Optional[str] = None


# =========================
# Health
# =========================
@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


# =========================
# AUTH (bv_users)
# =========================
@app.post("/auth/login")
def auth_login(body: LoginIn, request: Request):
    email = str(body.email).lower().strip()

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

        if not u or not u["is_active"]:
            raise HTTPException(status_code=401, detail="Credenciais inválidas")

        pw_hash = u["password_hash"] or ""

        # Migração: DEV_PLAIN:senha -> converte para bcrypt no primeiro login
        if pw_hash.startswith("DEV_PLAIN:"):
            plain = pw_hash.split(":", 1)[1]
            new_hash = pwd.hash(plain)
            cur.execute("update public.bv_users set password_hash=%s where id=%s", (new_hash, u["id"]))
            conn.commit()
            pw_hash = new_hash

        if not pwd.verify(body.password, pw_hash):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")

        token = create_token(str(u["id"]), u["user_type"], u["email"])

    log_action(
        action="LOGIN",
        request=request,
        user_id=str(u["id"]),
        entity="bv_users",
        entity_id=str(u["id"]),
        payload={"email": email, "user_type": u["user_type"]},
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


@app.get("/auth/me")
def auth_me(authorization: Optional[str] = Header(default=None, alias="Authorization")):
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")

    payload = decode_token(tok)
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, full_name, sector, user_type, email, is_active
            from public.bv_users
            where id=%s
            """,
            (uid,),
        )
        u = cur.fetchone()

    if not u or not u["is_active"]:
        raise HTTPException(status_code=401, detail="Usuário inválido")

    return {
        "id": str(u["id"]),
        "full_name": u["full_name"],
        "sector": u["sector"],
        "user_type": u["user_type"],
        "email": u["email"],
    }


# =========================
# DEV (users + logs)
# =========================
def _dev_list_users():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, full_name, sector, user_type, email, is_active, created_at
            from public.bv_users
            order by created_at desc
            """
        )
        rows = cur.fetchall() or []
    return [
        {
            "id": str(r["id"]),
            "full_name": r["full_name"],
            "sector": r["sector"],
            "user_type": r["user_type"],
            "email": r["email"],
            "is_active": bool(r["is_active"]),
            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        }
        for r in rows
    ]


@app.get("/dev/users")
def dev_list_users(dev_payload=Depends(require_dev_user)):
    return _dev_list_users()


# ✅ Alias pro front (se você estiver usando /api/dev/...)
@app.get("/api/dev/users")
def api_dev_list_users(dev_payload=Depends(require_dev_user)):
    return _dev_list_users()


def _dev_create_user(body: DevCreateUserIn, request: Request, dev_payload: Dict[str, Any]):
    allowed = {"apontador", "controlador", "dev", "gerencia", "supervisor"}

    if body.user_type not in allowed:
        raise HTTPException(status_code=400, detail="user_type inválido")

    email = str(body.email).lower().strip()

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("select 1 from public.bv_users where email=%s", (email,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Email já existe")

        pw_hash = pwd.hash(body.password)

        cur.execute(
            """
            insert into public.bv_users(full_name, sector, user_type, email, password_hash, is_active)
            values (%s,%s,%s,%s,%s,true)
            returning id
            """,
            (body.full_name.strip(), body.sector.strip(), body.user_type, email, pw_hash),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_USER",
        request=request,
        user_id=dev_payload.get("uid"),
        entity="bv_users",
        entity_id=str(new_id),
        payload={
            "created_user": {
                "id": str(new_id),
                "full_name": body.full_name.strip(),
                "sector": body.sector.strip(),
                "user_type": body.user_type,
                "email": email,
            }
        },
    )

    return {"ok": True, "id": str(new_id)}



@app.post("/dev/users")
def dev_create_user(body: DevCreateUserIn, request: Request, dev_payload=Depends(require_dev_user)):
    return _dev_create_user(body, request, dev_payload)


@app.post("/api/dev/users")
def api_dev_create_user(body: DevCreateUserIn, request: Request, dev_payload=Depends(require_dev_user)):
    return _dev_create_user(body, request, dev_payload)


@app.patch("/dev/users/{user_id}")
def dev_update_user(
    user_id: str,
    body: DevUpdateUserIn,
    request: Request,
    dev_payload=Depends(require_dev_user),
):
    allowed = {"apontador", "controlador", "dev", "gerencia", "supervisor"}

    fields = []
    values = []

    if body.full_name is not None:
        fields.append("full_name=%s")
        values.append(body.full_name.strip())

    if body.sector is not None:
        fields.append("sector=%s")
        values.append(body.sector.strip())

    if body.user_type is not None:
        if body.user_type not in allowed:
            raise HTTPException(status_code=400, detail="user_type inválido")
        fields.append("user_type=%s")
        values.append(body.user_type)

    if body.is_active is not None:
        fields.append("is_active=%s")
        values.append(bool(body.is_active))

    if body.reset_password is not None:
        fields.append("password_hash=%s")
        values.append(pwd.hash(body.reset_password))

    if not fields:
        return {"ok": True, "changed": False}

    values.append(user_id)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"update public.bv_users set {', '.join(fields)} where id=%s",
            tuple(values),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        conn.commit()

    log_action(
        action="UPDATE_USER",
        request=request,
        user_id=dev_payload.get("uid"),
        entity="bv_users",
        entity_id=str(user_id),
        payload={
            "changes": body.model_dump(exclude_none=True),
        },
    )

    return {"ok": True, "changed": True}


@app.patch("/api/dev/users/{user_id}")
def api_dev_update_user(
    user_id: str,
    body: DevUpdateUserIn,
    request: Request,
    dev_payload=Depends(require_dev_user),
):
    return dev_update_user(user_id, body, request, dev_payload)


def _dev_list_logs(
    limit: int,
    offset: int,
    action: Optional[str],
    entity: Optional[str],
    user_id: Optional[str],
    q: Optional[str],
    day_from: Optional[date],
    day_to: Optional[date],
):
    where = []
    args: List[Any] = []

    if action:
        where.append("l.action = %s")
        args.append(action)

    if entity:
        where.append("l.entity = %s")
        args.append(entity)

    if user_id:
        where.append("l.user_id = %s")
        args.append(user_id)

    if day_from:
        where.append("l.created_at >= %s")
        args.append(datetime.combine(day_from, datetime.min.time()).replace(tzinfo=timezone.utc))

    if day_to:
        where.append("l.created_at < %s")
        args.append(datetime.combine(day_to + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc))

    if q:
        # busca simples em entity_id, ip, user_name
        where.append("(cast(l.entity_id as text) ilike %s or l.ip ilike %s or u.full_name ilike %s)")
        qq = f"%{q}%"
        args.extend([qq, qq, qq])

    where_sql = ("where " + " and ".join(where)) if where else ""

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select l.id, l.user_id, l.action, l.entity, l.entity_id, l.ip, l.user_agent, l.payload, l.created_at,
                   u.full_name as user_name, u.user_type as user_type
            from public.bv_logs l
            left join public.bv_users u on u.id = l.user_id
            {where_sql}
            order by l.created_at desc
            limit %s offset %s
            """,
            tuple(args + [limit, offset]),
        )
        rows = cur.fetchall() or []

    out = []
    for r in rows:
        out.append(
            {
                "id": int(r["id"]),
                "user_id": str(r["user_id"]) if r["user_id"] else None,
                "user_name": r.get("user_name"),
                "user_type": r.get("user_type"),
                "action": r["action"],
                "entity": r["entity"],
                "entity_id": r["entity_id"],
                "ip": r["ip"],
                "user_agent": r["user_agent"],
                "payload": r["payload"],
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
            }
        )
    return out


@app.get("/dev/logs")
def dev_list_logs(
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0, le=1000000),
    action: Optional[str] = None,
    entity: Optional[str] = None,
    user_id: Optional[str] = None,
    q: Optional[str] = None,
    day_from: Optional[date] = None,
    day_to: Optional[date] = None,
    dev_payload=Depends(require_dev_user),
):
    return _dev_list_logs(limit, offset, action, entity, user_id, q, day_from, day_to)


@app.get("/api/dev/logs")
def api_dev_list_logs(
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0, le=1000000),
    action: Optional[str] = None,
    entity: Optional[str] = None,
    user_id: Optional[str] = None,
    q: Optional[str] = None,
    day_from: Optional[date] = None,
    day_to: Optional[date] = None,
    dev_payload=Depends(require_dev_user),
):
    return _dev_list_logs(limit, offset, action, entity, user_id, q, day_from, day_to)


# =========================
# Plant Production
# =========================
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


@app.get("/api/plant-production/{day}")
def get_plant_day(day: date, owner_id: str = Depends(require_owner_id)):
    periods = [_period_std_from_h(h) for h in range(24)]

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
            """,
            (owner_id, day),
        )
        db_rows = cur.fetchall() or []

    by_period: Dict[str, Any] = {}
    for r in db_rows:
        key = normalize_period(r["period"])
        if key:
            by_period[key] = r

    full_rows = []
    for p in periods:
        r = by_period.get(p)
        full_rows.append(
            {
                "period": p,
                "ton": r["ton"] if r else None,
                "freq": r["freq"] if r else None,
            }
        )

    obs = (daily["obs"] if daily else "") or ""
    updated_at = daily["updated_at"].isoformat() if (daily and daily.get("updated_at")) else None

    return {
        "day": str(day),
        "obs": obs,
        "rows": full_rows,
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
    block_retro(day, x_dev_key)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plant_production_daily(owner_id, day, obs, updated_at)
            values (%s,%s,%s, now())
            on conflict (owner_id, day)
            do update set obs = excluded.obs, updated_at = now()
            """,
            (owner_id, day, body.obs or ""),
        )

        cur.execute(
            "delete from public.bv_plant_production_rows where owner_id=%s and day=%s",
            (owner_id, day),
        )

        for r in body.rows or []:
            p = normalize_period(r.period) or r.period
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, period, ton, freq)
                values (%s,%s,%s,%s,%s)
                """,
                (owner_id, day, p, r.ton, r.freq),
            )

        conn.commit()

    log_action(
        action="UPDATE_PLANT_PRODUCTION",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_daily",
        entity_id=str(day),
        payload={"owner_id": owner_id, "day": str(day)},
    )

    return {"ok": True, "day": str(day)}


# =========================
# Stops
# =========================
@app.get("/api/stops")
def list_stops(day: date = Query(...), owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select *
            from public.bv_stops
            where owner_id=%s and day=%s
            order by created_at desc
            """,
            (owner_id, day),
        )
        rows = cur.fetchall() or []
    return rows


@app.post("/api/stops")
def create_stop(
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
        cur.execute(
            """
            insert into public.bv_stops(
              owner_id, day, turno,
              data_inicio, hora_inicio, data_fim, hora_fim,
              equipamento, tipo_parada, atividade, descricao, tempo_parada_h
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                body.day,
                int(body.turno),
                body.data_inicio,
                body.hora_inicio,
                body.data_fim,
                body.hora_fim,
                body.equipamento,
                body.tipo_parada,
                body.atividade,
                body.descricao,
                body.tempo_parada_h,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_STOP",
        request=request,
        user_id=user_id,
        entity="bv_stops",
        entity_id=str(new_id),
        payload={"owner_id": owner_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id}


@app.delete("/api/stops/{stop_id}")
def delete_stop(
    stop_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            delete from public.bv_stops
            where id=%s and owner_id=%s
            """,
            (stop_id, owner_id),
        )
        deleted = cur.rowcount
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")

    log_action(
        action="DELETE_STOP",
        request=request,
        user_id=user_id,
        entity="bv_stops",
        entity_id=str(stop_id),
        payload={"owner_id": owner_id},
    )

    return {"ok": True}


# =========================
# Horimetros
# =========================
@app.post("/api/horimetros")
def create_horimetro(
    body: HorimetroIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    # mantive o header pra não quebrar front (mas ele não é mais usado aqui)
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    # ✅ Horímetros: NÃO trava retroativo (dia anterior, etc.)
    # block_retro(body.day, x_dev_key)

    if body.horimetro_fim < body.horimetro_ini:
        raise HTTPException(status_code=400, detail="horimetro_fim deve ser >= horimetro_ini")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_horimetros(
              owner_id, day, turno, equipamento, horimetro_ini, horimetro_fim, obs
            )
            values (%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                body.day,
                int(body.turno),
                body.equipamento,
                body.horimetro_ini,
                body.horimetro_fim,
                body.obs,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_HORIMETRO",
        request=request,
        user_id=user_id,
        entity="bv_horimetros",
        entity_id=str(new_id),
        payload={"owner_id": owner_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id}


@app.get("/api/horimetros")
def list_horimetros(
    day: Optional[date] = Query(None),
    equipamento: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    owner_id: str = Depends(require_owner_id),
):
    with get_conn() as conn, conn.cursor() as cur:
        if day and equipamento:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and day=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, day, equipamento, limit),
            )
        elif day:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and day=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, day, limit),
            )
        elif equipamento:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, equipamento, limit),
            )
        else:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, limit),
            )
        rows = cur.fetchall() or []
    return rows


@app.get("/api/horimetros/last-by-eq")
def last_by_eq(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select distinct on (equipamento)
              equipamento, horimetro_ini, horimetro_fim, day, turno, created_at
            from public.bv_horimetros
            where owner_id=%s
            order by equipamento, created_at desc
            """,
            (owner_id,),
        )
        rows = cur.fetchall() or []

    out = []
    for r in rows:
        out.append(
            {
                "equipamento": r["equipamento"],
                "horimetro_ini": parse_float(r["horimetro_ini"]),
                "horimetro_fim": parse_float(r["horimetro_fim"]),
                "day": str(r["day"]),
                "turno": int(r["turno"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
        )
    return out


@app.delete("/api/horimetros/{horimetro_id}")
def delete_horimetro(
    horimetro_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            delete from public.bv_horimetros
            where id=%s and owner_id=%s
            """,
            (horimetro_id, owner_id),
        )
        deleted = cur.rowcount
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")

    log_action(
        action="DELETE_HORIMETRO",
        request=request,
        user_id=user_id,
        entity="bv_horimetros",
        entity_id=str(horimetro_id),
        payload={"owner_id": owner_id},
    )

    return {"ok": True}


# =========================
# Metas (por dia / mês) — NÃO bloqueia dias anteriores
# =========================

class GoalDayIn(BaseModel):
    meta_ton: float = Field(0, ge=0)
    discount_hours: float = Field(2, ge=0, le=24)

class GoalDayOut(BaseModel):
    day: date
    meta_ton: float
    discount_hours: float

class GoalMonthIn(BaseModel):
    days: List[GoalDayOut]

class GoalMonthOut(BaseModel):
    month: str
    total_month_ton: float
    days: List[GoalDayOut]



def _col(r, key: str, idx: int):
    """Compat: aceita RealDictCursor (dict) ou cursor tuple."""
    try:
        if isinstance(r, dict):
            return r.get(key)
    except Exception:
        pass
    try:
        return r[idx]
    except Exception:
        return None


def _ensure_goals_table():
    ddl = """
    CREATE TABLE IF NOT EXISTS public.bv_goals_daily(
      owner_id TEXT NOT NULL,
      day DATE NOT NULL,
      meta_ton NUMERIC(18,2) NOT NULL DEFAULT 0,
      discount_hours NUMERIC(10,2) NOT NULL DEFAULT 2,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(owner_id, day)
    );
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(ddl)
        conn.commit()

@app.on_event("startup")
def _startup_goals():
    try:
        _ensure_goals_table()
    except Exception:
        # não derruba a API por causa de DDL
        pass

def _parse_yyyy_mm(s: str) -> date:
    if not re.fullmatch(r"\d{4}-\d{2}", s or ""):
        raise HTTPException(status_code=400, detail="month deve ser YYYY-MM")
    y, m = s.split("-")
    y = int(y); m = int(m)
    if m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="month inválido")
    return date(y, m, 1)

def _month_range(first: date):
    # [first, next_month)
    if first.month == 12:
        nxt = date(first.year + 1, 1, 1)
    else:
        nxt = date(first.year, first.month + 1, 1)
    return first, nxt

@app.get("/api/goals/day/{day}", response_model=GoalDayOut)
def goals_get_day(day: date, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT meta_ton, discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND day=%s""",
                (owner_id, day),
            )
            row = cur.fetchone()
    if not row:
        return GoalDayOut(day=day, meta_ton=0.0, discount_hours=2.0)
    return GoalDayOut(day=day, meta_ton=float(_col(row,'meta_ton',0) or 0), discount_hours=float(_col(row,'discount_hours',1) or 0))

@app.put("/api/goals/day/{day}", response_model=GoalDayOut)
def goals_put_day(day: date, body: GoalDayIn, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO public.bv_goals_daily(owner_id, day, meta_ton, discount_hours)
                     VALUES(%s,%s,%s,%s)
                     ON CONFLICT (owner_id, day)
                     DO UPDATE SET meta_ton=EXCLUDED.meta_ton,
                                   discount_hours=EXCLUDED.discount_hours,
                                   updated_at=NOW()""",
                (owner_id, day, body.meta_ton, body.discount_hours),
            )
        conn.commit()
    return GoalDayOut(day=day, meta_ton=float(body.meta_ton), discount_hours=float(body.discount_hours))

@app.get("/api/goals/month/{month}", response_model=GoalMonthOut)
def goals_get_month(month: str, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT day, meta_ton, discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND day >= %s AND day < %s
                     ORDER BY day ASC""",
                (owner_id, a, b),
            )
            rows = cur.fetchall() or []

    days = [GoalDayOut(day=_col(r,'day',0), meta_ton=float(_col(r,'meta_ton',1) or 0), discount_hours=float(_col(r,'discount_hours',2) or 0)) for r in rows]
    total_month = float(sum(d.meta_ton for d in days))
    return GoalMonthOut(month=month, total_month_ton=total_month, days=days)

@app.put("/api/goals/month/{month}", response_model=GoalMonthOut)
def goals_put_month(month: str, body: GoalMonthIn, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    # valida: só aceita dias dentro do mês
    for d in body.days:
        if d.day < a or d.day >= b:
            raise HTTPException(status_code=400, detail=f"Dia {d.day} fora do mês {month}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            for d in body.days:
                cur.execute(
                    """INSERT INTO public.bv_goals_daily(owner_id, day, meta_ton, discount_hours)
                         VALUES(%s,%s,%s,%s)
                         ON CONFLICT (owner_id, day)
                         DO UPDATE SET meta_ton=EXCLUDED.meta_ton,
                                       discount_hours=EXCLUDED.discount_hours,
                                       updated_at=NOW()""",
                    (owner_id, d.day, d.meta_ton, d.discount_hours),
                )
        conn.commit()

    # retorna consolidado
    return goals_get_month(month, owner_id)


# =========================
# Estatísticas do mês (macro)
# =========================

def _period_start_hour(p: str) -> Optional[int]:
    """
    Extrai hora inicial do período.
    Aceita: "HH:00-HH:00" (padrão do banco) e também "HH:00-HH:00" com espaços.
    """
    if not p:
        return None
    s = p.strip()
    m = re.match(r"^(\d{2}):\d{2}\s*-\s*\d{2}:\d{2}$", s)
    if not m:
        # tenta formatos antigos tipo "00-01"
        m2 = re.match(r"^(\d{2})-(\d{2})$", re.sub(r"\s+", "", s))
        if m2:
            try:
                return int(m2.group(1))
            except Exception:
                return None
        return None
    try:
        h = int(m.group(1))
        return h if 0 <= h <= 23 else None
    except Exception:
        return None


def _turno_by_hour(h: int) -> int:
    """
    Regra A (confirmada):
      Turno 1: 07:00-19:00  (horas 07..18)
      Turno 2: 19:00-07:00  (horas 19..23 e 00..06)
    """
    return 1 if (7 <= h <= 18) else 2


@app.get("/api/stats/month/{month}")
def stats_month(month: str, owner_id: str = Depends(require_owner_id)):
    """
    Retorna estatísticas do mês (meta diária variável + produção + paradas + horímetros).
    month: "YYYY-MM"
    """
    _ensure_goals_table()

    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    # -------- Goals (metas diárias) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, meta_ton, discount_hours
            from public.bv_goals_daily
            where owner_id=%s and day >= %s and day < %s
            order by day asc
            """,
            (owner_id, a, b),
        )
        goal_rows = cur.fetchall() or []

    goals_by_day: Dict[str, Dict[str, float]] = {}
    meta_month_ton = 0.0
    programmed_stop_days = 0

    for r in goal_rows:
        d = _col(r, "day", 0)
        meta = float(_col(r, "meta_ton", 1) or 0)
        disc = float(_col(r, "discount_hours", 2) or 0)
        ds = str(d)
        goals_by_day[ds] = {"meta_ton": meta, "discount_hours": disc}
        meta_month_ton += meta
        if meta == 0:
            programmed_stop_days += 1

    # -------- Production rows (por hora) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        prod_rows = cur.fetchall() or []

    # agregações por dia
    day_prod: Dict[str, Dict[str, float]] = {}
    # métricas globais
    produced_month_ton = 0.0
    freq_sum = 0.0
    freq_cnt = 0
    prod_hours_cnt = 0  # quantidade de períodos com ton > 0 (para média t/h simples)
    t1_month = 0.0
    t2_month = 0.0

    for r in prod_rows:
        d = _col(r, "day", 0)
        ds = str(d)
        ton = float(_col(r, "ton", 2) or 0)
        freq = _col(r, "freq", 3)
        period = _col(r, "period", 1)

        if ds not in day_prod:
            day_prod[ds] = {
                "produced_ton": 0.0,
                "t1_ton": 0.0,
                "t2_ton": 0.0,
                "freq_sum": 0.0,
                "freq_cnt": 0,
                "hours_cnt": 0,
            }

        if ton and ton > 0:
            day_prod[ds]["produced_ton"] += ton
            produced_month_ton += ton
            day_prod[ds]["hours_cnt"] += 1
            prod_hours_cnt += 1

            h = _period_start_hour(str(period) if period is not None else "")
            if h is not None:
                t = _turno_by_hour(h)
                if t == 1:
                    day_prod[ds]["t1_ton"] += ton
                    t1_month += ton
                else:
                    day_prod[ds]["t2_ton"] += ton
                    t2_month += ton

        if freq is not None:
            try:
                fv = float(freq)
                if fv > 0:  # ignora 0/None (opcional)
                    day_prod[ds]["freq_sum"] += fv
                    day_prod[ds]["freq_cnt"] += 1
                    freq_sum += fv
                    freq_cnt += 1
            except Exception:
                pass

    produced_days = sum(1 for ds, v in day_prod.items() if (v.get("produced_ton", 0) or 0) > 0)

    # -------- Stops --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, equipamento, tipo_parada, descricao, hora_inicio, tempo_parada_h
            from public.bv_stops
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        stop_rows = cur.fetchall() or []

    stops_by_type: Dict[str, float] = {}
    stops_by_eq: Dict[str, float] = {}
    stops_by_desc: Dict[str, float] = {}
    stops_count_by_period: Dict[str, int] = {}
    maint_days_set = set()

    for r in stop_rows:
        d = _col(r, "day", 0)
        ds = str(d)

        eq = str(_col(r, "equipamento", 1) or "").strip() or "—"
        tp = str(_col(r, "tipo_parada", 2) or "").strip() or "—"
        desc = str(_col(r, "descricao", 3) or "").strip() or "—"
        hora_ini = str(_col(r, "hora_inicio", 4) or "").strip()
        h = float(_col(r, "tempo_parada_h", 5) or 0)

        stops_by_type[tp] = stops_by_type.get(tp, 0.0) + h
        stops_by_eq[eq] = stops_by_eq.get(eq, 0.0) + h
        stops_by_desc[desc] = stops_by_desc.get(desc, 0.0) + h

        # contagem por período HH-HH usando hora_inicio
        try:
            hh = int(hora_ini.split(":")[0]) if hora_ini else None
        except Exception:
            hh = None
        if hh is not None and 0 <= hh <= 23:
            nxt = (hh + 1) % 24
            period = f"{hh:02d}-{nxt:02d}"
            stops_count_by_period[period] = stops_count_by_period.get(period, 0) + 1

        if "manut" in tp.lower():
            # considera dia de manutenção se tiver >= 0.5h no dia (ajustável)
            if h >= 0.5:
                maint_days_set.add(ds)

    maintenance_stop_days = len(maint_days_set)

    # -------- Horímetros (horas trabalhadas) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select equipamento, horimetro_ini, horimetro_fim
            from public.bv_horimetros
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        h_rows = cur.fetchall() or []

    hours_by_eq: Dict[str, float] = {}
    total_work_hours = 0.0

    for r in h_rows:
        eq = str(_col(r, "equipamento", 0) or "").strip() or "—"
        ini = parse_float(_col(r, "horimetro_ini", 1))
        fim = parse_float(_col(r, "horimetro_fim", 2))
        if ini is None or fim is None:
            continue
        delta = max(0.0, float(fim) - float(ini))
        hours_by_eq[eq] = hours_by_eq.get(eq, 0.0) + delta
        total_work_hours += delta

    # -------- KPIs (mês) --------
    attainment_pct = (produced_month_ton / meta_month_ton * 100.0) if meta_month_ton > 0 else (100.0 if produced_month_ton > 0 else 0.0)
    delta_ton = produced_month_ton - meta_month_ton
    delta_pct = (attainment_pct - 100.0) if meta_month_ton > 0 else 0.0

    freq_avg_pct = (freq_sum / freq_cnt) if freq_cnt > 0 else 0.0
    avg_ton_per_hour = (produced_month_ton / prod_hours_cnt) if prod_hours_cnt > 0 else 0.0

    # -------- Series (por dia) --------
    # Lista de todos os dias do mês (para gráfico bonito)
    daily_series = []
    cur_day = a
    while cur_day < b:
        ds = str(cur_day)
        meta = goals_by_day.get(ds, {}).get("meta_ton", 0.0)
        disc = goals_by_day.get(ds, {}).get("discount_hours", 2.0)
        prod = day_prod.get(ds, {})
        produced = float(prod.get("produced_ton", 0.0) or 0.0)
        t1 = float(prod.get("t1_ton", 0.0) or 0.0)
        t2 = float(prod.get("t2_ton", 0.0) or 0.0)
        fcnt = int(prod.get("freq_cnt", 0) or 0)
        fsum = float(prod.get("freq_sum", 0.0) or 0.0)
        freq_day = (fsum / fcnt) if fcnt > 0 else 0.0
        hcnt = int(prod.get("hours_cnt", 0) or 0)
        avg_h = (produced / hcnt) if hcnt > 0 else 0.0

        daily_series.append(
            {
                "day": ds,
                "meta_ton": meta,
                "discount_hours": disc,
                "produced_ton": produced,
                "attainment_pct": (produced / meta * 100.0) if meta > 0 else (100.0 if produced > 0 else 0.0),
                "t1_ton": t1,
                "t2_ton": t2,
                "freq_avg": freq_day,
                "avg_ton_per_hour": avg_h,
            }
        )
        cur_day = cur_day + timedelta(days=1)

    # best / worst (considera apenas dias com meta > 0 ou com produção)
    candidates = [d for d in daily_series if (d["meta_ton"] > 0 or d["produced_ton"] > 0)]
    best_day = None
    worst_day = None
    if candidates:
        best_day = max(candidates, key=lambda x: x["attainment_pct"])
        worst_day = min(candidates, key=lambda x: x["attainment_pct"])

    # stops lists
    by_type_list = [{"type": k, "hours": round(v, 2)} for k, v in sorted(stops_by_type.items(), key=lambda kv: kv[1], reverse=True)]
    by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(stops_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    hours_by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(hours_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        "month": month,
        "meta_month_ton": round(meta_month_ton, 2),
        "produced_month_ton": round(produced_month_ton, 2),
        "attainment_pct": round(attainment_pct, 2),
        "delta_ton": round(delta_ton, 2),
        "delta_pct": round(delta_pct, 2),

        "days": {
            "produced_days": int(produced_days),
            "programmed_stop_days": int(programmed_stop_days),
            "maintenance_stop_days": int(maintenance_stop_days),
        },

        "best_day": best_day,
        "worst_day": worst_day,

        "kpis": {
            "freq_avg_pct": round(freq_avg_pct, 2),
            "avg_ton_per_hour": round(avg_ton_per_hour, 2),
        },

        "shift": {
            "t1_ton": round(t1_month, 2),
            "t2_ton": round(t2_month, 2),
        },

        "stops": {
            "by_type": by_type_list,
            "by_equipment": by_eq_list,
            "by_description": [
                {"description": k, "hours": round(v, 2)}
                for k, v in sorted(stops_by_desc.items(), key=lambda kv: kv[1], reverse=True)
            ],
            "count_by_period": [
                {"period": k, "count": int(v)}
                for k, v in sorted(stops_count_by_period.items(), key=lambda kv: kv[0])
            ],
        },

        "hours_worked": {
            "total_hours": round(total_work_hours, 2),
            "by_equipment": hours_by_eq_list,
        },

        "series": {
            "daily": daily_series,
        },
    }




# =========================
# Lançamento de Paradas (SEPARADO) - schema bv_launch
# Endpoints:
#   GET /api/stops-launch?day=YYYY-MM-DD
#   PUT /api/stops-launch?day=YYYY-MM-DD
# =========================

class StopLaunchRow(BaseModel):
    period: str = Field(..., description="Faixa horária ex: 07-08 ou 23-00")

    # Aceita tanto o payload antigo (equipment/stop_type/description/minutes)
    # quanto o payload do front (equipamento/tipo_parada/descricao/minutos)
    equipment: Optional[str] = Field(None, alias="equipamento")
    stop_type: Optional[str] = Field(None, alias="tipo_parada")
    description: Optional[str] = Field(None, alias="descricao")
    minutes: int = Field(0, ge=0, le=60, alias="minutos")

    class Config:
        allow_population_by_field_name = True


class StopLaunchPayload(BaseModel):
    day: date
    obs: Optional[str] = None
    rows: List[StopLaunchRow] = Field(default_factory=list)

def _clamp_0_60(v: int) -> int:
    try:
        n = int(v)
    except Exception:
        return 0
    if n < 0:
        return 0
    if n > 60:
        return 60
    return n

def _row_is_empty(r: StopLaunchRow) -> bool:
    # Linha vazia = nada preenchido (minutes=0 e campos em branco)
    if _clamp_0_60(r.minutes) > 0:
        return False
    if (r.description or "").strip():
        return False
    if (r.stop_type or "").strip():
        return False
    if (r.equipment or "").strip():
        return False
    return True

@app.get("/api/stops-launch")
def get_stops_launch(
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    """
    Lê lançamentos de paradas (manual) no schema bv_launch.
    Retorna chaves em PT-BR para o front:
      - equipamento, tipo_parada, descricao, minutos
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, obs
                FROM bv_launch.stops_day
                WHERE owner_id = %s AND day = %s
                """,
                (owner_id, day),
            )
            row = cur.fetchone()
            if not row:
                return {"day": day.isoformat(), "obs": "", "rows": []}

            day_id = row["id"] if isinstance(row, dict) else row[0]
            obs = (row.get("obs") if isinstance(row, dict) else row[1]) or ""

            cur.execute(
                """
                SELECT period, equipment, stop_type, description, minutes
                FROM bv_launch.stops_rows
                WHERE day_id = %s
                ORDER BY period
                """,
                (day_id,),
            )
            fetched = cur.fetchall() or []

    rows = []
    for r in fetched:
        period = r.get("period") if isinstance(r, dict) else r[0]
        equipment = r.get("equipment") if isinstance(r, dict) else r[1]
        stop_type = r.get("stop_type") if isinstance(r, dict) else r[2]
        description = r.get("description") if isinstance(r, dict) else r[3]
        minutes = r.get("minutes") if isinstance(r, dict) else r[4]
        rows.append(
            {
                "period": period,
                "equipamento": equipment or "",
                "tipo_parada": stop_type or "",
                "descricao": description or "",
                "minutos": int(minutes or 0),
            }
        )

    return {"day": day.isoformat(), "obs": obs, "rows": rows}


@app.put("/api/stops-launch")
def put_stops_launch(
    payload: StopLaunchDayUpsert,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    """
    Salva lançamentos de paradas (manual) no schema bv_launch.

    - Aceita payload em PT-BR (equipamento/tipo_parada/descricao/minutos)
    - Salva TODAS as linhas recebidas (inclusive zeradas), para ficar "fixo" no front
    - Mantém 'day' também na query para compatibilidade com o front
    """
    # tolerância: day da query é a fonte de verdade
    if payload.day != day:
        payload = StopLaunchDayUpsert(day=day, rows=payload.rows)

    normalized_rows = []
    for r in payload.rows or []:
        p = normalize_period_launch(str(r.period).strip())
        if not p:
            continue
        normalized_rows.append(
            (
                p,
                (r.equipamento or "").strip() or None,
                (r.tipo_parada or "").strip() or None,
                (r.descricao or "").strip() or None,
                _clamp_0_60(int(r.minutos or 0)),
            )
        )

    with get_conn() as conn:
        with conn.cursor() as cur:
            # UPSERT do dia
            cur.execute(
                """
                INSERT INTO bv_launch.stops_day (owner_id, day, obs)
                VALUES (%s, %s, %s)
                ON CONFLICT (owner_id, day)
                DO UPDATE SET obs = EXCLUDED.obs, updated_at = now()
                RETURNING id
                """,
                (owner_id, day, None),
            )
            row = cur.fetchone()
            day_id = row["id"] if isinstance(row, dict) else row[0]

            # Substitui todas as rows do dia
            cur.execute("DELETE FROM bv_launch.stops_rows WHERE day_id = %s", (day_id,))

            if normalized_rows:
                cur.executemany(
                    """
                    INSERT INTO bv_launch.stops_rows
                    (day_id, period, equipment, stop_type, description, minutes)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (day_id, period, equipment, stop_type, description, minutes)
                        for (period, equipment, stop_type, description, minutes) in normalized_rows
                    ],
                )

        conn.commit()

    return {"ok": True, "day": day.isoformat(), "rows_saved": len(normalized_rows)}



# =========================
# Notices (Supervisor broadcast + confirmação de leitura)
# =========================
@app.get("/api/notices/active", response_model=List[NoticeOut])
def api_list_active_notices(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")

    payload = decode_token(tok)
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select n.id, n.title, n.message, n.is_active, n.created_at, n.created_by,
                   r.read_at
            from public.bv_notices n
            left join public.bv_notice_reads r
              on r.notice_id = n.id and r.user_id = %s
            where n.is_active = true
            order by n.created_at desc
            """,
            (uid,),
        )
        rows = cur.fetchall() or []

    out: List[NoticeOut] = []
    for r in rows:
        out.append(
            NoticeOut(
                id=str(r["id"]),
                title=r["title"],
                message=r["message"],
                is_active=bool(r["is_active"]),
                created_at=r["created_at"].isoformat() if r.get("created_at") else "",
                created_by=str(r["created_by"]),
                read=r["read_at"] is not None,
                read_at=r["read_at"].isoformat() if r.get("read_at") else None,
            )
        )
    return out


@app.post("/api/notices", dependencies=[Depends(require_supervisor_user)])
def api_create_notice(
    body: NoticeCreateIn,
    request: Request,
    sup_payload=Depends(require_supervisor_user),
):
    uid = sup_payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    title = (body.title or "").strip()
    msg = (body.message or "").strip()
    if not title or not msg:
        raise HTTPException(status_code=400, detail="Título e mensagem são obrigatórios")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_notices(title, message, is_active, created_by)
            values (%s,%s,true,%s)
            returning id
            """,
            (title, msg, uid),
        )
        nid = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_NOTICE",
        request=request,
        user_id=str(uid),
        entity="bv_notices",
        entity_id=str(nid),
        payload={"title": title},
    )

    return {"ok": True, "id": str(nid)}


@app.post("/api/notices/{notice_id}/read")
def api_read_notice(
    notice_id: str,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")
    payload = decode_token(tok)
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("select 1 from public.bv_notices where id=%s and is_active=true", (notice_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Aviso não encontrado/ativo")

        cur.execute(
            """
            insert into public.bv_notice_reads(notice_id, user_id, read_at)
            values (%s,%s, now())
            on conflict (notice_id, user_id) do update set read_at = excluded.read_at
            """,
            (notice_id, uid),
        )
        conn.commit()

    return {"ok": True}


@app.post("/api/notices/{notice_id}/close", dependencies=[Depends(require_supervisor_user)])
def api_close_notice(
    notice_id: str,
    request: Request,
    sup_payload=Depends(require_supervisor_user),
):
    uid = sup_payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_notices
            set is_active=false, closed_at=now()
            where id=%s and is_active=true
            """,
            (notice_id,),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Aviso não encontrado/ativo")
        conn.commit()

    log_action(
        action="CLOSE_NOTICE",
        request=request,
        user_id=str(uid),
        entity="bv_notices",
        entity_id=str(notice_id),
        payload=None,
    )

    return {"ok": True}

