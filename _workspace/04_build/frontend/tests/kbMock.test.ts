import { describe, it, expect, beforeEach } from "vitest";
import {
  listKbRows,
  createKbRow,
  updateKbRow,
  deleteKbRow,
  kbStats,
  kbReindex,
  _resetKbMock,
} from "@/lib/kbMock";

/**
 * KB mock CRUD·필터·서버 규칙 재현 검증.
 * 서버가 등급·중점등록을 강제 재계산하므로 mock도 동일하게 산정해야 한다.
 */
describe("KB mock — 필터·페이징", () => {
  beforeEach(() => _resetKbMock());

  it("시드 30행 로드 + 대공종 20종 커버", async () => {
    const all = await listKbRows({ limit: 500 });
    expect(all.total).toBe(30);
    const majors = new Set(all.rows.map((r) => r.major_type));
    expect(majors.size).toBe(20);
  });

  it("텍스트 검색은 위험요인·대책·세부항목에서 매칭", async () => {
    const res = await listKbRows({ q: "와이어로프" });
    expect(res.total).toBeGreaterThan(0);
    expect(res.rows.every((r) => /와이어로프/.test(r.hazard_text + r.controls + r.detail_item))).toBe(true);
  });

  it("등급·재해형태·중점등록 필터 조합", async () => {
    const high = await listKbRows({ risk_grade: "상" });
    expect(high.rows.every((r) => r.risk_grade === "상")).toBe(true);
    const reg = await listKbRows({ critical_register: "O" });
    expect(reg.rows.every((r) => r.critical_register === "O")).toBe(true);
  });
});

describe("KB mock — 서버 도메인 규칙 재계산", () => {
  beforeEach(() => _resetKbMock());

  it("생성 시 등급·중점등록은 강도×빈도로 자동 산정(입력 무시)", async () => {
    const row = await createKbRow({
      major_type: "가설공사",
      sub_type: "타워크레인(T형)",
      detail_item: "마스트 해체",
      accident_type: "추락",
      severity: 5,
      frequency: 4, // 20 → 상
      hazard_text: "해체 중 추락",
      controls: "안전대 체결",
    });
    expect(row.risk_grade).toBe("상");
    expect(row.critical_register).toBe("O");
    expect(row.chunk_id.startsWith("N")).toBe(true);
  });

  it("곱16 경계셀은 critical_register 입력 존중 + boundary_cell", async () => {
    const row = await createKbRow({
      major_type: "가설공사",
      sub_type: "타워크레인(T형)",
      detail_item: "경계셀 테스트",
      severity: 4,
      frequency: 4,
      hazard_text: "테스트",
      critical_register: "X",
    });
    expect(row.boundary_cell).toBe(true);
    expect(row.risk_grade).toBe("상");
    expect(row.critical_register).toBe("X");
  });

  it("신규 세부항목은 is_new_detail 표시", async () => {
    const row = await createKbRow({
      major_type: "가설공사",
      sub_type: "타워크레인(T형)",
      detail_item: "완전히새로운세부항목XYZ",
      severity: 1,
      frequency: 1,
      hazard_text: "테스트",
    });
    expect(row.is_new_detail).toBe(true);
  });

  it("수정 후 변경값으로 등급 재산정", async () => {
    const before = (await listKbRows({ q: "와이어 이탈" })).rows[0];
    const updated = await updateKbRow(before.chunk_id, {
      major_type: before.major_type,
      sub_type: before.sub_type,
      detail_item: before.detail_item,
      accident_type: before.accident_type,
      severity: 5,
      frequency: 4, // 20 → 상
      hazard_text: before.hazard_text,
      controls: before.controls,
    });
    expect(updated.risk_grade).toBe("상");
  });

  it("소프트 삭제는 기본 검색에서 제외", async () => {
    const target = (await listKbRows({ limit: 1 })).rows[0];
    await deleteKbRow(target.chunk_id);
    const after = await listKbRows({ q: target.chunk_id });
    expect(after.rows.find((r) => r.chunk_id === target.chunk_id)).toBeUndefined();
    const withDeleted = await listKbRows({ q: target.chunk_id, include_deleted: true });
    expect(withDeleted.rows.find((r) => r.chunk_id === target.chunk_id)?.row_status).toBe("deleted");
  });
});

describe("KB mock — 재인덱싱", () => {
  beforeEach(() => _resetKbMock());

  it("변이 후 reindex_status가 idle이 아니게 되고, 수동 재인덱싱은 버전을 올린다", async () => {
    const s0 = await kbStats();
    await createKbRow({
      major_type: "가설공사",
      sub_type: "타워크레인(T형)",
      detail_item: "x",
      severity: 1,
      frequency: 1,
      hazard_text: "y",
    });
    const s1 = await kbStats();
    expect(s1.reindex_status).not.toBe("idle"); // pending/running 전이
    const ack = await kbReindex();
    expect(ack.index_version).toBeGreaterThan(s0.index_version);
    const s2 = await kbStats();
    expect(s2.reindex_status).toBe("idle");
  });
});
