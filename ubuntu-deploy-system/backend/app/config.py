from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")

    FOG_BASE_URL: str = "http://192.168.50.10/fog"
    FOG_API_TOKEN: str = "NjAxZjdiMjI3YjVhZjdiMTljMTdkNjk1MmNmNzM0ZWQwYjAxNzc0YjM1Mzg4Yjg0Y2QxYzdmN2ZiNWYyZTM1OGU4ZTAzYTBlODZkZjFjODY1ZjkzM2NiZTQwNmE5MGMwMmQ0MDkyZjhkOTJmMTEwZGIyMWJhNmE5NTQ4ZTdkZjg="
    FOG_USER_TOKEN: str = "YzM1N2M5YmEyODgzN2FhYWVjZjllZjc1MmFkYjI4ODE3N2YwYTVkMTViNWFjOWZhMjNmODUwOWVlZTdjYmUxNjZiMjZiODkxNDIxNGFlNzljYzU2MzRhMzgzY2RhZjY1MzgwYjQ2NTEzYzE3NzE4Y2I5OWE3ZDY4Njc0YzkxYzU="
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin"
    JWT_SECRET: str = "labDeploy2024SecureTokenSecretKey987654321"
    DATABASE_URL: str = "sqlite:///./deploy_history.db"
    MASTER_HOSTNAME: str = "ubuntu-master"
    BACKEND_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:8000,http://192.168.50.10:8000"


@lru_cache()
def get_settings():
    return Settings()
