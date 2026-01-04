import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

IS_VERCEL = bool(os.environ.get("VERCEL"))

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    # Lokal pakai file biasa
    if IS_VERCEL:
        DB_URL = "sqlite:////tmp/reasoned.db"   # ✅ writable di serverless
    else:
        DB_URL = "sqlite:///./reasoned.db"

connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}
engine = create_engine(DB_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
