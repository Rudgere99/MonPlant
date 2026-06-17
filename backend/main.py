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
import unicodedata
import random

from passlib.context import CryptContext

from db import get_conn
from auth_dep import require_owner_id

app = FastAPI(title="MonPlant API", version="1.0.0")


# =========================
# Notices tables bootstrap
# =========================
def ensure_notice_tables():
    """Cria as tabelas de avisos (se ainda não existirem)."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            # gen_random_uuid() vem do pgcrypto
            cur.execute("create extension if not exists pgcrypto;")

            cur.execute(
                """
                create table if not exists public.bv_notices (
                  id uuid primary key default gen_random_uuid(),
                  title text not null,
                  message text not null,
                  created_by uuid null,
                  created_by_name text null,
                  is_active boolean not null default true,
                  created_at timestamptz not null default now(),
                  expires_at timestamptz null
                );
                """
            )

            cur.execute(
                """
                create table if not exists public.bv_notice_reads (
                  id bigserial primary key,
                  notice_id uuid not null references public.bv_notices(id) on delete cascade,
                  user_id uuid not null,
                  read_at timestamptz not null default now(),
                  unique(notice_id, user_id)
                );
                """
            )

            cur.execute("alter table public.bv_notices add column if not exists closed_at timestamptz null;")
            cur.execute("alter table public.bv_notices add column if not exists source_key text null;")
            cur.execute("alter table public.bv_notices add column if not exists notice_type text null;")
            cur.execute("create index if not exists idx_bv_notices_source_key on public.bv_notices(source_key);")

            conn.commit()
    except Exception:
        # não pode derrubar a API
        return




def ensure_user_permission_columns():
    """Garante coluna de permissão para edição retroativa por usuário."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                alter table public.bv_users
                add column if not exists can_edit_retroactive boolean not null default false;
                """
            )
            conn.commit()
    except Exception:
        return



def ensure_supervisor_planta_tables():
    """Garante/migra a tabela de cadastro de supervisores da planta.

    Versão reforçada para produção Railway/PostgreSQL:
    - não usa um único bloco grande de DDL;
    - cada ALTER roda em transação própria;
    - não derruba a API se constraint/index falhar;
    - corrige tabela antiga criada sem owner_id.
    """

    def _run_sql(sql: str, params: Optional[tuple] = None) -> bool:
        try:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute(sql, params or ())
                conn.commit()
            return True
        except Exception:
            return False

    _run_sql("create table if not exists public.bv_supervisores_planta (id bigserial primary key);")

    for sql in [
        "alter table public.bv_supervisores_planta add column if not exists owner_id text;",
        "alter table public.bv_supervisores_planta add column if not exists nome_completo text;",
        "alter table public.bv_supervisores_planta add column if not exists empresa text;",
        "alter table public.bv_supervisores_planta add column if not exists plant_id integer;",
        "alter table public.bv_supervisores_planta add column if not exists planta_id integer;",  # compatibilidade com tabela antiga
        "alter table public.bv_supervisores_planta add column if not exists letra_turno text;",
        "alter table public.bv_supervisores_planta add column if not exists ativo boolean not null default true;",
        "alter table public.bv_supervisores_planta add column if not exists created_at timestamptz not null default now();",
        "alter table public.bv_supervisores_planta add column if not exists updated_at timestamptz not null default now();",
    ]:
        _run_sql(sql)

    _run_sql(
        """
        update public.bv_supervisores_planta
           set owner_id = coalesce(nullif(owner_id, ''), 'legacy'),
               nome_completo = coalesce(nullif(nome_completo, ''), 'Supervisor sem nome'),
               empresa = coalesce(nullif(empresa, ''), 'Trindade'),
               plant_id = coalesce(plant_id, planta_id, 1),
               planta_id = coalesce(planta_id, plant_id, 1),
               letra_turno = upper(coalesce(nullif(letra_turno, ''), 'A')),
               ativo = coalesce(ativo, true),
               created_at = coalesce(created_at, now()),
               updated_at = coalesce(updated_at, now())
         where owner_id is null or owner_id = ''
            or nome_completo is null or nome_completo = ''
            or empresa is null or empresa = ''
            or plant_id is null
            or planta_id is null
            or letra_turno is null or letra_turno = ''
            or ativo is null
            or created_at is null
            or updated_at is null;
        """
    )

    _run_sql(
        """
        update public.bv_supervisores_planta
           set letra_turno = 'A'
         where upper(coalesce(letra_turno, '')) not in ('A','B','C','D');
        """
    )

    for col in ["owner_id", "nome_completo", "empresa", "plant_id", "planta_id", "letra_turno", "ativo", "created_at", "updated_at"]:
        _run_sql(f"alter table public.bv_supervisores_planta alter column {col} set not null;")

    _run_sql(
        """
        do $$
        begin
          if not exists (
            select 1 from pg_constraint
            where conname = 'ck_bv_supervisores_planta_letra'
              and conrelid = 'public.bv_supervisores_planta'::regclass
          ) then
            alter table public.bv_supervisores_planta
              add constraint ck_bv_supervisores_planta_letra
              check (upper(letra_turno) in ('A','B','C','D'));
          end if;
        end $$;
        """
    )

    _run_sql("create index if not exists idx_bv_supervisores_planta_owner on public.bv_supervisores_planta(owner_id);")
    _run_sql("create index if not exists idx_bv_supervisores_planta_owner_plant on public.bv_supervisores_planta(owner_id, plant_id);")
    _run_sql("create index if not exists idx_bv_supervisores_planta_owner_letra on public.bv_supervisores_planta(owner_id, letra_turno);")
    _run_sql(
        """
        create unique index if not exists ux_bv_supervisores_planta_owner_nome_plant_letra
          on public.bv_supervisores_planta(owner_id, lower(nome_completo), plant_id, upper(letra_turno));
        """
    )



def ensure_plant_production_equipment_tables():
    """Garante a tabela de equipamentos da produção de planta.

    Esta tabela é separada de public.bv_equipments, que segue usada para
    equipamentos do Ritmo/conchada. Aqui ficam os TAGs utilizados nas telas
    de Produção de Planta e Paradas Minutos.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS public.bv_plant_production_equipments (
                    id BIGSERIAL PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    plant_id INTEGER NOT NULL,
                    tag TEXT NOT NULL,
                    description TEXT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute("ALTER TABLE public.bv_plant_production_equipments ADD COLUMN IF NOT EXISTS owner_id TEXT;")
            cur.execute("ALTER TABLE public.bv_plant_production_equipments ADD COLUMN IF NOT EXISTS plant_id INTEGER;")
            cur.execute("ALTER TABLE public.bv_plant_production_equipments ADD COLUMN IF NOT EXISTS tag TEXT;")
            cur.execute("ALTER TABLE public.bv_plant_production_equipments ADD COLUMN IF NOT EXISTS description TEXT;")
            cur.execute("ALTER TABLE public.bv_plant_production_equipments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;")
            cur.execute("ALTER TABLE public.bv_plant_production_equipments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();")
            cur.execute("ALTER TABLE public.bv_plant_production_equipments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();")

            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ux_bv_plant_production_equipments_owner_plant_tag
                ON public.bv_plant_production_equipments (owner_id, plant_id, UPPER(tag));
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_bv_plant_production_equipments_owner_plant
                ON public.bv_plant_production_equipments (owner_id, plant_id);
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_bv_plant_production_equipments_active
                ON public.bv_plant_production_equipments (owner_id, plant_id, is_active);
                """
            )
            conn.commit()
    except Exception:
        # Não derruba a API por DDL.
        return


def _supervisor_table_columns() -> set[str]:
    """Retorna colunas existentes na tabela de supervisores, sem derrubar a API."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select column_name
                from information_schema.columns
                where table_schema='public'
                  and table_name='bv_supervisores_planta'
                """
            )
            rows = cur.fetchall() or []
        cols = set()
        for r in rows:
            if isinstance(r, dict):
                cols.add(str(r.get("column_name")))
            else:
                cols.add(str(r[0]))
        return cols
    except Exception:
        return set()

@app.on_event("startup")
def _startup_bootstrap():
    ensure_notice_tables()
    ensure_user_permission_columns()
    ensure_supervisor_planta_tables()
    ensure_plant_production_over_columns()
    ensure_stops_launch_tables()
    ensure_plant_production_equipment_tables()

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

def normalize_user_type(v: str | None) -> str:
    """Normaliza user_type vindo do front/DB.
    Aceita variações com maiúsculas/acentos/espaços.
    """
    if v is None:
        return ""
    t = str(v).strip().lower()
    # remove acentos (ex: "gerência" -> "gerencia")
    t = unicodedata.normalize("NFD", t)
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    # normaliza separadores
    t = t.replace(" ", "_").replace("-", "_")
    t = re.sub(r"_+", "_", t)

    # aliases
    if t in {"gerencia", "gerencia_", "gerencia_planta", "management"}:
        return "gerencia"
    if t in {"supervisor", "supervisor_planta", "sup", "sup_planta"}:
        return "supervisor"

    return t


ALLOWED_USER_TYPES = {"apontador", "controlador", "dev", "gerencia", "supervisor", "gestao_vista"}


def is_dev(dev_key: Optional[str]) -> bool:
    """
    Habilita bypass do bloqueio retroativo, usando header X-Dev-Key.
    Configure no Railway: DEV_KEY=uma_senha_forte
    """
    if not dev_key:
        return False
    expected = (os.getenv("DEV_KEY") or "").strip()
    return bool(expected) and dev_key.strip() == expected


def user_can_edit_retroactive(authorization: Optional[str]) -> bool:
    """Retorna True quando o usuário autenticado recebeu permissão retroativa."""
    tok = bearer_token(authorization)
    if not tok:
        return False

    try:
        payload = decode_token(tok)
    except Exception:
        return False

    uid = payload.get("uid")
    typ = normalize_user_type(payload.get("typ"))

    # DEV continua liberado por segurança administrativa
    if typ == "dev":
        return True

    if not uid:
        return False

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select coalesce(can_edit_retroactive, false) as can_edit_retroactive
                from public.bv_users
                where id=%s and is_active=true
                """,
                (uid,),
            )
            row = cur.fetchone()
        return bool(row and row.get("can_edit_retroactive"))
    except Exception:
        return False


def block_retro(d: date, dev_key: Optional[str] = None, authorization: Optional[str] = None):
    """
    Regra (Brasil):
      - Bloqueia somente se for dia ANTERIOR ao "hoje"
      - EXCETO: permite editar "ontem" até um horário limite (útil para turno 19:00-07:00)
      - DEV: se X-Dev-Key bater, não bloqueia nada

    Configure no Railway (opcional):
      - RETRO_ALLOW_UNTIL_HOUR (default 7)  -> permite editar ontem até HH:59
    """
    if is_dev(dev_key) or user_can_edit_retroactive(authorization):
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


def ensure_plant_production_over_columns():
    """
    Garante os campos necessários para preservar o valor original antes do OVER.

    - bv_plant_production_rows continua guardando a produção oficial ajustada.
    - bv_plant_production_daily.original_rows guarda o lançamento original por hora.
    - bv_plant_production_daily.over_moved_t guarda o total de OVER movimentado no dia.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                alter table public.bv_plant_production_daily
                add column if not exists original_rows jsonb;
                """
            )
            cur.execute(
                """
                alter table public.bv_plant_production_daily
                add column if not exists over_moved_t numeric(18,2) not null default 0;
                """
            )
            conn.commit()
    except Exception:
        # Não derruba a API por DDL; as rotas também tratam fallback.
        return


