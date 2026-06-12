"""환경 설정 — 모델 ID·하이퍼파라미터·타임아웃·경로.

모든 LLM 모델 ID는 환경변수로 노출하여 A/B 테스트를 가능하게 한다.
API 키 미설정 시 claude_client 가 MockClaudeClient 로 동작한다(데모·테스트).
"""
from __future__ import annotations

import os
from pathlib import Path

# ── 경로 (backend/ 기준에서 _workspace 루트 역추적) ────────────────────────
_THIS = Path(__file__).resolve()
# .../_workspace/04_build/backend/app/config.py → parents[3] = _workspace
WORKSPACE_ROOT = _THIS.parents[3]
FOUNDATION_DIR = WORKSPACE_ROOT / "02_foundation"

# 환경변수 override 허용 (테스트·배포 유연성)
BM25_INDEX_PATH = Path(os.getenv("JHA_BM25_INDEX", str(FOUNDATION_DIR / "bm25_index.pkl")))
CHUNKS_PATH = Path(os.getenv("JHA_CHUNKS", str(FOUNDATION_DIR / "chunks.jsonl")))
SYSTEM_PROMPT_PATH = Path(
    os.getenv("JHA_SYSTEM_PROMPT", str(FOUNDATION_DIR / "rag_prompts" / "system_prompt.md"))
)
GEN_TEMPLATE_PATH = Path(
    os.getenv("JHA_GEN_TEMPLATE", str(FOUNDATION_DIR / "rag_prompts" / "jha_generation_template.md"))
)
TAXONOMY_DIR = Path(os.getenv("JHA_TAXONOMY", str(FOUNDATION_DIR / "taxonomy_lookup")))

# ── KB 운영 저장소(SSOT) — 안전관리자 CRUD 대상 ─────────────────────────────
# 원본 Excel/chunks.jsonl 은 불변 시드. 이 SQLite 가 운영 SSOT.
KB_SQLITE_PATH = Path(os.getenv("JHA_KB_SQLITE", str(FOUNDATION_DIR / "kb.sqlite")))
# 변이 후 자동 재인덱싱 디바운스(초). sync.py CHANGE_RATIO_THRESHOLD 와 동일 5%.
REINDEX_DEBOUNCE_S = float(os.getenv("JHA_REINDEX_DEBOUNCE", "3"))
CHANGE_RATIO_THRESHOLD = float(os.getenv("JHA_CHANGE_RATIO_THRESHOLD", "0.05"))

# G3 갭영역 키워드 사전(외부화) — rag_guardrails §2. env override 로 운영 중 교체 가능.
_APP_DATA_DIR = _THIS.parent / "data"
GAP_AREAS_PATH = Path(
    os.getenv("JHA_GAP_AREAS", str(_APP_DATA_DIR / "guardrail_gap_areas.json"))
)

# ── LLM 공급자 (기본 OpenAI, Anthropic 레거시, Mock 폴백) ─────────────────
# LLM_PROVIDER=openai|anthropic|mock. 기본 openai. 키 부재 시 mock 폴백(llm_client).
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai").lower()

# ── 모델 분기 (env 노출, A/B 가능 — ID 가 바뀌어도 코드 수정 불필요) ────────
# 기본값은 현행 안정 OpenAI 모델. 조직 가용 모델로 env 교체 가능(README 참조).
#   gpt-4.1: 분류·생성 균형 + Structured Outputs(json_schema) 지원.
MODEL_CLASSIFY = os.getenv("JHA_MODEL_CLASSIFY", "gpt-4.1")
MODEL_ASSESS = os.getenv("JHA_MODEL_ASSESS", "gpt-4.1")
# 모호 케이스(confidence<0.7) 2차 — 상위 모델. Claude extended thinking 대응은
# OpenAI 에서 reasoning 모델(o계열) 또는 동일 모델 유지로 단순화한다. 기본은 동일
# gpt-4.1 유지(추가 파라미터·요금 변동 없이 결정적). 필요 시 env 로 o-계열 지정 가능.
MODEL_COMPLEX = os.getenv("JHA_MODEL_COMPLEX", "gpt-4.1")
# 레거시 별칭(기존 코드 참조 호환). MODEL_COMPLEX 와 동일 값.
MODEL_AMBIGUOUS = os.getenv("JHA_MODEL_AMBIGUOUS", MODEL_COMPLEX)
MODEL_JUDGE = os.getenv("JHA_MODEL_JUDGE", "gpt-4.1")

