from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING
import os

if TYPE_CHECKING:
    from repair_engine.providers.gateway import GatewayRouter
    from repair_engine.providers.routing_config import RoutingConfig


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _openai_compatible_base_url(*values: str) -> str:
    for value in values:
        candidate = value.strip()
        if not candidate:
            continue
        if candidate.endswith("/v1"):
            return candidate[:-3]
        return candidate
    return ""


@dataclass
class SearchConfig:
    root_branching_factor: int = int(os.getenv("penny_ROOT_BRANCHING_FACTOR", "5"))
    beam_width: int = int(os.getenv("penny_BEAM_WIDTH", "2"))
    max_depth: int = int(os.getenv("penny_MAX_DEPTH", "2"))
    max_evals_per_finding: int = int(os.getenv("penny_MAX_EVALS_PER_FINDING", "20"))
    min_expand_score: float = float(os.getenv("penny_MIN_EXPAND_SCORE", "0.65"))


@dataclass
class EvaluationConfig:
    use_docker: bool = _bool_env("penny_EVAL_USE_DOCKER", True)
    docker_image: str = os.getenv("penny_DOCKER_IMAGE", "python:3.11")
    lint_command: str = os.getenv("penny_LINT_COMMAND", "")
    typecheck_command: str = os.getenv("penny_TYPECHECK_COMMAND", "")
    test_command: str = os.getenv("penny_TEST_COMMAND", "python3 -m unittest")
    timeout_seconds: int = int(os.getenv("penny_EVAL_TIMEOUT_SECONDS", "300"))


@dataclass
class IntegrationConfig:
    vllm_base_url: str = os.getenv("penny_VLLM_BASE_URL", "http://localhost:8000")
    vllm_model: str = os.getenv("penny_VLLM_MODEL", "deepseek-ai/deepseek-coder-6.7b-instruct")
    llm_api_key: str = os.getenv("penny_LLM_API_KEY", "")
    fallback_model: str = os.getenv("penny_FALLBACK_MODEL", "")
    fallback_base_url: str = os.getenv("penny_FALLBACK_BASE_URL", "")
    fallback_api_key: str = os.getenv("penny_FALLBACK_API_KEY", "")
    redis_url: str = os.getenv("penny_REDIS_URL", "redis://localhost:6379/0")
    qdrant_url: str = os.getenv("penny_QDRANT_URL", "http://localhost:6333")
    qdrant_collection: str = os.getenv("penny_QDRANT_COLLECTION", "penny_patch_memory")


@dataclass
class ApplyConfig:
    auto_apply: bool = _bool_env("penny_AUTO_APPLY", True)
    dry_run: bool = _bool_env("penny_DRY_RUN", False)
    max_files_changed: int = int(os.getenv("penny_MAX_FILES_CHANGED", "8"))
    protected_prefixes: list[str] = field(
        default_factory=lambda: [
            ".github/",
            "expectations/",
            "audits/schema/",
        ]
    )


