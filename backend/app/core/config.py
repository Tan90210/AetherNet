"""
AetherNet Backend  Application Configuration
Loads settings from .env file via pydantic-settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    app_name: str="ModelMesh"
    app_env: str="development"
    app_port: int=8000

    mongodb_uri: str
    mongodb_db_name: str="aethernet"

    clerk_frontend_api: str=""
    clerk_secret_key: str=""

    pinata_api_key: str=""
    pinata_api_secret: str=""
    pinata_jwt: str=""
    pinata_gateway: str = "https://gateway.pinata.cloud/ipfs/"

    cors_origins: str = "http://localhost:5173"

    fl_server_host: str="0.0.0.0"
    fl_server_port: int=8080
    fl_rounds: int=3
    fl_client_connect_host: str="127.0.0.1"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    model_config=SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
