"""Database connection and session management for Neon PostgreSQL"""

import asyncio
import asyncpg
from typing import Optional, List, Union
from app.config import get_settings

settings = get_settings()

# Database connection pool
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the database connection pool"""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=2,
            max_size=10,
            command_timeout=60,
        )
    return _pool


async def close_pool():
    """Close the database connection pool"""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_connection():
    """Get a database connection from the pool"""
    pool = await get_pool()
    return await pool.acquire()


async def release_connection(connection: asyncpg.Connection):
    """Release a connection back to the pool"""
    pool = await get_pool()
    pool.release(connection)


async def execute_sql(query: str, *args) -> str:
    """Execute a SQL query and return the result"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


async def fetch_sql(query: str, *args):
    """Fetch rows from a SQL query"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchone_sql(query: str, *args):
    """Fetch a single row from a SQL query"""
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


__all__ = [
    "get_pool",
    "close_pool",
    "get_connection",
    "release_connection",
    "execute_sql",
    "fetch_sql",
    "fetchone_sql",
    "reset_pool",
]


def reset_pool():
    """Reset the global pool variable (for testing)"""
    global _pool
    _pool = None
