# Hoban JHA Agent — Backend 컨테이너 (PoC)
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 의존성(레이어 캐시) — kiwipiepy/anthropic 은 선택(미설치 시 graceful)
RUN pip install --no-cache-dir \
    "fastapi>=0.110" "uvicorn>=0.29" "pydantic>=2.6" "rank-bm25>=0.2.2"

# 앱 코드
COPY app/ ./app/
COPY pyproject.toml ./

# BM25 인덱스·프롬프트·taxonomy 는 마운트로 주입(이미지 비대화 방지).
# 기본 경로는 config.py(02_foundation) — 컨테이너에선 env 로 override.
ENV JHA_BM25_INDEX=/data/bm25_index.pkl \
    JHA_CHUNKS=/data/chunks.jsonl \
    JHA_SYSTEM_PROMPT=/data/rag_prompts/system_prompt.md \
    JHA_GEN_TEMPLATE=/data/rag_prompts/jha_generation_template.md \
    JHA_TAXONOMY=/data/taxonomy_lookup

EXPOSE 8000

# 헬스 체크(의존성 포함)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/v1/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
