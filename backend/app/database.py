import os
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


def normalize_database_url(url: str) -> str:
    """Pin bare postgresql:// URLs to psycopg2, the driver Tribu installs.

    SQLAlchemy 2.1 switched the postgresql:// default to psycopg (v3). URLs
    that already name a driver, and non-PostgreSQL URLs, are left unchanged.
    """
    scheme, sep, rest = url.partition("://")
    if sep and scheme == "postgresql":
        return f"postgresql+psycopg2://{rest}"
    return url


DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required. Set it via environment variable.")

# Recover pooled connections after database restarts before a scheduler tick
# starts its transaction, instead of losing that reminder attempt.
engine = create_engine(normalize_database_url(DATABASE_URL), pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
