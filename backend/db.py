import os
import psycopg2
from psycopg2.extras import RealDictCursor


def _build_dsn() -> str:
    dsn = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("POSTGRES_URL")
    )
    if not dsn:
        raise RuntimeError("DATABASE_URL não configurada")

    if "sslmode=" not in dsn:
        dsn += ("&" if "?" in dsn else "?") + "sslmode=require"
    return dsn


def get_conn():
    """
    Conexão psycopg2 com cursor dict.
    """
    return psycopg2.connect(_build_dsn(), cursor_factory=RealDictCursor)


# ✅ compatibilidade (se algum arquivo antigo importar get_db)
def get_db():
    return get_conn()


def db_ping() -> bool:
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("select 1;")
            _ = cur.fetchone()
        return True
    except Exception:
        return False
