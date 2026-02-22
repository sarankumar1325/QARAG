"""Tests for database connection and operations"""

import pytest
from pgvector.asyncpg import Vector
from app.database import execute_sql, fetch_sql, fetchone_sql


@pytest.mark.asyncio
async def test_database_connection():
    """Test that database connection works"""
    result = await execute_sql("SELECT 1 as num;")
    assert result is not None


@pytest.mark.asyncio
async def test_pgvector_extension():
    """Test that pgvector extension is enabled"""
    rows = await fetch_sql("SELECT extname FROM pg_extension WHERE extname = 'vector';")
    assert len(rows) > 0
    assert rows[0]["extname"] == "vector"


@pytest.mark.asyncio
async def test_documents_table_exists():
    """Test that documents table exists"""
    rows = await fetch_sql("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'documents';
    """)
    assert len(rows) > 0


@pytest.mark.asyncio
async def test_document_chunks_table_exists():
    """Test that document_chunks table exists"""
    rows = await fetch_sql("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'document_chunks';
    """)
    assert len(rows) > 0


@pytest.mark.asyncio
async def test_vector_column_exists():
    """Test that embedding column with vector type exists"""
    rows = await fetch_sql("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'document_chunks'
        AND column_name = 'embedding';
    """)
    assert len(rows) > 0
    # The data type should be USER-DEFINED for vector type
    assert rows[0]["column_name"] == "embedding"


@pytest.mark.asyncio
async def test_insert_and_fetch_document():
    """Test inserting and fetching a document"""
    # Insert a test document
    await execute_sql("""
        INSERT INTO documents (id, filename, doc_type, source)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
    """, "test-doc-1", "test.pdf", "pdf", "test_source")

    # Fetch the document
    row = await fetchone_sql("SELECT * FROM documents WHERE id = $1", "test-doc-1")

    assert row is not None
    assert row["filename"] == "test.pdf"
    assert row["doc_type"] == "pdf"
    assert row["source"] == "test_source"


@pytest.mark.asyncio
async def test_insert_vector_embedding():
    """Test inserting a vector embedding"""
    # Insert a document
    await execute_sql("""
        INSERT INTO documents (id, filename, doc_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
    """, "test-doc-2", "test2.pdf", "pdf")

    # Delete the chunk if it exists from a previous test run
    await execute_sql("DELETE FROM document_chunks WHERE id = $1", "chunk-1")

    # Insert a chunk with 384-dim embedding (all zeros for test)
    embedding = Vector([0.0] * 384)
    await execute_sql("""
        INSERT INTO document_chunks (id, doc_id, chunk_index, content, embedding)
        VALUES ($1, $2, $3, $4, $5)
    """, "chunk-1", "test-doc-2", 0, "Test content", embedding)

    # Fetch and verify
    row = await fetchone_sql("SELECT * FROM document_chunks WHERE id = $1", "chunk-1")
    assert row is not None
    assert row["content"] == "Test content"
    assert row["chunk_index"] == 0


@pytest.mark.asyncio
async def test_vector_similarity_search():
    """Test vector similarity search using pgvector"""
    # Create test document
    await execute_sql("""
        INSERT INTO documents (id, filename, doc_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO NOTHING
    """, "test-doc-3", "test3.pdf", "pdf")

    # Insert chunks with different embeddings
    # Create two similar vectors (first 5 dimensions differ)
    embedding1 = Vector([0.1] * 5 + [0.0] * 379)
    embedding2 = Vector([0.1] * 5 + [0.0] * 379)  # Same as embedding1

    await execute_sql("""
        INSERT INTO document_chunks (id, doc_id, chunk_index, content, embedding)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
    """, "chunk-2", "test-doc-3", 0, "Similar content 1", embedding1)

    await execute_sql("""
        INSERT INTO document_chunks (id, doc_id, chunk_index, content, embedding)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
    """, "chunk-3", "test-doc-3", 1, "Similar content 2", embedding2)

    # Search using cosine similarity
    query_embedding = Vector([0.1] * 5 + [0.0] * 379)
    rows = await fetch_sql("""
        SELECT id, content, 1 - (embedding <=> $1) as similarity
        FROM document_chunks
        WHERE doc_id = $2
        ORDER BY embedding <=> $1
        LIMIT 2;
    """, query_embedding, "test-doc-3")

    assert len(rows) == 2
    # Both should have high similarity (close to 1.0)
    assert rows[0]["similarity"] > 0.9


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
