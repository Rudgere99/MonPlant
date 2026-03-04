# backend/abastecimento.py
from __future__ import annotations

from datetime import date, datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import get_db
from .auth import require_user  # <- use o seu dependency de auth (Bearer) que retorna owner_id

router = APIRouter(prefix="/api/ab", tags=["abastecimento"])


# ---------- Schemas ----------
class AssetUpsert(BaseModel):
    asset_tag: str = Field(..., examples=["BT-01"])
    tank_capacity_l: float = Field(..., gt=0)
    consumption_max_lph: float = Field(..., gt=0)
    consumption_factor: float = Field(1.0, gt=0)
    yellow_pct: float = Field(35, ge=0, le=100)
    red_pct: float = Field(20, ge=0, le=100)


class AssetOut(AssetUpsert):
    id: int


class RefuelCreate(BaseModel):
    asset_tag: str = Field(..., examples=["BT-01"])
    day: date
    ts: datetime
    horimetro: Optional[float] = None
    liters_added: float = Field(0, ge=0)
    tank_full: bool = False
    level_after_pct: Optional[float] = Field(None, ge=0, le=100)
    note: Optional[str] = None


class RefuelOut(RefuelCreate):
    id: int


# ---------- Assets ----------
@router.get("/assets/{asset_tag}", response_model=Optional[AssetOut])
def get_asset(asset_tag: str, db: Session = Depends(get_db), user=Depends(require_user)):
    owner_id = user["owner_id"]
    q = text("""
        SELECT id, owner_id, asset_tag, tank_capacity_l, consumption_max_lph, consumption_factor, yellow_pct, red_pct
        FROM "AB_assets"
        WHERE owner_id = :owner_id AND asset_tag = :asset_tag
        LIMIT 1
    """)
    row = db.execute(q, {"owner_id": owner_id, "asset_tag": asset_tag}).mappings().first()
    return row


@router.put("/assets/{asset_tag}", response_model=AssetOut)
def upsert_asset(asset_tag: str, payload: AssetUpsert, db: Session = Depends(get_db), user=Depends(require_user)):
    owner_id = user["owner_id"]

    if payload.asset_tag != asset_tag:
        raise HTTPException(status_code=400, detail="asset_tag do body deve bater com o da URL.")

    q = text("""
        INSERT INTO "AB_assets" (owner_id, asset_tag, tank_capacity_l, consumption_max_lph, consumption_factor, yellow_pct, red_pct)
        VALUES (:owner_id, :asset_tag, :tank_capacity_l, :consumption_max_lph, :consumption_factor, :yellow_pct, :red_pct)
        ON CONFLICT (owner_id, asset_tag)
        DO UPDATE SET
          tank_capacity_l = EXCLUDED.tank_capacity_l,
          consumption_max_lph = EXCLUDED.consumption_max_lph,
          consumption_factor = EXCLUDED.consumption_factor,
          yellow_pct = EXCLUDED.yellow_pct,
          red_pct = EXCLUDED.red_pct,
          updated_at = now()
        RETURNING id, owner_id, asset_tag, tank_capacity_l, consumption_max_lph, consumption_factor, yellow_pct, red_pct
    """)
    row = db.execute(q, {
        "owner_id": owner_id,
        "asset_tag": payload.asset_tag,
        "tank_capacity_l": payload.tank_capacity_l,
        "consumption_max_lph": payload.consumption_max_lph,
        "consumption_factor": payload.consumption_factor,
        "yellow_pct": payload.yellow_pct,
        "red_pct": payload.red_pct,
    }).mappings().first()
    db.commit()
    return row


# ---------- Refuels ----------
@router.get("/refuels", response_model=List[RefuelOut])
def list_refuels(
    day: date = Query(...),
    asset: str = Query("BT-01"),
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    owner_id = user["owner_id"]
    q = text("""
        SELECT id, owner_id, asset_tag, day, ts, horimetro, liters_added, tank_full, level_after_pct, note
        FROM "AB_refuels"
        WHERE owner_id = :owner_id AND asset_tag = :asset AND day = :day
        ORDER BY ts ASC
    """)
    rows = db.execute(q, {"owner_id": owner_id, "asset": asset, "day": day}).mappings().all()
    return rows


@router.post("/refuels", response_model=RefuelOut)
def create_refuel(payload: RefuelCreate, db: Session = Depends(get_db), user=Depends(require_user)):
    owner_id = user["owner_id"]

    q = text("""
        INSERT INTO "AB_refuels" (owner_id, asset_tag, day, ts, horimetro, liters_added, tank_full, level_after_pct, note)
        VALUES (:owner_id, :asset_tag, :day, :ts, :horimetro, :liters_added, :tank_full, :level_after_pct, :note)
        RETURNING id, owner_id, asset_tag, day, ts, horimetro, liters_added, tank_full, level_after_pct, note
    """)
    row = db.execute(q, {
        "owner_id": owner_id,
        "asset_tag": payload.asset_tag,
        "day": payload.day,
        "ts": payload.ts,
        "horimetro": payload.horimetro,
        "liters_added": payload.liters_added,
        "tank_full": payload.tank_full,
        "level_after_pct": payload.level_after_pct,
        "note": payload.note,
    }).mappings().first()
    db.commit()
    return row
