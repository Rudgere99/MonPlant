# Rotas extraidas de main.py para modularizar o backend.
from core import *
import core as _core
globals().update({k: v for k, v in vars(_core).items() if not k.startswith("__")})

@app.get("/health")
def health():
    return {"status": "ok", "ts": datetime.utcnow().isoformat()}


