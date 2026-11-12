from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./sentinel.db"
    jwt_secret: str = "local-demo-only-change-before-sharing-000000"
    operator_password: str = "SentinelDemo!2026"
    viewer_password: str = "ViewerDemo!2026"
    storage_mode: str = "local"
    local_evidence_dir: str = "./evidence"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "sentinel"
    minio_secret_key: str = "local-demo-minio-change-me"
    minio_bucket: str = "sentinel-evidence"
    minio_secure: bool = False
    milvus_uri: str = "http://milvus:19530"
    milvus_token: str = ""
    vector_enabled: bool = False
    gemma_base_url: str = ""
    ollama_url: str = "http://ollama:11434"
    llm_provider: str = "rules"
    llm_model: str = "qwen3:4b"
    embedding_model: str = "nomic-embed-text"
    groq_api_key: str = ""
    groq_model: str = ""
    allow_external_llm: bool = False
    seed_demo: bool = True
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

if settings.gemma_base_url:
    settings.ollama_url = settings.gemma_base_url.rstrip("/").removesuffix("/v1")
