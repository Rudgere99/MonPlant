# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/equipments")
def list_equipments(
    include_inactive: bool = Query(False),
    owner_id: str = Depends(require_owner_id),
):
    where = "where owner_id=%s"
    args: List[Any] = [owner_id]
    if not include_inactive:
        where += " and is_active=true"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, owner_id, equipment_type, tag, bucket_ton, is_active, created_at, updated_at
            from public.bv_equipments
            {where}
            order by is_active desc, tag asc
            """,
            tuple(args),
        )
        rows = cur.fetchall() or []

    return [_equipment_out(r) for r in rows]


@app.post("/api/equipments")
def create_equipment(
    body: EquipmentIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    tag = (body.tag or "").strip().upper()
    if not tag:
        raise HTTPException(status_code=400, detail="TAG é obrigatória")

    equipment_type = (body.equipment_type or "escavadeira").strip().lower() or "escavadeira"
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_equipments(owner_id, equipment_type, tag, bucket_ton, is_active, updated_at)
                values (%s,%s,%s,%s,%s,now())
                returning id, owner_id, equipment_type, tag, bucket_ton, is_active, created_at, updated_at
                """,
                (owner_id, equipment_type, tag, float(body.bucket_ton or 0), bool(body.is_active)),
            )
            row = cur.fetchone()
            conn.commit()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG")
        raise

    log_action(
        action="CREATE_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_equipments",
        entity_id=str(row["id"]),
        payload={"owner_id": owner_id, "tag": tag, "bucket_ton": float(body.bucket_ton or 0)},
    )
    return _equipment_out(row)


