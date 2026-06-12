"""LLM 통합 — 공급자 추상화(기본 OpenAI, Anthropic 레거시, Mock 폴백).

설계:
  - LLMClient 추상 인터페이스. 호출 시그니처는 기존 claude_client 와 동일:
        complete(model_id, system_block, fewshot_block, reference_block, user_content) -> LlmResponse
    rag_pipeline 변경을 최소화한다.
  - OpenAIClient(기본): openai SDK Chat Completions + Structured Outputs(json_schema)
    로 JHA JSON 스키마를 강제. temperature=0. OpenAI 는 프롬프트 캐싱이 자동이므로
    cache_control 마킹/4블록 로직 없음 — system/user 2메시지로 단순 구성.
  - AnthropicClient(레거시): 기존 Claude 경로 보존. prompt caching 4블록 +
    temperature 분기(opus 예외) 유지.
  - MockLLMClient: 키 부재 시 폴백. 검색 청크 메타로 결정적 JSON 생성(데모·테스트).

  공급자 선택: config.LLM_PROVIDER(openai|anthropic|mock). 기본 openai.
  OPENAI_API_KEY 부재 시 mock 폴백 + 경고 로그.

  모델 ID 는 전부 env 오버라이드 가능(config). ID 가 바뀌어도 코드 수정 불필요.
"""
from __future__ import annotations

import json
import logging
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional

from app import config
from app.errors import LlmCircuitOpen, LlmUpstreamError

logger = logging.getLogger("jha.llm")


@dataclass
class LlmResponse:
    """LLM 응답 + 관측 메타. (공급자 무관 공통 형태)"""
    text: str
    model_used: str
    extended_thinking_used: bool = False
    usage: dict[str, int] = field(default_factory=dict)  # 토큰·캐시 적중
    is_mock: bool = False


# ── Circuit Breaker ─────────────────────────────────────────────────────────
class _CircuitBreaker:
    def __init__(self, threshold: int = 5, reset_s: float = 60.0):
        self.threshold = threshold
        self.reset_s = reset_s
        self.fails = 0
        self.opened_at: Optional[float] = None

    def is_open(self) -> bool:
        if self.opened_at is None:
            return False
        if time.time() - self.opened_at >= self.reset_s:
            self.opened_at = None  # half-open: 1회 허용
            self.fails = 0
            return False
        return True

    def record_success(self) -> None:
        self.fails = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.fails += 1
        if self.fails >= self.threshold:
            self.opened_at = time.time()