# ── 하이퍼파라미터 ────────────────────────────────────────────────────────
MAX_TOKENS = int(os.getenv("JHA_MAX_TOKENS", "4096"))
# 공급자 무관 LLM 타임아웃. 레거시 JHA_CLAUDE_TIMEOUT 도 폴백으로 인정.
LLM_TIMEOUT_S = float(os.getenv("JHA_LLM_TIMEOUT", os.getenv("JHA_CLAUDE_TIMEOUT", "30")))
CLAUDE_TIMEOUT_S = LLM_TIMEOUT_S  # 레거시 별칭(호환)
KB_TIMEOUT_S = float(os.getenv("JHA_KB_TIMEOUT", "2"))

# RAG 검색 파라미터 (rag_retrieval_spec)
TOP_K = int(os.getenv("JHA_TOP_K", "20"))
TOP_K_FINAL = int(os.getenv("JHA_TOP_K_FINAL", "5"))
CONFIDENCE_AMBIGUOUS_THRESHOLD = float(os.getenv("JHA_CONFIDENCE_THRESHOLD", "0.7"))
LOW_SCORE_THRESHOLD = float(os.getenv("JHA_LOW_SCORE_THRESHOLD", "5.0"))  # BM25 top1<5 → low

# Outbox 백오프 (1·2·4·8s, 최대 N=5)
OUTBOX_MAX_ATTEMPTS = int(os.getenv("JHA_OUTBOX_MAX_ATTEMPTS", "5"))
OUTBOX_BACKOFF_BASE_S = float(os.getenv("JHA_OUTBOX_BACKOFF_BASE", "1"))

# ── 인증 (PoC 간이 JWT) ───────────────────────────────────────────────────
# PoC: HS256 공유 시크릿. 운영 전환 시 OIDC(JWKS) 로 교체.
JWT_SECRET = os.getenv("JHA_JWT_SECRET", "poc-dev-secret-do-not-use-in-prod")
AUTH_ENABLED = os.getenv("JHA_AUTH_ENABLED", "true").lower() != "false"

# ── LLM API 키 ────────────────────────────────────────────────────────────
# OpenAI(기본): backend/.env 에 OPENAI_API_KEY=sk-... . 부재 시 mock 폴백.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")  # Azure/프록시 등 커스텀 엔드포인트(선택)
# Anthropic(레거시): LLM_PROVIDER=anthropic 일 때만 사용.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# JHA_FORCE_MOCK=true → 공급자 무관 Mock 강제(테스트/데모).
_FORCE_MOCK = os.getenv("JHA_FORCE_MOCK", "").lower() == "true"
if _FORCE_MOCK:
    LLM_PROVIDER = "mock"

# 레거시 별칭(기존 README·코드 호환). 실제 폴백 판정은 llm_client 팩토리가 수행.
USE_MOCK_CLAUDE = LLM_PROVIDER == "mock"

# ── CORS (frontend 실연동) ────────────────────────────────────────────────
# frontend(Next.js) 개발 서버(3000)·mock 데모(3100)에서의 브라우저 호출 허용.
# 운영 전환 시 사내 도메인만 화이트리스트. env(JHA_CORS_ORIGINS, 콤마구분)로 override.
CORS_ORIGINS = [
    o.strip() for o in os.getenv(
        "JHA_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3100,http://127.0.0.1:3100",
    ).split(",") if o.strip()
]

APP_VERSION = "0.2.0"


def is_opus(model_id: str) -> bool:
    """opus 계열 여부 — temperature 미전송 + adaptive thinking 분기 판정."""
    return model_id.startswith("claude-opus")
