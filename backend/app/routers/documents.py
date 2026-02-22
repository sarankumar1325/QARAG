"""Documents router - handles document upload, listing, and deletion"""

import uuid
import shutil
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks

from app.models import (
    DocumentResponse,
    DocumentListResponse,
    DocumentStatus,
    DocumentType,
)
from app.services.document_processor import document_processor
from app.services.document_store import document_store
from app.config import get_settings


router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload and process a document file"""
    settings = get_settings()

    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Check file size
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > settings.max_document_size_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {settings.max_document_size_mb}MB, got {file_size_mb:.1f}MB",
        )

    # Generate document ID
    doc_id = str(uuid.uuid4())
    doc_type = document_processor.get_document_type(file.filename)

    print(f"[UPLOAD] doc_id: {doc_id}, filename: {file.filename}, type: {doc_type}")

    # Add document to database
    await document_store.add_document(
        doc_id=doc_id,
        filename=file.filename,
        doc_type=doc_type.value,
    )

    # Create initial document record
    doc_record = DocumentResponse(
        id=doc_id,
        filename=file.filename,
        doc_type=doc_type,
        status=DocumentStatus.PROCESSING,
        chunk_count=0,
        created_at=datetime.utcnow(),
    )

    print(f"[UPLOAD] returning doc_id: {doc_id}")

    # Process document in background
    background_tasks.add_task(
        _process_document_background, doc_id, content, file.filename
    )

    return doc_record


@router.post("/url", response_model=DocumentResponse)
async def add_url_document(
    background_tasks: BackgroundTasks,
    url: str = Form(...),
):
    """Add a website URL as a document"""

    # Validate URL
    if not url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400, detail="Invalid URL. Must start with http:// or https://"
        )

    # Generate document ID
    doc_id = str(uuid.uuid4())

    # Add document to database
    await document_store.add_document(
        doc_id=doc_id,
        filename=url,
        doc_type=DocumentType.HTML.value,
        source=url,
    )

    # Create initial document record
    doc_record = DocumentResponse(
        id=doc_id,
        filename=url,
        doc_type=DocumentType.HTML,
        source=url,
        status=DocumentStatus.PROCESSING,
        chunk_count=0,
        created_at=datetime.utcnow(),
    )

    # Process URL in background
    background_tasks.add_task(_process_url_background, doc_id, url)

    return doc_record


@router.get("/", response_model=DocumentListResponse)
async def list_documents():
    """List all uploaded documents"""
    docs = await document_store.list_documents()

    document_responses = []
    for doc in docs:
        document_responses.append(
            DocumentResponse(
                id=doc["id"],
                filename=doc["filename"],
                doc_type=DocumentType(doc["doc_type"]),
                source=doc.get("source"),
                status=DocumentStatus(doc.get("status", "completed")),
                chunk_count=doc.get("chunk_count", 0),
                created_at=datetime.fromisoformat(doc["created_at"]) if doc.get("created_at") else datetime.utcnow(),
                updated_at=datetime.fromisoformat(doc["updated_at"]) if doc.get("updated_at") else None,
            )
        )

    return DocumentListResponse(documents=document_responses, total=len(document_responses))


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    """Get a specific document by ID"""
    docs = await document_store.list_documents()
    doc = next((d for d in docs if d["id"] == doc_id), None)

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    return DocumentResponse(
        id=doc["id"],
        filename=doc["filename"],
        doc_type=DocumentType(doc["doc_type"]),
        source=doc.get("source"),
        status=DocumentStatus(doc.get("status", "completed")),
        chunk_count=doc.get("chunk_count", 0),
        created_at=datetime.fromisoformat(doc["created_at"]) if doc.get("created_at") else datetime.utcnow(),
        updated_at=datetime.fromisoformat(doc["updated_at"]) if doc.get("updated_at") else None,
    )


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document and its chunks"""
    docs = await document_store.list_documents()
    doc = next((d for d in docs if d["id"] == doc_id), None)

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from vector store (database)
    await document_store.delete_document(doc_id)

    # Delete from file system
    doc_dir = Path("documents") / doc_id
    if doc_dir.exists():
        shutil.rmtree(doc_dir)

    return {"message": "Document deleted successfully", "doc_id": doc_id}


@router.get("/stats/overview")
async def get_stats():
    """Get document statistics"""
    total_docs = await document_store.get_document_count()
    total_chunks = await document_store.get_chunk_count()

    # Get all documents for status breakdown
    docs = await document_store.list_documents()
    status_counts = {}
    for doc in docs:
        status = doc.get("status", "completed")
        status_counts[status] = status_counts.get(status, 0) + 1

    return {
        "total_documents": total_docs,
        "total_chunks": total_chunks,
        "status_breakdown": status_counts,
    }


async def _process_document_background(doc_id: str, content: bytes, filename: str):
    """Background task to process document"""
    from app.database import execute_sql, fetchone_sql
    
    try:
        print(f"[PROCESS] Starting processing for doc_id: {doc_id}")
        
        # Update status to processing (in case it's stuck)
        await execute_sql(
            """UPDATE documents SET status = 'processing', updated_at = NOW() WHERE id = $1""",
            doc_id
        )
        
        # Process file
        status, chunks, error = document_processor.process_file(
            content, filename, doc_id
        )
        print(f"[PROCESS] doc_id: {doc_id}, status: {status}, chunks: {len(chunks) if chunks else 0}, error: {error}")

        # Add to vector store if successful
        if status == DocumentStatus.COMPLETED and chunks:
            await document_store.add_document_chunks(doc_id, chunks)
            print(f"[PROCESS] doc_id: {doc_id} - chunks added successfully")
        else:
            # Update document status to failed
            await execute_sql(
                """
                UPDATE documents
                SET status = $1, updated_at = NOW()
                WHERE id = $2
                """,
                "failed",
                doc_id,
            )
            print(f"[PROCESS] doc_id: {doc_id} - processing failed: {error}")

    except Exception as e:
        # Update document status to failed
        await execute_sql(
            """
            UPDATE documents
            SET status = 'failed', updated_at = NOW()
            WHERE id = $1
            """,
            doc_id,
        )
        print(f"Error processing document {doc_id}: {e}")
    
    # Ensure status is always updated (completed or failed)
    finally:
        # Double-check status is not stuck at processing
        row = await fetchone_sql(
            "SELECT status FROM documents WHERE id = $1",
            doc_id,
        )
        if row and row['status'] == 'processing':
            print(f"[PROCESS] WARNING: doc_id {doc_id} still processing, setting to failed")
            await execute_sql(
                "UPDATE documents SET status = 'failed', updated_at = NOW() WHERE id = $1",
                doc_id,
            )


async def _process_url_background(doc_id: str, url: str):
    """Background task to process URL"""
    try:
        # Process URL
        status, chunks, error = document_processor.process_url(url, doc_id)

        # Add to vector store if successful
        if status == DocumentStatus.COMPLETED and chunks:
            await document_store.add_document_chunks(doc_id, chunks)
        else:
            # Update document status to failed
            from app.database import execute_sql
            await execute_sql(
                """
                UPDATE documents
                SET status = 'failed', updated_at = NOW()
                WHERE id = $1
                """,
                "failed",
                doc_id,
            )

    except Exception as e:
        # Update document status to failed
        from app.database import execute_sql
        await execute_sql(
            """
            UPDATE documents
            SET status = 'failed', updated_at = NOW()
            WHERE id = $1
            """,
            doc_id,
        )
        print(f"Error processing URL {doc_id}: {e}")
