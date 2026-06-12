"""KB 운영 저장소(SSOT) — 안전관리자 CRUD 대상 SQLite.

원본 Excel / chunks.jsonl 은 불변 시드. 본 SQLite(`kb.sqlite`)가 운영 SSOT 이다.
최초 기동 시 chunks.jsonl → 저장소 적재(이미 있으면 skip). 모든 변이는 감사 로그.

행 스키마: data_schema.json 준수 + 감사 필드(row_status / updated_at / updated_by).
신규 행 chunk_id: `N{seq}` (기존 R##### 보존). source_row 는 신규행에 음수 시퀀스 부여
(원본 Excel 행과 충돌 회피 + lineage 구분).

도메인 규칙 서버 강제(jha-domain-knowledge SKILL):
  - 등급 = 강도×빈도 임계곱 재계산 (하≤9 / 중10~15 / 상≥16). 클라이언트 입력 무시.
  - 곱16(강도4×빈도4) 경계셀: 입력 critical_register 존중 + boundary_cell 플래그.
  - 중점등록: 등급 '상' ⇔ 'O' 자동(곱16 제외).
  - taxonomy: 분류는 taxonomy_lookup 존재값. 신규 세부항목 허용 + [신규] 플래그.
"""
from __future__ import annotations

import csv
import json
import logging
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from app import config

logger = logging.getLogger("jha.kb_store")

