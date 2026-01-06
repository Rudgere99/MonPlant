from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List

from db import get_conn
from auth_dep import require_owner_id

app = FastAPI()

# ---------------------------
# Helpers
# ---------------------------
def today_local() -> date:
    return date.today()

def block_retro(day: date):
    if day < today_local():
        raise HTTPException(status_code=403, detail="Retroativo não pode ser editado")

# ---------------------------
# Schemas
# ---------------------------
class PlantRow(BaseModel):
    period: str
    ton: Optional[float] = None
    freq: Optional[float] = None

class PlantDayUpsert(BaseModel):
    obs: Optional[str] = ""
    rows: List[PlantRow]

class StopIn(BaseModel):
    day: date
    turno: int
    data_inicio: date
    hora_inicio: str  # "HH:MM"
    data_fim: date
    hora_fim: str
    equipamento: str
    tipo_parada: str
    atividade: str
    descricao: Optional[str] = ""
    tempo_parada_h: float

class HoriIn(BaseModel):
    day: date
    turno: int
    equipamento: str
    horimetro: float
    obs: Optional[str] = None

# ---------------------------
# Health
# ---------------------------
@app.get("/health")
def health():
    return {"status": "ok"}

# ---------------------------
# Plant Production
# ---------------------------
@app.get("/api/plant-production/{day}")
def get_plant_day(day: date, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select obs, updated_at
            from public.bv_plant_production_daily
            where owner_id=%s and day=%s
            """,
            (owner_id, day),
        )
        daily = cur.fetchone()

        cur.execute(
            """
            select period, ton, freq
            from public.bv_plant_production_rows
            where owner_id=%s and day=%s
            order by period
            """,
            (owner_id, day),
        )
        rows = [{"period": r[0], "ton": r[1], "freq": r[2]} for r in cur.fetchall()]

        if not daily and not rows:
            # front trata 404 criando layout vazio
            raise HTTPException(status_code=404, detail="Not found")

        obs = daily[0] if daily else ""
        updated_at = daily[1].isoformat() if daily and daily[1] else None

        return {"day": str(day), "obs": obs or "", "rows": rows, "updated_at": updated_at}

@app.put("/api/plant-production/{day}")
def put_plant_day(day: date, body: PlantDayUpsert, owner_id: str = Depends(require_owner_id)):
    block_retro(day)

    with get_conn() as conn, conn.cursor() as cur:
        # upsert header
        cur.execute(
            """
            insert into public.bv_plant_production_daily(owner_id, day, obs)
            values (%s, %s, %s)
            on conflict (owner_id, day)
            do update set obs=excluded.obs, updated_at=now()
            """,
            (owner_id, day, body.obs or ""),
        )

        # upsert rows (24)
        for r in body.rows:
            cur.execute(
                """
                insert into public.bv_plant_production_rows(owner_id, day, period, ton, freq)
                values (%s, %s, %s, %s, %s)
                on conflict (owner_id, day, period)
                do update set ton=excluded.ton, freq=excluded.freq, updated_at=now()
                """,
                (owner_id, day, r.period, r.ton, r.freq),
            )

        return {"ok": True}

@app.get("/api/plant-production/last7days")
def last7days(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select d.day, coalesce(sum(r.ton),0) as total_ton
            from public.bv_plant_production_daily d
            left join public.bv_plant_production_rows r
              on r.owner_id=d.owner_id and r.day=d.day
            where d.owner_id=%s
              and d.day >= (current_date - interval '6 days')
            group by d.day
            order by d.day
            """,
            (owner_id,),
        )
        return [{"day": str(x[0]), "total_ton": float(x[1] or 0)} for x in cur.fetchall()]

# ---------------------------
# Stops
# ---------------------------
@app.post("/api/stops")
def create_stop(body: StopIn, owner_id: str = Depends(require_owner_id)):
    block_retro(body.day)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_stops(
              owner_id, day, turno, data_inicio, hora_inicio, data_fim, hora_fim,
              equipamento, tipo_parada, atividade, descricao, tempo_parada_h
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id, body.day, body.turno, body.data_inicio, body.hora_inicio,
                body.data_fim, body.hora_fim, body.equipamento, body.tipo_parada,
                body.atividade, body.descricao or "", body.tempo_parada_h
            ),
        )
        new_id = cur.fetchone()[0]
        return {"id": new_id}

