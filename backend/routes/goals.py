# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/plants/{plant_id}/goals/day/{day}", response_model=GoalDayOut)
def goals_get_day_by_plant(plant_id: int, day: date, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT meta_ton, discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND plant_id=%s AND day=%s""",
                (owner_id, plant_id, day),
            )
            row = cur.fetchone()
    if not row:
        return _goal_day_default(day, plant_id)
    return GoalDayOut(day=day, meta_ton=float(_col(row,'meta_ton',0) or 0), discount_hours=float(_col(row,'discount_hours',1) or 0))


@app.put("/api/plants/{plant_id}/goals/day/{day}", response_model=GoalDayOut)
def goals_put_day_by_plant(plant_id: int, day: date, body: GoalDayIn, owner_id: str = Depends(require_owner_id), _user: Dict[str, Any] = Depends(require_control_user)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO public.bv_goals_daily(owner_id, plant_id, day, meta_ton, discount_hours)
                     VALUES(%s,%s,%s,%s,%s)
                     ON CONFLICT (owner_id, plant_id, day)
                     DO UPDATE SET meta_ton=EXCLUDED.meta_ton,
                                   discount_hours=EXCLUDED.discount_hours,
                                   updated_at=NOW()""",
                (owner_id, plant_id, day, body.meta_ton, body.discount_hours),
            )
        conn.commit()
    return GoalDayOut(day=day, meta_ton=float(body.meta_ton), discount_hours=float(body.discount_hours))


@app.get("/api/plants/{plant_id}/goals/month/{month}", response_model=GoalMonthOut)
def goals_get_month_by_plant(plant_id: int, month: str, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT day, meta_ton, discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND plant_id=%s AND day >= %s AND day < %s
                     ORDER BY day ASC""",
                (owner_id, plant_id, a, b),
            )
            rows = cur.fetchall() or []

    days = [GoalDayOut(day=_col(r,'day',0), meta_ton=float(_col(r,'meta_ton',1) or 0), discount_hours=float(_col(r,'discount_hours',2) or 0)) for r in rows]
    total_month = float(sum(d.meta_ton for d in days))
    return GoalMonthOut(month=month, total_month_ton=total_month, days=days)


@app.put("/api/plants/{plant_id}/goals/month/{month}", response_model=GoalMonthOut)
def goals_put_month_by_plant(plant_id: int, month: str, body: GoalMonthIn, owner_id: str = Depends(require_owner_id), _user: Dict[str, Any] = Depends(require_control_user)):
    _ensure_goals_table()
    plant_id = _validate_plant_id(plant_id)
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    for d in body.days:
        if d.day < a or d.day >= b:
            raise HTTPException(status_code=400, detail=f"Dia {d.day} fora do mês {month}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            for d in body.days:
                cur.execute(
                    """INSERT INTO public.bv_goals_daily(owner_id, plant_id, day, meta_ton, discount_hours)
                         VALUES(%s,%s,%s,%s,%s)
                         ON CONFLICT (owner_id, plant_id, day)
                         DO UPDATE SET meta_ton=EXCLUDED.meta_ton,
                                       discount_hours=EXCLUDED.discount_hours,
                                       updated_at=NOW()""",
                    (owner_id, plant_id, d.day, d.meta_ton, d.discount_hours),
                )
        conn.commit()

    return goals_get_month_by_plant(plant_id, month, owner_id)


@app.get("/api/aggregate/goals/month/{month}", response_model=GoalMonthOut)
def goals_get_month_aggregate(month: str, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT day,
                          COALESCE(SUM(COALESCE(meta_ton,0)),0) AS meta_ton,
                          COALESCE(AVG(COALESCE(discount_hours,2)),2) AS discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND day >= %s AND day < %s
                     GROUP BY day
                     ORDER BY day ASC""",
                (owner_id, a, b),
            )
            rows = cur.fetchall() or []

    days = [GoalDayOut(day=_col(r,'day',0), meta_ton=float(_col(r,'meta_ton',1) or 0), discount_hours=float(_col(r,'discount_hours',2) or 0)) for r in rows]
    total_month = float(sum(d.meta_ton for d in days))
    return GoalMonthOut(month=month, total_month_ton=total_month, days=days)


@app.get("/api/aggregate/goals/day/{day}", response_model=GoalDayOut)
def goals_get_day_aggregate(day: date, owner_id: str = Depends(require_owner_id)):
    _ensure_goals_table()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT COALESCE(SUM(COALESCE(meta_ton,0)),0) AS meta_ton,
                          COALESCE(AVG(COALESCE(discount_hours,2)),2) AS discount_hours
                     FROM public.bv_goals_daily
                     WHERE owner_id=%s AND day=%s""",
                (owner_id, day),
            )
            row = cur.fetchone()
    if not row:
        return GoalDayOut(day=day, meta_ton=0.0, discount_hours=2.0)
    return GoalDayOut(
        day=day,
        meta_ton=float(_col(row, 'meta_ton', 0) or 0),
        discount_hours=float(_col(row, 'discount_hours', 1) or 0),
    )


@app.get("/api/goals/day/{day}", response_model=GoalDayOut)
def goals_get_day(day: date, owner_id: str = Depends(require_owner_id)):
    return goals_get_day_by_plant(1, day, owner_id)


@app.put("/api/goals/day/{day}", response_model=GoalDayOut)
def goals_put_day(day: date, body: GoalDayIn, owner_id: str = Depends(require_owner_id), _user: Dict[str, Any] = Depends(require_control_user)):
    return goals_put_day_by_plant(1, day, body, owner_id, _user)


@app.get("/api/goals/month/{month}", response_model=GoalMonthOut)
def goals_get_month(month: str, owner_id: str = Depends(require_owner_id)):
    return goals_get_month_by_plant(1, month, owner_id)


@app.put("/api/goals/month/{month}", response_model=GoalMonthOut)
def goals_put_month(month: str, body: GoalMonthIn, owner_id: str = Depends(require_owner_id), _user: Dict[str, Any] = Depends(require_control_user)):
    return goals_put_month_by_plant(1, month, body, owner_id, _user)


