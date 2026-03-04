from __future__ import annotations

from datetime import date, datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from db import get_conn
from auth_dep import require_owner_id

router = APIRouter(prefix="/api/ab", tags=["abastecimento"])


# ---------------- Schemas ----------------
class AssetUpsert(BaseModel):
    asset_tag: str = Field(..., examples=["BT-01"])
    tank_capacity_l: float = Field(..., gt=0)
    consumption_max_lph: float = Field(..., gt=0)
    consumption_factor: float = Field(1.0, gt=0)
    yellow_pct: float = Field(35, ge=0, le=100)
    red_pct: float = Field(20, ge=0, le=100)


class RefuelCreate(BaseModel):
    asset_tag: str = Field(..., examples=["BT-01"])
    day: date
    ts: datetime
    horimetro: Optional[float] = None
    liters_added: float = Field(0, ge=0)
    tank_full: bool = False
    level_after_pct: Optional[float] = Field(None, ge=0, le=100)
    note: Optional[str] = None


# ---------------- Helpers ----------------
def _row_to_dict(cur) -> Optional[Dict[str, Any]]:
    """Converte o resultado do cursor em dict.

    Suporta:
    - cursor padrão (fetchone() -> tuple)
    - cursor Dict/RealDict (fetchone() -> dict-like)
    """
    row = cur.fetchone()
    if not row:
        return None

    # psycopg2.extras.RealDictCursor / DictCursor: row já é dict-like
    if isinstance(row, dict):
        return dict(row)

    cols = [c.name if hasattr(c, "name") else c[0] for c in cur.description]
    return dict(zip(cols, row))


def _rows_to_dicts(cur) -> List[Dict[str, Any]]:
    rows = cur.fetchall()
    if not rows:
        return []

    # Dict/RealDict: rows já é lista de dicts
    if isinstance(rows[0], dict):
        return [dict(r) for r in rows]

    cols = [c.name if hasattr(c, "name") else c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in rows]


# ---------------- Routes ----------------
@router.get("/assets/{asset_tag}")
def get_asset(asset_tag: str, owner_id: str = Depends(require_owner_id)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, owner_id, asset_tag, tank_capacity_l, consumption_max_lph, consumption_factor, yellow_pct, red_pct
                FROM "AB_assets"
                WHERE owner_id = %s AND asset_tag = %s
                LIMIT 1
                """,
                (owner_id, asset_tag),
            )
            row = _row_to_dict(cur)
            return row
    finally:
        conn.close()


@router.put("/assets/{asset_tag}")
def upsert_asset(asset_tag: str, payload: AssetUpsert, owner_id: str = Depends(require_owner_id)):
    if payload.asset_tag != asset_tag:
        raise HTTPException(status_code=400, detail="asset_tag do body deve bater com o da URL.")

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "AB_assets" (owner_id, asset_tag, tank_capacity_l, consumption_max_lph, consumption_factor, yellow_pct, red_pct)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (owner_id, asset_tag)
                DO UPDATE SET
                  tank_capacity_l = EXCLUDED.tank_capacity_l,
                  consumption_max_lph = EXCLUDED.consumption_max_lph,
                  consumption_factor = EXCLUDED.consumption_factor,
                  yellow_pct = EXCLUDED.yellow_pct,
                  red_pct = EXCLUDED.red_pct,
                  updated_at = now()
                RETURNING id, owner_id, asset_tag, tank_capacity_l, consumption_max_lph, consumption_factor, yellow_pct, red_pct
                """,
                (
                    owner_id,
                    payload.asset_tag,
                    payload.tank_capacity_l,
                    payload.consumption_max_lph,
                    payload.consumption_factor,
                    payload.yellow_pct,
                    payload.red_pct,
                ),
            )
            row = _row_to_dict(cur)
            conn.commit()
            return row
    finally:
        conn.close()


@router.get("/refuels")
def list_refuels(
    day: date = Query(...),
    asset: str = Query("BT-01"),
    owner_id: str = Depends(require_owner_id),
):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, owner_id, asset_tag, day, ts, horimetro, liters_added, tank_full, level_after_pct, note
                FROM "AB_refuels"
                WHERE owner_id = %s AND asset_tag = %s AND day = %s
                ORDER BY ts ASC
                """,
                (owner_id, asset, day),
            )
            return _rows_to_dicts(cur)
    finally:
        conn.close()


@router.post("/refuels")
def create_refuel(payload: RefuelCreate, owner_id: str = Depends(require_owner_id)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO "AB_refuels" (owner_id, asset_tag, day, ts, horimetro, liters_added, tank_full, level_after_pct, note)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, owner_id, asset_tag, day, ts, horimetro, liters_added, tank_full, level_after_pct, note
                """,
                (
                    owner_id,
                    payload.asset_tag,
                    payload.day,
                    payload.ts,
                    payload.horimetro,
                    payload.liters_added,
                    payload.tank_full,
                    payload.level_after_pct,
                    payload.note,
                ),
            )
            row = _row_to_dict(cur)
            conn.commit()
            return row
    finally:
        conn.close()
