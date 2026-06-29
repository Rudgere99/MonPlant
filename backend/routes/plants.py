# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/api/plants", response_model=List[PlantOut])
def list_plants(owner_id: str = Depends(require_owner_id)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select id, code, name, description, is_active
            from public.bv_plants
            where is_active = true
            order by id asc
            """
        )
        rows = cur.fetchall() or []

    return [
        {
            "id": int(r["id"]),
            "code": r["code"],
            "name": r["name"],
            "description": r["description"],
            "is_active": bool(r["is_active"]),
        }
        for r in rows
    ]


@app.post("/api/plants", response_model=PlantOut)
def create_plant(
    body: PlantCreateIn,
    owner_id: str = Depends(require_owner_id),
    _user: Dict[str, Any] = Depends(require_control_user),
):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into public.bv_plants(code, name, description, is_active)
            values (%s, %s, %s, %s)
            returning id, code, name, description, is_active
            """,
            (body.code.strip(), body.name.strip(), body.description, bool(body.is_active)),
        )
        row = cur.fetchone()
        conn.commit()

    return {
        "id": int(row["id"]),
        "code": row["code"],
        "name": row["name"],
        "description": row["description"],
        "is_active": bool(row["is_active"]),
    }


