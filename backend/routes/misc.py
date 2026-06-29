# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.options("/{path:path}")
def cors_preflight(path: str):
    # garante resposta 200 no preflight do navegador
    return Response(status_code=200)


