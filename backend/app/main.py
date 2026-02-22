"""Main FastAPI application"""

from datetime import datetime
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import HealthCheck
from app.routers import documents, chat, chat_stream
from app.database import close_pool
from app.services.document_store import document_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    print("Starting up...")
    # Initialize document store (creates tables if needed)
    await document_store.initialize()
    print("Document store initialized")
    yield
    # Shutdown
    print("Shutting down...")
    await close_pool()
    print("Database connections closed")


# Create FastAPI app
app = FastAPI(
    title="Company Document Chatbot API",
    description="API for answering questions using company documents",
    version="1.0.0",
    lifespan=lifespan,
)

# Get settings
settings = get_settings()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(chat_stream.router)


@app.get("/", response_model=HealthCheck)
async def root():
    """Root endpoint - health check"""
    return HealthCheck(
        status="healthy",
        version="1.0.0",
        timestamp=datetime.utcnow(),
        services={
            "api": "running",
            "document_store": "initialized",
            "document_processor": "ready",
            "database": "connected",
        },
    )


@app.get("/health", response_model=HealthCheck)
async def health_check():
    """Health check endpoint"""
    return HealthCheck(
        status="healthy",
        version="1.0.0",
        timestamp=datetime.utcnow(),
        services={
            "api": "running",
            "document_store": "initialized",
            "document_processor": "ready",
            "database": "connected",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app", host=settings.api_host, port=settings.api_port, reload=True
    )
