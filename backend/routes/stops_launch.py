# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/plants/{plant_id}/stops-launch")
def get_stops_launch_by_plant(
    plant_id: int,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    return _get_stops_launch_payload(owner_id=owner_id, day=day, plant_id=plant_id)


@app.put("/api/plants/{plant_id}/stops-launch")
def put_stops_launch_by_plant(
    plant_id: int,
    payload: StopLaunchDayUpsert,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    block_retro(day, x_dev_key, authorization)
    return _put_stops_launch_payload(owner_id=owner_id, day=day, payload=payload, plant_id=plant_id)


@app.get("/api/stops-launch")
def get_stops_launch(
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    # Endpoint legado: usa a primeira/planta padrão para compatibilidade.
    return _get_stops_launch_payload(owner_id=owner_id, day=day, plant_id=None)


@app.put("/api/stops-launch")
def put_stops_launch(
    payload: StopLaunchDayUpsert,
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
    x_dev_key: Optional[str] = Header(default=None, alias="X-Dev-Key"),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    block_retro(day, x_dev_key, authorization)
    # Endpoint legado: salva como Planta 1.
    return _put_stops_launch_payload(owner_id=owner_id, day=day, payload=payload, plant_id=1)


@app.get("/api/aggregate/stops-launch")
def get_aggregate_stops_launch(
    day: date = Query(...),
    owner_id: str = Depends(require_owner_id),
):
    """
    Consolida lançamentos de paradas (bv_launch) de TODAS as plantas no dia.

    Retorna linhas detalhadas para não perder múltiplas paradas no mesmo horário.
    O cálculo de simultaneidade deve ser analisado por planta/period, por isso também
    retorna summaries_by_plant_period.
    """
    ensure_stops_launch_tables()
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select sd.id, sd.obs, sd.plant_id
            from bv_launch.stops_day sd
            where sd.owner_id=%s and sd.day=%s
            order by sd.plant_id asc
            """,
            (owner_id, day),
        )
        day_rows = cur.fetchall() or []

        if not day_rows:
            return {"day": day.isoformat(), "scope": "all", "obs": "", "rows": [], "summaries_by_plant_period": {}}

        day_ids = [r["id"] for r in day_rows]
        plant_by_day_id = {int(r["id"]): int(r.get("plant_id") or 1) for r in day_rows}
        obs_list = [str(r.get("obs") or "").strip() for r in day_rows if str(r.get("obs") or "").strip()]

        cur.execute(
            """
            select day_id, id, period, equipment, stop_type, description, minutes,
                   hora_inicial, hora_final, justificativa_baixa_producao, ordem
            from bv_launch.stops_rows
            where day_id = any(%s)
            order by day_id, period, ordem, id
            """,
            (day_ids,),
        )
        rows = cur.fetchall() or []

    out = []
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        item = _row_to_stops_launch_out(r)
        day_id = int(r["day_id"])
        plant_id = plant_by_day_id.get(day_id, 1)
        item["plant_id"] = plant_id
        out.append(item)
        grouped.setdefault(f"plant_{plant_id}::{item['period']}", []).append(item)

    summaries = {key: _calc_period_overlap_summary(items) for key, items in grouped.items()}

    return {
        "day": day.isoformat(),
        "scope": "all",
        "obs": " | ".join(obs_list),
        "rows": out,
        "summaries_by_plant_period": summaries,
    }


