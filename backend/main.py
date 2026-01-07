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
    Regra:
      - Bloqueia somente se for dia ANTERIOR ao "hoje" no Brasil
      - EXCETO: permite editar "ontem" durante uma janela após meia-noite (ex.: 01:00)
      - DEV: se X-Dev-Key bater, não bloqueia nada
    """
    if is_dev(dev_key):
        return

    tdy = today_local()
    if d >= tdy:
        return

    # ✅ tolerância: após virar o dia, ainda pode editar "ontem" por X minutos
    n = now_local()
    grace_minutes = int(os.getenv("RETRO_GRACE_MINUTES") or "60")  # padrão 60 min
    if d == (tdy - timedelta(days=1)):
        if n.hour == 0 and n.minute < grace_minutes:
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
# Auth helpers (token HMAC simples)
# =========================
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


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


def bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    a = authorization.strip()
    if not a.lower().startswith("bearer "):
        return None
    return a.split(" ", 1)[1].strip()


def get_optional_user(
    authorization: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    Retorna payload do token se existir e for válido.
    Não bloqueia endpoints existentes (por enquanto).
    """
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
        # log nunca deve derrubar a API
        return


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
@app.get("/dev/users")
def dev_list_users(dev_payload=Depends(require_dev_user)):
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


@app.post("/dev/users")
def dev_create_user(
    body: DevCreateUserIn,
    request: Request,
    dev_payload=Depends(require_dev_user),
):
    allowed = {"apontador", "controlador", "dev"}
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


@app.get("/dev/logs")
def dev_list_logs(limit: int = Query(500, ge=1, le=2000), dev_payload=Depends(require_dev_user)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select l.id, l.user_id, l.action, l.entity, l.entity_id, l.ip, l.user_agent, l.payload, l.created_at,
                   u.full_name as user_name, u.user_type as user_type
            from public.bv_logs l
            left join public.bv_users u on u.id = l.user_id
            order by l.created_at desc
            limit %s
            """,
            (limit,),
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


# =========================
# Plant Production (FIX)
# - last7days vem ANTES do {day} (evita 422)
# - last7days sempre retorna 7 dias (mesmo 0)
# - get_plant_day sempre retorna 24 faixas (00-01..23-00)
# =========================
@app.get("/api/plant-production/last7days")
def plant_last7(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            with days as (
              select (current_date - offs)::date as day
              from generate_series(6, 0, -1) as offs
            ),
            sums as (
              select day, coalesce(sum(coalesce(ton,0)),0) as total_ton
              from public.bv_plant_production_rows
              where owner_id=%s
                and day >= (current_date - 6)
                and day <= current_date
              group by day
            )
            select d.day, coalesce(s.total_ton, 0) as total_ton
            from days d
            left join sums s on s.day = d.day
            order by d.day;
            """,
            (owner_id,),
        )
        rows = cur.fetchall() or []

    return [{"day": str(r["day"]), "total_ton": float(r["total_ton"] or 0)} for r in rows]


@app.get("/api/plant-production/{day}")
def get_plant_day(day: date, owner_id: str = Depends(require_owner_id)):
    periods = [f"{h:02d}-{(h+1)%24:02d}" for h in range(24)]

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

    by_period = {r["period"]: r for r in db_rows}

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
    # ✅ permite lançar "ontem" após meia-noite (grace) e libera DEV via X-Dev-Key
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
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, period, ton, freq)
                values (%s,%s,%s,%s,%s)
                """,
                (owner_id, day, r.period, r.ton, r.freq),
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
# Stops (mantido + log)
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
# Horimetros (INI/FIM) + log
# =========================
@app.post("/api/horimetros")
def create_horimetro(
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
    equipamento: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    owner_id: str = Depends(require_owner_id),
):
    with get_conn() as conn, conn.cursor() as cur:
        if equipamento:
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
