# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/plants/{plant_id}/stops")
def list_stops_by_plant(
    plant_id: int,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select *
            from public.bv_stops
            where owner_id=%s and day=%s and plant_id=%s
            order by created_at desc
            """,
            (owner_id, day, plant_id),
        )
        rows = cur.fetchall() or []
    return rows


@app.post("/api/plants/{plant_id}/stops")
def create_stop_by_plant(
    plant_id: int,
    body: StopIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    block_retro(body.day, x_dev_key, authorization)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_stops(
              owner_id, plant_id, day, turno,
              data_inicio, hora_inicio, data_fim, hora_fim,
              equipamento, tipo_parada, atividade, descricao, tempo_parada_h
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                plant_id,
                body.day,
                int(body.turno),
                body.data_inicio,
                body.hora_inicio,
                body.data_fim,
                body.hora_fim,
                body.equipamento,
                body.tipo_parada,
                body.atividade,
                body.descricao,
                body.tempo_parada_h,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_STOP",
        request=request,
        user_id=user_id,
        entity="bv_stops",
        entity_id=str(new_id),
        payload={"owner_id": owner_id, "plant_id": plant_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id, "plant_id": plant_id}


@app.delete("/api/plants/{plant_id}/stops/{stop_id}")
def delete_stop_by_plant(
    plant_id: int,
    stop_id: int,
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
            delete from public.bv_stops
            where id=%s and owner_id=%s and plant_id=%s
            """,
            (stop_id, owner_id, plant_id),
        )
        deleted = cur.rowcount
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")

    log_action(
        action="DELETE_STOP",
        request=request,
        user_id=user_id,
        entity="bv_stops",
        entity_id=str(stop_id),
        payload={"owner_id": owner_id, "plant_id": plant_id},
    )

    return {"ok": True}


@app.get("/api/stops")
def list_stops(day: date = Query(...), owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select *
            from public.bv_stops
            where owner_id=%s and day=%s
            order by created_at desc
            """,
            (owner_id, day),
        )
        rows = cur.fetchall() or []
    return rows


@app.post("/api/stops")
def create_stop(
    body: StopIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    block_retro(body.day, x_dev_key, authorization)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_stops(
              owner_id, day, turno,
              data_inicio, hora_inicio, data_fim, hora_fim,
              equipamento, tipo_parada, atividade, descricao, tempo_parada_h
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                body.day,
                int(body.turno),
                body.data_inicio,
                body.hora_inicio,
                body.data_fim,
                body.hora_fim,
                body.equipamento,
                body.tipo_parada,
                body.atividade,
                body.descricao,
                body.tempo_parada_h,
            ),
        )
        new_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="CREATE_STOP",
        request=request,
        user_id=user_id,
        entity="bv_stops",
        entity_id=str(new_id),
        payload={"owner_id": owner_id, "day": str(body.day), "equipamento": body.equipamento},
    )

    return {"ok": True, "id": new_id}


@app.delete("/api/stops/{stop_id}")
def delete_stop(
    stop_id: int,
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
            delete from public.bv_stops
            where id=%s and owner_id=%s
            """,
            (stop_id, owner_id),
        )
        deleted = cur.rowcount
        conn.commit()

    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")

    log_action(
        action="DELETE_STOP",
        request=request,
        user_id=user_id,
        entity="bv_stops",
        entity_id=str(stop_id),
        payload={"owner_id": owner_id},
    )

    return {"ok": True}