# ── JHA 응답 JSON 스키마 (OpenAI Structured Outputs / json_schema) ────────────
# classify·assess 모두를 포괄하는 단일 느슨한 스키마. result_type·classification 은
# 항상 존재하고, hazards 등 assess 전용 필드는 선택적(빈 배열 허용).
# OpenAI Structured Outputs 는 strict 모드에서 additionalProperties:false + 모든
# properties 를 required 로 요구하므로, assess/classify 공통 필드를 모두 required 로
# 두되 값은 빈 배열/null 허용으로 유연하게 둔다.
_JHA_JSON_SCHEMA: dict[str, Any] = {
    "name": "jha_response",
    "strict": False,  # PoC: 느슨 모드(필드 선택성↑). 운영 강화 시 strict + 필드분리.
    "schema": {
        "type": "object",
        "properties": {
            "result_type": {
                "type": "string",
                "enum": ["ok", "no_match", "low_confidence",
                         "refused_full", "refused_partial"],
            },
            "classification": {
                "type": "object",
                "properties": {
                    "major_type": {"type": ["string", "null"]},
                    "sub_type": {"type": ["string", "null"]},
                    "detail_item": {"type": ["string", "null"]},
                    "confidence": {"type": "number"},
                },
            },
            "hazards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "accident_type": {"type": "string"},
                        "description": {"type": "string"},
                        "severity": {"type": "integer"},
                        "frequency": {"type": "integer"},
                        "risk_grade": {"type": "string"},
                        "controls": {"type": "array", "items": {"type": "string"}},
                        "citations": {"type": "array", "items": {"type": "string"}},
                        "legal_refs": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            "critical_register": {"type": "string"},
            "critical_register_reasons": {"type": "array", "items": {"type": "string"}},
            "legal_refs": {"type": "array", "items": {"type": "string"}},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["result_type", "classification"],
    },
}


# ── 추상 인터페이스 ─────────────────────────────────────────────────────────
class LLMClient(ABC):
    """공급자 무관 LLM 인터페이스. rag_pipeline 이 의존하는 단일 메서드."""

    @abstractmethod
    def complete(self, model_id: str, system_block: str, fewshot_block: str,
                 reference_block: str, user_content: str) -> LlmResponse:
        ...


# ── OpenAI 클라이언트 (기본) ────────────────────────────────────────────────
class OpenAIClient(LLMClient):
    """OpenAI Chat Completions + Structured Outputs(json_schema).

    - system 메시지 = system_block + reference_block + fewshot_block 결합(정적 컨텍스트).
    - user 메시지 = user_content(가변 입력 + 검색결과).
    - temperature=0. response_format=json_schema 로 JHA JSON 강제.
    - 프롬프트 캐싱은 OpenAI 가 자동 처리(별도 마킹 불필요).
    - 5xx 1회 재시도(지수 백오프), 429 즉시 raise(라우터 Retry-After), circuit breaker.
    """

    def __init__(self) -> None:
        from openai import OpenAI  # 지연 import
        kwargs: dict[str, Any] = {"timeout": config.LLM_TIMEOUT_S}
        if config.OPENAI_API_KEY:
            kwargs["api_key"] = config.OPENAI_API_KEY
        if config.OPENAI_BASE_URL:
            kwargs["base_url"] = config.OPENAI_BASE_URL
        self._client = OpenAI(**kwargs)
        self._breaker = _CircuitBreaker()

    def complete(self, model_id: str, system_block: str, fewshot_block: str,
                 reference_block: str, user_content: str) -> LlmResponse:
        if self._breaker.is_open():
            raise LlmCircuitOpen(details={"retryable": True})

        system_text = "\n\n".join(s for s in (system_block, reference_block,
                                              fewshot_block) if s)
        messages = [
            {"role": "system", "content": system_text or "You are a JHA assistant."},
            {"role": "user", "content": user_content},
        ]
        params: dict[str, Any] = {
            "model": model_id,
            "max_tokens": config.MAX_TOKENS,
            "temperature": 0,
            "messages": messages,
            "response_format": {"type": "json_schema", "json_schema": _JHA_JSON_SCHEMA},
        }

        last_exc: Optional[Exception] = None
        for attempt in range(2):  # 1회 재시도(총 2회)
            try:
                resp = self._client.chat.completions.create(**params)
                self._breaker.record_success()
                return self._parse(resp, model_id)
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                status = self._status_of(exc)
                if status == 429:
                    raise  # 라우터에서 Retry-After 처리(재시도 안 함)
                if status is not None and status < 500:
                    raise LlmUpstreamError(details={"status": status})  # 4xx 비재시도
                self._breaker.record_failure()
                if attempt == 0:
                    time.sleep(config.OUTBOX_BACKOFF_BASE_S)  # 지수 백오프 1s→
                    continue
        if self._breaker.is_open():
            raise LlmCircuitOpen(details={"retryable": True})
        raise LlmUpstreamError(details={"retryable": True, "cause": str(last_exc)})

    @staticmethod
    def _status_of(exc: Any) -> Optional[int]:
        # openai SDK 예외는 .status_code 노출. 없으면 response.status_code 시도.
        st = getattr(exc, "status_code", None)
        if st is not None:
            return st
        resp = getattr(exc, "response", None)
        return getattr(resp, "status_code", None) if resp is not None else None

    @staticmethod
    def _parse(resp: Any, model_id: str) -> LlmResponse:
        text = ""
        try:
            text = resp.choices[0].message.content or ""
        except Exception:  # noqa: BLE001
            text = ""
        usage = {}
        u = getattr(resp, "usage", None)
        if u is not None:
            prompt_tok = getattr(u, "prompt_tokens", 0) or 0
            # OpenAI 자동 캐싱: prompt_tokens_details.cached_tokens 로 적중 노출.
            cached = 0
            details = getattr(u, "prompt_tokens_details", None)
            if details is not None:
                cached = getattr(details, "cached_tokens", 0) or 0
            usage = {
                "input_tokens": prompt_tok,
                "output_tokens": getattr(u, "completion_tokens", 0) or 0,
                # 관측 호환: cache_read_input_tokens 키 유지(claude 경로와 동일 키).
                "cache_read_input_tokens": cached,
                "cache_creation_input_tokens": 0,
            }
        return LlmResponse(text=text, model_used=model_id,
                           extended_thinking_used=False, usage=usage)


# ── Anthropic 클라이언트 (레거시 옵션) ──────────────────────────────────────
def _build_anthropic_params(model_id: str, system_block: str, fewshot_block: str,
                            reference_block: str, user_content: str) -> dict[str, Any]:
    """Anthropic messages.create 파라미터 빌드 (레거시 경로, prompt caching 4블록).

    cache_control 마킹: system(블록1) + reference(블록3), few-shot(블록2) user turn,
    가변 입력(블록4)은 캐시 안 함. temperature 분기는 opus 예외(레거시 한정).
    """
    system = [
        {"type": "text", "text": system_block,
         "cache_control": {"type": "ephemeral"}},          # 블록1
        {"type": "text", "text": reference_block,
         "cache_control": {"type": "ephemeral"}},          # 블록3 정적 레퍼런스
    ]
    messages = [
        {"role": "user", "content": [
            {"type": "text", "text": fewshot_block,
             "cache_control": {"type": "ephemeral"}},      # 블록2 few-shot
            {"type": "text", "text": user_content},        # 블록4 가변(캐시 안 함)
        ]},
    ]
    params: dict[str, Any] = {
        "model": model_id,
        "max_tokens": config.MAX_TOKENS,
        "system": system,
        "messages": messages,
    }
    if model_id.startswith("claude-opus"):
        # opus-4-7: temperature 전송 시 400 → 제외. adaptive thinking 부여.
        params["thinking"] = {"type": "adaptive", "effort": "low"}
    else:
        params["temperature"] = 0
    return params


class AnthropicClient(LLMClient):
    """레거시 Claude 경로 — 기존 동작 보존(prompt caching·temperature 분기·circuit breaker)."""

    def __init__(self) -> None:
        from anthropic import Anthropic  # 지연 import
        self._client = Anthropic(api_key=config.ANTHROPIC_API_KEY,
                                 timeout=config.LLM_TIMEOUT_S)
        self._breaker = _CircuitBreaker()

    def complete(self, model_id: str, system_block: str, fewshot_block: str,
                 reference_block: str, user_content: str) -> LlmResponse:
        if self._breaker.is_open():
            raise LlmCircuitOpen(details={"retryable": True})

        params = _build_anthropic_params(model_id, system_block, fewshot_block,
                                         reference_block, user_content)
        last_exc: Optional[Exception] = None
        for attempt in range(2):
            try:
                resp = self._client.messages.create(**params)
                self._breaker.record_success()
                return self._parse(resp, model_id)
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                status = getattr(exc, "status_code", None)
                if status == 429:
                    raise
                if status is not None and status < 500:
                    raise LlmUpstreamError(details={"status": status})
                self._breaker.record_failure()
                if attempt == 0:
                    time.sleep(config.OUTBOX_BACKOFF_BASE_S)
                    continue
        if self._breaker.is_open():
            raise LlmCircuitOpen(details={"retryable": True})
        raise LlmUpstreamError(details={"retryable": True, "cause": str(last_exc)})

    @staticmethod
    def _parse(resp: Any, model_id: str) -> LlmResponse:
        text_parts = [b.text for b in resp.content if getattr(b, "type", "") == "text"]
        thinking_used = any(getattr(b, "type", "") == "thinking" for b in resp.content)
        usage = {}
        if getattr(resp, "usage", None):
            u = resp.usage
            usage = {
                "input_tokens": getattr(u, "input_tokens", 0),
                "output_tokens": getattr(u, "output_tokens", 0),
                "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0,
                "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
            }
        return LlmResponse(text="\n".join(text_parts), model_used=model_id,
                           extended_thinking_used=thinking_used, usage=usage)


# ── Mock 클라이언트 (gold set 스타일 결정적 응답) ──────────────────────────
class MockLLMClient(LLMClient):
    """API 키 미설정 시 사용(공급자 무관). user_content 의 검색 청크 메타
    (severity/frequency/accident_type/chunk_id)로 결정적 JSON 생성.
    실제 LLM 없이도 G4~G8 후처리·상태머신·ERP 게이트를 end-to-end 검증 가능.
    """

    _CHUNK_RE = re.compile(r"\[chunk_id:\s*(R\d+)\]")
    _SEV_RE = re.compile(r"severity=(\d)")
    _FREQ_RE = re.compile(r"frequency=(\d)")
    _ACC_RE = re.compile(r"accident_type=([^\s|\]]+)")

    def complete(self, model_id: str, system_block: str, fewshot_block: str,
                 reference_block: str, user_content: str) -> LlmResponse:
        is_classify = "TASK=classify" in user_content
        payload = (self._mock_classify(user_content) if is_classify
                   else self._mock_assess(user_content))
        return LlmResponse(
            text=json.dumps(payload, ensure_ascii=False),
            model_used=model_id,
            extended_thinking_used=False,
            usage={"input_tokens": 1200, "output_tokens": 400,
                   "cache_read_input_tokens": 1000, "cache_creation_input_tokens": 0},
            is_mock=True,
        )

    # ── 청크 파싱 ───────────────────────────────────────────────────────
    def _parse_chunks(self, user_content: str) -> list[dict[str, Any]]:
        chunks: list[dict[str, Any]] = []
        for block in user_content.split("[chunk_id:"):
            cid_m = re.match(r"\s*(R\d+)\]", block)
            if not cid_m:
                continue
            cid = cid_m.group(1)
            sev = self._SEV_RE.search(block)
            freq = self._FREQ_RE.search(block)
            acc = self._ACC_RE.search(block)
            chunks.append({
                "chunk_id": cid,
                "severity": int(sev.group(1)) if sev else 3,
                "frequency": int(freq.group(1)) if freq else 3,
                "accident_type": acc.group(1) if acc else "기타",
            })
        return chunks

    def _mock_classify(self, user_content: str) -> dict[str, Any]:
        chunks = self._parse_chunks(user_content)
        if not chunks:
            return {"result_type": "no_match",
                    "classification": {"major_type": None, "sub_type": None,
                                       "detail_item": None, "confidence": 0.0},
                    "warnings": ["관련 표준 데이터가 없습니다."]}
        maj = self._grab(user_content, "major_type")
        sub = self._grab(user_content, "sub_type")
        det = self._grab(user_content, "detail_item")
        return {
            "result_type": "ok",
            "classification": {"major_type": maj, "sub_type": sub,
                               "detail_item": det, "confidence": 0.86},
            "warnings": [],
        }

    def _mock_assess(self, user_content: str) -> dict[str, Any]:
        chunks = self._parse_chunks(user_content)
        if not chunks:
            return {"result_type": "no_match", "classification": {}, "hazards": [],
                    "critical_register": "X", "human_review_flags": {},
                    "warnings": ["관련 표준 데이터가 없습니다."], "source_rows": []}
        hazards = []
        for c in chunks[:3]:
            hazards.append({
                "accident_type": c["accident_type"],
                "description": f"{c['accident_type']} 위험요인(표준 데이터 근거)",
                "severity": c["severity"],
                "frequency": c["frequency"],
                "risk_grade": "상",  # 코드가 재계산하므로 임의값
                "boundary_cell": c["severity"] == 4 and c["frequency"] == 4,
                "controls": ["표준 개선대책(데이터 근거)"],
                "citations": [c["chunk_id"]],
                "legal_refs": ["산업안전보건기준에 관한 규칙 §43"],
            })
        return {
            "result_type": "ok",
            "classification": {"major_type": self._grab(user_content, "major_type")},
            "hazards": hazards,
            "critical_register": "O",
            "critical_register_reasons": ["mock"],
            "legal_refs": ["산업안전보건기준에 관한 규칙 §43"],
            "human_review_flags": {},
            "warnings": [],
            "source_rows": [],
        }

    @staticmethod
    def _grab(text: str, key: str) -> Optional[str]:
        m = re.search(rf"{key}=([^\s|\]\n]+)", text)
        return m.group(1) if m else None


# ── 팩토리 ─────────────────────────────────────────────────────────────────
_client: Optional[LLMClient] = None


def _build_client() -> LLMClient:
    provider = (config.LLM_PROVIDER or "openai").lower()

    if provider == "mock":
        logger.warning("LLM_PROVIDER=mock — MockLLMClient 사용(데모/테스트).")
        return MockLLMClient()

    if provider == "anthropic":
        if not config.ANTHROPIC_API_KEY:
            logger.warning(
                "LLM_PROVIDER=anthropic 이나 ANTHROPIC_API_KEY 미설정 — "
                "MockLLMClient 폴백.")
            return MockLLMClient()
        try:
            return AnthropicClient()
        except Exception as exc:  # noqa: BLE001
            logger.warning("AnthropicClient 초기화 실패(%s) — MockLLMClient 폴백.", exc)
            return MockLLMClient()

    # 기본: openai
    if not config.OPENAI_API_KEY:
        logger.warning(
            "OPENAI_API_KEY 미설정 — MockLLMClient 폴백(데모/테스트). "
            "실 호출은 backend/.env 에 OPENAI_API_KEY 설정 후 가능.")
        return MockLLMClient()
    try:
        return OpenAIClient()
    except Exception as exc:  # noqa: BLE001
        logger.warning("OpenAIClient 초기화 실패(%s) — MockLLMClient 폴백.", exc)
        return MockLLMClient()


def get_llm() -> LLMClient:
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def reset_llm() -> None:
    """테스트·재구성용 — 싱글톤 리셋."""
    global _client
    _client = None
