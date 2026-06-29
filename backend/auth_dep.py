import os
from fastapi import Header, HTTPException, Depends
from db import get_conn


def require_owner_id(
    x_owner_id: str | None = Header(default=None, alias="X-Owner-Id"),
):
    """
    MonPlant usa owner_id para isolar dados por 'dono' (multi-PC).
    Por enquanto:
      - se não vier header, usa 'default'
      - depois você pode fazer isso amarrado ao usuário logado
    """
    owner_id = (x_owner_id or "").strip()
    if not owner_id:
        # fallback para não quebrar nada
        return "default"
    return owner_id


def get_owner_id_from_token(user_id: str) -> str | None:
    """
    (para futuro) buscar owner_id relacionado ao usuário, se quiser.
    Hoje não usamos.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("select 1;")
        return None
    except Exception:
        return None
