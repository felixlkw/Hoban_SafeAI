"""LLM 공급자 추상화 단위 테스트 — 실 API 호출 없음.

- OpenAIClient: 요청 구성(모델 ID·json_schema·temperature=0·메시지) 검증.
- 팩토리 폴백: 키 부재 시 MockLLMClient.
- claude_client shim: get_claude == get_llm 호환.
"""
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services import llm_client as lc


# ── 가짜 OpenAI 응답/클라이언트 ─────────────────────────────────────────────
def _fake_openai_response(content: str):
    usage = SimpleNamespace(
        prompt_tokens=1500,
        completion_tokens=300,
        prompt_tokens_details=SimpleNamespace(cached_tokens=1000),
    )
    msg = SimpleNamespace(content=content)
    choice = SimpleNamespace(message=msg)
    return SimpleNamespace(choices=[choice], usage=usage)


class _FakeCompletions:
    def __init__(self, captured: dict):
        self._captured = captured

    def create(self, **params):
        self._captured.update(params)
        return _fake_openai_response(json.dumps({
            "result_type": "ok",
            "classification": {"major_type": "건축", "confidence": 0.9},
        }, ensure_ascii=False))


class _FakeOpenAIClient:
    def __init__(self, captured: dict):
        self.chat = SimpleNamespace(completions=_FakeCompletions(captured))


def _make_openai_client(monkeypatch):
    """OpenAIClient 를 가짜 SDK 클라이언트로 주입해 생성."""
    captured: dict = {}
    client = lc.OpenAIClient.__new__(lc.OpenAIClient)  # __init__(SDK 생성) 우회
    client._client = _FakeOpenAIClient(captured)
    client._breaker = lc._CircuitBreaker()
    return client, captured


# ── 요청 구성 검증 ──────────────────────────────────────────────────────────
def test_openai_request_construction(monkeypatch):
    client, captured = _make_openai_client(monkeypatch)
    resp = client.complete(
        model_id="gpt-4.1",
        system_block="SYS",
        fewshot_block="FEW",
        reference_block="REF",
        user_content="TASK=classify\nmajor_type=건축\n작업입력: 거푸집 설치",
    )

    # 모델 ID 전달
    assert captured["model"] == "gpt-4.1"
    # temperature=0 (결정성)
    assert captured["temperature"] == 0
    # Structured Outputs(json_schema) 강제
    rf = captured["response_format"]
    assert rf["type"] == "json_schema"
    assert rf["json_schema"]["name"] == "jha_response"
    assert "result_type" in rf["json_schema"]["schema"]["properties"]
    # 메시지: system(결합) + user(가변)
    msgs = captured["messages"]
    assert msgs[0]["role"] == "system"
    assert "SYS" in msgs[0]["content"] and "REF" in msgs[0]["content"] and "FEW" in msgs[0]["content"]
    assert msgs[1]["role"] == "user"
    assert "거푸집" in msgs[1]["content"]
    # cache_control 마킹 없음(OpenAI 자동 캐싱)
    assert "cache_control" not in json.dumps(captured)

    # 응답 파싱: 텍스트·usage(캐시 적중 키 호환)
    assert resp.model_used == "gpt-4.1"
    assert resp.extended_thinking_used is False
    assert resp.usage["input_tokens"] == 1500
    assert resp.usage["cache_read_input_tokens"] == 1000
    parsed = json.loads(resp.text)
    assert parsed["result_type"] == "ok"


def test_openai_model_id_override(monkeypatch):
    """모델 ID 가 바뀌어도 그대로 전달(env override 시나리오)."""
    client, captured = _make_openai_client(monkeypatch)
    client.complete("gpt-4.1-mini", "S", "", "R", "U")
    assert captured["model"] == "gpt-4.1-mini"


# ── 팩토리 폴백 ─────────────────────────────────────────────────────────────
def test_factory_falls_back_to_mock_without_key(monkeypatch):
    monkeypatch.setattr(lc.config, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(lc.config, "OPENAI_API_KEY", "")
    lc.reset_llm()
    client = lc.get_llm()
    assert isinstance(client, lc.MockLLMClient)
    lc.reset_llm()


def test_factory_mock_provider(monkeypatch):
    monkeypatch.setattr(lc.config, "LLM_PROVIDER", "mock")
    lc.reset_llm()
    assert isinstance(lc.get_llm(), lc.MockLLMClient)
    lc.reset_llm()


def test_factory_anthropic_without_key_falls_back(monkeypatch):
    monkeypatch.setattr(lc.config, "LLM_PROVIDER", "anthropic")
    monkeypatch.setattr(lc.config, "ANTHROPIC_API_KEY", "")
    lc.reset_llm()
    assert isinstance(lc.get_llm(), lc.MockLLMClient)
    lc.reset_llm()


# ── Mock 결정성(공급자 무관) ────────────────────────────────────────────────
def test_mock_classify_deterministic():
    mock = lc.MockLLMClient()
    uc = ("TASK=classify\nmajor_type=건축 sub_type=철근 detail_item=배근\n"
          "[chunk_id: R0001] accident_type=낙하 severity=4 frequency=3")
    r1 = mock.complete("gpt-4.1", "S", "", "R", uc)
    r2 = mock.complete("gpt-4.1", "S", "", "R", uc)
    assert r1.text == r2.text
    assert r1.is_mock is True
    parsed = json.loads(r1.text)
    assert parsed["result_type"] == "ok"
    assert parsed["classification"]["major_type"] == "건축"


# ── shim 호환 ───────────────────────────────────────────────────────────────
def test_claude_client_shim_aliases():
    from app.services import claude_client as cc
    assert cc.get_claude is lc.get_llm
    assert cc.MockClaudeClient is lc.MockLLMClient
    assert cc.ClaudeClient is lc.AnthropicClient
