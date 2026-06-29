# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/avisos-supervisor/unread")
def api_avisos_supervisor_unread(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])
    _ensure_supervisor_auto_reminders(uid)

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select count(*) as total
                from public.bv_notices n
                left join public.bv_notice_reads r
                  on r.notice_id = n.id and r.user_id = %s
                where n.is_active = true
                  and (n.created_by = %s or n.created_by is null)
                  and r.read_at is null
                """,
                (uid, uid),
            )
            row = cur.fetchone() or {"total": 0}
        pending_count = int(_notice_value(row, "total", 0) or 0)
        # unread numérico mantém compatibilidade com AppShell que usa data.unread > 0.
        return {"unread": pending_count, "pending_count": pending_count, "has_unread": pending_count > 0}
    except Exception:
        return {"unread": 0, "pending_count": 0, "has_unread": False, "error": "avisos_unread_db_error"}


@app.get("/api/avisos-supervisor")
def api_avisos_supervisor_list(
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])
    _ensure_supervisor_auto_reminders(uid)

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select n.id, n.title, n.message,
                       coalesce(n.notice_type, 'sistema') as notice_type,
                       n.is_active, n.created_at, r.read_at
                from public.bv_notices n
                left join public.bv_notice_reads r
                  on r.notice_id = n.id and r.user_id = %s
                where n.is_active = true
                  and (n.created_by = %s or n.created_by is null)
                order by n.created_at desc
                limit %s
                """,
                (uid, uid, limit),
            )
            rows = cur.fetchall() or []
    except Exception:
        rows = []

    items = [_safe_notice_row_to_out(r) for r in rows]
    pending_count = sum(1 for i in items if i.get("status") == "pendente")
    return {"unread": pending_count, "pending_count": pending_count, "has_unread": pending_count > 0, "items": items}


@app.post("/api/avisos-supervisor/{notice_id}/read")
@app.post("/api/avisos-supervisor/{notice_id}/confirmar")
def api_avisos_supervisor_read(
    notice_id: str,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select 1
                from public.bv_notices
                where id=%s and is_active=true and (created_by=%s or created_by is null)
                """,
                (notice_id, uid),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Aviso não encontrado")

            cur.execute(
                """
                insert into public.bv_notice_reads(notice_id, user_id, read_at)
                values (%s,%s,now())
                on conflict (notice_id, user_id) do update set read_at=excluded.read_at
                """,
                (notice_id, uid),
            )
            conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        return {"ok": False, "error": "avisos_read_db_error"}


@app.post("/api/avisos-supervisor/mark-all-read")
def api_avisos_supervisor_mark_all_read(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    payload = _require_user_payload(authorization)
    uid = str(payload["uid"])

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_notice_reads(notice_id, user_id, read_at)
                select n.id, %s, now()
                from public.bv_notices n
                left join public.bv_notice_reads r
                  on r.notice_id=n.id and r.user_id=%s
                where n.is_active=true
                  and (n.created_by=%s or n.created_by is null)
                  and r.read_at is null
                on conflict (notice_id, user_id) do update set read_at=excluded.read_at
                """,
                (uid, uid, uid),
            )
            changed = cur.rowcount
            conn.commit()
        return {"ok": True, "marked": int(changed or 0)}
    except Exception:
        return {"ok": False, "marked": 0, "error": "avisos_mark_all_db_error"}


@app.get("/avisos-supervisor/unread")
def legacy_avisos_supervisor_unread(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_unread(authorization)


@app.get("/avisos-supervisor")
def legacy_avisos_supervisor_list(
    limit: int = Query(100, ge=1, le=500),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_list(limit=limit, authorization=authorization)


@app.post("/avisos-supervisor/{notice_id}/confirmar")
def legacy_avisos_supervisor_confirmar(
    notice_id: str,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_read(notice_id=notice_id, authorization=authorization)


@app.post("/avisos-supervisor/mark-all-read")
def legacy_avisos_supervisor_mark_all_read(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    return api_avisos_supervisor_mark_all_read(authorization=authorization)


@app.get("/api/notices/active", response_model=List[NoticeOut])
def api_list_active_notices(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
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
            select n.id, n.title, n.message, n.is_active, n.created_at, n.created_by,
                   r.read_at
            from public.bv_notices n
            left join public.bv_notice_reads r
              on r.notice_id = n.id and r.user_id = %s
            where n.is_active = true
            order by n.created_at desc
            """,
            (uid,),
        )
        rows = cur.fetchall() or []

    out: List[NoticeOut] = []
    for r in rows:
        out.append(
            NoticeOut(
                id=str(r["id"]),
                title=r["title"],
                message=r["message"],
                is_active=bool(r["is_active"]),
                created_at=r["created_at"].isoformat() if r.get("created_at") else "",
                created_by=str(r["created_by"]),
                read=r["read_at"] is not None,
                read_at=r["read_at"].isoformat() if r.get("read_at") else None,
            )
        )
    return out


@app.post("/api/notices", dependencies=[Depends(require_supervisor_user)])
def api_create_notice(
    body: NoticeCreateIn,
    request: Request,
    sup_payload=Depends(require_supervisor_user),
):
    uid = sup_payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    title = (body.title or "").strip()
    msg = (body.message or "").strip()
    if not title or not msg:
        raise HTTPException(status_code=400, detail="Título e mensagem são obrigatórios")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_notices(title, message, is_active, created_by)
            values (%s,%s,true,%s)
            returning id
            """,
            (title, msg, uid),
        )
        nid = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_NOTICE",
        request=request,
        user_id=str(uid),
        entity="bv_notices",
        entity_id=str(nid),
        payload={"title": title},
    )

    return {"ok": True, "id": str(nid)}


@app.post("/api/notices/{notice_id}/read")
def api_read_notice(
    notice_id: str,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    tok = bearer_token(authorization)
    if not tok:
        raise HTTPException(status_code=401, detail="Sem token")
    payload = decode_token(tok)
    uid = payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("select 1 from public.bv_notices where id=%s and is_active=true", (notice_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Aviso não encontrado/ativo")

        cur.execute(
            """
            insert into public.bv_notice_reads(notice_id, user_id, read_at)
            values (%s,%s, now())
            on conflict (notice_id, user_id) do update set read_at = excluded.read_at
            """,
            (notice_id, uid),
        )
        conn.commit()

    return {"ok": True}


@app.post("/api/notices/{notice_id}/close", dependencies=[Depends(require_supervisor_user)])
@app.post("/api/notices/{notice_id}/end", dependencies=[Depends(require_supervisor_user)])
def api_close_notice(
    notice_id: str,
    request: Request,
    sup_payload=Depends(require_supervisor_user),
):
    uid = sup_payload.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Token inválido")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_notices
            set is_active=false, closed_at=now()
            where id=%s and is_active=true
            """,
            (notice_id,),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Aviso não encontrado/ativo")
        conn.commit()

    log_action(
        action="CLOSE_NOTICE",
        request=request,
        user_id=str(uid),
        entity="bv_notices",
        entity_id=str(notice_id),
        payload=None,
    )

    return {"ok": True}


