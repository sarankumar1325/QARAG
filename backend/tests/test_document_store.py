"""Tests for document store retrieval behavior."""

import uuid

import pytest

from app.services.document_processor import DocumentChunk
from app.services.document_store import document_store


@pytest.mark.asyncio
async def test_search_uses_fallback_for_generic_query_with_doc_ids():
    """Generic doc questions should still return chunks when doc_ids are provided."""
    doc_id = f"test-doc-{uuid.uuid4()}"
    chunks = [
        DocumentChunk(
            "Alice Johnson is a backend engineer with Python and FastAPI experience.",
            {"chunk_index": 0},
        ),
        DocumentChunk(
            "She has worked on PostgreSQL schema design and API reliability.",
            {"chunk_index": 1},
        ),
    ]

    await document_store.add_document(
        doc_id=doc_id,
        filename="alice_resume.txt",
        doc_type="text",
    )
    await document_store.add_document_chunks(doc_id=doc_id, chunks=chunks)

    try:
        results = await document_store.search(
            query="tell me about this document",
            doc_ids=[doc_id],
            n_results=3,
        )

        assert len(results) > 0
        assert all(source.document_id == doc_id for source in results)
    finally:
        await document_store.delete_document(doc_id)


@pytest.mark.asyncio
async def test_search_matches_multiword_query_tokens():
    """Multi-word prompts should match chunk tokens instead of full query phrase only."""
    doc_id = f"test-doc-{uuid.uuid4()}"
    chunks = [
        DocumentChunk(
            "Python is a programming language widely used for automation.",
            {"chunk_index": 0},
        ),
        DocumentChunk(
            "FastAPI is a modern framework for building APIs.",
            {"chunk_index": 1},
        ),
    ]

    await document_store.add_document(
        doc_id=doc_id,
        filename="python_notes.txt",
        doc_type="text",
    )
    await document_store.add_document_chunks(doc_id=doc_id, chunks=chunks)

    try:
        results = await document_store.search(
            query="what programming language is used",
            doc_ids=[doc_id],
            n_results=3,
        )

        assert len(results) > 0
        assert any("Python" in source.snippet for source in results)
    finally:
        await document_store.delete_document(doc_id)
