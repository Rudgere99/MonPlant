# backend/auth_dep.py
import os
from typing import Optional, Dict, Any

from fastapi import Header, HTTPException, Depends

# Se no seu main.py você já tem verify_token(), importe de lá.
# Caso já exista verify_token aqui, mantenha o seu e só use require_owner_id abaixo.
from main import verify_token  # ajuste se estiver em outro módulo

OWNER_ID = os.getenv("MP_OWNER_ID", "shared")


def require_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing token")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = verify_token(token)  # deve retornar dict com sub/user_id etc.
        if not payload:
            raise ValueError("invalid token")
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_owner_id(user: Dict[str, Any] = Depends(require_user)) -> str:
    # Por enquanto: TODO mundo no mesmo owner (não bloqueia páginas ainda)
    return OWNER_ID
