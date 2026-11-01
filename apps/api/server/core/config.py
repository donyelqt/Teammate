from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TEAMMATE_", extra="ignore")

    log_level: str = Field(default="INFO")
    database_url: str = Field(default="")
    supabase_url: str = Field(default="")
    supabase_jwt_secret: str = Field(default="")


@lru_cache
def get_settings() -> Settings:
    return Settings()
