"""Tests for document processing service"""

import pytest
from app.services.document_processor import document_processor, DocumentChunk
from app.models import DocumentType, DocumentStatus


@pytest.mark.asyncio
async def test_get_document_type_pdf():
    """Test document type detection for PDF"""
    doc_type = document_processor.get_document_type("test.pdf")
    assert doc_type == DocumentType.PDF

    doc_type = document_processor.get_document_type("test.PDF")
    assert doc_type == DocumentType.PDF


@pytest.mark.asyncio
async def test_get_document_type_docx():
    """Test document type detection for DOCX"""
    doc_type = document_processor.get_document_type("test.docx")
    assert doc_type == DocumentType.DOCX

    doc_type = document_processor.get_document_type("test.doc")
    assert doc_type == DocumentType.DOCX


@pytest.mark.asyncio
async def test_get_document_type_markdown():
    """Test document type detection for Markdown"""
    doc_type = document_processor.get_document_type("test.md")
    assert doc_type == DocumentType.MARKDOWN

    doc_type = document_processor.get_document_type("test.markdown")
    assert doc_type == DocumentType.MARKDOWN


@pytest.mark.asyncio
async def test_get_document_type_text():
    """Test document type detection for plain text"""
    doc_type = document_processor.get_document_type("test.txt")
    assert doc_type == DocumentType.TEXT

    doc_type = document_processor.get_document_type("test.text")
    assert doc_type == DocumentType.TEXT


@pytest.mark.asyncio
async def test_get_document_type_unknown():
    """Test document type detection for unknown types (defaults to TEXT)"""
    doc_type = document_processor.get_document_type("test.unknown")
    assert doc_type == DocumentType.TEXT


@pytest.mark.asyncio
async def test_extract_text_from_markdown():
    """Test extracting text from markdown file"""
    markdown_content = b"""# Test Document

This is a test markdown file.

## Section 1

Some content here.

## Section 2

More content.
"""
    status, chunks, error = document_processor.process_file(
        markdown_content, "test.md", "test-doc-1"
    )

    assert status == DocumentStatus.COMPLETED
    assert error is None
    assert len(chunks) > 0
    assert all(isinstance(chunk, DocumentChunk) for chunk in chunks)
    assert all(chunk.content.strip() for chunk in chunks)


@pytest.mark.asyncio
async def test_extract_text_from_plain_text():
    """Test extracting text from plain text file"""
    text_content = b"""This is a plain text file.

It has multiple lines.

And multiple paragraphs.

This should be chunked properly."""
    status, chunks, error = document_processor.process_file(
        text_content, "test.txt", "test-doc-2"
    )

    assert status == DocumentStatus.COMPLETED
    assert error is None
    assert len(chunks) > 0


@pytest.mark.asyncio
async def test_chunk_metadata():
    """Test that chunks have proper metadata"""
    content = b"Test content for metadata check. " * 100  # Make it long enough to chunk
    status, chunks, error = document_processor.process_file(
        content, "test.txt", "test-doc-3"
    )

    assert status == DocumentStatus.COMPLETED
    assert len(chunks) > 1

    # Check first chunk metadata
    first_chunk = chunks[0]
    assert "doc_id" in first_chunk.metadata
    assert "source" in first_chunk.metadata
    assert "chunk_index" in first_chunk.metadata
    assert "total_chunks" in first_chunk.metadata
    assert first_chunk.metadata["chunk_index"] == 0
    assert first_chunk.metadata["total_chunks"] == len(chunks)


@pytest.mark.asyncio
async def test_url_validation():
    """Test URL validation"""
    assert document_processor._is_valid_url("https://example.com") == True
    assert document_processor._is_valid_url("http://example.com") == True
    assert document_processor._is_valid_url("ftp://example.com") == True
    assert document_processor._is_valid_url("not-a-url") == False
    assert document_processor._is_valid_url("") == False


@pytest.mark.asyncio
async def test_extract_html():
    """Test HTML content extraction"""
    html_content = b"""
    <html>
        <head><title>Test Page</title></head>
        <body>
            <h1>Header</h1>
            <p>Paragraph 1</p>
            <p>Paragraph 2</p>
            <script>alert('ignore me');</script>
        </body>
    </html>
    """
    text = document_processor._extract_html(html_content, "http://test.com")

    assert "Header" in text
    assert "Paragraph 1" in text
    assert "Paragraph 2" in text
    assert "script" not in text.lower() or "alert" not in text


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
