from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # API Keys
    groq_api_key: str
    tavily_api_key: str

    # Database
    database_url: str

    # Model Configuration
    llm_model: str = "llama-3.3-70b-versatile"

    # Document Processing
    max_document_size_mb: int = 50
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # API Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
