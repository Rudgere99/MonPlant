import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL não definido no .env")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

def test_connection():
    with engine.connect() as conn:
        return conn.execute(text("SELECT 1")).scalar()
