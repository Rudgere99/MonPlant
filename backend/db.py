import os
import psycopg2
from psycopg2.extras import RealDictCursor


def get_conn():
    """
    Railway fornece DATABASE_URL / DATABASE_PUBLIC_URL.
    Preferimos DATABASE_URL (normalmente já vem pronta).
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

    conn = psycopg2.connect(dsn, cursor_factory=RealDictCursor)
    return conn
