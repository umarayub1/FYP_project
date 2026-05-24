from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    redis_url: str = "redis://redis:6379"
    mongo_uri: str = "mongodb://mongodb:27017/synapse"
    chroma_host: str = "chromadb"
    chroma_port: int = 8000  # container port; docker-compose maps host 8001 → container 8000
    llm_provider: str = "external"
    llm_model: str = "claude-haiku-4-5-20251001"
    ollama_model: str = "llama3"
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    ollama_base_url: str = "http://host.docker.internal:11434"
    embedding_model: str = "text-embedding-3-small"
    embedding_provider: str = "openai"
    core_service_url: str = "http://core-service:4001"
    cors_origins: str = "http://localhost:3000"
    ingest_max_attempts: int = 3
    ingest_retry_delay_s: float = 2.0
    internal_secret: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
