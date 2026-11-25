from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Loads backend/.env when uvicorn is started from the backend/ directory.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./vtcsas.db"
    secret_key: str = "your-super-secret-key-change-this-in-production"
    # Comma-separated IPv4/IPv6 addresses or CIDR ranges, e.g. 10.1.2.0/24,10.1.3.40
    # Seeded into school_networks on startup and also used as an override at check-in time.
    school_networks: str = ""
    # If true, use the rightmost X-Forwarded-For / X-Real-IP hop. Default is false:
    # only the direct socket IP is trusted, because clients on the public internet
    # can spoof forwarded headers.
    trust_proxy_headers: bool = False
    # DeepSeek API key. Never commit the real value; put it in backend/.env.
    deepseek_api_key: str = ""

settings = Settings()

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