VALID_ACCIDENT_TYPES = {
    "추락", "낙하", "전도", "협착", "충돌", "감전", "화재", "폭발", "질식",
    "근골격계", "질환", "비래", "붕괴", "도괴", "베임", "찔림", "절단", "말림",
    "골절", "직업성 질환", "기타",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── 청크 텍스트 빌드 (chunk.py build_text 와 동일 포맷 — 동일성 테스트로 보증) ──
def build_chunk_text(rec: dict[str, Any]) -> str:
    """chunk.py build_text 와 바이트 동일 포맷. 재인덱싱이 시드 인덱스와 정합."""
    return (
        f"[대공종: {rec['major_type']} / 중공종: {rec['sub_type']} / "
        f"세부항목: {rec['detail_item']} / 재해형태: {rec['accident_type']}]\n"
        f"[등급: {rec['risk_grade']} (강도 {rec['severity']} × 빈도 {rec['frequency']}) / "
        f"중점등록: {rec['critical_register']}]\n"
        f"위험요인:\n{rec['hazard_text']}\n"
        f"개선대책:\n{rec['controls']}"
    )


def sha256(s: str) -> str:
    import hashlib
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ── 도메인 규칙 (kb_store·domain_postprocess 일관) ────────────────────────────
def recompute_grade(severity: int, frequency: int) -> str:
    """강도×빈도 곱으로 등급 결정적 재계산. 하≤9 / 중10~15 / 상≥16."""
    p = severity * frequency
    if p >= 16:
        return "상"
    if p >= 10:
        return "중"
    return "하"


def is_boundary_cell(severity: int, frequency: int) -> bool:
    """곱16 경계셀: 강도4 × 빈도4 (정확히)."""
    return severity == 4 and frequency == 4


def apply_domain_rules(severity: int, frequency: int,
                       critical_register_in: Optional[str]) -> dict[str, Any]:
    """서버 강제 도메인 규칙 → (risk_product, risk_grade, critical_register, boundary).

    - 등급은 임계곱 재계산(입력 무시).
    - 중점등록: 등급 '상' ⇔ 'O' 자동. 단 곱16 경계셀은 입력값 존중(인간 판단 영역).
    """
    severity = max(1, min(5, int(severity)))
    frequency = max(1, min(5, int(frequency)))
    product = severity * frequency
    grade = recompute_grade(severity, frequency)
    boundary = is_boundary_cell(severity, frequency)

    if boundary:
        # 곱16: 상 249 / 중 35 갈림 — 입력 critical_register 존중(기본 O), boundary 플래그
        cr = (critical_register_in or "O").upper()
        cr = "O" if cr not in ("O", "X") else cr
    else:
        cr = "O" if grade == "상" else "X"
    return {
        "risk_product": product,
        "risk_grade": grade,
        "critical_register": cr,
        "boundary_cell": boundary,
    }


# ── taxonomy 검증 ─────────────────────────────────────────────────────────────
@dataclass
class TaxonomyLookup:
    major_name_to_id: dict[str, str]
    sub_key_to_id: dict[tuple, str]          # (major, sub) → SB###
    detail_key_to_id: dict[tuple, str]       # (major, sub, detail) → DT####

    @classmethod
    def load(cls) -> "TaxonomyLookup":
        major: dict[str, str] = {}
        sub: dict[tuple, str] = {}
        detail: dict[tuple, str] = {}
        try:
            with open(config.TAXONOMY_DIR / "major.csv", encoding="utf-8-sig",
                      newline="") as f:
                for r in csv.DictReader(f):
                    major[r["major_type"]] = r["major_type_id"]
            with open(config.TAXONOMY_DIR / "sub.csv", encoding="utf-8-sig",
                      newline="") as f:
                for r in csv.DictReader(f):
                    sub[(r["major_type"], r["sub_type"])] = r["sub_type_id"]
            with open(config.TAXONOMY_DIR / "detail.csv", encoding="utf-8-sig",
                      newline="") as f:
                for r in csv.DictReader(f):
                    detail[(r["major_type"], r["sub_type"], r["detail_item"])] = \
                        r["detail_item_id"]
        except Exception as exc:  # noqa: BLE001
            logger.warning("taxonomy_lookup 적재 실패: %s", exc)
        return cls(major, sub, detail)

    def resolve(self, major: str, sub: str, detail: str) -> dict[str, Any]:
        """분류 검증·ID 부여. 신규 세부항목은 허용 + is_new 플래그.

        반환: {major_type_id, sub_type_id, detail_item_id, is_new, errors[]}.
        대/중공종은 존재값 필수(미존재 시 errors). 세부항목 신규는 허용.
        """
        errors: list[str] = []
        mid = self.major_name_to_id.get(major)
        if mid is None:
            errors.append(f"대공종 '{major}' 미등록(taxonomy_lookup 존재값 필요)")
        sid = self.sub_key_to_id.get((major, sub))
        if sid is None:
            errors.append(f"중공종 '{sub}'(대공종 '{major}') 미등록")
        did = self.detail_key_to_id.get((major, sub, detail))
        is_new = did is None
        if is_new and not errors:
            # 신규 세부항목: 임시 ID 부여(DT9 + 해시 단축) + [신규] 플래그
            did = "DT9" + sha256(f"{major}|{sub}|{detail}")[:5].upper()
        return {
            "major_type_id": mid or "MJ000",
            "sub_type_id": sid or "SB000",
            "detail_item_id": did or "DT0000",
            "is_new_detail": is_new,
            "errors": errors,
        }


# ── 저장소 ─────────────────────────────────────────────────────────────────────
_COLUMNS = [
    "chunk_id", "content_hash", "source_row",
    "major_type_id", "major_type", "sub_type_id", "sub_type",
    "detail_item_id", "detail_item", "accident_type",
    "severity", "frequency", "risk_product", "risk_grade",
    "expected_grade", "grade_inconsistent", "critical_register",
    "hazard_text", "hazard_items", "controls", "controls_items",
    "legal_refs", "dup_group", "dup_content_of", "last_modified",
    # 운영·감사 필드
    "row_status", "is_new_detail", "boundary_cell", "updated_at", "updated_by",
]
_JSON_COLS = {"hazard_items", "controls_items", "legal_refs"}


class KbStore:
    """SQLite 기반 KB 운영 저장소. 스레드 안전(단일 커넥션 + Lock)."""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = str(db_path or config.KB_SQLITE_PATH)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False,
                                     timeout=30.0)
        self._conn.row_factory = sqlite3.Row
        # WAL: 재인덱싱 읽기(active_rows)와 CRUD 쓰기 동시성 향상 + 락 대기(30s).
        try:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA busy_timeout=30000")
            self._conn.execute("PRAGMA synchronous=NORMAL")
        except Exception:  # noqa: BLE001
            pass
        self._tax = TaxonomyLookup.load()
        self._init_schema()

    def _init_schema(self) -> None:
        cols_sql = ",\n  ".join(f'"{c}" TEXT' for c in _COLUMNS)
        with self._lock:
            self._conn.execute(f'CREATE TABLE IF NOT EXISTS kb_rows (\n  {cols_sql},\n'
                               '  PRIMARY KEY("chunk_id")\n)')
            self._conn.execute(
                'CREATE TABLE IF NOT EXISTS kb_audit ('
                'id INTEGER PRIMARY KEY AUTOINCREMENT, chunk_id TEXT, op TEXT, '
                'actor TEXT, ts TEXT, before TEXT, after TEXT)')
            self._conn.execute(
                'CREATE TABLE IF NOT EXISTS kb_seq (name TEXT PRIMARY KEY, val INTEGER)')
            self._conn.commit()

    # ── 시드 ────────────────────────────────────────────────────────────
    def seed_if_empty(self, chunks_path: Optional[str] = None) -> int:
        """chunks.jsonl → 저장소 적재. 이미 행이 있으면 skip. 반환: 적재 행수."""
        with self._lock:
            cur = self._conn.execute("SELECT COUNT(*) AS n FROM kb_rows")
            if cur.fetchone()["n"] > 0:
                return 0
        path = chunks_path or str(config.CHUNKS_PATH)
        n = 0
        with open(path, encoding="utf-8") as f:
            rows = []
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                m = dict(rec["metadata"])
                m.setdefault("row_status", "active")
                m.setdefault("is_new_detail", False)
                m["boundary_cell"] = is_boundary_cell(int(m["severity"]),
                                                      int(m["frequency"]))
                m["updated_at"] = m.get("last_modified") or now_iso()
                m["updated_by"] = "seed"
                rows.append(m)
                n += 1
            with self._lock:
                for m in rows:
                    self._insert_row(m, actor="seed", op="seed", audit=False)
                self._conn.commit()
        logger.info("kb_store seeded: %d rows from %s", n, path)
        return n

    # ── 내부 직렬화 ──────────────────────────────────────────────────────
    @staticmethod
    def _to_db(m: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for c in _COLUMNS:
            v = m.get(c)
            if c in _JSON_COLS:
                out[c] = json.dumps(v or [], ensure_ascii=False)
            elif isinstance(v, bool):
                out[c] = "1" if v else "0"
            elif v is None:
                out[c] = None
            else:
                out[c] = str(v)
        return out

    @staticmethod
    def _from_db(row: sqlite3.Row) -> dict[str, Any]:
        m: dict[str, Any] = {}
        for c in _COLUMNS:
            v = row[c]
            if c in _JSON_COLS:
                m[c] = json.loads(v) if v else []
            elif c in ("severity", "frequency", "risk_product", "source_row"):
                m[c] = int(v) if v not in (None, "") else None
            elif c in ("grade_inconsistent", "is_new_detail", "boundary_cell"):
                m[c] = v in ("1", "True", "true")
            else:
                m[c] = v
        return m

    def _insert_row(self, m: dict[str, Any], actor: str, op: str,
                    audit: bool = True) -> None:
        db = self._to_db(m)
        placeholders = ",".join("?" for _ in _COLUMNS)
        self._conn.execute(
            f'INSERT OR REPLACE INTO kb_rows ({",".join(chr(34)+c+chr(34) for c in _COLUMNS)}) '
            f'VALUES ({placeholders})',
            [db[c] for c in _COLUMNS])
        if audit:
            self._audit(m["chunk_id"], op, actor, before=None, after=m)

    def _audit(self, chunk_id: str, op: str, actor: str,
               before: Optional[dict], after: Optional[dict]) -> None:
        self._conn.execute(
            "INSERT INTO kb_audit (chunk_id, op, actor, ts, before, after) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (chunk_id, op, actor, now_iso(),
             json.dumps(before, ensure_ascii=False) if before else None,
             json.dumps(after, ensure_ascii=False) if after else None))

    def _next_seq(self, name: str) -> int:
        cur = self._conn.execute("SELECT val FROM kb_seq WHERE name=?", (name,))
        r = cur.fetchone()
        nxt = (r["val"] if r else 0) + 1
        self._conn.execute("INSERT OR REPLACE INTO kb_seq (name, val) VALUES (?, ?)",
                           (name, nxt))
        return nxt

    # ── 조회 ────────────────────────────────────────────────────────────
    def get(self, chunk_id: str, include_deleted: bool = True) -> Optional[dict[str, Any]]:
        with self._lock:
            cur = self._conn.execute("SELECT * FROM kb_rows WHERE chunk_id=?", (chunk_id,))
            row = cur.fetchone()
        if row is None:
            return None
        m = self._from_db(row)
        if not include_deleted and m.get("row_status") == "deleted":
            return None
        return m

    def list_rows(self, *, q: Optional[str] = None,
                  major_type: Optional[str] = None, sub_type: Optional[str] = None,
                  accident_type: Optional[str] = None, risk_grade: Optional[str] = None,
                  critical_register: Optional[str] = None,
                  include_deleted: bool = False,
                  offset: int = 0, limit: int = 50,
                  sort: str = "chunk_id") -> tuple[list[dict[str, Any]], int]:
        clauses: list[str] = []
        params: list[Any] = []
        if not include_deleted:
            clauses.append("row_status != 'deleted'")
        for col, val in (("major_type", major_type), ("sub_type", sub_type),
                         ("accident_type", accident_type), ("risk_grade", risk_grade),
                         ("critical_register", critical_register)):
            if val:
                clauses.append(f'"{col}" = ?')
                params.append(val)
        if q:
            clauses.append('("hazard_text" LIKE ? OR "controls" LIKE ? '
                           'OR "detail_item" LIKE ?)')
            like = f"%{q}%"
            params.extend([like, like, like])
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        sort_col = sort if sort in _COLUMNS else "chunk_id"
        with self._lock:
            total = self._conn.execute(
                f"SELECT COUNT(*) AS n FROM kb_rows{where}", params).fetchone()["n"]
            cur = self._conn.execute(
                f'SELECT * FROM kb_rows{where} ORDER BY "{sort_col}" '
                f"LIMIT ? OFFSET ?", [*params, limit, offset])
            rows = [self._from_db(r) for r in cur.fetchall()]
        return rows, total

    def active_rows(self) -> list[dict[str, Any]]:
        """재인덱싱 대상 — row_status=active 전체(chunk_id 순)."""
        with self._lock:
            cur = self._conn.execute(
                "SELECT * FROM kb_rows WHERE row_status='active' ORDER BY chunk_id")
            return [self._from_db(r) for r in cur.fetchall()]

    # ── 변이(CRUD) — 도메인 규칙 서버 강제 ────────────────────────────────
    def _normalize_payload(self, payload: dict[str, Any],
                           existing: Optional[dict] = None) -> dict[str, Any]:
        """입력 검증 + 도메인 규칙 적용. ValueError(메시지)로 검증 실패 전파."""
        def pick(key, default=None):
            return payload.get(key, existing.get(key) if existing else default)

        major = (pick("major_type") or "").strip()
        sub = (pick("sub_type") or "").strip()
        detail = (pick("detail_item") or "").strip()
        accident = (pick("accident_type") or "기타").strip()
        if not major or not sub or not detail:
            raise ValueError("major_type / sub_type / detail_item 필수")
        if accident not in VALID_ACCIDENT_TYPES:
            raise ValueError(f"accident_type '{accident}' 비허용(21종 enum)")

        try:
            sev = int(pick("severity"))
            freq = int(pick("frequency"))
        except (TypeError, ValueError):
            raise ValueError("severity / frequency 는 정수 1~5")
        if not (1 <= sev <= 5 and 1 <= freq <= 5):
            raise ValueError("severity / frequency 범위 1~5")

        tax = self._tax.resolve(major, sub, detail)
        if tax["errors"]:
            raise ValueError("; ".join(tax["errors"]))

        rules = apply_domain_rules(sev, freq, pick("critical_register"))
        hazard = (pick("hazard_text") or "").strip()
        controls = (pick("controls") or "").strip()
        if not hazard:
            raise ValueError("hazard_text 필수")

        m = {
            "major_type": major, "sub_type": sub, "detail_item": detail,
            "major_type_id": tax["major_type_id"], "sub_type_id": tax["sub_type_id"],
            "detail_item_id": tax["detail_item_id"], "accident_type": accident,
            "severity": sev, "frequency": freq,
            "risk_product": rules["risk_product"], "risk_grade": rules["risk_grade"],
            "expected_grade": rules["risk_grade"], "grade_inconsistent": False,
            "critical_register": rules["critical_register"],
            "boundary_cell": rules["boundary_cell"],
            "hazard_text": hazard,
            "hazard_items": payload.get("hazard_items")
                            or [x.strip() for x in hazard.split("·") if x.strip()],
            "controls": controls,
            "controls_items": payload.get("controls_items")
                              or [x.strip() for x in controls.split("·") if x.strip()],
            "legal_refs": pick("legal_refs") or [],
            "dup_group": pick("dup_group") or "",
            "dup_content_of": "",
            "is_new_detail": tax["is_new_detail"],
            "last_modified": now_iso(),
            "row_status": "active",
        }
        text = build_chunk_text(m)
        m["content_hash"] = sha256(text)
        return m

    def create(self, payload: dict[str, Any], actor: str) -> dict[str, Any]:
        with self._lock:
            m = self._normalize_payload(payload)
            seq = self._next_seq("new_chunk")
            m["chunk_id"] = f"N{seq}"
            # 신규행 source_row: 음수 시퀀스(원본 Excel 행과 구분 + lineage)
            m["source_row"] = -seq
            m["updated_at"] = now_iso()
            m["updated_by"] = actor
            self._insert_row(m, actor=actor, op="create")
            self._conn.commit()
        return m

    def update(self, chunk_id: str, payload: dict[str, Any],
               actor: str) -> dict[str, Any]:
        with self._lock:
            existing = self.get(chunk_id)
            if existing is None or existing.get("row_status") == "deleted":
                raise KeyError(chunk_id)
            m = self._normalize_payload(payload, existing=existing)
            m["chunk_id"] = chunk_id
            m["source_row"] = existing["source_row"]
            m["dup_group"] = existing.get("dup_group", "")
            m["updated_at"] = now_iso()
            m["updated_by"] = actor
            self._conn.execute(
                "UPDATE kb_rows SET " + ",".join(f'"{c}"=?' for c in _COLUMNS) +
                " WHERE chunk_id=?",
                [*[self._to_db(m)[c] for c in _COLUMNS], chunk_id])
            self._audit(chunk_id, "update", actor, before=existing, after=m)
            self._conn.commit()
        return m

    def soft_delete(self, chunk_id: str, actor: str) -> dict[str, Any]:
        with self._lock:
            existing = self.get(chunk_id)
            if existing is None:
                raise KeyError(chunk_id)
            self._conn.execute(
                "UPDATE kb_rows SET row_status='deleted', updated_at=?, updated_by=? "
                "WHERE chunk_id=?", (now_iso(), actor, chunk_id))
            self._audit(chunk_id, "delete", actor, before=existing, after=None)
            self._conn.commit()
            existing["row_status"] = "deleted"
        return existing

    # ── 통계·감사 ────────────────────────────────────────────────────────
    def stats(self) -> dict[str, Any]:
        with self._lock:
            active = self._conn.execute(
                "SELECT COUNT(*) AS n FROM kb_rows WHERE row_status='active'"
            ).fetchone()["n"]
            deleted = self._conn.execute(
                "SELECT COUNT(*) AS n FROM kb_rows WHERE row_status='deleted'"
            ).fetchone()["n"]
            by_major = {r["major_type"]: r["n"] for r in self._conn.execute(
                "SELECT major_type, COUNT(*) AS n FROM kb_rows "
                "WHERE row_status='active' GROUP BY major_type").fetchall()}
            by_grade = {r["risk_grade"]: r["n"] for r in self._conn.execute(
                "SELECT risk_grade, COUNT(*) AS n FROM kb_rows "
                "WHERE row_status='active' GROUP BY risk_grade").fetchall()}
            new_rows = self._conn.execute(
                "SELECT COUNT(*) AS n FROM kb_rows "
                "WHERE row_status='active' AND chunk_id LIKE 'N%'").fetchone()["n"]
        return {
            "active_rows": active, "deleted_rows": deleted,
            "new_rows": new_rows,
            "by_major_type": by_major, "by_risk_grade": by_grade,
        }

    def audit_log(self, chunk_id: Optional[str] = None,
                  limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            if chunk_id:
                cur = self._conn.execute(
                    "SELECT * FROM kb_audit WHERE chunk_id=? ORDER BY id DESC LIMIT ?",
                    (chunk_id, limit))
            else:
                cur = self._conn.execute(
                    "SELECT * FROM kb_audit ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in cur.fetchall()]


# ── 싱글톤 ─────────────────────────────────────────────────────────────────────
_store: Optional[KbStore] = None


def get_kb_store() -> KbStore:
    global _store
    if _store is None:
        _store = KbStore()
        _store.seed_if_empty()
    return _store


def reset_kb_store() -> None:
    """테스트용 싱글톤 리셋."""
    global _store
    if _store is not None:
        try:
            _store._conn.close()
        except Exception:  # noqa: BLE001
            pass
    _store = None