@dataclass
class ProviderConfig:
    """API keys and model overrides for all LLM providers.

    All values read from environment variables. Override individual model tiers
    with penny_AIMLAPI_*_MODEL, penny_OPENAI_*_MODEL, etc.
    """

    # ── API keys ──────────────────────────────────────────────────────────────
    aimlapi_api_key: str = field(default_factory=lambda: os.getenv("AIMLAPI_API_KEY", ""))
    hf_api_key: str = field(default_factory=lambda: os.getenv("HF_TOKEN", ""))
    openai_api_key: str = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    local_llm_base_url: str = field(
        default_factory=lambda: _openai_compatible_base_url(
            os.getenv("penny_LOCAL_LLM_BASE_URL", ""),
            os.getenv("OLLAMA_BASE_URL", ""),
            "http://127.0.0.1:11434",
        )
    )
    local_llm_model: str = field(
        default_factory=lambda: os.getenv("penny_LOCAL_LLM_MODEL", "qwen2.5-coder:14b")
    )
    local_llm_api_key: str = field(default_factory=lambda: os.getenv("penny_LOCAL_LLM_API_KEY", ""))

    # ── Model overrides (per tier) ────────────────────────────────────────────
    # aimlapi
    aimlapi_nano_model: str = field(default_factory=lambda: os.getenv("penny_AIMLAPI_NANO_MODEL", ""))
    aimlapi_cheap_model: str = field(default_factory=lambda: os.getenv("penny_AIMLAPI_CHEAP_MODEL", ""))
    aimlapi_mid_model: str = field(default_factory=lambda: os.getenv("penny_AIMLAPI_MID_MODEL", ""))
    aimlapi_expensive_model: str = field(default_factory=lambda: os.getenv("penny_AIMLAPI_EXPENSIVE_MODEL", ""))
    # HuggingFace
    hf_nano_model: str = field(default_factory=lambda: os.getenv("penny_HF_NANO_MODEL", ""))
    # OpenAI
    openai_mini_model: str = field(default_factory=lambda: os.getenv("penny_OPENAI_MINI_MODEL", ""))
    openai_balanced_model: str = field(default_factory=lambda: os.getenv("penny_OPENAI_BALANCED_MODEL", ""))
    # Anthropic
    anthropic_haiku_model: str = field(default_factory=lambda: os.getenv("penny_ANTHROPIC_HAIKU_MODEL", ""))
    anthropic_sonnet_model: str = field(default_factory=lambda: os.getenv("penny_ANTHROPIC_SONNET_MODEL", ""))
    anthropic_opus_model: str = field(default_factory=lambda: os.getenv("penny_ANTHROPIC_OPUS_MODEL", ""))
    # Gemini
    gemini_flash_model: str = field(default_factory=lambda: os.getenv("penny_GEMINI_FLASH_MODEL", ""))
    gemini_pro_model: str = field(default_factory=lambda: os.getenv("penny_GEMINI_PRO_MODEL", ""))

    # ── Routing config path ───────────────────────────────────────────────────
    routing_config_path: str = field(
        default_factory=lambda: os.getenv("penny_ROUTING_CONFIG", "audits/routing_config.json")
    )

    @property
    def aimlapi_model_overrides(self) -> dict[str, str]:
        return {k: v for k, v in {
            "nano": self.aimlapi_nano_model,
            "cheap": self.aimlapi_cheap_model,
            "mid": self.aimlapi_mid_model,
            "expensive": self.aimlapi_expensive_model,
        }.items() if v}

    @property
    def openai_model_overrides(self) -> dict[str, str]:
        return {k: v for k, v in {
            "mini": self.openai_mini_model,
            "balanced": self.openai_balanced_model,
        }.items() if v}

    @property
    def anthropic_model_overrides(self) -> dict[str, str]:
        return {k: v for k, v in {
            "haiku": self.anthropic_haiku_model,
            "sonnet": self.anthropic_sonnet_model,
            "opus": self.anthropic_opus_model,
        }.items() if v}

    @property
    def gemini_model_overrides(self) -> dict[str, str]:
        return {k: v for k, v in {
            "flash": self.gemini_flash_model,
            "pro": self.gemini_pro_model,
        }.items() if v}

    def build_gateway(self, routing_config: "RoutingConfig | None" = None) -> "GatewayRouter":
        """Build a GatewayRouter from this config.

        Lazy import avoids circular dependency between config.py and providers/.
        """
        from repair_engine.providers.gateway import GatewayRouter
        from repair_engine.providers.routing_config import RoutingConfig as RC

        rc = routing_config or RC.load(self.routing_config_path)
        return GatewayRouter.from_keys(
            aimlapi_key=self.aimlapi_api_key,
            hf_api_key=self.hf_api_key,
            openai_api_key=self.openai_api_key,
            anthropic_api_key=self.anthropic_api_key,
            gemini_api_key=self.gemini_api_key,
            local_llm_base_url=self.local_llm_base_url,
            local_llm_model=self.local_llm_model,
            local_llm_api_key=self.local_llm_api_key,
            aimlapi_model_overrides=self.aimlapi_model_overrides or None,
            openai_model_overrides=self.openai_model_overrides or None,
            anthropic_model_overrides=self.anthropic_model_overrides or None,
            gemini_model_overrides=self.gemini_model_overrides or None,
            hf_nano_model=self.hf_nano_model,
            routing_config=rc,
        )


@dataclass
class ArtifactConfig:
    runs_root: str = os.getenv("penny_REPAIR_RUNS_DIR", "audits/repair_runs")
    findings_file: str = os.getenv("penny_FINDINGS_FILE", "audits/open_findings.json")
    index_file: str = os.getenv("penny_INDEX_FILE", "audits/index.json")


@dataclass
class EngineConfig:
    search: SearchConfig = field(default_factory=SearchConfig)
    evaluation: EvaluationConfig = field(default_factory=EvaluationConfig)
    integrations: IntegrationConfig = field(default_factory=IntegrationConfig)
    apply: ApplyConfig = field(default_factory=ApplyConfig)
    artifacts: ArtifactConfig = field(default_factory=ArtifactConfig)
    providers: ProviderConfig = field(default_factory=ProviderConfig)
