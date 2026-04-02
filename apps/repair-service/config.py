"""Configuration for Penny Repair Service."""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Service
    SERVICE_NAME: str = "penny-repair-service"
    SERVICE_PORT: int = int(os.getenv("REPAIR_SERVICE_PORT", "3001"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # Supabase
    SUPABASE_URL: str | None = os.getenv("SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    # GitHub
    GITHUB_TOKEN: str | None = os.getenv("GITHUB_TOKEN")
    GITHUB_ORG: str | None = os.getenv("GITHUB_ORG")
    GITHUB_REPO: str | None = os.getenv("GITHUB_REPO")

    # LLM
    ANTHROPIC_API_KEY: str | None = os.getenv("ANTHROPIC_API_KEY")
    CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-3-5-sonnet-latest")

    # Docker
    DOCKER_HOST: str = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock")

    # Redis
    REDIS_URL: str | None = os.getenv("REDIS_URL")

    # Sentry
    SENTRY_DSN: str | None = os.getenv("PENNY_SENTRY_DSN")

    # Governance (Locked)
    CONFIDENCE_FAST_LANE_THRESHOLD: float = 0.98
    CONFIDENCE_VULNERABILITY_MINIMUM: float = 0.97
    MAX_CONCURRENT_REPAIRS_PER_REPO: int = 4
    DEFAULT_REPAIR_TIMEOUT_SECONDS: int = 180
    MIN_REPAIR_TIMEOUT_SECONDS: int = 30
    MAX_REPAIR_TIMEOUT_SECONDS: int = 900
    ALLOW_VULNERABILITY_REPAIRS: bool = True
    VULNERABILITY_LOCALITY_MINIMUM: float = 0.90
    VULNERABILITY_NO_DEPENDENCY_UPGRADES: bool = True
    VULNERABILITY_NO_EXTERNAL_IMPORTS: bool = True

    def validate(self) -> None:
        """Validate critical configuration."""
        if not self.SUPABASE_URL:
            raise ValueError("SUPABASE_URL not configured")
        if not self.SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("SUPABASE_SERVICE_ROLE_KEY not configured")
        if not self.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not configured")


def get_settings() -> Settings:
    """Get application settings."""
    return Settings()
