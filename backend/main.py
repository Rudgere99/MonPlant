from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from datetime import date, datetime, time
import psycopg
import os

app = FastAPI()

# =====================================================
# CORS
# =====================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# DATABASE
# =====================================================
DATABASE_URL = os.getenv("DATABASE_URL")

def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL não configurada")
    return psycopg.connect(DATABASE_URL)

# =====================================================
# HELPERS
# =====================================================
def today_local():
    return date.today()

def block_retro_day(d: date):
    if d < today_local():
        raise HTTPException(
            status_code=403,
            detail="Dia anterior não pode ser editado."
        )

def combine_date_time(d: str, h: str) -> datetime:
    return datetime.combine(
        date.fromisoformat(d),
        time.fromisoformat(h)
    )

def calc_hours(dt_ini: datetime, dt_fim: datetime) -> float:
    return round((dt_fim - dt_ini).total_seconds() / 3600, 2)

# =====================================================
# HEALTH
# =====================================================
@app.get("/health")
def health():
    return {"status": "ok"}

# =====================================================
# PRODUÇÃO DA PLANTA
# =====================================================
@app.get("/api/plant-production/{day}")
def get_production(day: str, request: Request):
    owner_id = request.headers.get("x-owner-id", "default")

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT rows, observacao
            FROM bv_plant_production_daily
            WHERE owner_id = %s AND day = %s
            """,
            (owner_id, day)
        )
        row = cur.fetchone()

    if not row:
        return {"rows": [], "observacao": ""}

    return {
        "rows": row[0],
        "observacao": row[1]
    }

@app.put("/api/plant-production/{day}")
def save_production(day: str, payload: dict, request: Request):
    owner_id = request.headers.get("x-owner-id", "default")
    d = date.fromisoformat(day)
    block_retro_day(d)

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO bv_plant_production_daily
            (owner_id, day, rows, observacao)
            VALUES (%s,%s,%s,%s)
            ON CONFLICT (owner_id, day)
            DO UPDATE SET
              rows = EXCLUDED.rows,
              observacao = EXCLUDED.observacao
            """,
            (
                owner_id,
                day,
                payload.get("rows", []),
                payload.get("observacao", "")
            )
        )
        conn.commit()

    return {"ok": True}

# =====================================================
# PARADAS
# =====================================================
@app.post("/api/stops")
def create_stop(payload: dict, request: Request):
    owner_id = request.headers.get("x-owner-id", "default")

    day = date.fromisoformat(payload["day"])
    block_retro_day(day)

    dt_ini = combine_date_time(
        payload["data_inicio"],
        payload["hora_inicio"]
    )
    dt_fim = combine_date_time(
        payload["data_fim"],
        payload["hora_fim"]
    )

    if dt_fim <= dt_ini:
        raise HTTPException(400, "Fim deve ser maior que início")

    tempo_h = calc_hours(dt_ini, dt_fim)

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO bv_stops (
                owner_id,
                day,
                turno,
                equipamento,
                tipo_parada,
                atividade,
                descricao,
                data_inicio,
                hora_inicio,
                data_fim,
                hora_fim,
                tempo_parada_h
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
            """,
            (
                owner_id,
                day,
                payload["turno"],
                payload["equipamento"],
                payload["tipo_parada"],
                payload["atividade"],
                payload.get("descricao"),
                payload["data_inicio"],
                payload["hora_inicio"],
                payload["data_fim"],
                payload["hora_fim"],
                tempo_h
            )
        )
        stop_id = cur.fetchone()[0]
        conn.commit()

    return {
        "id": stop_id,
        "tempo_parada_h": tempo_h
    }

# =====================================================
# HORÍMETROS
# =====================================================
@app.post("/api/horimetros")
def create_horimetro(payload: dict, request: Request):
    owner_id = request.headers.get("x-owner-id", "default")

    day = date.fromisoformat(payload["day"])
    block_retro_day(day)

    h_ini = payload["horimetro_ini"]
    h_fim = payload["horimetro_fim"]

    if h_fim < h_ini:
        raise HTTPException(400, "Horímetro final menor que inicial")

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO bv_horimetros (
                owner_id,
                day,
                turno,
                equipamento,
                horimetro_ini,
                horimetro_fim,
                obs
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
            """,
            (
                owner_id,
                day,
                payload["turno"],
                payload["equipamento"],
                h_ini,
                h_fim,
                payload.get("obs")
            )
        )
        hid = cur.fetchone()[0]
        conn.commit()

    return {"id": hid}

@app.get("/api/horimetros/last-by-eq")
def last_horimetros(request: Request):
    owner_id = request.headers.get("x-owner-id", "default")

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT DISTINCT ON (equipamento)
              equipamento,
              horimetro_fim,
              created_at
            FROM bv_horimetros
            WHERE owner_id = %s
            ORDER BY equipamento, created_at DESC
            """,
            (owner_id,)
        )
        rows = cur.fetchall()

    return [
        {
            "equipamento": r[0],
            "horimetro": r[1],
            "created_at": r[2]
        }
        for r in rows
    ]
