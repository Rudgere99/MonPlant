# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

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


