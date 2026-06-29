# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/dev/users")
def dev_list_users(dev_payload=Depends(require_dev_user)):
    return _dev_list_users()


@app.get("/api/dev/users")
def api_dev_list_users(dev_payload=Depends(require_dev_user)):
    return _dev_list_users()


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


