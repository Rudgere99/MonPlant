from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import date, datetime
from typing import Optional, List
from zoneinfo import ZoneInfo

from db import get_conn
from auth_dep import require_owner_id

app = FastAPI(title="MonPlant API", version="1.0.0")

# =========================
# CORS (resolve "Failed to fetch")
# IMPORTANTE:
# - NÃO pode usar allow_credentials=True com allow_origins=["*"] no browser
# - Isso costuma virar "Failed to fetch" (CORS bloqueado)
# =========================
ALLOWED_ORIGINS = ["*"]  # depois você trava na URL do Vercel (ex: ["https://seuapp.vercel.app"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # <<< MUITO IMPORTANTE
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Helpers
# =========================
BR_TZ = ZoneInfo("America/Sao_Paulo")

def today_local() -> date:
    return datetime.now(BR_TZ).date()

def block_retro(d: date):
    # Só bloqueia se for dia ANTERIOR ao hoje no Brasil
    if d < today_local():
        raise HTTPException(status_code=403, detail="Dia anterior não pode ser editado.")

def parse_float(v):
    if v is None:
        return None
    try:
        return float(v)
    except Exception:
        return None

# =========================
# Schemas
# =========================
class PlantRow(BaseModel):
    period: str
    ton: Optional[float] = None
    freq: Optional[float] = None

class PlantDayUpsert(BaseModel):
    obs: Optional[str] = ""
    rows: List[PlantRow] = Field(default_factory=list)

class StopIn(BaseModel):
    day: date
    data_inicio: str
    hora_inicio: str
    data_fim: str
    hora_fim: str
    equipamento: str
    tipo_parada: str
    atividade: str
    descricao: str
    tempo_parada_h: float

class HorimetroIn(BaseModel):
    day: date
    turno: int  # 1|2
    equipamento: str
    horimetro_ini: float
    horimetro_fim: float
    obs: Optional[str] = None

# =========================
# Health
# =========================
@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}

# =========================
# Plant Production
# =========================
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
        rows = cur.fetchall() or []

    if not daily and not rows:
        raise HTTPException(status_code=404, detail="Not found")

    return {
        "day": str(day),
        "obs": (daily["obs"] if daily else "") or "",
        "updated_at": daily["updated_at"].isoformat() if daily and daily.get("updated_at") else None,
        "rows": [
            {
                "period": r["period"],
                "ton": parse_float(r["ton"]),
                "freq": parse_float(r["freq"]),
            }
            for r in rows
        ],
    }

@app.put("/api/plant-production/{day}")
def put_plant_day(day: date, body: PlantDayUpsert, owner_id: str = Depends(require_owner_id)):
    block_retro(day)

    with get_conn() as conn, conn.cursor() as cur:
        # upsert daily
        cur.execute(
            """
            insert into public.bv_plant_production_daily(owner_id, day, obs)
            values (%s,%s,%s)
            on conflict (owner_id, day)
            do update set obs=excluded.obs, updated_at=now()
            """,
            (owner_id, day, body.obs or ""),
        )

        # limpa rows e recria
        cur.execute(
            """
            delete from public.bv_plant_production_rows
            where owner_id=%s and day=%s
            """,
            (owner_id, day),
        )

        if body.rows:
            cur.executemany(
                """
                insert into public.bv_plant_production_rows(owner_id, day, period, ton, freq)
                values (%s,%s,%s,%s,%s)
                """,
                [
                    (
                        owner_id,
                        day,
                        r.period,
                        r.ton,
                        r.freq,
                    )
                    for r in body.rows
                ],
            )

        conn.commit()

    return {"ok": True}

@app.get("/api/plant-production/last7days")
def last7days(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, coalesce(sum(ton),0) as total_ton
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

# =========================
# Stops
# =========================
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
def create_stop(body: StopIn, owner_id: str = Depends(require_owner_id)):
    block_retro(body.day)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_stops(
              owner_id, day, data_inicio, hora_inicio, data_fim, hora_fim,
              equipamento, tipo_parada, atividade, descricao, tempo_parada_h
            )
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            returning id
            """,
            (
                owner_id,
                body.day,
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

    return {"ok": True, "id": new_id}

@app.delete("/api/stops/{id}")
def delete_stop(id: int, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            delete from public.bv_stops
            where owner_id=%s and id=%s
            """,
            (owner_id, id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Not found")
        conn.commit()
    return {"ok": True, "id": id}

# =========================
# Horimetros (INI/FIM)
# =========================
@app.post("/api/horimetros")
def create_horimetro(body: HorimetroIn, owner_id: str = Depends(require_owner_id)):
    block_retro(body.day)

    if body.horimetro_fim < body.horimetro_ini:
        raise HTTPException(status_code=400, detail="horimetro_fim deve ser >= horimetro_ini")

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

    return {"ok": True, "id": new_id}

@app.get("/api/horimetros")
def list_horimetros(
    day: Optional[date] = None,
    turno: Optional[int] = None,
    equipamento: Optional[str] = None,
    limit: int = Query(200, ge=1, le=2000),
    owner_id: str = Depends(require_owner_id),
):
    q = """
        select *
        from public.bv_horimetros
        where owner_id=%s
    """
    params = [owner_id]

    if day is not None:
        q += " and day=%s"
        params.append(day)

    if turno is not None:
        q += " and turno=%s"
        params.append(int(turno))

    if equipamento:
        q += " and equipamento=%s"
        params.append(equipamento)

    q += " order by created_at desc limit %s"
    params.append(limit)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(q, tuple(params))
        rows = cur.fetchall() or []

    return rows

@app.delete("/api/horimetros/{id}")
def delete_horimetro(id: int, owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            delete from public.bv_horimetros
            where owner_id=%s and id=%s
            """,
            (owner_id, id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Not found")
        conn.commit()
    return {"ok": True, "id": id}

@app.get("/api/horimetros/last-by-eq")
def last_by_eq(owner_id: str = Depends(require_owner_id)):
    # pega o último registro (final) por equipamento
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
