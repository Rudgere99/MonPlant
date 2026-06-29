# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/stats/month/{month}")
def stats_month(month: str, owner_id: str = Depends(require_owner_id)):
    """
    Retorna estatísticas do mês (meta diária variável + produção + paradas + horímetros).
    month: "YYYY-MM"
    """
    _ensure_goals_table()

    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    # -------- Goals (metas diárias) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day,
                   coalesce(sum(coalesce(meta_ton,0)),0) as meta_ton,
                   coalesce(avg(coalesce(discount_hours,2)),2) as discount_hours
            from public.bv_goals_daily
            where owner_id=%s and day >= %s and day < %s
            group by day
            order by day asc
            """,
            (owner_id, a, b),
        )
        goal_rows = cur.fetchall() or []

    goals_by_day: Dict[str, Dict[str, float]] = {}
    meta_month_ton = 0.0
    programmed_stop_days = 0

    for r in goal_rows:
        d = _col(r, "day", 0)
        meta = float(_col(r, "meta_ton", 1) or 0)
        disc = float(_col(r, "discount_hours", 2) or 0)
        ds = str(d)
        goals_by_day[ds] = {"meta_ton": meta, "discount_hours": disc}
        meta_month_ton += meta
        if meta == 0:
            programmed_stop_days += 1

    # -------- Production rows (por hora) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        prod_rows = cur.fetchall() or []

    # agregações por dia
    day_prod: Dict[str, Dict[str, float]] = {}
    # métricas globais
    produced_month_ton = 0.0
    freq_sum = 0.0
    freq_cnt = 0
    prod_hours_cnt = 0  # quantidade de períodos com ton > 0 (para média t/h simples)
    t1_month = 0.0
    t2_month = 0.0

    for r in prod_rows:
        d = _col(r, "day", 0)
        ds = str(d)
        ton = float(_col(r, "ton", 2) or 0)
        freq = _col(r, "freq", 3)
        period = _col(r, "period", 1)

        if ds not in day_prod:
            day_prod[ds] = {
                "produced_ton": 0.0,
                "t1_ton": 0.0,
                "t2_ton": 0.0,
                "freq_sum": 0.0,
                "freq_cnt": 0,
                "hours_cnt": 0,
            }

        if ton and ton > 0:
            day_prod[ds]["produced_ton"] += ton
            produced_month_ton += ton
            day_prod[ds]["hours_cnt"] += 1
            prod_hours_cnt += 1

            h = _period_start_hour(str(period) if period is not None else "")
            if h is not None:
                t = _turno_by_hour(h)
                if t == 1:
                    day_prod[ds]["t1_ton"] += ton
                    t1_month += ton
                else:
                    day_prod[ds]["t2_ton"] += ton
                    t2_month += ton

        if freq is not None:
            try:
                fv = float(freq)
                if fv > 0:  # ignora 0/None (opcional)
                    day_prod[ds]["freq_sum"] += fv
                    day_prod[ds]["freq_cnt"] += 1
                    freq_sum += fv
                    freq_cnt += 1
            except Exception:
                pass

    produced_days = sum(1 for ds, v in day_prod.items() if (v.get("produced_ton", 0) or 0) > 0)

    # -------- Stops --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, equipamento, tipo_parada, descricao, hora_inicio, tempo_parada_h
            from public.bv_stops
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        stop_rows = cur.fetchall() or []

    stops_by_type: Dict[str, float] = {}
    stops_by_eq: Dict[str, float] = {}
    stops_by_desc: Dict[str, float] = {}
    stops_count_by_period: Dict[str, int] = {}
    maint_days_set = set()

    for r in stop_rows:
        d = _col(r, "day", 0)
        ds = str(d)

        eq = str(_col(r, "equipamento", 1) or "").strip() or "—"
        tp = str(_col(r, "tipo_parada", 2) or "").strip() or "—"
        desc = str(_col(r, "descricao", 3) or "").strip() or "—"
        hora_ini = str(_col(r, "hora_inicio", 4) or "").strip()
        h = float(_col(r, "tempo_parada_h", 5) or 0)

        stops_by_type[tp] = stops_by_type.get(tp, 0.0) + h
        stops_by_eq[eq] = stops_by_eq.get(eq, 0.0) + h
        stops_by_desc[desc] = stops_by_desc.get(desc, 0.0) + h

        # contagem por período HH-HH usando hora_inicio
        try:
            hh = int(hora_ini.split(":")[0]) if hora_ini else None
        except Exception:
            hh = None
        if hh is not None and 0 <= hh <= 23:
            nxt = (hh + 1) % 24
            period = f"{hh:02d}-{nxt:02d}"
            stops_count_by_period[period] = stops_count_by_period.get(period, 0) + 1

        if "manut" in tp.lower():
            # considera dia de manutenção se tiver >= 0.5h no dia (ajustável)
            if h >= 0.5:
                maint_days_set.add(ds)

    maintenance_stop_days = len(maint_days_set)

    # -------- Horímetros (horas trabalhadas) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select equipamento, horimetro_ini, horimetro_fim
            from public.bv_horimetros
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        h_rows = cur.fetchall() or []

    hours_by_eq: Dict[str, float] = {}
    total_work_hours = 0.0

    for r in h_rows:
        eq = str(_col(r, "equipamento", 0) or "").strip() or "—"
        ini = parse_float(_col(r, "horimetro_ini", 1))
        fim = parse_float(_col(r, "horimetro_fim", 2))
        if ini is None or fim is None:
            continue
        delta = max(0.0, float(fim) - float(ini))
        hours_by_eq[eq] = hours_by_eq.get(eq, 0.0) + delta
        total_work_hours += delta

    # -------- KPIs (mês) --------
    attainment_pct = (produced_month_ton / meta_month_ton * 100.0) if meta_month_ton > 0 else (100.0 if produced_month_ton > 0 else 0.0)
    delta_ton = produced_month_ton - meta_month_ton
    delta_pct = (attainment_pct - 100.0) if meta_month_ton > 0 else 0.0

    freq_avg_pct = (freq_sum / freq_cnt) if freq_cnt > 0 else 0.0
    avg_ton_per_hour = (produced_month_ton / prod_hours_cnt) if prod_hours_cnt > 0 else 0.0

    # -------- Series (por dia) --------
    # Lista de todos os dias do mês (para gráfico bonito)
    daily_series = []
    cur_day = a
    while cur_day < b:
        ds = str(cur_day)
        meta = goals_by_day.get(ds, {}).get("meta_ton", 0.0)
        disc = goals_by_day.get(ds, {}).get("discount_hours", 2.0)
        prod = day_prod.get(ds, {})
        produced = float(prod.get("produced_ton", 0.0) or 0.0)
        t1 = float(prod.get("t1_ton", 0.0) or 0.0)
        t2 = float(prod.get("t2_ton", 0.0) or 0.0)
        fcnt = int(prod.get("freq_cnt", 0) or 0)
        fsum = float(prod.get("freq_sum", 0.0) or 0.0)
        freq_day = (fsum / fcnt) if fcnt > 0 else 0.0
        hcnt = int(prod.get("hours_cnt", 0) or 0)
        avg_h = (produced / hcnt) if hcnt > 0 else 0.0

        daily_series.append(
            {
                "day": ds,
                "meta_ton": meta,
                "discount_hours": disc,
                "produced_ton": produced,
                "attainment_pct": (produced / meta * 100.0) if meta > 0 else (100.0 if produced > 0 else 0.0),
                "t1_ton": t1,
                "t2_ton": t2,
                "freq_avg": freq_day,
                "avg_ton_per_hour": avg_h,
            }
        )
        cur_day = cur_day + timedelta(days=1)

    # best / worst (considera apenas dias com meta > 0 ou com produção)
    candidates = [d for d in daily_series if (d["meta_ton"] > 0 or d["produced_ton"] > 0)]
    best_day = None
    worst_day = None
    if candidates:
        best_day = max(candidates, key=lambda x: x["attainment_pct"])
        worst_day = min(candidates, key=lambda x: x["attainment_pct"])

    # stops lists
    by_type_list = [{"type": k, "hours": round(v, 2)} for k, v in sorted(stops_by_type.items(), key=lambda kv: kv[1], reverse=True)]
    by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(stops_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    hours_by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(hours_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        "month": month,
        "meta_month_ton": round(meta_month_ton, 2),
        "produced_month_ton": round(produced_month_ton, 2),
        "attainment_pct": round(attainment_pct, 2),
        "delta_ton": round(delta_ton, 2),
        "delta_pct": round(delta_pct, 2),

        "days": {
            "produced_days": int(produced_days),
            "programmed_stop_days": int(programmed_stop_days),
            "maintenance_stop_days": int(maintenance_stop_days),
        },

        "best_day": best_day,
        "worst_day": worst_day,

        "kpis": {
            "freq_avg_pct": round(freq_avg_pct, 2),
            "avg_ton_per_hour": round(avg_ton_per_hour, 2),
        },

        "shift": {
            "t1_ton": round(t1_month, 2),
            "t2_ton": round(t2_month, 2),
        },

        "stops": {
            "by_type": by_type_list,
            "by_equipment": by_eq_list,
            "by_description": [
                {"description": k, "hours": round(v, 2)}
                for k, v in sorted(stops_by_desc.items(), key=lambda kv: kv[1], reverse=True)
            ],
            "count_by_period": [
                {"period": k, "count": int(v)}
                for k, v in sorted(stops_count_by_period.items(), key=lambda kv: kv[0])
            ],
        },

        "hours_worked": {
            "total_hours": round(total_work_hours, 2),
            "by_equipment": hours_by_eq_list,
        },

        "series": {
            "daily": daily_series,
        },
    }


@app.get("/api/plants/{plant_id}/stats/month/{month}")
def stats_month_by_plant(
    plant_id: int,
    month: str,
    owner_id: str = Depends(require_owner_id)
):
    """
    Estatísticas mensais filtradas por planta.
    """
    _ensure_goals_table()

    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    # -------- Goals (consolidada por owner/dia/planta) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, meta_ton, discount_hours
            from public.bv_goals_daily
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            order by day asc
            """,
            (owner_id, plant_id, a, b),
        )
        goal_rows = cur.fetchall() or []

    goals_by_day: Dict[str, Dict[str, float]] = {}
    meta_month_ton = 0.0
    programmed_stop_days = 0

    for r in goal_rows:
        d = _col(r, "day", 0)
        meta = float(_col(r, "meta_ton", 1) or 0)
        disc = float(_col(r, "discount_hours", 2) or 0)
        ds = str(d)
        goals_by_day[ds] = {"meta_ton": meta, "discount_hours": disc}
        meta_month_ton += meta
        if meta == 0:
            programmed_stop_days += 1

    # -------- Produção por planta --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            """,
            (owner_id, plant_id, a, b),
        )
        prod_rows = cur.fetchall() or []

    day_prod: Dict[str, Dict[str, float]] = {}
    produced_month_ton = 0.0
    freq_sum = 0.0
    freq_cnt = 0
    prod_hours_cnt = 0
    t1_month = 0.0
    t2_month = 0.0

    for r in prod_rows:
        d = _col(r, "day", 0)
        ds = str(d)
        ton = float(_col(r, "ton", 2) or 0)
        freq = _col(r, "freq", 3)
        period = _col(r, "period", 1)

        if ds not in day_prod:
            day_prod[ds] = {
                "produced_ton": 0.0,
                "t1_ton": 0.0,
                "t2_ton": 0.0,
                "freq_sum": 0.0,
                "freq_cnt": 0,
                "hours_cnt": 0,
            }

        if ton and ton > 0:
            day_prod[ds]["produced_ton"] += ton
            produced_month_ton += ton
            day_prod[ds]["hours_cnt"] += 1
            prod_hours_cnt += 1

            h = _period_start_hour(str(period) if period is not None else "")
            if h is not None:
                t = _turno_by_hour(h)
                if t == 1:
                    day_prod[ds]["t1_ton"] += ton
                    t1_month += ton
                else:
                    day_prod[ds]["t2_ton"] += ton
                    t2_month += ton

        if freq is not None:
            try:
                fv = float(freq)
                if fv > 0:
                    day_prod[ds]["freq_sum"] += fv
                    day_prod[ds]["freq_cnt"] += 1
                    freq_sum += fv
                    freq_cnt += 1
            except Exception:
                pass

    produced_days = sum(1 for ds, v in day_prod.items() if (v.get("produced_ton", 0) or 0) > 0)

    # -------- Paradas por planta --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, equipamento, tipo_parada, descricao, hora_inicio, tempo_parada_h
            from public.bv_stops
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            """,
            (owner_id, plant_id, a, b),
        )
        stop_rows = cur.fetchall() or []

    stops_by_type: Dict[str, float] = {}
    stops_by_eq: Dict[str, float] = {}
    stops_by_desc: Dict[str, float] = {}
    stops_count_by_period: Dict[str, int] = {}
    maint_days_set = set()

    for r in stop_rows:
        d = _col(r, "day", 0)
        ds = str(d)

        eq = str(_col(r, "equipamento", 1) or "").strip() or "—"
        tp = str(_col(r, "tipo_parada", 2) or "").strip() or "—"
        desc = str(_col(r, "descricao", 3) or "").strip() or "—"
        hora_ini = str(_col(r, "hora_inicio", 4) or "").strip()
        h = float(_col(r, "tempo_parada_h", 5) or 0)

        stops_by_type[tp] = stops_by_type.get(tp, 0.0) + h
        stops_by_eq[eq] = stops_by_eq.get(eq, 0.0) + h
        stops_by_desc[desc] = stops_by_desc.get(desc, 0.0) + h

        try:
            hh = int(hora_ini.split(":")[0]) if hora_ini else None
        except Exception:
            hh = None
        if hh is not None and 0 <= hh <= 23:
            nxt = (hh + 1) % 24
            period = f"{hh:02d}-{nxt:02d}"
            stops_count_by_period[period] = stops_count_by_period.get(period, 0) + 1

        if "manut" in tp.lower() and h >= 0.5:
            maint_days_set.add(ds)

    maintenance_stop_days = len(maint_days_set)

    # -------- Horímetros por planta --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select equipamento, horimetro_ini, horimetro_fim
            from public.bv_horimetros
            where owner_id=%s and plant_id=%s and day >= %s and day < %s
            """,
            (owner_id, plant_id, a, b),
        )
        h_rows = cur.fetchall() or []

    hours_by_eq: Dict[str, float] = {}
    total_work_hours = 0.0

    for r in h_rows:
        eq = str(_col(r, "equipamento", 0) or "").strip() or "—"
        ini = parse_float(_col(r, "horimetro_ini", 1))
        fim = parse_float(_col(r, "horimetro_fim", 2))
        if ini is None or fim is None:
            continue
        delta = max(0.0, float(fim) - float(ini))
        hours_by_eq[eq] = hours_by_eq.get(eq, 0.0) + delta
        total_work_hours += delta

    attainment_pct = (produced_month_ton / meta_month_ton * 100.0) if meta_month_ton > 0 else (100.0 if produced_month_ton > 0 else 0.0)
    delta_ton = produced_month_ton - meta_month_ton
    delta_pct = (attainment_pct - 100.0) if meta_month_ton > 0 else 0.0
    freq_avg_pct = (freq_sum / freq_cnt) if freq_cnt > 0 else 0.0
    avg_ton_per_hour = (produced_month_ton / prod_hours_cnt) if prod_hours_cnt > 0 else 0.0

    daily_series = []
    cur_day = a
    while cur_day < b:
        ds = str(cur_day)
        meta = goals_by_day.get(ds, {}).get("meta_ton", 0.0)
        disc = goals_by_day.get(ds, {}).get("discount_hours", 2.0)
        prod = day_prod.get(ds, {})
        produced = float(prod.get("produced_ton", 0.0) or 0.0)
        t1 = float(prod.get("t1_ton", 0.0) or 0.0)
        t2 = float(prod.get("t2_ton", 0.0) or 0.0)
        fcnt = int(prod.get("freq_cnt", 0) or 0)
        fsum = float(prod.get("freq_sum", 0.0) or 0.0)
        freq_day = (fsum / fcnt) if fcnt > 0 else 0.0
        hcnt = int(prod.get("hours_cnt", 0) or 0)
        avg_h = (produced / hcnt) if hcnt > 0 else 0.0

        daily_series.append(
            {
                "day": ds,
                "meta_ton": meta,
                "discount_hours": disc,
                "produced_ton": produced,
                "attainment_pct": (produced / meta * 100.0) if meta > 0 else (100.0 if produced > 0 else 0.0),
                "t1_ton": t1,
                "t2_ton": t2,
                "freq_avg": freq_day,
                "avg_ton_per_hour": avg_h,
            }
        )
        cur_day = cur_day + timedelta(days=1)

    candidates = [d for d in daily_series if (d["meta_ton"] > 0 or d["produced_ton"] > 0)]
    best_day = None
    worst_day = None
    if candidates:
        best_day = max(candidates, key=lambda x: x["attainment_pct"])
        worst_day = min(candidates, key=lambda x: x["attainment_pct"])

    by_type_list = [{"type": k, "hours": round(v, 2)} for k, v in sorted(stops_by_type.items(), key=lambda kv: kv[1], reverse=True)]
    by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(stops_by_eq.items(), key=lambda kv: kv[1], reverse=True)]
    hours_by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(hours_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        "month": month,
        "plant_id": plant_id,
        "meta_month_ton": round(meta_month_ton, 2),
        "produced_month_ton": round(produced_month_ton, 2),
        "attainment_pct": round(attainment_pct, 2),
        "delta_ton": round(delta_ton, 2),
        "delta_pct": round(delta_pct, 2),
        "days": {
            "produced_days": int(produced_days),
            "programmed_stop_days": int(programmed_stop_days),
            "maintenance_stop_days": int(maintenance_stop_days),
        },
        "best_day": best_day,
        "worst_day": worst_day,
        "kpis": {
            "freq_avg_pct": round(freq_avg_pct, 2),
            "avg_ton_per_hour": round(avg_ton_per_hour, 2),
        },
        "shift": {
            "t1_ton": round(t1_month, 2),
            "t2_ton": round(t2_month, 2),
        },
        "stops": {
            "by_type": by_type_list,
            "by_equipment": by_eq_list,
            "by_description": [
                {"description": k, "hours": round(v, 2)}
                for k, v in sorted(stops_by_desc.items(), key=lambda kv: kv[1], reverse=True)
            ],
            "count_by_period": [
                {"period": k, "count": int(v)}
                for k, v in sorted(stops_count_by_period.items(), key=lambda kv: kv[0])
            ],
        },
        "hours_worked": {
            "total_hours": round(total_work_hours, 2),
            "by_equipment": hours_by_eq_list,
        },
        "series": {
            "daily": daily_series,
        },
    }


