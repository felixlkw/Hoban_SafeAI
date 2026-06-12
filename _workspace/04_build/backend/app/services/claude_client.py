"""레거시 호환 shim — LLM 공급자 추상화로 이전됨(llm_client.py).

기존 import 경로(app.services.claude_client)를 깨지 않기 위해 유지한다.
실제 구현은 llm_client.py 의 공급자 추상화(기본 OpenAI, Anthropic 레거시, Mock).

  - get_claude()  → get_llm() 별칭(기존 호출부 호환)
  - ClaudeClient  → AnthropicClient 별칭(레거시 명칭)
  - MockClaudeClient → MockLLMClient 별칭
  - build_params  → Anthropic 파라미터 빌더(레거시) 별칭
"""
from __future__ import annotations

from app.services.llm_client import (  # noqa: F401
    AnthropicClient as ClaudeClient,
    LlmResponse,
    MockLLMClient as MockClaudeClient,
    OpenAIClient,
    _build_anthropic_params as build_params,
    get_llm as get_claude,
    get_llm,
    reset_llm,
)
