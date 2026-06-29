# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.post("/api/plants/{plant_id}/horimetros")
def create_horimetro_by_plant(
    plant_id: int,
    body: HorimetroIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    # Horímetros seguem a mesma trava operacional de data.
    block_retro(body.day, x_dev_key, authorization)

    if body.horimetro_fim < body.horimetro_ini:
        raise HTTPException(status_code=400, detail="horimetro_fim deve ser >= horimetro_ini")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_horimetros(
              owner_id, plant_id, day, turno, equipamento, horimetro_ini, horimetro_fim, obs
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                plant_id,
                body.day,
                int(body.turno),
                body.equipamento,
                body.horimetro_ini,
                body.horimetro_fim,
                body.obs,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_HORIMETRO",
        request=request,
        user_id=user_id,
        entity="bv_horimetros",
        entity_id=str(new_id),
        payload={"owner_id": owner_id, "plant_id": plant_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id, "plant_id": plant_id}


@app.get("/api/plants/{plant_id}/horimetros")
def list_horimetros_by_plant(
    plant_id: int,
    day: Optional[date] = Query(None),
    equipamento: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    owner_id: str = Depends(require_owner_id),
):
    with get_conn() as conn, conn.cursor() as cur:
        if day and equipamento:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and plant_id=%s and day=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, day, equipamento, limit),
            )
        elif day:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and plant_id=%s and day=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, day, limit),
            )
        elif equipamento:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and plant_id=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, equipamento, limit),
            )
        else:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and plant_id=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, plant_id, limit),
            )
        rows = cur.fetchall() or []
    return rows


@app.get("/api/plants/{plant_id}/horimetros/last-by-eq")
def last_by_eq_by_plant(plant_id: int, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select distinct on (equipamento)
              equipamento, horimetro_ini, horimetro_fim, day, turno, created_at
            from public.bv_horimetros
            where owner_id=%s and plant_id=%s
            order by equipamento, created_at desc
            """,
            (owner_id, plant_id),
        )
        rows = cur.fetchall() or []

    out = []
    for r in rows:
        out.append(
            {
                "equipamento": r["equipamento"],
                "horimetro_ini": parse_float(r["horimetro_ini"]),
                "horimetro_fim": parse_float(r["horimetro_fim"]),
                "day": str(r["day"]),
                "turno": int(r["turno"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
        )
    return out


@app.delete("/api/plants/{plant_id}/horimetros/{horimetro_id}")
def delete_horimetro_by_plant(
    plant_id: int,
    horimetro_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            delete from public.bv_horimetros
            where id=%s and owner_id=%s and plant_id=%s
            """,
            (horimetro_id, owner_id, plant_id),
        )
        deleted = cur.rowcount
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")

    log_action(
        action="DELETE_HORIMETRO",
        request=request,
        user_id=user_id,
        entity="bv_horimetros",
        entity_id=str(horimetro_id),
        payload={"owner_id": owner_id, "plant_id": plant_id},
    )

    return {"ok": True}


@app.post("/api/horimetros")
def create_horimetro(
    body: HorimetroIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    # mantive o header pra não quebrar front (mas ele não é mais usado aqui)
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    # Horímetros seguem a mesma trava operacional de data.
    block_retro(body.day, x_dev_key, authorization)

    if body.horimetro_fim < body.horimetro_ini:
        raise HTTPException(status_code=400, detail="horimetro_fim deve ser >= horimetro_ini")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_horimetros(
              owner_id, day, turno, equipamento, horimetro_ini, horimetro_fim, obs
            )
            values (%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                body.day,
                int(body.turno),
                body.equipamento,
                body.horimetro_ini,
                body.horimetro_fim,
                body.obs,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_HORIMETRO",
        request=request,
        user_id=user_id,
        entity="bv_horimetros",
        entity_id=str(new_id),
        payload={"owner_id": owner_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id}


@app.get("/api/horimetros")
def list_horimetros(
    day: Optional[date] = Query(None),
    equipamento: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    owner_id: str = Depends(require_owner_id),
):
    with get_conn() as conn, conn.cursor() as cur:
        if day and equipamento:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and day=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, day, equipamento, limit),
            )
        elif day:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and day=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, day, limit),
            )
        elif equipamento:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s and equipamento=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, equipamento, limit),
            )
        else:
            cur.execute(
                """
                select *
                from public.bv_horimetros
                where owner_id=%s
                order by created_at desc
                limit %s
                """,
                (owner_id, limit),
            )
        rows = cur.fetchall() or []
    return rows


@app.get("/api/horimetros/last-by-eq")
def last_by_eq(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select distinct on (equipamento)
              equipamento, horimetro_ini, horimetro_fim, day, turno, created_at
            from public.bv_horimetros
            where owner_id=%s
            order by equipamento, created_at desc
            """,
            (owner_id,),
        )
        rows = cur.fetchall() or []

    out = []
    for r in rows:
        out.append(
            {
                "equipamento": r["equipamento"],
                "horimetro_ini": parse_float(r["horimetro_ini"]),
                "horimetro_fim": parse_float(r["horimetro_fim"]),
                "day": str(r["day"]),
                "turno": int(r["turno"]),
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
        )
    return out


@app.delete("/api/horimetros/{horimetro_id}")
def delete_horimetro(
    horimetro_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            delete from public.bv_horimetros
            where id=%s and owner_id=%s
            """,
            (horimetro_id, owner_id),
        )
        deleted = cur.rowcount
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")

    log_action(
        action="DELETE_HORIMETRO",
        request=request,
        user_id=user_id,
        entity="bv_horimetros",
        entity_id=str(horimetro_id),
        payload={"owner_id": owner_id},
    )

    return {"ok": True}


