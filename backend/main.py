"""Entry point da API MonPlant.

A maior parte da logica compartilhada esta em core.py.
As rotas foram separadas em backend/routes/*.py para facilitar manutencao.
"""
from core import app

# Importar os modulos registra as rotas no objeto FastAPI `app`.
import routes.health  # noqa: F401
import routes.auth  # noqa: F401
import routes.dev  # noqa: F401
import routes.plants  # noqa: F401
import routes.supervisores_planta  # noqa: F401
import routes.equipments  # noqa: F401
import routes.plant_production  # noqa: F401
import routes.stops  # noqa: F401
import routes.horimetros  # noqa: F401
import routes.goals  # noqa: F401
import routes.stats  # noqa: F401
import routes.stops_launch  # noqa: F401
import routes.aggregate  # noqa: F401
import routes.notices  # noqa: F401
import routes.misc  # noqa: F401
