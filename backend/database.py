"""SQLAlchemy async database setup for SQLite."""

import os
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from config import DATABASE_URL

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


# SQLite performance pragmas for high-concurrency offline sync writes
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA synchronous=NORMAL;")
    cursor.execute("PRAGMA cache_size=-64000;")  # 64MB cache
    cursor.close()


async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    """Create all tables on startup."""
    from models import team, zone, task, system_event  # noqa: F401 – register models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency that yields a database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
