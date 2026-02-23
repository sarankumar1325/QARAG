"""Simple document storage using PostgreSQL full-text search."""

import json
import re
from typing import Any, Dict, List, Optional

from app.database import execute_sql, fetch_sql, fetchone_sql
from app.models import Source, SourceType
from app.services.document_processor import DocumentChunk


_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "can",
    "could",
    "did",
    "do",
    "does",
    "for",
    "from",
    "get",
    "give",
    "how",
    "i",
    "if",
    "in",
    "is",
    "it",
    "its",
    "me",
    "my",
    "of",
    "on",
    "or",
    "our",
    "please",
    "show",
    "tell",
    "that",
    "the",
    "their",
    "them",
    "this",
    "to",
    "us",
    "was",
    "we",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "you",
    "your",
    "doc",
    "docs",
    "document",
    "documents",
}


class SimpleDocumentStore:
    """Simple document store using PostgreSQL full-text search."""

    def __init__(self):
        self._initialized = False

    async def initialize(self):
        """Initialize database tables."""
        if self._initialized:
            return

        await execute_sql(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                doc_type TEXT NOT NULL,
                source TEXT,
                status TEXT NOT NULL DEFAULT 'processing',
                chunk_count INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """
        )

        await execute_sql(
            """
            CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(doc_id, chunk_index)
            );
        """
        )

        await execute_sql(
            """
            CREATE INDEX IF NOT EXISTS document_chunks_content_idx
            ON document_chunks USING gin(to_tsvector('english', content));
        """
        )

        await execute_sql(
            """
            CREATE INDEX IF NOT EXISTS document_chunks_doc_id_idx
            ON document_chunks(doc_id);
        """
        )

        self._initialized = True
        print("Simple document store initialized")

    async def add_document(
        self,
        doc_id: str,
        filename: str,
        doc_type: str,
        source: Optional[str] = None,
    ) -> bool:
        """Add document metadata."""
        await self.initialize()

        await execute_sql(
            """
            INSERT INTO documents (id, filename, doc_type, source)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                filename = EXCLUDED.filename,
                doc_type = EXCLUDED.doc_type,
                source = EXCLUDED.source,
                updated_at = NOW()
            """,
            doc_id,
            filename,
            doc_type,
            source,
        )
        return True

    async def add_document_chunks(
        self,
        doc_id: str,
        chunks: List[DocumentChunk],
    ) -> bool:
        """Add document chunks WITHOUT embeddings."""
        await self.initialize()

        if not chunks:
            return True

        for chunk in chunks:
            await execute_sql(
                """
                INSERT INTO document_chunks (id, doc_id, chunk_index, content, metadata)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (doc_id, chunk_index) DO UPDATE SET
                    content = EXCLUDED.content,
                    metadata = EXCLUDED.metadata
                """,
                chunk.id,
                doc_id,
                chunk.metadata.get("chunk_index", 0),
                chunk.content,
                json.dumps(chunk.metadata),
            )

        await execute_sql(
            "UPDATE documents SET chunk_count = $1, updated_at = NOW() WHERE id = $2",
            len(chunks),
            doc_id,
        )
        await execute_sql(
            "UPDATE documents SET status = 'completed', updated_at = NOW() WHERE id = $1",
            doc_id,
        )

        return True

    async def search(
        self,
        query: str,
        n_results: int = 5,
        doc_ids: Optional[List[str]] = None,
        score_threshold: float = 0.0,
    ) -> List[Source]:
        """Search chunks using query text and optional thread document filtering."""
        await self.initialize()

        query_text = (query or "").strip()
        query_terms = self._extract_query_terms(query_text)

        print(f"[SEARCH] query: {query_text}")
        print(f"[SEARCH] doc_ids: {doc_ids}")
        print(f"[SEARCH] n_results: {n_results}")
        print(f"[SEARCH] query_terms: {query_terms}")

        rows: List[Dict[str, Any]] = []
        if doc_ids is not None:
            if len(doc_ids) == 0:
                print("[SEARCH] empty doc_ids provided; returning no internal sources")
                return []

            debug_chunks = await fetch_sql(
                """
                SELECT doc_id, COUNT(*) as chunk_count
                FROM document_chunks
                WHERE doc_id = ANY($1::text[])
                GROUP BY doc_id
                """,
                doc_ids,
            )
            print(f"[SEARCH] chunks found: {debug_chunks}")

            rows = await fetch_sql(
                """
                SELECT
                    dc.id,
                    dc.doc_id,
                    dc.chunk_index,
                    dc.content,
                    dc.metadata,
                    d.filename,
                    d.source,
                    CASE
                        WHEN dc.content ILIKE '%' || $1 || '%' THEN 1.0
                        ELSE 0.7
                    END as rank_score
                FROM document_chunks dc
                JOIN documents d ON dc.doc_id = d.id
                WHERE dc.doc_id = ANY($2::text[])
                  AND (
                    dc.content ILIKE '%' || $1 || '%'
                    OR EXISTS (
                        SELECT 1
                        FROM unnest($3::text[]) AS term
                        WHERE dc.content ILIKE '%' || term || '%'
                    )
                  )
                ORDER BY rank_score DESC, dc.chunk_index ASC
                LIMIT $4
                """,
                query_text,
                doc_ids,
                query_terms,
                n_results,
            )

            # Broad prompts ("tell me about this document") often have no lexical overlap.
            # In that case, send first chunks from selected docs so the LLM still has context.
            if not rows:
                print("[SEARCH] no lexical match, using fallback chunks from selected docs")
                rows = await self._fetch_fallback_chunks(doc_ids=doc_ids, n_results=n_results)
        else:
            rows = await fetch_sql(
                """
                SELECT
                    dc.id,
                    dc.doc_id,
                    dc.chunk_index,
                    dc.content,
                    dc.metadata,
                    d.filename,
                    d.source,
                    CASE
                        WHEN dc.content ILIKE '%' || $1 || '%' THEN 1.0
                        ELSE 0.7
                    END as rank_score
                FROM document_chunks dc
                JOIN documents d ON dc.doc_id = d.id
                WHERE dc.content ILIKE '%' || $1 || '%'
                   OR EXISTS (
                       SELECT 1
                       FROM unnest($2::text[]) AS term
                       WHERE dc.content ILIKE '%' || term || '%'
                   )
                ORDER BY rank_score DESC, dc.chunk_index ASC
                LIMIT $3
                """,
                query_text,
                query_terms,
                n_results,
            )

        sources = self._rows_to_sources(rows)
        if score_threshold > 0:
            sources = [s for s in sources if s.relevance_score >= score_threshold]

        print(f"[SEARCH] sources returned: {len(sources)}")
        return sources

    async def _fetch_fallback_chunks(self, doc_ids: List[str], n_results: int) -> List[Dict[str, Any]]:
        """Fetch deterministic chunks from selected docs when lexical matching returns nothing."""
        return await fetch_sql(
            """
            SELECT
                dc.id,
                dc.doc_id,
                dc.chunk_index,
                dc.content,
                dc.metadata,
                d.filename,
                d.source,
                0.45 as rank_score
            FROM document_chunks dc
            JOIN documents d ON dc.doc_id = d.id
            WHERE dc.doc_id = ANY($1::text[])
            ORDER BY dc.doc_id ASC, dc.chunk_index ASC
            LIMIT $2
            """,
            doc_ids,
            n_results,
        )

    def _rows_to_sources(self, rows: List[Dict[str, Any]]) -> List[Source]:
        """Convert DB rows to Source models."""
        sources: List[Source] = []
        for row in rows:
            metadata = row.get("metadata") or {}
            if isinstance(metadata, str):
                try:
                    metadata = json.loads(metadata)
                except json.JSONDecodeError:
                    metadata = {}

            content = row.get("content") or ""
            snippet = content[:500] + "..." if len(content) > 500 else content
            source = Source(
                source_type=SourceType.INTERNAL_DOCUMENT,
                document_id=row.get("doc_id"),
                document_name=row.get("filename") or metadata.get("source", "Unknown"),
                snippet=snippet,
                relevance_score=float(row.get("rank_score", 0.8)),
            )
            sources.append(source)
        return sources

    def _extract_query_terms(self, query: str) -> List[str]:
        """Extract normalized terms used for substring matching."""
        tokens = re.findall(r"[a-z0-9]+", query.lower())
        terms: List[str] = []
        for token in tokens:
            if len(token) < 3 or token in _STOP_WORDS:
                continue
            if token not in terms:
                terms.append(token)
        return terms[:12]

    async def delete_document(self, doc_id: str) -> bool:
        """Delete a document and all its chunks."""
        await execute_sql("DELETE FROM document_chunks WHERE doc_id = $1;", doc_id)
        await execute_sql("DELETE FROM documents WHERE id = $1;", doc_id)
        return True

    async def get_document_count(self) -> int:
        """Get total number of documents."""
        row = await fetchone_sql("SELECT COUNT(*) as count FROM documents;")
        return row["count"] if row else 0

    async def get_chunk_count(self) -> int:
        """Get total number of chunks."""
        row = await fetchone_sql("SELECT COUNT(*) as count FROM document_chunks;")
        return row["count"] if row else 0

    async def list_documents(self) -> List[Dict[str, Any]]:
        """List all documents."""
        rows = await fetch_sql(
            """
            SELECT id, filename, doc_type, source, status, chunk_count, created_at, updated_at
            FROM documents
            ORDER BY created_at DESC;
            """
        )
        return [
            {
                "id": row["id"],
                "filename": row["filename"],
                "doc_type": row["doc_type"],
                "source": row["source"],
                "status": row["status"],
                "chunk_count": row["chunk_count"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }
            for row in rows
        ]


document_store = SimpleDocumentStore()

__all__ = ["document_store", "SimpleDocumentStore"]
