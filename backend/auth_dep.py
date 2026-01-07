import os
import base64
import json
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from db import get_db
from db import BVUser  # vamos criar no db.py


TOKEN_SECRET = os.getenv("AUTH_SECRET", "CHANGE_ME_AUTH_SECRET")
TOKEN_TTL_HOURS = int(os.getenv("AUTH_TTL_HOURS", "168"))  # 7 dias


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _sign(payload_b64: str) -> str:
    sig = hmac.new(TOKEN_SECRET.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return _b64url(sig)


def create_token(user_id: str, user_type: str, email: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)
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


def get_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    a = authorization.strip()
    if not a.lower().startswith("bearer "):
        return None
    return a.split(" ", 1)[1].strip()


def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> BVUser:
    token = get_bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Sem token")

    payload = decode_token(token)
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    user = db.query(BVUser).filter(BVUser.id == uid).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário inválido")

    return user


def require_dev(user: BVUser = Depends(get_current_user)) -> BVUser:
    if user.user_type != "dev":
        raise HTTPException(status_code=403, detail="Acesso negado")
    return user
