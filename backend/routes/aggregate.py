# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/aggregate/plant-production/{day}")
def get_aggregate_plant_day(
    day: date,
    owner_id: str = Depends(require_owner_id),
):
    """
    Consolida a produção de TODAS as plantas no dia.
    Retorna no mesmo formato da rota de produção diária, somando ton/freq por período.
    """
    periods = [_period_std_from_h(h) for h in range(24)]

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select period,
                   coalesce(sum(coalesce(ton,0)),0) as ton_sum,
                   avg(nullif(freq, 0)) as freq_avg
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s
            group by period
            """,
            (owner_id, day),
        )
        db_rows = cur.fetchall() or []

        cur.execute(
            """
            select string_agg(coalesce(obs,''), ' | ' order by plant_id) as obs_agg,
                   max(updated_at) as updated_at
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s
            """,
            (owner_id, day),
        )
        daily = cur.fetchone()

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
                "ton": float(r["ton_sum"]) if r and r["ton_sum"] is not None else None,
                "freq": float(r["freq_avg"]) if r and r["freq_avg"] is not None else None,
            }
        )

    obs = (daily["obs_agg"] if daily else "") or ""
    updated_at = daily["updated_at"].isoformat() if (daily and daily.get("updated_at")) else None

    return {
        "day": str(day),
        "scope": "all",
        "obs": obs,
        "rows": full_rows,
        "updated_at": updated_at,
    }


@app.get("/api/aggregate/plant-production/last7days")
def get_aggregate_last7days(owner_id: str = Depends(require_owner_id)):
    """
    Consolida os últimos 7 dias somando a produção de todas as plantas.
    """
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


