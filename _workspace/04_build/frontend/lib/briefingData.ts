/**
 * 오늘의 현장 브리핑 — 정적 데모 데이터.
 *
 * 출처: _workspace/02_foundation/chunks.jsonl 에서 major_type='재해 사례'(MJ020, 133행) 중
 *       재해형태가 서로 다른 대표 5건을 추출(hazard_text·controls 원문 보존).
 *       추후 RAG '재해사례' 코퍼스 실시간 질의로 교체 가능(provider 추상화 정합).
 *
 * 별·기명(홍길동 등) 등 데모 원문의 식별성 표식은 마스킹/축약하지 않고 그대로 전시하되,
 * UI에서는 앞쪽 ★ 마커를 제거해 노출(briefingCases 가공값 사용).
 */

export interface AccidentCase {
  chunk_id: string;
  source_row: number;
  accident_type: string; // 재해형태(추락/낙하/협착 …)
  severity: number; // 강도 1~5
  frequency: number; // 빈도 1~5
  risk_grade: "상" | "중" | "하";
  hazard: string; // 위험요인 원문(★ 제거)
  control: string; // 대표 개선대책 1건
}

/** 재해형태가 서로 다른 대표 사례 5건(원본 데이터에서 추출). */
export const ACCIDENT_CASES: AccidentCase[] = [
  {
    chunk_id: "R04338",
    source_row: 4338,
    accident_type: "추락",
    severity: 5,
    frequency: 4,
    risk_grade: "상",
    hazard: "E/V PIT 내 청소작업 출입 시 사전 작업계획 미수립으로 추락의 위험",
    control: "명일위험작업회의 시 세부일정 확인하여 작업계획 수립(인원·생명줄·감시요원 지정)",
  },
  {
    chunk_id: "R04341",
    source_row: 4341,
    accident_type: "전도",
    severity: 5,
    frequency: 4,
    risk_grade: "상",
    hazard: "방바닥 통미장 호스 운반·이동 중 안전모 턱끈 미체결 상태에서 넘어져 두부 손상 위험",
    control: "작업 전 안전모·턱끈 착용 교육, 이동 중 핸드레일 파지·입수보행 금지 전파",
  },
  {
    chunk_id: "R04345",
    source_row: 4345,
    accident_type: "낙하",
    severity: 4,
    frequency: 5,
    risk_grade: "상",
    hazard: "외부 특화석 코킹 작업 중 상부 비계에 남은 석자재가 떨어져 맞음",
    control: "비계 작업발판에서 석재 절단·가공 지양, 잔재 즉시 정리",
  },
  {
    chunk_id: "R04346",
    source_row: 4346,
    accident_type: "비래",
    severity: 4,
    frequency: 5,
    risk_grade: "상",
    hazard: "벽체 상부에 임시 고정된 석재가 탈락하며 떨어져 안면에 맞음",
    control: "석공사 벽체 시공 시 석재 고정 추가 보강 실시",
  },
  {
    chunk_id: "R04376",
    source_row: 4376,
    accident_type: "협착",
    severity: 4,
    frequency: 5,
    risk_grade: "상",
    hazard: "달비계 로프를 내리던 중 로프와 난간대 사이에 엄지손가락이 끼임",
    control: "로프 꼬임상태 사전 확인, 보호장갑 착용 및 손 위치 관리",
  },
];

/** 오늘의 안전 팁 — 로테이션(현장 TBM 교육 톤). */
export const SAFETY_TIPS: string[] = [
  "고소작업 전 안전대 체결을 2회 확인하세요. 부착 위치는 가능한 한 머리 위로.",
  "강풍·우천 시 양중 작업은 작업중지 기준을 먼저 확인하세요(타워크레인 10/15 m/s).",
  "굴착면 부근 접근 전 흙막이 계측·균열을 점검하고, 강우 후에는 붕괴 위험을 재평가하세요.",
  "밀폐공간 진입 전 산소·유해가스 농도를 측정하고 감시인을 배치하세요.",
  "중량물 운반 시 이동 동선의 협착·끼임 지점을 사전 표시하고 신호수를 지정하세요.",
];

/** 공종 트리 빠른 탐색용 대공종 목록(taxonomy major.csv 일부). */
export interface MajorTaxon {
  id: string;
  name: string;
  count: number;
}

export const MAJOR_TAXONS: MajorTaxon[] = [
  { id: "MJ001", name: "가설공사", count: 524 },
  { id: "MJ004", name: "철골공사", count: 47 },
  { id: "MJ005", name: "골조(콘크리트)", count: 91 },
  { id: "MJ006", name: "골조(형틀)", count: 189 },
  { id: "MJ008", name: "습식공사", count: 239 },
  { id: "MJ009", name: "마감공사", count: 276 },
  { id: "MJ012", name: "토공 및 가시설", count: 451 },
  { id: "MJ015", name: "전기/통신", count: 209 },
  { id: "MJ016", name: "소방/기계설비", count: 262 },
  { id: "MJ017", name: "토목 전문공사", count: 1352 },
];

/** 날짜를 시드로 사용해 결정론적으로 회전(데모 재현성). */
export function caseOfDay(d = new Date()): AccidentCase {
  const idx = (d.getFullYear() + d.getMonth() + d.getDate()) % ACCIDENT_CASES.length;
  return ACCIDENT_CASES[idx];
}