@app.put("/api/equipments/{equipment_id}")
def update_equipment(
    equipment_id: int,
    body: EquipmentUpdateIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    fields = []
    values: List[Any] = []

    if body.equipment_type is not None:
        fields.append("equipment_type=%s")
        values.append((body.equipment_type or "escavadeira").strip().lower() or "escavadeira")
    if body.tag is not None:
        tag = (body.tag or "").strip().upper()
        if not tag:
            raise HTTPException(status_code=400, detail="TAG é obrigatória")
        fields.append("tag=%s")
        values.append(tag)
    if body.bucket_ton is not None:
        fields.append("bucket_ton=%s")
        values.append(float(body.bucket_ton or 0))
    if body.is_active is not None:
        fields.append("is_active=%s")
        values.append(bool(body.is_active))

    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    fields.append("updated_at=now()")
    values.extend([owner_id, equipment_id])

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                update public.bv_equipments
                set {', '.join(fields)}
                where owner_id=%s and id=%s
                returning id, owner_id, equipment_type, tag, bucket_ton, is_active, created_at, updated_at
                """,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Equipamento não encontrado")
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG")
        raise

    log_action(
        action="UPDATE_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_equipments",
        entity_id=str(equipment_id),
        payload=body.model_dump(exclude_none=True),
    )
    return _equipment_out(row)


@app.delete("/api/equipments/{equipment_id}")
def delete_equipment(
    equipment_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    """Inativa o equipamento para preservar histórico e não quebrar alocações antigas."""
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_equipments
            set is_active=false, updated_at=now()
            where owner_id=%s and id=%s
            returning id
            """,
            (owner_id, equipment_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Equipamento não encontrado")

        # Desativa vínculos ativos desse equipamento.
        cur.execute(
            """
            update public.bv_plant_equipment_allocations
            set is_active=false, updated_at=now()
            where owner_id=%s and equipment_id=%s and is_active=true
            """,
            (owner_id, equipment_id),
        )
        conn.commit()

    log_action(
        action="DELETE_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_equipments",
        entity_id=str(equipment_id),
        payload={"owner_id": owner_id, "soft_delete": True},
    )
    return {"ok": True, "id": equipment_id, "is_active": False}


@app.get("/api/plants/{plant_id}/equipment-allocation")
def get_equipment_allocation(
    plant_id: int,
    owner_id: str = Depends(require_owner_id),
):
    plant_id = _validate_plant_id(plant_id)
    return _get_equipment_allocation(owner_id, plant_id)


@app.put("/api/plants/{plant_id}/equipment-allocation")
def put_equipment_allocation(
    plant_id: int,
    body: EquipmentAllocationIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    plant_id = _validate_plant_id(plant_id)
    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    if body.equipment_id is None:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                update public.bv_plant_equipment_allocations
                set is_active=false, updated_at=now()
                where owner_id=%s and plant_id=%s and is_active=true
                """,
                (owner_id, plant_id),
            )
            conn.commit()
        log_action(
            action="REMOVE_PLANT_EQUIPMENT_ALLOCATION",
            request=request,
            user_id=user_id,
            entity="bv_plant_equipment_allocations",
            entity_id=f"plant::{plant_id}",
            payload={"owner_id": owner_id, "plant_id": plant_id},
        )
        return {"ok": True, **_get_equipment_allocation(owner_id, plant_id)}

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id
            from public.bv_equipments
            where owner_id=%s and id=%s and is_active=true
            """,
            (owner_id, body.equipment_id),
        )
        if not cur.fetchone():
            raise HTTPException(status_code=400, detail="Equipamento ativo não encontrado")

        cur.execute(
            """
            insert into public.bv_plant_equipment_allocations(owner_id, plant_id, equipment_id, is_active, updated_at)
            values (%s,%s,%s,true,now())
            on conflict (owner_id, plant_id)
            do update set equipment_id=excluded.equipment_id, is_active=true, updated_at=now()
            returning id
            """,
            (owner_id, plant_id, body.equipment_id),
        )
        allocation_id = cur.fetchone()["id"]
        conn.commit()

    log_action(
        action="SET_PLANT_EQUIPMENT_ALLOCATION",
        request=request,
        user_id=user_id,
        entity="bv_plant_equipment_allocations",
        entity_id=str(allocation_id),
        payload={"owner_id": owner_id, "plant_id": plant_id, "equipment_id": body.equipment_id},
    )
    return {"ok": True, **_get_equipment_allocation(owner_id, plant_id)}


@app.get("/api/plants/{plant_id}/rhythm-equipment")
def get_rhythm_equipment(
    plant_id: int,
    owner_id: str = Depends(require_owner_id),
):
    """Endpoint dedicado ao Ritmo: retorna a escavadeira vinculada à planta e sua t/conchada."""
    plant_id = _validate_plant_id(plant_id)
    return _get_equipment_allocation(owner_id, plant_id)


@app.get("/api/plants/{plant_id}/plant-production-equipments")
def list_plant_production_equipments_by_plant(
    plant_id: int,
    include_inactive: bool = Query(False),
    owner_id: str = Depends(require_owner_id),
):
    """Lista TAGs de equipamentos cadastrados para uso em Produção de Planta/Paradas Minutos."""
    plant_id = _validate_plant_id(plant_id)
    ensure_plant_production_equipment_tables()

    args: List[Any] = [owner_id, plant_id]
    where = "where owner_id=%s and plant_id=%s"
    if not include_inactive:
        where += " and is_active=true"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
            from public.bv_plant_production_equipments
            {where}
            order by is_active desc, tag asc
            """,
            tuple(args),
        )
        rows = cur.fetchall() or []

    return [_plant_production_equipment_out(r) for r in rows]


@app.get("/api/plant-production-equipments")
def list_plant_production_equipments(
    plant_id: Optional[int] = Query(None),
    include_inactive: bool = Query(False),
    owner_id: str = Depends(require_owner_id),
):
    """Lista os equipamentos da produção de planta. Pode filtrar por plant_id."""
    ensure_plant_production_equipment_tables()

    where = "where owner_id=%s"
    args: List[Any] = [owner_id]

    if plant_id is not None:
        plant_id = _validate_plant_id(plant_id)
        where += " and plant_id=%s"
        args.append(int(plant_id))

    if not include_inactive:
        where += " and is_active=true"

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            select id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
            from public.bv_plant_production_equipments
            {where}
            order by plant_id asc, is_active desc, tag asc
            """,
            tuple(args),
        )
        rows = cur.fetchall() or []

    return [_plant_production_equipment_out(r) for r in rows]


@app.post("/api/plant-production-equipments")
def create_plant_production_equipment(
    body: PlantProductionEquipmentIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    """Cria TAG de equipamento vinculado a uma planta."""
    ensure_plant_production_equipment_tables()

    plant_id = _validate_plant_id(body.plant_id)
    tag = (body.tag or "").strip().upper()
    description = (body.description or "").strip() or None

    if not tag:
        raise HTTPException(status_code=400, detail="TAG é obrigatória")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_plant_production_equipments(
                    owner_id, plant_id, tag, description, is_active, updated_at
                )
                values (%s,%s,%s,%s,%s,now())
                returning id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
                """,
                (owner_id, plant_id, tag, description, bool(body.is_active)),
            )
            row = cur.fetchone()
            conn.commit()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG para esta planta")
        raise

    log_action(
        action="CREATE_PLANT_PRODUCTION_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_equipments",
        entity_id=str(row["id"]),
        payload={"owner_id": owner_id, "plant_id": plant_id, "tag": tag},
    )

    return {"ok": True, **_plant_production_equipment_out(row)}


@app.put("/api/plant-production-equipments/{equipment_id}")
def update_plant_production_equipment(
    equipment_id: int,
    body: PlantProductionEquipmentUpdateIn,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    """Atualiza TAG/planta/descrição/status do equipamento de produção de planta."""
    ensure_plant_production_equipment_tables()

    fields = []
    values: List[Any] = []

    if body.plant_id is not None:
        plant_id = _validate_plant_id(body.plant_id)
        fields.append("plant_id=%s")
        values.append(plant_id)

    if body.tag is not None:
        tag = (body.tag or "").strip().upper()
        if not tag:
            raise HTTPException(status_code=400, detail="TAG é obrigatória")
        fields.append("tag=%s")
        values.append(tag)

    if body.description is not None:
        description = (body.description or "").strip() or None
        fields.append("description=%s")
        values.append(description)

    if body.is_active is not None:
        fields.append("is_active=%s")
        values.append(bool(body.is_active))

    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    fields.append("updated_at=now()")
    values.extend([owner_id, int(equipment_id)])

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                update public.bv_plant_production_equipments
                set {', '.join(fields)}
                where owner_id=%s and id=%s
                returning id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
                """,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Equipamento não encontrado")
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Já existe equipamento com esta TAG para esta planta")
        raise

    log_action(
        action="UPDATE_PLANT_PRODUCTION_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_equipments",
        entity_id=str(equipment_id),
        payload=body.model_dump(exclude_none=True),
    )

    return {"ok": True, **_plant_production_equipment_out(row)}


@app.delete("/api/plant-production-equipments/{equipment_id}")
def delete_plant_production_equipment(
    equipment_id: int,
    request: Request,
    owner_id: str = Depends(require_owner_id),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    """Inativa o equipamento para preservar histórico."""
    ensure_plant_production_equipment_tables()

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_plant_production_equipments
            set is_active=false, updated_at=now()
            where owner_id=%s and id=%s
            returning id, owner_id, plant_id, tag, description, is_active, created_at, updated_at
            """,
            (owner_id, int(equipment_id)),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Equipamento não encontrado")
        conn.commit()

    log_action(
        action="DELETE_PLANT_PRODUCTION_EQUIPMENT",
        request=request,
        user_id=user_id,
        entity="bv_plant_production_equipments",
        entity_id=str(equipment_id),
        payload={"owner_id": owner_id, "soft_delete": True},
    )

    return {"ok": True, **_plant_production_equipment_out(row)}


