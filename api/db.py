import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

def _db_url():
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        return env_url

    # Vercel: filesystem project read-only, pakai /tmp untuk sqlite
    if os.environ.get("VERCEL") == "1" or os.environ.get("VERCEL"):
        return "sqlite:////tmp/reasoned.db"

    # Lokal
    return "sqlite:///./reasoned.db"

DATABASE_URL = _db_url()

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
