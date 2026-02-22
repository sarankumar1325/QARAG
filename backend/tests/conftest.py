"""Test configuration and fixtures - simplified"""

import pytest
import pytest_asyncio
from app.database import get_pool, close_pool, reset_pool


@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_db():
    """Setup database connection pool for tests"""
    # Reset pool state before each test
    reset_pool()
    pool = await get_pool()
    yield
    await close_pool()
    # Reset pool state after each test
    reset_pool()