@app.get("/api/aggregate/stats/month/{month}")
def stats_month_aggregate(
    month: str,
    owner_id: str = Depends(require_owner_id)
):
    """
    Estatísticas consolidadas de TODAS as plantas.
    Mantém o formato do endpoint de stats por planta.
    """
    _ensure_goals_table()

    first = _parse_yyyy_mm(month)
    a, b = _month_range(first)

    # -------- Goals (por planta) --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day,
                   coalesce(sum(coalesce(meta_ton,0)),0) as meta_ton,
                   coalesce(avg(coalesce(discount_hours,2)),2) as discount_hours
            from public.bv_goals_daily
            where owner_id=%s and day >= %s and day < %s
            group by day
            order by day asc
            """,
            (owner_id, a, b),
        )
        goal_rows = cur.fetchall() or []

    goals_by_day: Dict[str, Dict[str, float]] = {}
    meta_month_ton = 0.0
    programmed_stop_days = 0

    for r in goal_rows:
        d = _col(r, "day", 0)
        meta = float(_col(r, "meta_ton", 1) or 0)
        disc = float(_col(r, "discount_hours", 2) or 0)
        ds = str(d)
        goals_by_day[ds] = {"meta_ton": meta, "discount_hours": disc}
        meta_month_ton += meta
        if meta == 0:
            programmed_stop_days += 1

    # -------- Produção agregada --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, period,
                   coalesce(sum(coalesce(ton,0)),0) as ton_sum,
                   avg(nullif(freq,0)) as freq_avg
            from public.bv_plant_production_rows
            where owner_id=%s and day >= %s and day < %s
            group by day, period
            """,
            (owner_id, a, b),
        )
        prod_rows = cur.fetchall() or []

    day_prod: Dict[str, Dict[str, float]] = {}
    produced_month_ton = 0.0
    freq_sum = 0.0
    freq_cnt = 0
    prod_hours_cnt = 0
    t1_month = 0.0
    t2_month = 0.0

    for r in prod_rows:
        d = _col(r, "day", 0)
        ds = str(d)
        ton = float(_col(r, "ton_sum", 2) or 0)
        freq = _col(r, "freq_avg", 3)
        period = _col(r, "period", 1)

        if ds not in day_prod:
            day_prod[ds] = {
                "produced_ton": 0.0,
                "t1_ton": 0.0,
                "t2_ton": 0.0,
                "freq_sum": 0.0,
                "freq_cnt": 0,
                "hours_cnt": 0,
            }

        if ton and ton > 0:
            day_prod[ds]["produced_ton"] += ton
            produced_month_ton += ton
            day_prod[ds]["hours_cnt"] += 1
            prod_hours_cnt += 1

            h = _period_start_hour(str(period) if period is not None else "")
            if h is not None:
                t = _turno_by_hour(h)
                if t == 1:
                    day_prod[ds]["t1_ton"] += ton
                    t1_month += ton
                else:
                    day_prod[ds]["t2_ton"] += ton
                    t2_month += ton

        if freq is not None:
            try:
                fv = float(freq)
                if fv > 0:
                    day_prod[ds]["freq_sum"] += fv
                    day_prod[ds]["freq_cnt"] += 1
                    freq_sum += fv
                    freq_cnt += 1
            except Exception:
                pass

    produced_days = sum(1 for ds, v in day_prod.items() if (v.get("produced_ton", 0) or 0) > 0)

    # -------- Paradas agregadas --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, equipamento, tipo_parada, descricao, hora_inicio, tempo_parada_h
            from public.bv_stops
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        stop_rows = cur.fetchall() or []

    stops_by_type: Dict[str, float] = {}
    stops_by_eq: Dict[str, float] = {}
    stops_by_desc: Dict[str, float] = {}
    stops_count_by_period: Dict[str, int] = {}
    maint_days_set = set()

    for r in stop_rows:
        d = _col(r, "day", 0)
        ds = str(d)

        eq = str(_col(r, "equipamento", 1) or "").strip() or "—"
        tp = str(_col(r, "tipo_parada", 2) or "").strip() or "—"
        desc = str(_col(r, "descricao", 3) or "").strip() or "—"
        hora_ini = str(_col(r, "hora_inicio", 4) or "").strip()
        h = float(_col(r, "tempo_parada_h", 5) or 0)

        stops_by_type[tp] = stops_by_type.get(tp, 0.0) + h
        stops_by_eq[eq] = stops_by_eq.get(eq, 0.0) + h
        stops_by_desc[desc] = stops_by_desc.get(desc, 0.0) + h

        try:
            hh = int(hora_ini.split(":")[0]) if hora_ini else None
        except Exception:
            hh = None
        if hh is not None and 0 <= hh <= 23:
            nxt = (hh + 1) % 24
            period = f"{hh:02d}-{nxt:02d}"
            stops_count_by_period[period] = stops_count_by_period.get(period, 0) + 1

        if "manut" in tp.lower() and h >= 0.5:
            maint_days_set.add(ds)

    maintenance_stop_days = len(maint_days_set)

    # -------- Horímetros agregados --------
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select equipamento, horimetro_ini, horimetro_fim
            from public.bv_horimetros
            where owner_id=%s and day >= %s and day < %s
            """,
            (owner_id, a, b),
        )
        h_rows = cur.fetchall() or []

    hours_by_eq: Dict[str, float] = {}
    total_work_hours = 0.0

    for r in h_rows:
        eq = str(_col(r, "equipamento", 0) or "").strip() or "—"
        ini = parse_float(_col(r, "horimetro_ini", 1))
        fim = parse_float(_col(r, "horimetro_fim", 2))
        if ini is None or fim is None:
            continue
        delta = max(0.0, float(fim) - float(ini))
        hours_by_eq[eq] = hours_by_eq.get(eq, 0.0) + delta
        total_work_hours += delta

    attainment_pct = (produced_month_ton / meta_month_ton * 100.0) if meta_month_ton > 0 else (100.0 if produced_month_ton > 0 else 0.0)
    delta_ton = produced_month_ton - meta_month_ton
    delta_pct = (attainment_pct - 100.0) if meta_month_ton > 0 else 0.0

    freq_avg_pct = (freq_sum / freq_cnt) if freq_cnt > 0 else 0.0
    avg_ton_per_hour = (produced_month_ton / prod_hours_cnt) if prod_hours_cnt > 0 else 0.0

    daily_series = []
    cur_day = a
    while cur_day < b:
        ds = str(cur_day)
        meta = goals_by_day.get(ds, {}).get("meta_ton", 0.0)
        disc = goals_by_day.get(ds, {}).get("discount_hours", 2.0)
        prod = day_prod.get(ds, {})
        produced = float(prod.get("produced_ton", 0.0) or 0.0)
        t1 = float(prod.get("t1_ton", 0.0) or 0.0)
        t2 = float(prod.get("t2_ton", 0.0) or 0.0)
        fcnt = int(prod.get("freq_cnt", 0) or 0)
        fsum = float(prod.get("freq_sum", 0.0) or 0.0)
        freq_day = (fsum / fcnt) if fcnt > 0 else 0.0
        hcnt = int(prod.get("hours_cnt", 0) or 0)
        avg_h = (produced / hcnt) if hcnt > 0 else 0.0

        daily_series.append(
            {
                "day": ds,
                "meta_ton": meta,
                "discount_hours": disc,
                "produced_ton": produced,
                "attainment_pct": (produced / meta * 100.0) if meta > 0 else (100.0 if produced > 0 else 0.0),
                "t1_ton": t1,
                "t2_ton": t2,
                "freq_avg": freq_day,
                "avg_ton_per_hour": avg_h,
            }
        )
        cur_day = cur_day + timedelta(days=1)

    candidates = [d for d in daily_series if (d["meta_ton"] > 0 or d["produced_ton"] > 0)]
    best_day = None
    worst_day = None
    if candidates:
        best_day = max(candidates, key=lambda x: x["attainment_pct"])
        worst_day = min(candidates, key=lambda x: x["attainment_pct"])

    by_type_list = [{"type": k, "hours": round(v, 2)} for k, v in sorted(stops_by_type.items(), key=lambda kv: kv[1], reverse=True)]
    by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(stops_by_eq.items(), key=lambda kv: kv[1], reverse=True)]
    hours_by_eq_list = [{"equipment": k, "hours": round(v, 2)} for k, v in sorted(hours_by_eq.items(), key=lambda kv: kv[1], reverse=True)]

    return {
        "month": month,
        "scope": "all",
        "meta_month_ton": round(meta_month_ton, 2),
        "produced_month_ton": round(produced_month_ton, 2),
        "attainment_pct": round(attainment_pct, 2),
        "delta_ton": round(delta_ton, 2),
        "delta_pct": round(delta_pct, 2),
        "days": {
            "produced_days": int(produced_days),
            "programmed_stop_days": int(programmed_stop_days),
            "maintenance_stop_days": int(maintenance_stop_days),
        },
        "best_day": best_day,
        "worst_day": worst_day,
        "kpis": {
            "freq_avg_pct": round(freq_avg_pct, 2),
            "avg_ton_per_hour": round(avg_ton_per_hour, 2),
        },
        "shift": {
            "t1_ton": round(t1_month, 2),
            "t2_ton": round(t2_month, 2),
        },
        "stops": {
            "by_type": by_type_list,
            "by_equipment": by_eq_list,
            "by_description": [
                {"description": k, "hours": round(v, 2)}
                for k, v in sorted(stops_by_desc.items(), key=lambda kv: kv[1], reverse=True)
            ],
            "count_by_period": [
                {"period": k, "count": int(v)}
                for k, v in sorted(stops_count_by_period.items(), key=lambda kv: kv[0])
            ],
        },
        "hours_worked": {
            "total_hours": round(total_work_hours, 2),
            "by_equipment": hours_by_eq_list,
        },
        "series": {
            "daily": daily_series,
        },
    }


