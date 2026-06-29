# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.options("/api/supervisores-planta")
def options_supervisores_planta():
    return Response(status_code=200)


@app.options("/api/supervisores-planta/{supervisor_id}")
def options_supervisor_planta_id(supervisor_id: int):
    return Response(status_code=200)


@app.get("/api/supervisores-planta")
def listar_supervisores_planta(
    plant_id: Optional[int] = Query(None),
    letra_turno: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    somente_ativos: Optional[bool] = Query(None),
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
):
    owner_id = safe_owner_id_from_auth(authorization)
    # Compatibilidade: algumas versões do front chamavam ?somente_ativos=true.
    # O padrão novo é ?include_inactive=false.
    if somente_ativos is not None:
        include_inactive = not bool(somente_ativos)

    ensure_supervisor_planta_tables()
    cols = _supervisor_table_columns()

    # Se a tabela ainda não existe ou a migração não conseguiu criar colunas,
    # não deixa o navegador cair em Failed to fetch/CORS. Retorna lista vazia
    # e o startup/SQL pode corrigir em seguida.
    required = {"id", "nome_completo", "empresa", "plant_id", "letra_turno", "ativo", "created_at", "updated_at"}
    if not required.issubset(cols):
        return []

    has_owner = "owner_id" in cols
    select_owner = "owner_id" if has_owner else "null::text as owner_id"
    where: List[str] = []
    args: List[Any] = []

    if has_owner:
        where.append("owner_id=%s")
        args.append(owner_id)

    if plant_id is not None:
        where.append("coalesce(plant_id, planta_id)=%s")
        args.append(int(plant_id))

    if letra_turno:
        where.append("upper(letra_turno)=upper(%s)")
        args.append(_normalize_letra_turno(letra_turno))

    if not include_inactive:
        where.append("ativo=true")

    where_sql = "where " + " and ".join(where) if where else ""

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                select id, {select_owner} as owner_id, nome_completo, empresa,
                       coalesce(plant_id, planta_id) as plant_id,
                       letra_turno, ativo, created_at, updated_at
                from public.bv_supervisores_planta
                {where_sql}
                order by coalesce(plant_id, planta_id) asc, letra_turno asc, nome_completo asc
                """,
                tuple(args),
            )
            rows = cur.fetchall() or []
    except Exception:
        # Evita quebrar a API e aparecer como CORS no front.
        return []

    return [_supervisor_planta_out(r) for r in rows]


@app.post("/api/supervisores-planta")
def criar_supervisor_planta(
    body: SupervisorPlantaIn,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    owner_id = safe_owner_id_from_auth(authorization)
    ensure_supervisor_planta_tables()

    nome = (body.nome_completo or "").strip()
    empresa = (body.empresa or "").strip()
    plant_id = int(body.plant_id)
    letra = _normalize_letra_turno(body.letra_turno)

    if not nome:
        raise HTTPException(status_code=400, detail="Nome completo é obrigatório")
    if not empresa:
        raise HTTPException(status_code=400, detail="Empresa é obrigatória")
    if plant_id <= 0:
        raise HTTPException(status_code=400, detail="Planta de operação inválida")

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                insert into public.bv_supervisores_planta(
                  owner_id, nome_completo, empresa, plant_id, planta_id, letra_turno, ativo, updated_at
                )
                values (%s,%s,%s,%s,%s,%s,%s,now())
                returning id, owner_id, nome_completo, empresa, coalesce(plant_id, planta_id) as plant_id, letra_turno, ativo, created_at, updated_at
                """,
                (owner_id, nome, empresa, plant_id, plant_id, letra, bool(body.ativo)),
            )
            row = cur.fetchone()
            conn.commit()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Este supervisor já está cadastrado para esta planta e letra")
        raise

    log_action(
        action="CREATE_SUPERVISOR_PLANTA",
        request=request,
        user_id=user_id,
        entity="bv_supervisores_planta",
        entity_id=str(row["id"]),
        payload={"owner_id": owner_id, "plant_id": plant_id, "letra_turno": letra, "nome_completo": nome},
    )

    return {"ok": True, **_supervisor_planta_out(row)}


