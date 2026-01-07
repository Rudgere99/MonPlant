import os
import psycopg2
from psycopg2.extras import RealDictCursor


def _build_dsn() -> str:
    """
    Railway fornece DATABASE_URL / DATABASE_PUBLIC_URL / POSTGRES_URL.
    Preferimos DATABASE_URL.
    """
    dsn = (
        os.getenv("DATABASE_URL")
        or os.getenv("DATABASE_PUBLIC_URL")
        or os.getenv("POSTGRES_URL")
    )

    if not dsn:
        raise RuntimeError(
            "DATABASE_URL não configurada. Defina DATABASE_URL nas Variables do Railway."
        )

    # sslmode=require é comum no Railway
    if "sslmode=" not in dsn:
        if "?" in dsn:
            dsn = dsn + "&sslmode=require"
        else:
            dsn = dsn + "?sslmode=require"

    return dsn


def get_conn():
    """
    Retorna conexão psycopg2 com cursor dict.
    Usado assim no main.py:
      with get_conn() as conn, conn.cursor() as cur:
          ...
    """
    dsn = _build_dsn()
    return psycopg2.connect(dsn, cursor_factory=RealDictCursor)


def db_ping() -> bool:
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("select 1;")
            _ = cur.fetchone()
        return True
    except Exception:
        return False