def _plant_rows_to_plain(rows: Optional[List[Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in rows or []:
        if hasattr(r, "model_dump"):
            d = r.model_dump()
        else:
            d = dict(r)
        p = normalize_period(str(d.get("period") or "")) or str(d.get("period") or "")
        out.append(
            {
                "period": p,
                "ton": d.get("ton"),
                "freq": d.get("freq"),
            }
        )
    return out


def _coerce_rows_like_to_full_rows(rows_like: Any, periods: List[str]) -> List[Dict[str, Any]]:
    """
    Converte original_rows salvo no JSONB em 24 linhas no mesmo padrão do front.
    Se estiver vazio/inválido, retorna linhas zeradas.
    """
    by_period: Dict[str, Dict[str, Any]] = {}

    if isinstance(rows_like, str):
        try:
            rows_like = json.loads(rows_like)
        except Exception:
            rows_like = []

    if isinstance(rows_like, list):
        for item in rows_like:
            if not isinstance(item, dict):
                continue
            p = normalize_period(str(item.get("period") or ""))
            if not p:
                continue
            by_period[p] = {
                "period": p,
                "ton": item.get("ton"),
                "freq": item.get("freq"),
            }

    return [
        {
            "period": p,
            "ton": by_period.get(p, {}).get("ton"),
            "freq": by_period.get(p, {}).get("freq"),
        }
        for p in periods
    ]


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


def safe_owner_id_from_auth(authorization: Optional[str]) -> str:
    """Resolve owner_id sem deixar erro de auth/DB quebrar rotas auxiliares.

    Usado no cadastro de supervisores para evitar que falhas no auth_dep virem
    erro 500 sem cabeçalho CORS no navegador.
    """
    try:
        tok = bearer_token(authorization)
        if not tok:
            return "legacy"
        payload = decode_token(tok)
        uid = payload.get("uid")
        return str(uid) if uid else "legacy"
    except Exception:
        return "legacy"


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

    # Novo modelo de Paradas Minutos:
    # - permite mais de uma parada no mesmo period;
    # - usa hora inicial/final para identificar simultaneidade/sobreposição;
    # - justificativa é preenchida pelo front somente quando a baixa produção horária for detectada.
    id: Optional[int] = None
    ordem: Optional[int] = None
    hora_inicial: Optional[str] = None
    hora_final: Optional[str] = None
    justificativa_baixa_producao: Optional[str] = ""


class StopLaunchDayUpsert(BaseModel):
    day: date
    obs: Optional[str] = None
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
    # rows = produção oficial AJUSTADA, usada em Dashboard/Statistics.
    rows: List[PlantRow] = Field(default_factory=list)
    # original_rows = produção antes do abatimento de OVER.
    # Mantém compatibilidade: se o front não enviar, o backend salva igual a rows.
    original_rows: Optional[List[PlantRow]] = None
    # over_moved_t = total de OVER movimentado no dia.
    over_moved_t: Optional[float] = 0


class PlantOut(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool


class PlantCreateIn(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True


class SupervisorPlantaIn(BaseModel):
    nome_completo: str
    empresa: str
    plant_id: int
    letra_turno: str
    ativo: bool = True


class SupervisorPlantaUpdateIn(BaseModel):
    nome_completo: Optional[str] = None
    empresa: Optional[str] = None
    plant_id: Optional[int] = None
    letra_turno: Optional[str] = None
    ativo: Optional[bool] = None


class EquipmentIn(BaseModel):
    equipment_type: Optional[str] = "escavadeira"
    tag: str
    bucket_ton: float = Field(0, ge=0)
    is_active: bool = True


class EquipmentUpdateIn(BaseModel):
    equipment_type: Optional[str] = None
    tag: Optional[str] = None
    bucket_ton: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None


class EquipmentAllocationIn(BaseModel):
    equipment_id: Optional[int] = None


class PlantProductionEquipmentIn(BaseModel):
    plant_id: int
    tag: str
    description: Optional[str] = None
    is_active: bool = True


class PlantProductionEquipmentUpdateIn(BaseModel):
    plant_id: Optional[int] = None
    tag: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


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
    user_type: str  # apontador | controlador | gerencia | supervisor | gestao_vista | dev
    email: EmailStr
    password: str


class DevUpdateUserIn(BaseModel):
    full_name: Optional[str] = None
    sector: Optional[str] = None
    user_type: Optional[str] = None  # apontador | controlador | gerencia | supervisor | gestao_vista | dev
    is_active: Optional[bool] = None
    can_edit_retroactive: Optional[bool] = None
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
            select id, full_name, sector, user_type, email, password_hash, is_active, coalesce(can_edit_retroactive,false) as can_edit_retroactive
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

        ut = normalize_user_type(u["user_type"])
        token = create_token(str(u["id"]), ut, u["email"])

    log_action(
        action="LOGIN",
        request=request,
        user_id=str(u["id"]),
        entity="bv_users",
        entity_id=str(u["id"]),
        payload={"email": email, "user_type": normalize_user_type(u["user_type"])},
    )

    return {
        "token": token,
        "user": {
            "id": str(u["id"]),
            "full_name": u["full_name"],
            "sector": u["sector"],
            "user_type": normalize_user_type(u["user_type"]),
            "email": u["email"],
            "can_edit_retroactive": bool(u.get("can_edit_retroactive", False)),
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
            select id, full_name, sector, user_type, email, is_active, coalesce(can_edit_retroactive,false) as can_edit_retroactive
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
        "user_type": normalize_user_type(u["user_type"]),
        "email": u["email"],
        "can_edit_retroactive": bool(u.get("can_edit_retroactive", False)),
    }


# =========================
# DEV (users + logs)
# =========================
def _dev_list_users():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, full_name, sector, user_type, email, is_active, coalesce(can_edit_retroactive,false) as can_edit_retroactive, created_at
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
            "user_type": normalize_user_type(r["user_type"]),
            "email": r["email"],
            "is_active": bool(r["is_active"]),
            "can_edit_retroactive": bool(r.get("can_edit_retroactive", False)),
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
    user_type = normalize_user_type(body.user_type)
    if user_type not in ALLOWED_USER_TYPES:
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
            (body.full_name.strip(), body.sector.strip(), user_type, email, pw_hash),
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
                "user_type": user_type,
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
    fields = []
    values = []

    if body.full_name is not None:
        fields.append("full_name=%s")
        values.append(body.full_name.strip())

    if body.sector is not None:
        fields.append("sector=%s")
        values.append(body.sector.strip())

    if body.user_type is not None:
        if normalize_user_type(body.user_type) not in ALLOWED_USER_TYPES:
            raise HTTPException(status_code=400, detail="user_type inválido")
        fields.append("user_type=%s")
        values.append(normalize_user_type(body.user_type))

    if body.is_active is not None:
        fields.append("is_active=%s")
        values.append(bool(body.is_active))

    if body.can_edit_retroactive is not None:
        fields.append("can_edit_retroactive=%s")
        values.append(bool(body.can_edit_retroactive))

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
# Plants
# =========================
@app.get("/api/plants", response_model=List[PlantOut])
def list_plants(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, code, name, description, is_active
            from public.bv_plants
            where is_active = true
            order by id asc
            """
        )
        rows = cur.fetchall() or []

    return [
        {
            "id": int(r["id"]),
            "code": r["code"],
            "name": r["name"],
            "description": r["description"],
            "is_active": bool(r["is_active"]),
        }
        for r in rows
    ]


@app.post("/api/plants", response_model=PlantOut)
def create_plant(
    body: PlantCreateIn,
    owner_id: str = Depends(require_owner_id),
):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plants(code, name, description, is_active)
            values (%s, %s, %s, %s)
            returning id, code, name, description, is_active
            """,
            (body.code.strip(), body.name.strip(), body.description, bool(body.is_active)),
        )
        row = cur.fetchone()
        conn.commit()

    return {
        "id": int(row["id"]),
        "code": row["code"],
        "name": row["name"],
        "description": row["description"],
        "is_active": bool(row["is_active"]),
    }


# =========================
# Supervisores Planta
# =========================
@app.options("/api/supervisores-planta")
def options_supervisores_planta():
    return Response(status_code=200)


@app.options("/api/supervisores-planta/{supervisor_id}")
def options_supervisor_planta_id(supervisor_id: int):
    return Response(status_code=200)


def _normalize_letra_turno(letra: Optional[str]) -> str:
    v = (letra or "").strip().upper()
    if v not in {"A", "B", "C", "D"}:
        raise HTTPException(status_code=400, detail="Letra do turno inválida. Use A, B, C ou D.")
    return v


def _supervisor_planta_out(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(r["id"]),
        "owner_id": r.get("owner_id"),
        "nome_completo": r.get("nome_completo") or "",
        "empresa": r.get("empresa") or "",
        "plant_id": int(r.get("plant_id") or 0),
        "letra_turno": (r.get("letra_turno") or "").upper(),
        "ativo": bool(r.get("ativo")),
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
    }


@app.get("/api/supervisores-planta")
def listar_supervisores_planta(
    plant_id: Optional[int] = Query(None),
    letra_turno: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    somente_ativos: Optional[bool] = Query(None),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    owner_id = safe_owner_id_from_auth(authorization)
    # Compatibilidade: algumas versões do front chamavam ?somente_ativos=true.
    # O padrão novo é ?include_inactive=false.
    if somente_ativos is not None:
        include_inactive = not bool(somente_ativos)

    ensure_supervisor_planta_tables()
    cols = _supervisor_table_columns()

    # Se a tabela ainda não existe ou a migração não conseguiu criar colunas,
    # não deixa o navegador cair em Failed to fetch/CORS. Retorna lista vazia
    # e o startup/SQL pode corrigir em seguida.
    required = {"id", "nome_completo", "empresa", "plant_id", "letra_turno", "ativo", "created_at", "updated_at"}
    if not required.issubset(cols):
        return []

    has_owner = "owner_id" in cols
    select_owner = "owner_id" if has_owner else "null::text as owner_id"
    where: List[str] = []
    args: List[Any] = []

    if has_owner:
        where.append("owner_id=%s")
        args.append(owner_id)

    if plant_id is not None:
        where.append("coalesce(plant_id, planta_id)=%s")
        args.append(int(plant_id))

    if letra_turno:
        where.append("upper(letra_turno)=upper(%s)")
        args.append(_normalize_letra_turno(letra_turno))

    if not include_inactive:
        where.append("ativo=true")

    where_sql = "where " + " and ".join(where) if where else ""

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                select id, {select_owner} as owner_id, nome_completo, empresa,
                       coalesce(plant_id, planta_id) as plant_id,
                       letra_turno, ativo, created_at, updated_at
                from public.bv_supervisores_planta
                {where_sql}
                order by coalesce(plant_id, planta_id) asc, letra_turno asc, nome_completo asc
                """,
                tuple(args),
            )
            rows = cur.fetchall() or []
    except Exception:
        # Evita quebrar a API e aparecer como CORS no front.
        return []

    return [_supervisor_planta_out(r) for r in rows]


@app.post("/api/supervisores-planta")
def criar_supervisor_planta(
    body: SupervisorPlantaIn,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    owner_id = safe_owner_id_from_auth(authorization)
    ensure_supervisor_planta_tables()

    nome = (body.nome_completo or "").strip()
    empresa = (body.empresa or "").strip()
    plant_id = int(body.plant_id)
    letra = _normalize_letra_turno(body.letra_turno)

    if not nome:
        raise HTTPException(status_code=400, detail="Nome completo é obrigatório")
    if not empresa:
        raise HTTPException(status_code=400, detail="Empresa é obrigatória")
    if plant_id <= 0:
        raise HTTPException(status_code=400, detail="Planta de operação inválida")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_supervisores_planta(
                  owner_id, nome_completo, empresa, plant_id, planta_id, letra_turno, ativo, updated_at
                )
                values (%s,%s,%s,%s,%s,%s,%s,now())
                returning id, owner_id, nome_completo, empresa, coalesce(plant_id, planta_id) as plant_id, letra_turno, ativo, created_at, updated_at
                """,
                (owner_id, nome, empresa, plant_id, plant_id, letra, bool(body.ativo)),
            )
            row = cur.fetchone()
            conn.commit()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Este supervisor já está cadastrado para esta planta e letra")
        raise

    log_action(
        action="CREATE_SUPERVISOR_PLANTA",
        request=request,
        user_id=user_id,
        entity="bv_supervisores_planta",
        entity_id=str(row["id"]),
        payload={"owner_id": owner_id, "plant_id": plant_id, "letra_turno": letra, "nome_completo": nome},
    )

    return {"ok": True, **_supervisor_planta_out(row)}


@app.put("/api/supervisores-planta/{supervisor_id}")
def atualizar_supervisor_planta(
    supervisor_id: int,
    body: SupervisorPlantaIn,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return alterar_supervisor_planta(supervisor_id, SupervisorPlantaUpdateIn(**body.model_dump()), request, authorization)


@app.patch("/api/supervisores-planta/{supervisor_id}")
def alterar_supervisor_planta(
    supervisor_id: int,
    body: SupervisorPlantaUpdateIn,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    owner_id = safe_owner_id_from_auth(authorization)
    ensure_supervisor_planta_tables()

    fields = []
    values: List[Any] = []

    if body.nome_completo is not None:
        nome = (body.nome_completo or "").strip()
        if not nome:
            raise HTTPException(status_code=400, detail="Nome completo é obrigatório")
        fields.append("nome_completo=%s")
        values.append(nome)

    if body.empresa is not None:
        empresa = (body.empresa or "").strip()
        if not empresa:
            raise HTTPException(status_code=400, detail="Empresa é obrigatória")
        fields.append("empresa=%s")
        values.append(empresa)

    if body.plant_id is not None:
        plant_id = int(body.plant_id)
        if plant_id <= 0:
            raise HTTPException(status_code=400, detail="Planta de operação inválida")
        fields.append("plant_id=%s")
        values.append(plant_id)
        fields.append("planta_id=%s")
        values.append(plant_id)

    if body.letra_turno is not None:
        fields.append("letra_turno=%s")
        values.append(_normalize_letra_turno(body.letra_turno))

    if body.ativo is not None:
        fields.append("ativo=%s")
        values.append(bool(body.ativo))

    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    fields.append("updated_at=now()")
    values.extend([owner_id, int(supervisor_id)])

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                update public.bv_supervisores_planta
                set {', '.join(fields)}
                where owner_id=%s and id=%s
                returning id, owner_id, nome_completo, empresa, coalesce(plant_id, planta_id) as plant_id, letra_turno, ativo, created_at, updated_at
                """,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Supervisor não encontrado")
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Este supervisor já está cadastrado para esta planta e letra")
        raise

    log_action(
        action="UPDATE_SUPERVISOR_PLANTA",
        request=request,
        user_id=user_id,
        entity="bv_supervisores_planta",
        entity_id=str(supervisor_id),
        payload=body.model_dump(exclude_none=True),
    )

    return {"ok": True, **_supervisor_planta_out(row)}


@app.delete("/api/supervisores-planta/{supervisor_id}")
def remover_supervisor_planta(
    supervisor_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    """Inativa o cadastro para preservar histórico."""
    owner_id = safe_owner_id_from_auth(authorization)
    ensure_supervisor_planta_tables()

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_supervisores_planta
            set ativo=false, updated_at=now()
            where owner_id=%s and id=%s
            returning id, owner_id, nome_completo, empresa, coalesce(plant_id, planta_id) as plant_id, letra_turno, ativo, created_at, updated_at
            """,
            (owner_id, supervisor_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Supervisor não encontrado")
        conn.commit()

    log_action(
        action="DELETE_SUPERVISOR_PLANTA",
        request=request,
        user_id=user_id,
        entity="bv_supervisores_planta",
        entity_id=str(supervisor_id),
        payload={"owner_id": owner_id, "soft_delete": True},
    )

    return {"ok": True, **_supervisor_planta_out(row)}


# =========================
# Equipamentos / Escavadeiras + Alocação por Planta
# =========================
def _equipment_out(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(r["id"]),
        "owner_id": r.get("owner_id"),
        "equipment_type": r.get("equipment_type") or "escavadeira",
        "tag": r.get("tag") or "",
        "bucket_ton": float(r.get("bucket_ton") or 0),
        "is_active": bool(r.get("is_active")),
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
    }


@app.get("/api/equipments")
def list_equipments(
    include_inactive: bool = Query(False),
    owner_id: str = Depends(require_owner_id),
):
    where = "where owner_id=%s"
    args: List[Any] = [owner_id]
    if not include_inactive:
        where += " and is_active=true"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, owner_id, equipment_type, tag, bucket_ton, is_active, created_at, updated_at
            from public.bv_equipments
            {where}
            order by is_active desc, tag asc
            """,
            tuple(args),
        )
        rows = cur.fetchall() or []

    return [_equipment_out(r) for r in rows]


@app.post("/api/equipments")
def create_equipment(
    body: EquipmentIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    tag = (body.tag or "").strip().upper()
    if not tag:
        raise HTTPException(status_code=400, detail="TAG é obrigatória")

    equipment_type = (body.equipment_type or "escavadeira").strip().lower() or "escavadeira"
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_equipments(owner_id, equipment_type, tag, bucket_ton, is_active, updated_at)
                values (%s,%s,%s,%s,%s,now())
                returning id, owner_id, equipment_type, tag, bucket_ton, is_active, created_at, updated_at
                """,
                (owner_id, equipment_type, tag, float(body.bucket_ton or 0), bool(body.is_active)),
            )
            row = cur.fetchone()
            conn.commit()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG")
        raise

    log_action(
        action="CREATE_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_equipments",
        entity_id=str(row["id"]),
        payload={"owner_id": owner_id, "tag": tag, "bucket_ton": float(body.bucket_ton or 0)},
    )
    return _equipment_out(row)


@app.put("/api/equipments/{equipment_id}")
def update_equipment(
    equipment_id: int,
    body: EquipmentUpdateIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    fields = []
    values: List[Any] = []

    if body.equipment_type is not None:
        fields.append("equipment_type=%s")
        values.append((body.equipment_type or "escavadeira").strip().lower() or "escavadeira")
    if body.tag is not None:
        tag = (body.tag or "").strip().upper()
        if not tag:
            raise HTTPException(status_code=400, detail="TAG é obrigatória")
        fields.append("tag=%s")
        values.append(tag)
    if body.bucket_ton is not None:
        fields.append("bucket_ton=%s")
        values.append(float(body.bucket_ton or 0))
    if body.is_active is not None:
        fields.append("is_active=%s")
        values.append(bool(body.is_active))

    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    fields.append("updated_at=now()")
    values.extend([owner_id, equipment_id])

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                update public.bv_equipments
                set {', '.join(fields)}
                where owner_id=%s and id=%s
                returning id, owner_id, equipment_type, tag, bucket_ton, is_active, created_at, updated_at
                """,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Equipamento não encontrado")
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG")
        raise

    log_action(
        action="UPDATE_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_equipments",
        entity_id=str(equipment_id),
        payload=body.model_dump(exclude_none=True),
    )
    return _equipment_out(row)


@app.delete("/api/equipments/{equipment_id}")
def delete_equipment(
    equipment_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    """Inativa o equipamento para preservar histórico e não quebrar alocações antigas."""
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_equipments
            set is_active=false, updated_at=now()
            where owner_id=%s and id=%s
            returning id
            """,
            (owner_id, equipment_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Equipamento não encontrado")

        # Desativa vínculos ativos desse equipamento.
        cur.execute(
            """
            update public.bv_plant_equipment_allocations
            set is_active=false, updated_at=now()
            where owner_id=%s and equipment_id=%s and is_active=true
            """,
            (owner_id, equipment_id),
        )
        conn.commit()

    log_action(
        action="DELETE_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_equipments",
        entity_id=str(equipment_id),
        payload={"owner_id": owner_id, "soft_delete": True},
    )
    return {"ok": True, "id": equipment_id, "is_active": False}


def _equipment_allocation_payload(plant_id: int, row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not row:
        return {"plant_id": plant_id, "allocation": None, "equipment": None}
    equipment = {
        "id": int(row["equipment_id"]),
        "equipment_type": row.get("equipment_type") or "escavadeira",
        "tag": row.get("tag") or "",
        "bucket_ton": float(row.get("bucket_ton") or 0),
        "is_active": bool(row.get("equipment_is_active", True)),
    }
    return {
        "plant_id": plant_id,
        "allocation": {
            "id": int(row["allocation_id"]),
            "plant_id": int(row["plant_id"]),
            "equipment_id": int(row["equipment_id"]),
            "is_active": bool(row.get("allocation_is_active", True)),
            "updated_at": row["allocation_updated_at"].isoformat() if row.get("allocation_updated_at") else None,
        },
        "equipment": equipment,
    }


def _get_equipment_allocation(owner_id: str, plant_id: int) -> Dict[str, Any]:
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select a.id as allocation_id, a.plant_id, a.equipment_id,
                   a.is_active as allocation_is_active, a.updated_at as allocation_updated_at,
                   e.equipment_type, e.tag, e.bucket_ton, e.is_active as equipment_is_active
            from public.bv_plant_equipment_allocations a
            join public.bv_equipments e on e.id = a.equipment_id and e.owner_id = a.owner_id
            where a.owner_id=%s and a.plant_id=%s and a.is_active=true
            limit 1
            """,
            (owner_id, plant_id),
        )
        row = cur.fetchone()
    return _equipment_allocation_payload(plant_id, row)


@app.get("/api/plants/{plant_id}/equipment-allocation")
def get_equipment_allocation(
    plant_id: int,
    owner_id: str = Depends(require_owner_id),
):
    plant_id = _validate_plant_id(plant_id)
    return _get_equipment_allocation(owner_id, plant_id)


@app.put("/api/plants/{plant_id}/equipment-allocation")
def put_equipment_allocation(
    plant_id: int,
    body: EquipmentAllocationIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    plant_id = _validate_plant_id(plant_id)
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    if body.equipment_id is None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                update public.bv_plant_equipment_allocations
                set is_active=false, updated_at=now()
                where owner_id=%s and plant_id=%s and is_active=true
                """,
                (owner_id, plant_id),
            )
            conn.commit()
        log_action(
            action="REMOVE_PLANT_EQUIPMENT_ALLOCATION",
            request=request,
            user_id=user_id,
            entity="bv_plant_equipment_allocations",
            entity_id=f"plant::{plant_id}",
            payload={"owner_id": owner_id, "plant_id": plant_id},
        )
        return {"ok": True, **_get_equipment_allocation(owner_id, plant_id)}

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id
            from public.bv_equipments
            where owner_id=%s and id=%s and is_active=true
            """,
            (owner_id, body.equipment_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Equipamento ativo não encontrado")

        cur.execute(
            """
            insert into public.bv_plant_equipment_allocations(owner_id, plant_id, equipment_id, is_active, updated_at)
            values (%s,%s,%s,true,now())
            on conflict (owner_id, plant_id)
            do update set equipment_id=excluded.equipment_id, is_active=true, updated_at=now()
            returning id
            """,
            (owner_id, plant_id, body.equipment_id),
        )
        allocation_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="SET_PLANT_EQUIPMENT_ALLOCATION",
        request=request,
        user_id=user_id,
        entity="bv_plant_equipment_allocations",
        entity_id=str(allocation_id),
        payload={"owner_id": owner_id, "plant_id": plant_id, "equipment_id": body.equipment_id},
    )
    return {"ok": True, **_get_equipment_allocation(owner_id, plant_id)}


@app.get("/api/plants/{plant_id}/rhythm-equipment")
def get_rhythm_equipment(
    plant_id: int,
    owner_id: str = Depends(require_owner_id),
):
    """Endpoint dedicado ao Ritmo: retorna a escavadeira vinculada à planta e sua t/conchada."""
    plant_id = _validate_plant_id(plant_id)
    return _get_equipment_allocation(owner_id, plant_id)


def _plant_production_equipment_out(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": int(r["id"]),
        "owner_id": r.get("owner_id"),
        "plant_id": int(r.get("plant_id") or 0),
        "tag": r.get("tag") or "",
        "description": r.get("description") or "",
        "is_active": bool(r.get("is_active")),
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
        "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
    }


@app.get("/api/plants/{plant_id}/plant-production-equipments")
def list_plant_production_equipments_by_plant(
    plant_id: int,
    include_inactive: bool = Query(False),
    owner_id: str = Depends(require_owner_id),
):
    """Lista TAGs de equipamentos cadastrados para uso em Produção de Planta/Paradas Minutos."""
    plant_id = _validate_plant_id(plant_id)
    ensure_plant_production_equipment_tables()

    args: List[Any] = [owner_id, plant_id]
    where = "where owner_id=%s and plant_id=%s"
    if not include_inactive:
        where += " and is_active=true"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
            from public.bv_plant_production_equipments
            {where}
            order by is_active desc, tag asc
            """,
            tuple(args),
        )
        rows = cur.fetchall() or []

    return [_plant_production_equipment_out(r) for r in rows]


@app.get("/api/plant-production-equipments")
def list_plant_production_equipments(
    plant_id: Optional[int] = Query(None),
    include_inactive: bool = Query(False),
    owner_id: str = Depends(require_owner_id),
):
    """Lista os equipamentos da produção de planta. Pode filtrar por plant_id."""
    ensure_plant_production_equipment_tables()

    where = "where owner_id=%s"
    args: List[Any] = [owner_id]

    if plant_id is not None:
        plant_id = _validate_plant_id(plant_id)
        where += " and plant_id=%s"
        args.append(int(plant_id))

    if not include_inactive:
        where += " and is_active=true"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
            from public.bv_plant_production_equipments
            {where}
            order by plant_id asc, is_active desc, tag asc
            """,
            tuple(args),
        )
        rows = cur.fetchall() or []

    return [_plant_production_equipment_out(r) for r in rows]


@app.post("/api/plant-production-equipments")
def create_plant_production_equipment(
    body: PlantProductionEquipmentIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    """Cria TAG de equipamento vinculado a uma planta."""
    ensure_plant_production_equipment_tables()

    plant_id = _validate_plant_id(body.plant_id)
    tag = (body.tag or "").strip().upper()
    description = (body.description or "").strip() or None

    if not tag:
        raise HTTPException(status_code=400, detail="TAG é obrigatória")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_plant_production_equipments(
                    owner_id, plant_id, tag, description, is_active, updated_at
                )
                values (%s,%s,%s,%s,%s,now())
                returning id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
                """,
                (owner_id, plant_id, tag, description, bool(body.is_active)),
            )
            row = cur.fetchone()
            conn.commit()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG para esta planta")
        raise

    log_action(
        action="CREATE_PLANT_PRODUCTION_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_equipments",
        entity_id=str(row["id"]),
        payload={"owner_id": owner_id, "plant_id": plant_id, "tag": tag},
    )

    return {"ok": True, **_plant_production_equipment_out(row)}


@app.put("/api/plant-production-equipments/{equipment_id}")
def update_plant_production_equipment(
    equipment_id: int,
    body: PlantProductionEquipmentUpdateIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    """Atualiza TAG/planta/descrição/status do equipamento de produção de planta."""
    ensure_plant_production_equipment_tables()

    fields = []
    values: List[Any] = []

    if body.plant_id is not None:
        plant_id = _validate_plant_id(body.plant_id)
        fields.append("plant_id=%s")
        values.append(plant_id)

    if body.tag is not None:
        tag = (body.tag or "").strip().upper()
        if not tag:
            raise HTTPException(status_code=400, detail="TAG é obrigatória")
        fields.append("tag=%s")
        values.append(tag)

    if body.description is not None:
        description = (body.description or "").strip() or None
        fields.append("description=%s")
        values.append(description)

    if body.is_active is not None:
        fields.append("is_active=%s")
        values.append(bool(body.is_active))

    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    fields.append("updated_at=now()")
    values.extend([owner_id, int(equipment_id)])

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                update public.bv_plant_production_equipments
                set {', '.join(fields)}
                where owner_id=%s and id=%s
                returning id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
                """,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Equipamento não encontrado")
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG para esta planta")
        raise

    log_action(
        action="UPDATE_PLANT_PRODUCTION_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_equipments",
        entity_id=str(equipment_id),
        payload=body.model_dump(exclude_none=True),
    )

    return {"ok": True, **_plant_production_equipment_out(row)}


@app.delete("/api/plant-production-equipments/{equipment_id}")
def delete_plant_production_equipment(
    equipment_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    """Inativa o equipamento para preservar histórico."""
    ensure_plant_production_equipment_tables()

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_plant_production_equipments
            set is_active=false, updated_at=now()
            where owner_id=%s and id=%s
            returning id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
            """,
            (owner_id, int(equipment_id)),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Equipamento não encontrado")
        conn.commit()

    log_action(
        action="DELETE_PLANT_PRODUCTION_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_equipments",
        entity_id=str(equipment_id),
        payload={"owner_id": owner_id, "soft_delete": True},
    )

    return {"ok": True, **_plant_production_equipment_out(row)}


# =========================
# Plant Production (Multi-planta)
# =========================
@app.get("/api/plants/{plant_id}/plant-production/last7days")
def plant_last7_by_plant(plant_id: int, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, coalesce(sum(coalesce(ton,0)),0) as total_ton
            from public.bv_plant_production_rows
            where owner_id=%s
              and plant_id=%s
            group by day
            order by day desc
            limit 7
            """,
            (owner_id, plant_id),
        )
        rows = cur.fetchall() or []

    rows = list(reversed(rows))
    return [{"day": str(r["day"]), "total_ton": float(r["total_ton"] or 0)} for r in rows]


@app.get("/api/plants/{plant_id}/plant-production/{day}")
def get_plant_day_by_plant(
    plant_id: int,
    day: date,
    owner_id: str = Depends(require_owner_id),
):
    ensure_plant_production_over_columns()
    periods = [_period_std_from_h(h) for h in range(24)]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select obs, updated_at, original_rows, coalesce(over_moved_t,0) as over_moved_t
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s and plant_id=%s
            """,
            (owner_id, day, plant_id),
        )
        daily = cur.fetchone()

        cur.execute(
            """
            select period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s and plant_id=%s
            """,
            (owner_id, day, plant_id),
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
    over_moved_t = float((daily.get("over_moved_t") if daily else 0) or 0)

    # Se ainda não existir original_rows no banco, usa rows como fallback.
    # A partir do primeiro salvamento com o front ajustado, original_rows preserva o valor antes do OVER.
    original_rows_saved = daily.get("original_rows") if daily else None
    original_rows = _coerce_rows_like_to_full_rows(original_rows_saved, periods) if original_rows_saved else full_rows

    return {
        "day": str(day),
        "plant_id": plant_id,
        "obs": obs,
        "rows": full_rows,
        "original_rows": original_rows,
        "over_moved_t": over_moved_t,
        "updated_at": updated_at,
    }


@app.put("/api/plants/{plant_id}/plant-production/{day}")
def put_plant_day_by_plant(
    plant_id: int,
    day: date,
    body: PlantDayUpsert,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    ensure_plant_production_over_columns()
    block_retro(day, x_dev_key, authorization)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    adjusted_rows_plain = _plant_rows_to_plain(body.rows)
    original_rows_plain = _plant_rows_to_plain(body.original_rows) if body.original_rows is not None else adjusted_rows_plain
    over_moved_t = float(body.over_moved_t or 0)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plant_production_daily(
              owner_id, day, plant_id, obs, original_rows, over_moved_t, updated_at
            )
            values (%s,%s,%s,%s,%s::jsonb,%s,now())
            on conflict (owner_id, day, plant_id)
            do update set
              obs = excluded.obs,
              original_rows = excluded.original_rows,
              over_moved_t = excluded.over_moved_t,
              updated_at = now()
            """,
            (
                owner_id,
                day,
                plant_id,
                body.obs or "",
                json.dumps(original_rows_plain, ensure_ascii=False),
                over_moved_t,
            ),
        )

        cur.execute(
            """
            delete from public.bv_plant_production_rows
            where owner_id=%s and day=%s and plant_id=%s
            """,
            (owner_id, day, plant_id),
        )

        for r in body.rows or []:
            p = normalize_period(r.period) or r.period
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, plant_id, period, ton, freq)
                values (%s,%s,%s,%s,%s,%s)
                """,
                (owner_id, day, plant_id, p, r.ton, r.freq),
            )

        conn.commit()

    log_action(
        action="UPDATE_PLANT_PRODUCTION",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_daily",
        entity_id=f"{day}::plant::{plant_id}",
        payload={
            "owner_id": owner_id,
            "day": str(day),
            "plant_id": plant_id,
            "over_moved_t": over_moved_t,
        },
    )

    return {
        "ok": True,
        "day": str(day),
        "plant_id": plant_id,
        "over_moved_t": over_moved_t,
    }


# =========================
# Plant Production (Legacy)
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
    # Compatibilidade do endpoint legado: usa Planta 1 como padrão.
    # Isso evita erro quando o banco já está no modelo multi-planta com unique(owner_id, day, plant_id).
    ensure_plant_production_over_columns()
    plant_id = 1
    periods = [_period_std_from_h(h) for h in range(24)]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select obs, updated_at, original_rows, coalesce(over_moved_t,0) as over_moved_t
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s and coalesce(plant_id, 1)=%s
            order by plant_id nulls first
            limit 1
            """,
            (owner_id, day, plant_id),
        )
        daily = cur.fetchone()

        cur.execute(
            """
            select period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s and coalesce(plant_id, 1)=%s
            """,
            (owner_id, day, plant_id),
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
    over_moved_t = float((daily.get("over_moved_t") if daily else 0) or 0)
    original_rows_saved = daily.get("original_rows") if daily else None
    original_rows = _coerce_rows_like_to_full_rows(original_rows_saved, periods) if original_rows_saved else full_rows

    return {
        "day": str(day),
        "plant_id": plant_id,
        "obs": obs,
        "rows": full_rows,
        "original_rows": original_rows,
        "over_moved_t": over_moved_t,
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
    ensure_plant_production_over_columns()
    block_retro(day, x_dev_key, authorization)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None
    plant_id = 1  # endpoint legado = Planta 1

    adjusted_rows_plain = _plant_rows_to_plain(body.rows)
    original_rows_plain = _plant_rows_to_plain(body.original_rows) if body.original_rows is not None else adjusted_rows_plain
    over_moved_t = float(body.over_moved_t or 0)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plant_production_daily(
              owner_id, day, plant_id, obs, original_rows, over_moved_t, updated_at
            )
            values (%s,%s,%s,%s,%s::jsonb,%s,now())
            on conflict (owner_id, day, plant_id)
            do update set
              obs = excluded.obs,
              original_rows = excluded.original_rows,
              over_moved_t = excluded.over_moved_t,
              updated_at = now()
            """,
            (
                owner_id,
                day,
                plant_id,
                body.obs or "",
                json.dumps(original_rows_plain, ensure_ascii=False),
                over_moved_t,
            ),
        )

        cur.execute(
            """
            delete from public.bv_plant_production_rows
            where owner_id=%s and day=%s and coalesce(plant_id, 1)=%s
            """,
            (owner_id, day, plant_id),
        )

        for r in body.rows or []:
            p = normalize_period(r.period) or r.period
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, plant_id, period, ton, freq)
                values (%s,%s,%s,%s,%s,%s)
                """,
                (owner_id, day, plant_id, p, r.ton, r.freq),
            )

        conn.commit()

    log_action(
        action="UPDATE_PLANT_PRODUCTION",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_daily",
        entity_id=f"{day}::plant::{plant_id}",
        payload={
            "owner_id": owner_id,
            "day": str(day),
            "plant_id": plant_id,
            "over_moved_t": over_moved_t,
        },
    )

    return {
        "ok": True,
        "day": str(day),
        "plant_id": plant_id,
        "over_moved_t": over_moved_t,
    }


# Stops (Multi-planta)
# =========================
@app.get("/api/plants/{plant_id}/stops")
def list_stops_by_plant(
    plant_id: int,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select *
            from public.bv_stops
            where owner_id=%s and day=%s and plant_id=%s
            order by created_at desc
            """,
            (owner_id, day, plant_id),
        )
        rows = cur.fetchall() or []
    return rows


@app.post("/api/plants/{plant_id}/stops")
def create_stop_by_plant(
    plant_id: int,
    body: StopIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    block_retro(body.day, x_dev_key, authorization)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_stops(
              owner_id, plant_id, day, turno,
              data_inicio, hora_inicio, data_fim, hora_fim,
              equipamento, tipo_parada, atividade, descricao, tempo_parada_h
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                plant_id,
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
        payload={"owner_id": owner_id, "plant_id": plant_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id, "plant_id": plant_id}


@app.delete("/api/plants/{plant_id}/stops/{stop_id}")
def delete_stop_by_plant(
    plant_id: int,
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
            where id=%s and owner_id=%s and plant_id=%s
            """,
            (stop_id, owner_id, plant_id),
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
        payload={"owner_id": owner_id, "plant_id": plant_id},
    )

    return {"ok": True}


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
    block_retro(body.day, x_dev_key, authorization)

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
# Horimetros (Multi-planta)
# =========================
@app.post("/api/plants/{plant_id}/horimetros")
def create_horimetro_by_plant(
    plant_id: int,
    body: HorimetroIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    # ✅ Horímetros: NÃO trava retroativo (dia anterior, etc.)
    # block_retro(body.day, x_dev_key, authorization)

    if body.horimetro_fim < body.horimetro_ini:
        raise HTTPException(status_code=400, detail="horimetro_fim deve ser >= horimetro_ini")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_horimetros(
              owner_id, plant_id, day, turno, equipamento, horimetro_ini, horimetro_fim, obs
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                plant_id,
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
        payload={"owner_id": owner_id, "plant_id": plant_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id, "plant_id": plant_id}


@app.get("/api/plants/{plant_id}/horimetros")
def list_horimetros_by_plant(
    plant_id: int,
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
                where owner_id=%s and plant_id=%s and day=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, day, equipamento, limit),
            )
        elif day:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and plant_id=%s and day=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, day, limit),
            )
        elif equipamento:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and plant_id=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, equipamento, limit),
            )
        else:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and plant_id=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, limit),
            )
        rows = cur.fetchall() or []
    return rows


@app.get("/api/plants/{plant_id}/horimetros/last-by-eq")
def last_by_eq_by_plant(plant_id: int, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select distinct on (equipamento)
              equipamento, horimetro_ini, horimetro_fim, day, turno, created_at
            from public.bv_horimetros
            where owner_id=%s and plant_id=%s
            order by equipamento, created_at desc
            """,
            (owner_id, plant_id),
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


@app.delete("/api/plants/{plant_id}/horimetros/{horimetro_id}")
def delete_horimetro_by_plant(
    plant_id: int,
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
            where id=%s and owner_id=%s and plant_id=%s
            """,
            (horimetro_id, owner_id, plant_id),
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
        payload={"owner_id": owner_id, "plant_id": plant_id},
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
    # block_retro(body.day, x_dev_key, authorization)

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
    """
    Garante metas por planta.

    Modelo novo:
      - owner_id + plant_id + day

    Compatibilidade:
      - se a tabela antiga já existir com PRIMARY KEY(owner_id, day),
        a migração remove essa PK antiga e cria uma chave única por planta.
      - registros antigos recebem plant_id=1, preservando a Planta 01.
    """
    ddl = """
    CREATE TABLE IF NOT EXISTS public.bv_goals_daily(
      owner_id TEXT NOT NULL,
      plant_id INTEGER NOT NULL DEFAULT 1,
      day DATE NOT NULL,
      meta_ton NUMERIC(18,2) NOT NULL DEFAULT 0,
      discount_hours NUMERIC(10,2) NOT NULL DEFAULT 2,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE public.bv_goals_daily
      ADD COLUMN IF NOT EXISTS plant_id INTEGER;

    UPDATE public.bv_goals_daily
       SET plant_id = 1
     WHERE plant_id IS NULL;

    ALTER TABLE public.bv_goals_daily
      ALTER COLUMN plant_id SET DEFAULT 1;

    ALTER TABLE public.bv_goals_daily
      ALTER COLUMN plant_id SET NOT NULL;

    DO $$
    DECLARE
      pk_name text;
      pk_cols text;
    BEGIN
      SELECT c.conname,
             string_agg(a.attname, ',' ORDER BY u.idx) AS cols
        INTO pk_name, pk_cols
        FROM pg_constraint c
        JOIN unnest(c.conkey) WITH ORDINALITY AS u(attnum, idx) ON true
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
       WHERE c.conrelid = 'public.bv_goals_daily'::regclass
         AND c.contype = 'p'
       GROUP BY c.conname;

      IF pk_name IS NOT NULL AND pk_cols <> 'owner_id,plant_id,day' THEN
        EXECUTE format('ALTER TABLE public.bv_goals_daily DROP CONSTRAINT %I', pk_name);
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_bv_goals_daily_owner_plant_day
      ON public.bv_goals_daily(owner_id, plant_id, day);

    CREATE INDEX IF NOT EXISTS idx_bv_goals_daily_owner_day
      ON public.bv_goals_daily(owner_id, day);
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


def _validate_plant_id(plant_id: int) -> int:
    try:
        pid = int(plant_id)
    except Exception:
        raise HTTPException(status_code=400, detail="plant_id inválido")
    if pid <= 0:
        raise HTTPException(status_code=400, detail="plant_id inválido")
    return pid


def _goal_day_default(day: date, plant_id: int = 1) -> GoalDayOut:
    return GoalDayOut(day=day, meta_ton=0.0, discount_hours=2.0)


# -------- Metas por planta --------
@app.get("/api/plants/{plant_id}/goals/day/{day}", response_model=GoalDayOut)
def goals_get_day_by_plant(plant_id: int, day: date, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT meta_ton, discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND plant_id=%s AND day=%s""",
                (owner_id, plant_id, day),
            )
            row = cur.fetchone()
    if not row:
        return _goal_day_default(day, plant_id)
    return GoalDayOut(day=day, meta_ton=float(_col(row,'meta_ton',0) or 0), discount_hours=float(_col(row,'discount_hours',1) or 0))


@app.put("/api/plants/{plant_id}/goals/day/{day}", response_model=GoalDayOut)
def goals_put_day_by_plant(plant_id: int, day: date, body: GoalDayIn, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO public.bv_goals_daily(owner_id, plant_id, day, meta_ton, discount_hours)
                     VALUES(%s,%s,%s,%s,%s)
                     ON CONFLICT (owner_id, plant_id, day)
                     DO UPDATE SET meta_ton=EXCLUDED.meta_ton,
                                   discount_hours=EXCLUDED.discount_hours,
                                   updated_at=NOW()""",
                (owner_id, plant_id, day, body.meta_ton, body.discount_hours),
            )
        conn.commit()
    return GoalDayOut(day=day, meta_ton=float(body.meta_ton), discount_hours=float(body.discount_hours))


@app.get("/api/plants/{plant_id}/goals/month/{month}", response_model=GoalMonthOut)
def goals_get_month_by_plant(plant_id: int, month: str, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT day, meta_ton, discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND plant_id=%s AND day >= %s AND day < %s
                     ORDER BY day ASC""",
                (owner_id, plant_id, a, b),
            )
            rows = cur.fetchall() or []

    days = [GoalDayOut(day=_col(r,'day',0), meta_ton=float(_col(r,'meta_ton',1) or 0), discount_hours=float(_col(r,'discount_hours',2) or 0)) for r in rows]
    total_month = float(sum(d.meta_ton for d in days))
    return GoalMonthOut(month=month, total_month_ton=total_month, days=days)


@app.put("/api/plants/{plant_id}/goals/month/{month}", response_model=GoalMonthOut)
def goals_put_month_by_plant(plant_id: int, month: str, body: GoalMonthIn, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    for d in body.days:
        if d.day < a or d.day >= b:
            raise HTTPException(status_code=400, detail=f"Dia {d.day} fora do mês {month}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            for d in body.days:
                cur.execute(
                    """INSERT INTO public.bv_goals_daily(owner_id, plant_id, day, meta_ton, discount_hours)
                         VALUES(%s,%s,%s,%s,%s)
                         ON CONFLICT (owner_id, plant_id, day)
                         DO UPDATE SET meta_ton=EXCLUDED.meta_ton,
                                       discount_hours=EXCLUDED.discount_hours,
                                       updated_at=NOW()""",
                    (owner_id, plant_id, d.day, d.meta_ton, d.discount_hours),
                )
        conn.commit()

    return goals_get_month_by_plant(plant_id, month, owner_id)


# -------- Metas consolidadas / todas as plantas --------
@app.get("/api/aggregate/goals/month/{month}", response_model=GoalMonthOut)
def goals_get_month_aggregate(month: str, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT day,
                          COALESCE(SUM(COALESCE(meta_ton,0)),0) AS meta_ton,
                          COALESCE(AVG(COALESCE(discount_hours,2)),2) AS discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND day >= %s AND day < %s
                     GROUP BY day
                     ORDER BY day ASC""",
                (owner_id, a, b),
            )
            rows = cur.fetchall() or []

    days = [GoalDayOut(day=_col(r,'day',0), meta_ton=float(_col(r,'meta_ton',1) or 0), discount_hours=float(_col(r,'discount_hours',2) or 0)) for r in rows]
    total_month = float(sum(d.meta_ton for d in days))
    return GoalMonthOut(month=month, total_month_ton=total_month, days=days)




@app.get("/api/aggregate/goals/day/{day}", response_model=GoalDayOut)
def goals_get_day_aggregate(day: date, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT COALESCE(SUM(COALESCE(meta_ton,0)),0) AS meta_ton,
                          COALESCE(AVG(COALESCE(discount_hours,2)),2) AS discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND day=%s""",
                (owner_id, day),
            )
            row = cur.fetchone()
    if not row:
        return GoalDayOut(day=day, meta_ton=0.0, discount_hours=2.0)
    return GoalDayOut(
        day=day,
        meta_ton=float(_col(row, 'meta_ton', 0) or 0),
        discount_hours=float(_col(row, 'discount_hours', 1) or 0),
    )

# -------- Endpoints legados: mantêm Planta 01 como padrão --------
@app.get("/api/goals/day/{day}", response_model=GoalDayOut)
def goals_get_day(day: date, owner_id: str = Depends(require_owner_id)):
    return goals_get_day_by_plant(1, day, owner_id)


@app.put("/api/goals/day/{day}", response_model=GoalDayOut)
def goals_put_day(day: date, body: GoalDayIn, owner_id: str = Depends(require_owner_id)):
    return goals_put_day_by_plant(1, day, body, owner_id)


@app.get("/api/goals/month/{month}", response_model=GoalMonthOut)
def goals_get_month(month: str, owner_id: str = Depends(require_owner_id)):
    return goals_get_month_by_plant(1, month, owner_id)


@app.put("/api/goals/month/{month}", response_model=GoalMonthOut)
def goals_put_month(month: str, body: GoalMonthIn, owner_id: str = Depends(require_owner_id)):
    return goals_put_month_by_plant(1, month, body, owner_id)


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
            select day,
                   coalesce(sum(coalesce(meta_ton,0)),0) as meta_ton,
                   coalesce(avg(coalesce(discount_hours,2)),2) as discount_hours
            from public.bv_goals_daily
            where owner_id=%s and day >= %s and day < %s
            group by day
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



@app.get("/api/plants/{plant_id}/stats/month/{month}")
def stats_month_by_plant(
    plant_id: int,
    month: str,
    owner_id: str = Depends(require_owner_id)
):
    """
    Estatísticas mensais filtradas por planta.
    """
    _ensure_goals_table()

    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    # -------- Goals (consolidada por owner/dia/planta) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, meta_ton, discount_hours
            from public.bv_goals_daily
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            order by day asc
            """,
            (owner_id, plant_id, a, b),
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

    # -------- Produção por planta --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            """,
            (owner_id, plant_id, a, b),
        )
        prod_rows = cur.fetchall() or []

    day_prod: Dict[str, Dict[str, float]] = {}
    produced_month_ton = 0.0
    freq_sum = 0.0
    freq_cnt = 0
    prod_hours_cnt = 0
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
                if fv > 0:
                    day_prod[ds]["freq_sum"] += fv
                    day_prod[ds]["freq_cnt"] += 1
                    freq_sum += fv
                    freq_cnt += 1
            except Exception:
                pass

    produced_days = sum(1 for ds, v in day_prod.items() if (v.get("produced_ton", 0) or 0) > 0)

    # -------- Paradas por planta --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, equipamento, tipo_parada, descricao, hora_inicio, tempo_parada_h
            from public.bv_stops
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            """,
            (owner_id, plant_id, a, b),
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

        try:
            hh = int(hora_ini.split(":")[0]) if hora_ini else None
        except Exception:
            hh = None
        if hh is not None and 0 <= hh <= 23:
            nxt = (hh + 1) % 24
            period = f"{hh:02d}-{nxt:02d}"
            stops_count_by_period[period] = stops_count_by_period.get(period, 0) + 1

        if "manut" in tp.lower() and h >= 0.5:
            maint_days_set.add(ds)

    maintenance_stop_days = len(maint_days_set)

    # -------- Horímetros por planta --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select equipamento, horimetro_ini, horimetro_fim
            from public.bv_horimetros
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            """,
            (owner_id, plant_id, a, b),
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

    attainment_pct = (produced_month_ton / meta_month_ton * 100.0) if meta_month_ton > 0 else (100.0 if produced_month_ton > 0 else 0.0)
    delta_ton = produced_month_ton - meta_month_ton
    delta_pct = (attainment_pct - 100.0) if meta_month_ton > 0 else 0.0
    freq_avg_pct = (freq_sum / freq_cnt) if freq_cnt > 0 else 0.0
    avg_ton_per_hour = (produced_month_ton / prod_hours_cnt) if prod_hours_cnt > 0 else 0.0

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

    candidates = [d for d in daily_series if (d["meta_ton"] > 0 or d["produced_ton"] > 0)]
    best_day = None
    worst_day = None
    if candidates:
        best_day = max(candidates, key=lambda x: x["attainment_pct"])
        worst_day = min(candidates, key=lambda x: x["attainment_pct"])

    by_type_list = [{"type": k, "hours": round(v, 2)} for k, v in sorted(stops_by_type.items(), key=lambda kv: kv[1], reverse=True)]
    by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(stops_by_eq.items(), key=lambda kv: kv[1], reverse=True)]
    hours_by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(hours_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        "month": month,
        "plant_id": plant_id,
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
#   GET /api/stops-launch?day=YYYY-MM-DD                (legado = planta 1 / compatibilidade)
#   PUT /api/stops-launch?day=YYYY-MM-DD                (legado = planta 1 / compatibilidade)
#   GET /api/plants/{plant_id}/stops-launch?day=...     (multi-planta)
#   PUT /api/plants/{plant_id}/stops-launch?day=...     (multi-planta)
#
# Modelo revisado:
#   - permite múltiplas paradas no mesmo period (ex.: 07-08 com linhas A/B/C);
#   - usa hora_inicial/hora_final para calcular simultaneidade dentro da mesma planta;
#   - justificativa_baixa_producao é campo separado e pode ser bloqueado/liberado pelo front
#     conforme detecção automática da baixa produção horária.
# =========================

def ensure_stops_launch_tables():
    """Garante/migra as tabelas de Paradas Minutos no schema bv_launch."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("CREATE SCHEMA IF NOT EXISTS bv_launch;")

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS bv_launch.stops_day (
                  id BIGSERIAL PRIMARY KEY,
                  owner_id TEXT NOT NULL,
                  day DATE NOT NULL,
                  plant_id INTEGER NOT NULL DEFAULT 1,
                  obs TEXT NULL,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute("ALTER TABLE bv_launch.stops_day ADD COLUMN IF NOT EXISTS plant_id INTEGER;")
            cur.execute("UPDATE bv_launch.stops_day SET plant_id = 1 WHERE plant_id IS NULL;")
            cur.execute("ALTER TABLE bv_launch.stops_day ALTER COLUMN plant_id SET DEFAULT 1;")
            cur.execute("ALTER TABLE bv_launch.stops_day ALTER COLUMN plant_id SET NOT NULL;")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_stops_day_owner_day_plant ON bv_launch.stops_day(owner_id, day, plant_id);")

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS bv_launch.stops_rows (
                  id BIGSERIAL PRIMARY KEY,
                  day_id BIGINT NOT NULL REFERENCES bv_launch.stops_day(id) ON DELETE CASCADE,
                  period TEXT NOT NULL,
                  equipment TEXT NULL,
                  stop_type TEXT NULL,
                  description TEXT NULL,
                  minutes INTEGER NOT NULL DEFAULT 0,
                  hora_inicial TIME NULL,
                  hora_final TIME NULL,
                  justificativa_baixa_producao TEXT NULL,
                  ordem INTEGER NOT NULL DEFAULT 1,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute("ALTER TABLE bv_launch.stops_rows ADD COLUMN IF NOT EXISTS hora_inicial TIME;")
            cur.execute("ALTER TABLE bv_launch.stops_rows ADD COLUMN IF NOT EXISTS hora_final TIME;")
            cur.execute("ALTER TABLE bv_launch.stops_rows ADD COLUMN IF NOT EXISTS justificativa_baixa_producao TEXT;")
            cur.execute("ALTER TABLE bv_launch.stops_rows ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 1;")
            cur.execute("UPDATE bv_launch.stops_rows SET ordem = 1 WHERE ordem IS NULL;")
            cur.execute("ALTER TABLE bv_launch.stops_rows ALTER COLUMN ordem SET DEFAULT 1;")
            cur.execute("ALTER TABLE bv_launch.stops_rows ALTER COLUMN ordem SET NOT NULL;")

            # A constraint antiga 'hora_final > hora_inicial' quebra o período 23-00.
            # A validação completa fica no backend/front, pois precisa considerar virada de dia.
            cur.execute("ALTER TABLE bv_launch.stops_rows DROP CONSTRAINT IF EXISTS chk_stops_rows_horas_validas;")
            cur.execute("ALTER TABLE bv_launch.stops_rows DROP CONSTRAINT IF EXISTS chk_stops_rows_horas_preenchidas_juntas;")
            cur.execute(
                """
                ALTER TABLE bv_launch.stops_rows
                ADD CONSTRAINT chk_stops_rows_horas_preenchidas_juntas
                CHECK (
                    (hora_inicial IS NULL AND hora_final IS NULL)
                    OR
                    (hora_inicial IS NOT NULL AND hora_final IS NOT NULL)
                );
                """
            )

            cur.execute("CREATE INDEX IF NOT EXISTS idx_stops_rows_day_period_ordem ON bv_launch.stops_rows(day_id, period, ordem);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_stops_rows_day_period_horas ON bv_launch.stops_rows(day_id, period, hora_inicial, hora_final);")
            conn.commit()
    except Exception:
        # Não derruba a API se a migração falhar; as rotas continuarão tentando operar.
        return


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


def _normalize_launch_time(v: Any) -> Optional[str]:
    """Normaliza HH:MM/HH:MM:SS para HH:MM; retorna None para vazio."""
    if v is None:
        return None
    s = str(v).strip()
    if not s or s in {"-", "—", "--:--", "__:__"}:
        return None
    m = re.fullmatch(r"(\d{1,2}):(\d{2})(?::\d{2})?", s)
    if not m:
        raise HTTPException(status_code=400, detail=f"Hora inválida: {s}. Use HH:MM.")
    h = int(m.group(1))
    mm = int(m.group(2))
    if h < 0 or h > 23 or mm < 0 or mm > 59:
        raise HTTPException(status_code=400, detail=f"Hora inválida: {s}. Use HH:MM.")
    return f"{h:02d}:{mm:02d}"


def _fmt_time(v: Any) -> str:
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%H:%M")
    s = str(v).strip()
    if not s:
        return ""
    return s[:5]


def _period_start_hour_launch(period: str) -> Optional[int]:
    p = normalize_period_launch(period)
    if not p:
        return None
    try:
        return int(p.split("-", 1)[0])
    except Exception:
        return None


def _time_to_minutes_for_period(period: str, hhmm: str) -> Optional[int]:
    """Converte uma hora HH:MM para minuto absoluto dentro da faixa horária, tratando 23-00."""
    t = _normalize_launch_time(hhmm)
    if not t:
        return None
    h, m = map(int, t.split(":"))
    total = h * 60 + m
    start_h = _period_start_hour_launch(period)
    if start_h is None:
        return total
    start_total = start_h * 60
    # Se a faixa inicia no fim do dia e a hora está após meia-noite, joga para o dia seguinte.
    if total < start_total:
        total += 24 * 60
    return total


def _calc_period_overlap_summary(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    """Calcula minutos brutos, coincidência e total líquido por união dos intervalos."""
    bruto = 0
    intervals: List[tuple[int, int]] = []

    for r in rows:
        minutes = _clamp_0_60(int(r.get("minutos") or 0))
        bruto += minutes
        period = str(r.get("period") or "")
        hi = r.get("hora_inicial")
        hf = r.get("hora_final")
        if hi and hf:
            a = _time_to_minutes_for_period(period, str(hi))
            b = _time_to_minutes_for_period(period, str(hf))
            if a is not None and b is not None:
                if b <= a:
                    b += 24 * 60
                intervals.append((a, b))

    if not intervals:
        liquido = min(60, bruto)
        return {"minutos_brutos": bruto, "coincidencia": max(0, bruto - liquido), "minutos_liquidos": liquido}

    intervals.sort()
    union = 0
    cur_a, cur_b = intervals[0]
    for a, b in intervals[1:]:
        if a <= cur_b:
            cur_b = max(cur_b, b)
        else:
            union += max(0, cur_b - cur_a)
            cur_a, cur_b = a, b
    union += max(0, cur_b - cur_a)
    liquido = min(60, union)
    coincidencia = max(0, bruto - liquido)
    return {"minutos_brutos": bruto, "coincidencia": coincidencia, "minutos_liquidos": liquido}


def _build_stops_launch_summaries(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    by_period: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        by_period.setdefault(str(r.get("period") or ""), []).append(r)
    return {period: _calc_period_overlap_summary(items) for period, items in by_period.items() if period}


def _row_to_stops_launch_out(r: Any) -> Dict[str, Any]:
    if isinstance(r, dict):
        row_id = r.get("id")
        period = r.get("period")
        equipment = r.get("equipment")
        stop_type = r.get("stop_type")
        description = r.get("description")
        minutes = r.get("minutes")
        hora_inicial = r.get("hora_inicial")
        hora_final = r.get("hora_final")
        justificativa = r.get("justificativa_baixa_producao")
        ordem = r.get("ordem")
    else:
        row_id, period, equipment, stop_type, description, minutes, hora_inicial, hora_final, justificativa, ordem = r

    return {
        "id": int(row_id) if row_id is not None else None,
        "period": period,
        "ordem": int(ordem or 1),
        "equipamento": equipment or "",
        "tipo_parada": stop_type or "",
        "descricao": description or "",
        "minutos": int(minutes or 0),
        "hora_inicial": _fmt_time(hora_inicial),
        "hora_final": _fmt_time(hora_final),
        "justificativa_baixa_producao": justificativa or "",
    }


def _normalize_stops_launch_rows(rows: List[StopLaunchRowIn]) -> List[tuple]:
    """Normaliza payload para INSERT. Gera ordem sequencial por period quando não vier do front."""
    normalized_rows = []
    counters: Dict[str, int] = {}

    for r in rows or []:
        p = normalize_period_launch(str(r.period).strip())
        if not p:
            continue

        counters[p] = counters.get(p, 0) + 1
        ordem = int(r.ordem or counters[p])
        if ordem <= 0:
            ordem = counters[p]

        hi = _normalize_launch_time(r.hora_inicial)
        hf = _normalize_launch_time(r.hora_final)

        normalized_rows.append(
            (
                p,
                ordem,
                (r.equipamento or "").strip() or None,
                (r.tipo_parada or "").strip() or None,
                (r.descricao or "").strip() or None,
                _clamp_0_60(int(r.minutos or 0)),
                hi,
                hf,
                (r.justificativa_baixa_producao or "").strip() or None,
            )
        )

    return normalized_rows


def _get_stops_launch_payload(*, owner_id: str, day: date, plant_id: Optional[int] = None) -> Dict[str, Any]:
    ensure_stops_launch_tables()
    where_plant = "AND plant_id = %s" if plant_id is not None else ""
    args: List[Any] = [owner_id, day]
    if plant_id is not None:
        args.append(int(plant_id))

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, obs, plant_id
                FROM bv_launch.stops_day
                WHERE owner_id = %s AND day = %s {where_plant}
                ORDER BY plant_id ASC
                LIMIT 1
                """,
                tuple(args),
            )
            row = cur.fetchone()
            if not row:
                base = {"day": day.isoformat(), "obs": "", "rows": [], "summaries": {}}
                if plant_id is not None:
                    base["plant_id"] = plant_id
                return base

            day_id = row["id"] if isinstance(row, dict) else row[0]
            obs = (row.get("obs") if isinstance(row, dict) else row[1]) or ""
            db_plant_id = row.get("plant_id") if isinstance(row, dict) else row[2]

            cur.execute(
                """
                SELECT id, period, equipment, stop_type, description, minutes,
                       hora_inicial, hora_final, justificativa_baixa_producao, ordem
                FROM bv_launch.stops_rows
                WHERE day_id = %s
                ORDER BY period ASC, ordem ASC, id ASC
                """,
                (day_id,),
            )
            fetched = cur.fetchall() or []

    rows = [_row_to_stops_launch_out(r) for r in fetched]
    out = {"day": day.isoformat(), "obs": obs, "rows": rows, "summaries": _build_stops_launch_summaries(rows)}
    if plant_id is not None:
        out["plant_id"] = plant_id
    else:
        out["plant_id"] = int(db_plant_id or 1)
    return out


def _put_stops_launch_payload(*, owner_id: str, day: date, payload: StopLaunchDayUpsert, plant_id: int) -> Dict[str, Any]:
    ensure_stops_launch_tables()
    if payload.day != day:
        payload = StopLaunchDayUpsert(day=day, obs=payload.obs, rows=payload.rows)

    normalized_rows = _normalize_stops_launch_rows(payload.rows)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO bv_launch.stops_day (owner_id, day, plant_id, obs)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (owner_id, day, plant_id)
                DO UPDATE SET obs = EXCLUDED.obs, updated_at = now()
                RETURNING id
                """,
                (owner_id, day, int(plant_id), payload.obs),
            )
            row = cur.fetchone()
            day_id = row["id"] if isinstance(row, dict) else row[0]

            # Substitui todas as linhas da planta/dia. Esse modelo combina com o front salvando a tela inteira.
            cur.execute("DELETE FROM bv_launch.stops_rows WHERE day_id = %s", (day_id,))

            if normalized_rows:
                cur.executemany(
                    """
                    INSERT INTO bv_launch.stops_rows
                    (day_id, period, ordem, equipment, stop_type, description, minutes,
                     hora_inicial, hora_final, justificativa_baixa_producao)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::time, %s::time, %s)
                    """,
                    [
                        (day_id, period, ordem, equipment, stop_type, description, minutes, hi, hf, justificativa)
                        for (period, ordem, equipment, stop_type, description, minutes, hi, hf, justificativa) in normalized_rows
                    ],
                )

        conn.commit()

    # Monta summaries com o mesmo payload enviado, sem precisar reler do banco.
    rows_out = []
    for period, ordem, equipment, stop_type, description, minutes, hi, hf, justificativa in normalized_rows:
        rows_out.append(
            {
                "id": None,
                "period": period,
                "ordem": ordem,
                "equipamento": equipment or "",
                "tipo_parada": stop_type or "",
                "descricao": description or "",
                "minutos": int(minutes or 0),
                "hora_inicial": hi or "",
                "hora_final": hf or "",
                "justificativa_baixa_producao": justificativa or "",
            }
        )

    return {
        "ok": True,
        "day": day.isoformat(),
        "plant_id": int(plant_id),
        "rows_saved": len(normalized_rows),
        "summaries": _build_stops_launch_summaries(rows_out),
    }


@app.get("/api/plants/{plant_id}/stops-launch")
def get_stops_launch_by_plant(
    plant_id: int,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    return _get_stops_launch_payload(owner_id=owner_id, day=day, plant_id=plant_id)


@app.put("/api/plants/{plant_id}/stops-launch")
def put_stops_launch_by_plant(
    plant_id: int,
    payload: StopLaunchDayUpsert,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    return _put_stops_launch_payload(owner_id=owner_id, day=day, payload=payload, plant_id=plant_id)


@app.get("/api/stops-launch")
def get_stops_launch(
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    # Endpoint legado: usa a primeira/planta padrão para compatibilidade.
    return _get_stops_launch_payload(owner_id=owner_id, day=day, plant_id=None)


@app.put("/api/stops-launch")
def put_stops_launch(
    payload: StopLaunchDayUpsert,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    # Endpoint legado: salva como Planta 1.
    return _put_stops_launch_payload(owner_id=owner_id, day=day, payload=payload, plant_id=1)


# =========================
# Aggregate / Todas as plantas
# =========================
@app.get("/api/aggregate/plant-production/{day}")
def get_aggregate_plant_day(
    day: date,
    owner_id: str = Depends(require_owner_id),
):
    """
    Consolida a produção de TODAS as plantas no dia.
    Retorna no mesmo formato da rota de produção diária, somando ton/freq por período.
    """
    periods = [_period_std_from_h(h) for h in range(24)]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select period,
                   coalesce(sum(coalesce(ton,0)),0) as ton_sum,
                   avg(nullif(freq, 0)) as freq_avg
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s
            group by period
            """,
            (owner_id, day),
        )
        db_rows = cur.fetchall() or []

        cur.execute(
            """
            select string_agg(coalesce(obs,''), ' | ' order by plant_id) as obs_agg,
                   max(updated_at) as updated_at
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s
            """,
            (owner_id, day),
        )
        daily = cur.fetchone()

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
                "ton": float(r["ton_sum"]) if r and r["ton_sum"] is not None else None,
                "freq": float(r["freq_avg"]) if r and r["freq_avg"] is not None else None,
            }
        )

    obs = (daily["obs_agg"] if daily else "") or ""
    updated_at = daily["updated_at"].isoformat() if (daily and daily.get("updated_at")) else None

    return {
        "day": str(day),
        "scope": "all",
        "obs": obs,
        "rows": full_rows,
        "updated_at": updated_at,
    }


@app.get("/api/aggregate/plant-production/last7days")
def get_aggregate_last7days(owner_id: str = Depends(require_owner_id)):
    """
    Consolida os últimos 7 dias somando a produção de todas as plantas.
    """
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


@app.get("/api/aggregate/stops-launch")
def get_aggregate_stops_launch(
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    """
    Consolida lançamentos de paradas (bv_launch) de TODAS as plantas no dia.

    Retorna linhas detalhadas para não perder múltiplas paradas no mesmo horário.
    O cálculo de simultaneidade deve ser analisado por planta/period, por isso também
    retorna summaries_by_plant_period.
    """
    ensure_stops_launch_tables()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select sd.id, sd.obs, sd.plant_id
            from bv_launch.stops_day sd
            where sd.owner_id=%s and sd.day=%s
            order by sd.plant_id asc
            """,
            (owner_id, day),
        )
        day_rows = cur.fetchall() or []

        if not day_rows:
            return {"day": day.isoformat(), "scope": "all", "obs": "", "rows": [], "summaries_by_plant_period": {}}

        day_ids = [r["id"] for r in day_rows]
        plant_by_day_id = {int(r["id"]): int(r.get("plant_id") or 1) for r in day_rows}
        obs_list = [str(r.get("obs") or "").strip() for r in day_rows if str(r.get("obs") or "").strip()]

        cur.execute(
            """
            select day_id, id, period, equipment, stop_type, description, minutes,
                   hora_inicial, hora_final, justificativa_baixa_producao, ordem
            from bv_launch.stops_rows
            where day_id = any(%s)
            order by day_id, period, ordem, id
            """,
            (day_ids,),
        )
        rows = cur.fetchall() or []

    out = []
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        item = _row_to_stops_launch_out(r)
        day_id = int(r["day_id"])
        plant_id = plant_by_day_id.get(day_id, 1)
        item["plant_id"] = plant_id
        out.append(item)
        grouped.setdefault(f"plant_{plant_id}::{item['period']}", []).append(item)

    summaries = {key: _calc_period_overlap_summary(items) for key, items in grouped.items()}

    return {
        "day": day.isoformat(),
        "scope": "all",
        "obs": " | ".join(obs_list),
        "rows": out,
        "summaries_by_plant_period": summaries,
    }


@app.get("/api/aggregate/stats/month/{month}")
def stats_month_aggregate(
    month: str,
    owner_id: str = Depends(require_owner_id)
):
    """
    Estatísticas consolidadas de TODAS as plantas.
    Mantém o formato do endpoint de stats por planta.
    """
    _ensure_goals_table()

    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    # -------- Goals (por planta) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day,
                   coalesce(sum(coalesce(meta_ton,0)),0) as meta_ton,
                   coalesce(avg(coalesce(discount_hours,2)),2) as discount_hours
            from public.bv_goals_daily
            where owner_id=%s and day >= %s and day < %s
            group by day
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

    # -------- Produção agregada --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, period,
                   coalesce(sum(coalesce(ton,0)),0) as ton_sum,
                   avg(nullif(freq,0)) as freq_avg
            from public.bv_plant_production_rows
            where owner_id=%s and day >= %s and day < %s
            group by day, period
            """,
            (owner_id, a, b),
        )
        prod_rows = cur.fetchall() or []

    day_prod: Dict[str, Dict[str, float]] = {}
    produced_month_ton = 0.0
    freq_sum = 0.0
    freq_cnt = 0
    prod_hours_cnt = 0
    t1_month = 0.0
    t2_month = 0.0

    for r in prod_rows:
        d = _col(r, "day", 0)
        ds = str(d)
        ton = float(_col(r, "ton_sum", 2) or 0)
        freq = _col(r, "freq_avg", 3)
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
                if fv > 0:
                    day_prod[ds]["freq_sum"] += fv
                    day_prod[ds]["freq_cnt"] += 1
                    freq_sum += fv
                    freq_cnt += 1
            except Exception:
                pass

    produced_days = sum(1 for ds, v in day_prod.items() if (v.get("produced_ton", 0) or 0) > 0)

    # -------- Paradas agregadas --------
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

        try:
            hh = int(hora_ini.split(":")[0]) if hora_ini else None
        except Exception:
            hh = None
        if hh is not None and 0 <= hh <= 23:
            nxt = (hh + 1) % 24
            period = f"{hh:02d}-{nxt:02d}"
            stops_count_by_period[period] = stops_count_by_period.get(period, 0) + 1

        if "manut" in tp.lower() and h >= 0.5:
            maint_days_set.add(ds)

    maintenance_stop_days = len(maint_days_set)

    # -------- Horímetros agregados --------
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

    attainment_pct = (produced_month_ton / meta_month_ton * 100.0) if meta_month_ton > 0 else (100.0 if produced_month_ton > 0 else 0.0)
    delta_ton = produced_month_ton - meta_month_ton
    delta_pct = (attainment_pct - 100.0) if meta_month_ton > 0 else 0.0

    freq_avg_pct = (freq_sum / freq_cnt) if freq_cnt > 0 else 0.0
    avg_ton_per_hour = (produced_month_ton / prod_hours_cnt) if prod_hours_cnt > 0 else 0.0

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

    candidates = [d for d in daily_series if (d["meta_ton"] > 0 or d["produced_ton"] > 0)]
    best_day = None
    worst_day = None
    if candidates:
        best_day = max(candidates, key=lambda x: x["attainment_pct"])
        worst_day = min(candidates, key=lambda x: x["attainment_pct"])

    by_type_list = [{"type": k, "hours": round(v, 2)} for k, v in sorted(stops_by_type.items(), key=lambda kv: kv[1], reverse=True)]
    by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(stops_by_eq.items(), key=lambda kv: kv[1], reverse=True)]
    hours_by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(hours_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        "month": month,
        "scope": "all",
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
# Avisos Supervisor automáticos
# Usa SOMENTE bv_notices + bv_notice_reads neste main.py.
# A página do front apenas exibe/confirma; o backend cria os lembretes.
# =========================

def _require_user_payload(authorization: Optional[str]) -> Dict[str, Any]:
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")
    payload = decode_token(tok)
    if not payload.get("uid"):
        raise HTTPException(status_code=401, detail="Token inválido")
    return payload


def _notice_value(r: Any, key: str, default=None):
    try:
        if isinstance(r, dict):
            return r.get(key, default)
    except Exception:
        pass
    return default


def _safe_notice_row_to_out(r: Dict[str, Any]) -> Dict[str, Any]:
    created_at = _notice_value(r, "created_at")
    read_at = _notice_value(r, "read_at")
    notice_type = _notice_value(r, "notice_type") or "sistema"
    return {
        "id": str(_notice_value(r, "id", "")),
        "type": notice_type,
        "tipo": notice_type,
        "notice_type": notice_type,
        "title": _notice_value(r, "title", "") or "",
        "message": _notice_value(r, "message", "") or "",
        "scheduled_for": created_at.isoformat() if created_at else None,
        "created_at": created_at.isoformat() if created_at else None,
        "status": "confirmado" if read_at else "pendente",
        "read": read_at is not None,
        "read_at": read_at.isoformat() if read_at else None,
        "confirmed_at": read_at.isoformat() if read_at else None,
        "confirmed_by": None,
        "is_active": bool(_notice_value(r, "is_active", True)),
    }


def _insert_system_notice_once(*, cur, uid: str, source_key: str, notice_type: str, title: str, message: str):
    """Insere aviso uma única vez por source_key+usuário."""
    cur.execute(
        """
        select id
        from public.bv_notices
        where source_key=%s and created_by=%s
        limit 1
        """,
        (source_key, uid),
    )
    if cur.fetchone():
        return

    cur.execute(
        """
        insert into public.bv_notices(
          title, message, created_by, created_by_name,
          is_active, source_key, notice_type, created_at
        )
        values (%s,%s,%s,%s,true,%s,%s,now())
        """,
        (title, message, uid, "Sistema MonPlant", source_key, notice_type),
    )


def _ensure_supervisor_auto_reminders(uid: str):
    """
    Cria automaticamente:
      1) Um lembrete de produção por hora.
      2) Um lembrete de impacto/baixa produção de tempos em tempos.

    A criação acontece quando o AppShell consulta /unread ou quando a página lista /api/avisos-supervisor.
    """
    ensure_notice_tables()
    now = now_local()

    try:
        with get_conn() as conn, conn.cursor() as cur:
            # 1) Produção da última hora — 1 aviso por hora por usuário.
            prev_hour = (now.hour - 1) % 24
            cur_hour = now.hour
            prod_key = f"prod-hour:{uid}:{now.strftime('%Y-%m-%d')}:{cur_hour:02d}"
            _insert_system_notice_once(
                cur=cur,
                uid=uid,
                source_key=prod_key,
                notice_type="producao_horaria",
                title="Enviar produção da última hora",
                message=(
                    "Enviar no grupo de WhatsApp a produção realizada no período "
                    f"{prev_hour:02d}-{cur_hour:02d}."
                ),
            )

            # 2) Impacto/baixa produção — cria o primeiro automaticamente.
            # Depois, cria novo a cada 45min de forma determinística.
            cur.execute(
                """
                select created_at
                from public.bv_notices
                where created_by=%s
                  and notice_type='impacto_supervisor'
                order by created_at desc
                limit 1
                """,
                (uid,),
            )
            last = cur.fetchone()

            should_create_impact = False
            if not last or not _notice_value(last, "created_at"):
                should_create_impact = True
            else:
                last_dt = _notice_value(last, "created_at")
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                elapsed_min = (datetime.now(timezone.utc) - last_dt.astimezone(timezone.utc)).total_seconds() / 60
                if elapsed_min >= 45:
                    should_create_impact = True

            if should_create_impact:
                impact_key = f"impact:{uid}:{now.strftime('%Y%m%d%H%M')}"
                _insert_system_notice_once(
                    cur=cur,
                    uid=uid,
                    source_key=impact_key,
                    notice_type="impacto_supervisor",
                    title="Confirmar impacto ou baixa produção",
                    message=(
                        "Perguntar ao supervisor se houve impacto operacional, baixa produção, "
                        "parada relevante ou restrição que precise entrar no boletim do turno."
                    ),
                )

            conn.commit()
    except Exception:
        # Não derruba a API nem quebra o AppShell.
        return


@app.get("/api/avisos-supervisor/unread")
def api_avisos_supervisor_unread(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])
    _ensure_supervisor_auto_reminders(uid)

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select count(*) as total
                from public.bv_notices n
                left join public.bv_notice_reads r
                  on r.notice_id = n.id and r.user_id = %s
                where n.is_active = true
                  and (n.created_by = %s or n.created_by is null)
                  and r.read_at is null
                """,
                (uid, uid),
            )
            row = cur.fetchone() or {"total": 0}
        pending_count = int(_notice_value(row, "total", 0) or 0)
        # unread numérico mantém compatibilidade com AppShell que usa data.unread > 0.
        return {"unread": pending_count, "pending_count": pending_count, "has_unread": pending_count > 0}
    except Exception:
        return {"unread": 0, "pending_count": 0, "has_unread": False, "error": "avisos_unread_db_error"}


@app.get("/api/avisos-supervisor")
def api_avisos_supervisor_list(
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])
    _ensure_supervisor_auto_reminders(uid)

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select n.id, n.title, n.message,
                       coalesce(n.notice_type, 'sistema') as notice_type,
                       n.is_active, n.created_at, r.read_at
                from public.bv_notices n
                left join public.bv_notice_reads r
                  on r.notice_id = n.id and r.user_id = %s
                where n.is_active = true
                  and (n.created_by = %s or n.created_by is null)
                order by n.created_at desc
                limit %s
                """,
                (uid, uid, limit),
            )
            rows = cur.fetchall() or []
    except Exception:
        rows = []

    items = [_safe_notice_row_to_out(r) for r in rows]
    pending_count = sum(1 for i in items if i.get("status") == "pendente")
    return {"unread": pending_count, "pending_count": pending_count, "has_unread": pending_count > 0, "items": items}


@app.post("/api/avisos-supervisor/{notice_id}/read")
@app.post("/api/avisos-supervisor/{notice_id}/confirmar")
def api_avisos_supervisor_read(
    notice_id: str,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select 1
                from public.bv_notices
                where id=%s and is_active=true and (created_by=%s or created_by is null)
                """,
                (notice_id, uid),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Aviso não encontrado")

            cur.execute(
                """
                insert into public.bv_notice_reads(notice_id, user_id, read_at)
                values (%s,%s,now())
                on conflict (notice_id, user_id) do update set read_at=excluded.read_at
                """,
                (notice_id, uid),
            )
            conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        return {"ok": False, "error": "avisos_read_db_error"}


@app.post("/api/avisos-supervisor/mark-all-read")
def api_avisos_supervisor_mark_all_read(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_notice_reads(notice_id, user_id, read_at)
                select n.id, %s, now()
                from public.bv_notices n
                left join public.bv_notice_reads r
                  on r.notice_id=n.id and r.user_id=%s
                where n.is_active=true
                  and (n.created_by=%s or n.created_by is null)
                  and r.read_at is null
                on conflict (notice_id, user_id) do update set read_at=excluded.read_at
                """,
                (uid, uid, uid),
            )
            changed = cur.rowcount
            conn.commit()
        return {"ok": True, "marked": int(changed or 0)}
    except Exception:
        return {"ok": False, "marked": 0, "error": "avisos_mark_all_db_error"}


# Alias legados apenas para evitar quebra caso algum front antigo ainda chame sem /api.
@app.get("/avisos-supervisor/unread")
def legacy_avisos_supervisor_unread(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_unread(authorization)


@app.get("/avisos-supervisor")
def legacy_avisos_supervisor_list(
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_list(limit=limit, authorization=authorization)


@app.post("/avisos-supervisor/{notice_id}/confirmar")
def legacy_avisos_supervisor_confirmar(
    notice_id: str,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_read(notice_id=notice_id, authorization=authorization)


@app.post("/avisos-supervisor/mark-all-read")
def legacy_avisos_supervisor_mark_all_read(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_mark_all_read(authorization=authorization)

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
@app.post("/api/notices/{notice_id}/end", dependencies=[Depends(require_supervisor_user)])
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
