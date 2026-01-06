# backend/db.py
import os
import psycopg2

def get_conn():
    dsn = os.getenv("DATABASE_URL") or os.getenv("DATABASE_PUBLIC_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL não configurada no Railway")
    return psycopg2.connect(dsn)
