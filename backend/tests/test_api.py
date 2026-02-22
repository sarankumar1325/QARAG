"""Tests for FastAPI endpoints"""

import pytest
import io
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_check():
    """Test health check endpoint"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"
        assert "api" in data["services"]
        assert "database" in data["services"]


@pytest.mark.asyncio
async def test_health_endpoint():
    """Test dedicated health endpoint"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200

        data = response.json()
        assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_list_documents_empty():
    """Test listing documents when empty"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/documents/")
        assert response.status_code == 200

        data = response.json()
        assert "documents" in data
        assert "total" in data
        assert isinstance(data["documents"], list)


@pytest.mark.asyncio
async def test_upload_text_file():
    """Test uploading a text file"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create a test text file
        content = b"This is a test document for upload.\n\nIt has multiple paragraphs.\n\nAnd some more content."

        files = {"file": ("test.txt", io.BytesIO(content), "text/plain")}
        response = await client.post("/documents/upload", files=files)

        assert response.status_code == 200

        data = response.json()
        assert "id" in data
        assert data["filename"] == "test.txt"
        assert data["status"] in ["processing", "completed"]


@pytest.mark.asyncio
async def test_upload_markdown_file():
    """Test uploading a markdown file"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        content = b"""# Test Document

This is a **markdown** file.

## Features

- Feature 1
- Feature 2
- Feature 3
"""

        files = {"file": ("test.md", io.BytesIO(content), "text/markdown")}
        response = await client.post("/documents/upload", files=files)

        assert response.status_code == 200

        data = response.json()
        assert data["filename"] == "test.md"


@pytest.mark.asyncio
async def test_add_url_document():
    """Test adding a URL as a document"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/documents/url",
            data={"url": "https://example.com"}
        )

        # This might fail if the URL is not accessible, but should return 200 or 400
        assert response.status_code in [200, 400]

        if response.status_code == 200:
            data = response.json()
            assert "id" in data
            assert data["doc_type"] == "html"


@pytest.mark.asyncio
async def test_chat_endpoint():
    """Test chat endpoint"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First upload a document to have content
        content = b"Python is a programming language. It was created by Guido van Rossum. Python is widely used for web development, data science, and automation."

        files = {"file": ("python.txt", io.BytesIO(content), "text/plain")}
        upload_response = await client.post("/documents/upload", files=files)

        # Wait a bit for processing
        import asyncio
        await asyncio.sleep(2)

        # Now ask a question
        chat_response = await client.post(
            "/chat/",
            json={
                "message": "What is Python?",
                "include_web_search": False
            }
        )

        assert chat_response.status_code == 200

        data = chat_response.json()
        assert "answer" in data
        assert "sources" in data
        assert "conversation_id" in data
        assert "confidence_score" in data


@pytest.mark.asyncio
async def test_chat_with_web_search():
    """Test chat endpoint with web search enabled"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/chat/",
            json={
                "message": "What is the latest news?",
                "include_web_search": True
            }
        )

        assert response.status_code == 200

        data = response.json()
        assert "answer" in data
        # May or may not have web sources depending on the query


@pytest.mark.asyncio
async def test_get_stats():
    """Test getting document statistics"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/documents/stats/overview")

        assert response.status_code == 200

        data = response.json()
        assert "total_documents" in data
        assert "total_chunks" in data
        assert "status_breakdown" in data


@pytest.mark.asyncio
async def test_list_conversations():
    """Test listing conversations"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/chat/conversations")

        assert response.status_code == 200

        data = response.json()
        assert "conversations" in data
        assert isinstance(data["conversations"], list)


@pytest.mark.asyncio
async def test_invalid_file_upload_no_file():
    """Test uploading without a file should fail"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/documents/upload")

        # Should return 422 (Unprocessable Entity) or 400
        assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_get_nonexistent_document():
    """Test getting a document that doesn't exist"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/documents/nonexistent-id")

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_document():
    """Test deleting a document that doesn't exist"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.delete("/documents/nonexistent-id")

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_nonexistent_conversation():
    """Test getting a conversation that doesn't exist"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/chat/conversations/nonexistent-id")

        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