@app.get("/api/stops")
def list_stops(day: date, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, day, turno, data_inicio, hora_inicio, data_fim, hora_fim,
                   equipamento, tipo_parada, atividade, descricao, tempo_parada_h, created_at
            from public.bv_stops
            where owner_id=%s and day=%s
            order by created_at desc
            """,
            (owner_id, day),
        )
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

@app.get("/api/stops/last")
def last_stop(day: date, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, equipamento, tipo_parada, atividade, tempo_parada_h, created_at
            from public.bv_stops
            where owner_id=%s and day=%s
            order by created_at desc
            limit 1
            """,
            (owner_id, day),
        )
        r = cur.fetchone()
        if not r:
            return None
        return {
            "id": r[0],
            "equipamento": r[1],
            "tipo_parada": r[2],
            "atividade": r[3],
            "tempo_parada_h": float(r[4]),
            "created_at": r[5].isoformat() if r[5] else None
        }

@app.get("/api/stops/total")
def total_stops(day: date, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select coalesce(sum(tempo_parada_h),0)
            from public.bv_stops
            where owner_id=%s and day=%s
            """,
            (owner_id, day),
        )
        v = cur.fetchone()[0]
        return {"day": str(day), "total_h": float(v or 0)}

# ---------------------------
# Horimetros
# ---------------------------
@app.post("/api/horimetros")
def create_hori(body: HoriIn, owner_id: str = Depends(require_owner_id)):
    block_retro(body.day)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_horimetros(owner_id, day, turno, equipamento, horimetro, obs)
            values (%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (owner_id, body.day, body.turno, body.equipamento, body.horimetro, body.obs),
        )
        return {"id": cur.fetchone()[0]}

@app.get("/api/horimetros")
def list_hori(
    day: Optional[date] = None,
    turno: Optional[int] = None,
    equipamento: Optional[str] = None,
    limit: int = Query(default=200, ge=1, le=2000),
    owner_id: str = Depends(require_owner_id),
):
    where = ["owner_id=%s"]
    params = [owner_id]
    if day:
        where.append("day=%s"); params.append(day)
    if turno:
        where.append("turno=%s"); params.append(turno)
    if equipamento:
        where.append("equipamento=%s"); params.append(equipamento)

    sql = f"""
      select id, day, turno, equipamento, horimetro, obs, created_at
      from public.bv_horimetros
      where {" and ".join(where)}
      order by created_at desc
      limit {limit}
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, tuple(params))
        cols = [d.name for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

@app.get("/api/horimetros/last-by-eq")
def last_by_eq(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select distinct on (equipamento)
              equipamento, horimetro, day, turno, created_at
            from public.bv_horimetros
            where owner_id=%s
            order by equipamento, created_at desc
            """,
            (owner_id,),
        )
        return [
            {
                "equipamento": r[0],
                "horimetro": float(r[1]),
                "day": str(r[2]),
                "turno": r[3],
                "created_at": r[4].isoformat() if r[4] else None
            }
            for r in cur.fetchall()
        ]

# ---------------------------
# Dashboard (tempo real)
# ---------------------------
@app.get("/api/dashboard/today")
def dashboard_today(owner_id: str = Depends(require_owner_id)):
    d = today_local()
    with get_conn() as conn, conn.cursor() as cur:
        # produção total do dia
        cur.execute(
            """
            select coalesce(sum(r.ton),0)
            from public.bv_plant_production_rows r
            where r.owner_id=%s and r.day=%s
            """,
            (owner_id, d),
        )
        prod_total = float(cur.fetchone()[0] or 0)

        # última parada
        cur.execute(
            """
            select id, equipamento, tipo_parada, atividade, tempo_parada_h, created_at
            from public.bv_stops
            where owner_id=%s and day=%s
            order by created_at desc
            limit 1
            """,
            (owner_id, d),
        )
        ls = cur.fetchone()
        last_stop = None if not ls else {
            "id": ls[0], "equipamento": ls[1], "tipo_parada": ls[2],
            "atividade": ls[3], "tempo_parada_h": float(ls[4]),
            "created_at": ls[5].isoformat() if ls[5] else None
        }

        # total paradas do dia
        cur.execute(
            "select coalesce(sum(tempo_parada_h),0) from public.bv_stops where owner_id=%s and day=%s",
            (owner_id, d),
        )
        total_stops_h = float(cur.fetchone()[0] or 0)

    return {
        "day": str(d),
        "plant_total_ton": prod_total,
        "last_stop": last_stop,
        "total_stops_h": total_stops_h
    }
