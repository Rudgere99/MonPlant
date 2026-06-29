# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/plants/{plant_id}/plant-production/last7days")
def plant_last7_by_plant(plant_id: int, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, coalesce(sum(coalesce(ton,0)),0) as total_ton
            from public.bv_plant_production_rows
            where owner_id=%s
              and plant_id=%s
            group by day
            order by day desc
            limit 7
            """,
            (owner_id, plant_id),
        )
        rows = cur.fetchall() or []

    rows = list(reversed(rows))
    return [{"day": str(r["day"]), "total_ton": float(r["total_ton"] or 0)} for r in rows]


@app.get("/api/plants/{plant_id}/plant-production/{day}")
def get_plant_day_by_plant(
    plant_id: int,
    day: date,
    owner_id: str = Depends(require_owner_id),
):
    ensure_plant_production_over_columns()
    periods = [_period_std_from_h(h) for h in range(24)]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select obs, updated_at, original_rows, coalesce(over_moved_t,0) as over_moved_t
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s and plant_id=%s
            """,
            (owner_id, day, plant_id),
        )
        daily = cur.fetchone()

        cur.execute(
            """
            select period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s and plant_id=%s
            """,
            (owner_id, day, plant_id),
        )
        db_rows = cur.fetchall() or []

    by_period: Dict[str, Any] = {}
    for r in db_rows:
        key = normalize_period(r["period"])
        if key:
            by_period[key] = r

    full_rows = []
    for p in periods:
        r = by_period.get(p)
        full_rows.append(
            {
                "period": p,
                "ton": r["ton"] if r else None,
                "freq": r["freq"] if r else None,
            }
        )

    obs = (daily["obs"] if daily else "") or ""
    updated_at = daily["updated_at"].isoformat() if (daily and daily.get("updated_at")) else None
    over_moved_t = float((daily.get("over_moved_t") if daily else 0) or 0)

    # Se ainda não existir original_rows no banco, usa rows como fallback.
    # A partir do primeiro salvamento com o front ajustado, original_rows preserva o valor antes do OVER.
    original_rows_saved = daily.get("original_rows") if daily else None
    original_rows = _coerce_rows_like_to_full_rows(original_rows_saved, periods) if original_rows_saved else full_rows

    return {
        "day": str(day),
        "plant_id": plant_id,
        "obs": obs,
        "rows": full_rows,
        "original_rows": original_rows,
        "over_moved_t": over_moved_t,
        "updated_at": updated_at,
    }


@app.put("/api/plants/{plant_id}/plant-production/{day}")
def put_plant_day_by_plant(
    plant_id: int,
    day: date,
    body: PlantDayUpsert,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    ensure_plant_production_over_columns()
    block_retro(day, x_dev_key, authorization)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    adjusted_rows_plain = _plant_rows_to_plain(body.rows)
    original_rows_plain = _plant_rows_to_plain(body.original_rows) if body.original_rows is not None else adjusted_rows_plain
    over_moved_t = float(body.over_moved_t or 0)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plant_production_daily(
              owner_id, day, plant_id, obs, original_rows, over_moved_t, updated_at
            )
            values (%s,%s,%s,%s,%s::jsonb,%s,now())
            on conflict (owner_id, day, plant_id)
            do update set
              obs = excluded.obs,
              original_rows = excluded.original_rows,
              over_moved_t = excluded.over_moved_t,
              updated_at = now()
            """,
            (
                owner_id,
                day,
                plant_id,
                body.obs or "",
                json.dumps(original_rows_plain, ensure_ascii=False),
                over_moved_t,
            ),
        )

        cur.execute(
            """
            delete from public.bv_plant_production_rows
            where owner_id=%s and day=%s and plant_id=%s
            """,
            (owner_id, day, plant_id),
        )

        for r in body.rows or []:
            p = normalize_period(r.period) or r.period
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, plant_id, period, ton, freq)
                values (%s,%s,%s,%s,%s,%s)
                """,
                (owner_id, day, plant_id, p, r.ton, r.freq),
            )

        conn.commit()

    log_action(
        action="UPDATE_PLANT_PRODUCTION",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_daily",
        entity_id=f"{day}::plant::{plant_id}",
        payload={
            "owner_id": owner_id,
            "day": str(day),
            "plant_id": plant_id,
            "over_moved_t": over_moved_t,
        },
    )

    return {
        "ok": True,
        "day": str(day),
        "plant_id": plant_id,
        "over_moved_t": over_moved_t,
    }