@app.put("/api/supervisores-planta/{supervisor_id}")
def atualizar_supervisor_planta(
    supervisor_id: int,
    body: SupervisorPlantaIn,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    return alterar_supervisor_planta(supervisor_id, SupervisorPlantaUpdateIn(**body.model_dump()), request, authorization)


@app.patch("/api/supervisores-planta/{supervisor_id}")
def alterar_supervisor_planta(
    supervisor_id: int,
    body: SupervisorPlantaUpdateIn,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    owner_id = safe_owner_id_from_auth(authorization)
    ensure_supervisor_planta_tables()

    fields = []
    values: List[Any] = []

    if body.nome_completo is not None:
        nome = (body.nome_completo or "").strip()
        if not nome:
            raise HTTPException(status_code=400, detail="Nome completo é obrigatório")
        fields.append("nome_completo=%s")
        values.append(nome)

    if body.empresa is not None:
        empresa = (body.empresa or "").strip()
        if not empresa:
            raise HTTPException(status_code=400, detail="Empresa é obrigatória")
        fields.append("empresa=%s")
        values.append(empresa)

    if body.plant_id is not None:
        plant_id = int(body.plant_id)
        if plant_id <= 0:
            raise HTTPException(status_code=400, detail="Planta de operação inválida")
        fields.append("plant_id=%s")
        values.append(plant_id)
        fields.append("planta_id=%s")
        values.append(plant_id)

    if body.letra_turno is not None:
        fields.append("letra_turno=%s")
        values.append(_normalize_letra_turno(body.letra_turno))

    if body.ativo is not None:
        fields.append("ativo=%s")
        values.append(bool(body.ativo))

    if not fields:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    fields.append("updated_at=now()")
    values.extend([owner_id, int(supervisor_id)])

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(
                f"""
                update public.bv_supervisores_planta
                set {', '.join(fields)}
                where owner_id=%s and id=%s
                returning id, owner_id, nome_completo, empresa, coalesce(plant_id, planta_id) as plant_id, letra_turno, ativo, created_at, updated_at
                """,
                tuple(values),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Supervisor não encontrado")
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg:
            raise HTTPException(status_code=400, detail="Este supervisor já está cadastrado para esta planta e letra")
        raise

    log_action(
        action="UPDATE_SUPERVISOR_PLANTA",
        request=request,
        user_id=user_id,
        entity="bv_supervisores_planta",
        entity_id=str(supervisor_id),
        payload=body.model_dump(exclude_none=True),
    )

    return {"ok": True, **_supervisor_planta_out(row)}


@app.delete("/api/supervisores-planta/{supervisor_id}")
def remover_supervisor_planta(
    supervisor_id: int,
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    """Inativa o cadastro para preservar histórico."""
    owner_id = safe_owner_id_from_auth(authorization)
    ensure_supervisor_planta_tables()

    user_payload = get_optional_user(authorization)
    user_id = user_payload.get("uid") if user_payload else None

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            update public.bv_supervisores_planta
            set ativo=false, updated_at=now()
            where owner_id=%s and id=%s
            returning id, owner_id, nome_completo, empresa, coalesce(plant_id, planta_id) as plant_id, letra_turno, ativo, created_at, updated_at
            """,
            (owner_id, supervisor_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Supervisor não encontrado")
        conn.commit()

    log_action(
        action="DELETE_SUPERVISOR_PLANTA",
        request=request,
        user_id=user_id,
        entity="bv_supervisores_planta",
        entity_id=str(supervisor_id),
        payload={"owner_id": owner_id, "soft_delete": True},
    )

    return {"ok": True, **_supervisor_planta_out(row)}


