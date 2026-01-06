from fastapi import Header, HTTPException

def require_owner_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid token")

    # ✅ AJUSTE AQUI para seu auth real:
    # - se você já tem /auth/verify, replique a lógica interna
    # - ou importe sua função verify_token existente e retorne owner_id
    #
    # Exemplo simples: owner_id = token (NÃO recomendado em produção)
    owner_id = token  # <-- troque por: verify_token(token)["sub"] etc.
    return owner_id