@app.get("/api/plant-production/last7days")
def plant_last7(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, coalesce(sum(coalesce(ton,0)),0) as total_ton
            from public.bv_plant_production_rows
            where owner_id=%s
            group by day
            order by day desc
            limit 7
            """,
            (owner_id,),
        )
        rows = cur.fetchall() or []

    rows = list(reversed(rows))
    return [{"day": str(r["day"]), "total_ton": float(r["total_ton"] or 0)} for r in rows]


@app.get("/api/plant-production/{day}")
def get_plant_day(day: date, owner_id: str = Depends(require_owner_id)):
    # Compatibilidade do endpoint legado: usa Planta 1 como padrão.
    # Isso evita erro quando o banco já está no modelo multi-planta com unique(owner_id, day, plant_id).
    ensure_plant_production_over_columns()
    plant_id = 1
    periods = [_period_std_from_h(h) for h in range(24)]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select obs, updated_at, original_rows, coalesce(over_moved_t,0) as over_moved_t
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s and coalesce(plant_id, 1)=%s
            order by plant_id nulls first
            limit 1
            """,
            (owner_id, day, plant_id),
        )
        daily = cur.fetchone()

        cur.execute(
            """
            select period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s and coalesce(plant_id, 1)=%s
            """,
            (owner_id, day, plant_id),
        )
        db_rows = cur.fetchall() or []

    by_period: Dict[str, Any] = {}
    for r in db_rows:
        key = normalize_period(r["period"])
        if key:
            by_period[key] = r

    full_rows = []
    for p in periods:
        r = by_period.get(p)
        full_rows.append(
            {
                "period": p,
                "ton": r["ton"] if r else None,
                "freq": r["freq"] if r else None,
            }
        )

    obs = (daily["obs"] if daily else "") or ""
    updated_at = daily["updated_at"].isoformat() if (daily and daily.get("updated_at")) else None
    over_moved_t = float((daily.get("over_moved_t") if daily else 0) or 0)
    original_rows_saved = daily.get("original_rows") if daily else None
    original_rows = _coerce_rows_like_to_full_rows(original_rows_saved, periods) if original_rows_saved else full_rows

    return {
        "day": str(day),
        "plant_id": plant_id,
        "obs": obs,
        "rows": full_rows,
        "original_rows": original_rows,
        "over_moved_t": over_moved_t,
        "updated_at": updated_at,
    }


@app.put("/api/plant-production/{day}")
def put_plant_day(
    day: date,
    body: PlantDayUpsert,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_write_user),
):
    ensure_plant_production_over_columns()
    block_retro(day, x_dev_key, authorization)

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None
    plant_id = 1  # endpoint legado = Planta 1

    adjusted_rows_plain = _plant_rows_to_plain(body.rows)
    original_rows_plain = _plant_rows_to_plain(body.original_rows) if body.original_rows is not None else adjusted_rows_plain
    over_moved_t = float(body.over_moved_t or 0)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plant_production_daily(
              owner_id, day, plant_id, obs, original_rows, over_moved_t, updated_at
            )
            values (%s,%s,%s,%s,%s::jsonb,%s,now())
            on conflict (owner_id, day, plant_id)
            do update set
              obs = excluded.obs,
              original_rows = excluded.original_rows,
              over_moved_t = excluded.over_moved_t,
              updated_at = now()
            """,
            (
                owner_id,
                day,
                plant_id,
                body.obs or "",
                json.dumps(original_rows_plain, ensure_ascii=False),
                over_moved_t,
            ),
        )

        cur.execute(
            """
            delete from public.bv_plant_production_rows
            where owner_id=%s and day=%s and coalesce(plant_id, 1)=%s
            """,
            (owner_id, day, plant_id),
        )

        for r in body.rows or []:
            p = normalize_period(r.period) or r.period
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, plant_id, period, ton, freq)
                values (%s,%s,%s,%s,%s,%s)
                """,
                (owner_id, day, plant_id, p, r.ton, r.freq),
            )

        conn.commit()

    log_action(
        action="UPDATE_PLANT_PRODUCTION",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_daily",
        entity_id=f"{day}::plant::{plant_id}",
        payload={
            "owner_id": owner_id,
            "day": str(day),
            "plant_id": plant_id,
            "over_moved_t": over_moved_t,
        },
    )

    return {
        "ok": True,
        "day": str(day),
        "plant_id": plant_id,
        "over_moved_t": over_moved_t,
    }


