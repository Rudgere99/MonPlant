from fastapi import FastAPI, HTTPException, Depends, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, EmailStr
from datetime import date, datetime, timedelta, timezone, time
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


# =========================
# Helpers
# =========================
BR_TZ = ZoneInfo("America/Sao_Paulo")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

AUTH_SECRET = (os.getenv("AUTH_SECRET") or "").strip()
if not AUTH_SECRET or AUTH_SECRET == "CHANGE_ME_AUTH_SECRET":
    # Em produção, defina AUTH_SECRET no Railway/ambiente.
    # Mantém fallback apenas em execução local para não quebrar desenvolvimento.
    if os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RENDER") or os.getenv("VERCEL"):
        raise RuntimeError("AUTH_SECRET não configurado para produção")
    AUTH_SECRET = "DEV_ONLY_CHANGE_ME_AUTH_SECRET"
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
    Regra operacional (America/Sao_Paulo):
      - Não permite lançar/editar data futura.
      - Permite editar o dia atual.
      - Permite editar o dia anterior somente até o horário limite configurado.
      - DEV ou usuário com permissão retroativa podem editar fora da janela.

    Configure no ambiente:
      - RETRO_ALLOW_UNTIL_HOUR (default 1) -> libera D-1 até HH:00.
    """
    if is_dev(dev_key) or user_can_edit_retroactive(authorization):
        return

    tdy = today_local()
    n = now_local()

    if d > tdy:
        raise HTTPException(status_code=403, detail="Data futura não pode ser editada.")

    if d == tdy:
        return

    allow_until_hour = int(os.getenv("RETRO_ALLOW_UNTIL_HOUR") or "1")
    allow_until_hour = max(0, min(23, allow_until_hour))
    cutoff = datetime.combine(tdy, time(hour=allow_until_hour, minute=0), tzinfo=BR_TZ)

    if d == (tdy - timedelta(days=1)) and n <= cutoff:
        return

    raise HTTPException(
        status_code=403,
        detail=f"Dia anterior só pode ser editado até {allow_until_hour:02d}:00. Datas futuras não são permitidas.",
    )

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


def _active_user_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select user_type, email, full_name, coalesce(is_active, true) as is_active
                from public.bv_users
                where id=%s
                """,
                (uid,),
            )
            row = cur.fetchone()
    except HTTPException:
        raise
    except Exception:
        # Se a consulta falhar por uma migração ainda não aplicada, mantém o token validado.
        row = None

    if row is not None:
        if not bool(row.get("is_active", True)):
            raise HTTPException(status_code=403, detail="Usuário inativo")
        payload = dict(payload)
        payload["typ"] = normalize_user_type(row.get("user_type") or payload.get("typ"))
        payload["em"] = row.get("email") or payload.get("em")
        payload["name"] = row.get("full_name") or payload.get("name")

    return payload


def require_authenticated_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")
    return _active_user_payload(decode_token(tok))


def require_write_user(payload: Dict[str, Any] = Depends(require_authenticated_user)):
    role = normalize_user_type(payload.get("typ"))
    if role not in {"apontador", "controlador", "supervisor", "gerencia", "dev"}:
        raise HTTPException(status_code=403, detail="Usuário sem permissão para salvar dados")
    return payload


def require_control_user(payload: Dict[str, Any] = Depends(require_authenticated_user)):
    role = normalize_user_type(payload.get("typ"))
    if role not in {"controlador", "gerencia", "dev"}:
        raise HTTPException(status_code=403, detail="Usuário sem permissão para esta alteração")
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


# =========================
# AUTH (bv_users)
# =========================




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




# ✅ Alias pro front (se você estiver usando /api/dev/...)


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






# =========================
# Plants
# =========================




# =========================
# Supervisores Planta
# =========================




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












# =========================
# Plant Production (Multi-planta)
# =========================






# =========================
# Plant Production (Legacy)
# =========================






# Stops (Multi-planta)
# =========================






# =========================
# Stops
# =========================






# =========================
# Horimetros (Multi-planta)
# =========================








# =========================
# Horimetros
# =========================








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








# -------- Metas consolidadas / todas as plantas --------





# -------- Endpoints legados: mantêm Planta 01 como padrão --------








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










# =========================
# Aggregate / Todas as plantas
# =========================











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
            # Depois, cria novo se passaram 90min; entre 45 e 90min tem chance controlada.
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
                if elapsed_min >= 90:
                    should_create_impact = True
                elif elapsed_min >= 45:
                    should_create_impact = random.random() < 0.20

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










# Alias legados apenas para evitar quebra caso algum front antigo ainda chame sem /api.







# =========================
# Notices (Supervisor broadcast + confirmação de leitura)
# =========================






