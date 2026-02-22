from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
from enum import Enum


class DocumentType(str, Enum):
    """Supported document types"""

    PDF = "pdf"
    DOCX = "docx"
    MARKDOWN = "markdown"
    TEXT = "text"
    HTML = "html"


class DocumentStatus(str, Enum):
    """Document processing status"""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentBase(BaseModel):
    """Base document model"""

    filename: str
    doc_type: DocumentType
    source: Optional[str] = None


class DocumentCreate(DocumentBase):
    """Document creation model"""

    pass


class DocumentResponse(DocumentBase):
    """Document response model"""

    id: str
    status: DocumentStatus
    chunk_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """List of documents response"""

    documents: List[DocumentResponse]
    total: int


class SourceType(str, Enum):
    """Source of the information"""

    INTERNAL_DOCUMENT = "internal_document"
    WEB_SEARCH = "web_search"


class Source(BaseModel):
    """Source information for an answer"""

    source_type: SourceType
    document_id: Optional[str] = None
    document_name: Optional[str] = None
    url: Optional[str] = None
    snippet: str
    relevance_score: float


class ChatMessage(BaseModel):
    """Chat message model"""

    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    """Chat request model"""

    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    max_internal_sources: int = 5
    max_web_sources: int = 3
    force_web_search: bool = False
    doc_ids: Optional[List[str]] = None  # Only search documents uploaded to THIS thread


class ChatResponse(BaseModel):
    """Chat response model"""

    answer: str
    sources: List[Source]
    conversation_id: str
    confidence_score: float
    processing_time_ms: int


class HealthCheck(BaseModel):
    """Health check response"""

    status: str
    version: str = "1.0.0"
    timestamp: datetime
    services: dict
