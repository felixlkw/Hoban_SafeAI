/**
 * KB(지식베이스) 운영 화면 mock — NEXT_PUBLIC_USE_MOCK=true 데모.
 *
 * - 대표 30행(실제 chunks.jsonl에서 다양한 대공종 20종·등급·재해형태·경계셀 추출).
 * - CRUD 시뮬레이션 + 서버 도메인 규칙 재현(등급 임계곱·중점등록 자동·경계셀 존중).
 * - 재인덱싱 상태 시퀀스: 변이 시 pending→running→idle 로 비동기 전이(index_version++).
 *   stats 폴링(2s)으로 화면이 running 스피너 → idle 토스트로 진행하도록 한다.
 *
 * 모든 변이는 in-memory(모듈 전역). 새로고침 시 시드로 복귀(데모 일관성).
 */

import {
  KbRow,
  KbRowList,
  KbRowWrite,
  KbStats,
  KbListQuery,
  ReindexAck,
  RiskGrade,
  CriticalRegister,
} from "./types";

// ─── 시드 데이터(대표 30행) ──────────────────────────────────────────────
// 주: R00010 은 원본에 곱16인데 등급'중'으로 기재된 데이터 이상치였다.
// 서버 규칙(≥16→상)에 맞춰 시드 자체를 규칙 정합으로 보정(상·O·경계셀).
const SEED: KbRow[] = [
  {"chunk_id": "R00010", "source_row": 10, "major_type": "가설공사", "sub_type": "타워크레인(T형)", "detail_item": "보조 크레인 양중", "accident_type": "낙하", "severity": 4, "frequency": 4, "risk_product": 16, "risk_grade": "상", "critical_register": "O", "hazard_text": "작업구역 통제 미실시 : 낙하", "hazard_items": ["작업구역 통제 미실시 : 낙하"], "controls": "하부통제구역 설정 및 관리자 배치 확인 · 신호수 지정 배치", "controls_items": ["하부통제구역 설정 및 관리자 배치 확인", "신호수 지정 배치"], "legal_refs": [], "boundary_cell": true, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00284", "source_row": 284, "major_type": "가설공사", "sub_type": "엘리베이터 개구부", "detail_item": "안전난간대 설치", "accident_type": "낙하", "severity": 4, "frequency": 4, "risk_product": 16, "risk_grade": "상", "critical_register": "O", "hazard_text": "난간대 설치 작업시 공도구 낙하위험", "hazard_items": ["난간대 설치 작업시 공도구 낙하위험"], "controls": "공도구별 개별 결속(로프, 커넥터), 공도구용 낙하방지 장비, 이탈방지끈 확인", "controls_items": ["공도구별 개별 결속(로프, 커넥터), 공도구용 낙하방지 장비, 이탈방지끈 확인"], "legal_refs": [], "boundary_cell": true, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00287", "source_row": 287, "major_type": "가설공사", "sub_type": "엘리베이터 개구부", "detail_item": "안전난간대 설치", "accident_type": "추락", "severity": 4, "frequency": 4, "risk_product": 16, "risk_grade": "상", "critical_register": "O", "hazard_text": "안전방호대 설치 작업시 추락 위험발생", "hazard_items": ["안전방호대 설치 작업시 추락 위험발생"], "controls": "방호대 설치시 안전고리체결 실시", "controls_items": ["방호대 설치시 안전고리체결 실시"], "legal_refs": [], "boundary_cell": true, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00032", "source_row": 32, "major_type": "가설공사", "sub_type": "타워크레인(T형)", "detail_item": "타워크레인 사용", "accident_type": "붕괴", "severity": 4, "frequency": 5, "risk_product": 20, "risk_grade": "상", "critical_register": "O", "hazard_text": "고정된 물체를 인발하는 작업 또는 고정된 물체에 줄걸이가 걸려 타워크레인 붕괴", "hazard_items": ["고정된 물체를 인발하는 작업 또는 고정된 물체에 줄걸이가 걸려 타워크레인 붕괴"], "controls": "고정된 물체 인발작업 금지 · 고정된 물체에 줄걸이가 걸렸을 경우 무리하게 작동하여 줄걸이를 빼지않고 하부 인원의 도움을 받을 것", "controls_items": ["고정된 물체 인발작업 금지", "고정된 물체에 줄걸이가 걸렸을 경우 무리하게 작동하여 줄걸이를 빼지않고 하부 인원의 도움을 받을 것"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00069", "source_row": 69, "major_type": "가설공사", "sub_type": "타워크레인(L형)", "detail_item": "유압실린더 작동 마스트 상승/연결", "accident_type": "붕괴", "severity": 4, "frequency": 5, "risk_product": 20, "risk_grade": "상", "critical_register": "O", "hazard_text": "상부 불균형으로 인한 붕괴", "hazard_items": ["상부 불균형으로 인한 붕괴"], "controls": "양방향 균형유지(밸런스웨이트 사용 必) · 마스트 고정용 핀 체결 확인 必(규정토크) · 지브균형유지 및 마스트 볼트 및 너트 완전조임 이전에 상부 회전 절대 금지", "controls_items": ["양방향 균형유지(밸런스웨이트 사용 必)", "마스트 고정용 핀 체결 확인 必(규정토크)", "지브균형유지 및 마스트 볼트 및 너트 완전조임 이전에 상부 회전 절대 금지"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00073", "source_row": 73, "major_type": "가설공사", "sub_type": "타워크레인(L형)", "detail_item": "타워크레인 사용", "accident_type": "붕괴", "severity": 5, "frequency": 4, "risk_product": 20, "risk_grade": "상", "critical_register": "O", "hazard_text": "자재인양시 로드셀 및 인디케이터 미작동으로 인한 타워크레인 붕괴", "hazard_items": ["자재인양시 로드셀 및 인디케이터 미작동으로 인한 타워크레인 붕괴"], "controls": "인디케이터의 트롤리 거리, 중량물 하중, 정격 하중 등이 정상적으로 표시되는지 확인 · 제원이 확실한 중량물을 인양 하여 로드셀이 정확히 인식하는지 확인", "controls_items": ["인디케이터의 트롤리 거리, 중량물 하중, 정격 하중 등이 정상적으로 표시되는지 확인", "제원이 확실한 중량물을 인양 하여 로드셀이 정확히 인식하는지 확인"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00074", "source_row": 74, "major_type": "가설공사", "sub_type": "타워크레인(L형)", "detail_item": "타워크레인 사용", "accident_type": "붕괴", "severity": 5, "frequency": 4, "risk_product": 20, "risk_grade": "상", "critical_register": "O", "hazard_text": "고정된 물체를 인발하는 작업 또는 고정된 물체에 줄걸이가 걸려 타워크레인 붕괴", "hazard_items": ["고정된 물체를 인발하는 작업 또는 고정된 물체에 줄걸이가 걸려 타워크레인 붕괴"], "controls": "고정된 물체 인발작업 금지 · 고정된 물체에 줄걸이가 걸렸을 경우 무리하게 작동하여 줄걸이를 빼지않고 하부 인원의 도움을 받을 것", "controls_items": ["고정된 물체 인발작업 금지", "고정된 물체에 줄걸이가 걸렸을 경우 무리하게 작동하여 줄걸이를 빼지않고 하부 인원의 도움을 받을 것"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00526", "source_row": 526, "major_type": "파일공사", "sub_type": "항타기 조립/해체", "detail_item": "리더 제원 확인", "accident_type": "전도", "severity": 4, "frequency": 2, "risk_product": 8, "risk_grade": "하", "critical_register": "X", "hazard_text": "리더 제원 초과로 장비 전도사고", "hazard_items": ["리더 제원 초과로 장비 전도사고"], "controls": "항타기 반입전 장비 제원을 확인하고 리더 장착가능여부를 확인", "controls_items": ["항타기 반입전 장비 제원을 확인하고 리더 장착가능여부를 확인"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00583", "source_row": 583, "major_type": "PC공사", "sub_type": "PC공사", "detail_item": "천공 및 앙카 작업", "accident_type": "감전", "severity": 4, "frequency": 2, "risk_product": 8, "risk_grade": "하", "critical_register": "X", "hazard_text": "피복/접지/전선거치 불량으로 인한 감전", "hazard_items": ["피복/접지/전선거치 불량으로 인한 감전"], "controls": "사용전 피복/접지상태 확인 · 전선거치대 사용 전선거치(통행로 전선관리)", "controls_items": ["사용전 피복/접지상태 확인", "전선거치대 사용 전선거치(통행로 전선관리)"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00612", "source_row": 612, "major_type": "철골공사", "sub_type": "데크플레이트", "detail_item": "자재 반입", "accident_type": "기타", "severity": 5, "frequency": 1, "risk_product": 5, "risk_grade": "하", "critical_register": "X", "hazard_text": "데크플레이트 조립도, 작업순서 미작성, 미검토로 개구부 미확인", "hazard_items": ["데크플레이트 조립도, 작업순서 미작성, 미검토로 개구부 미확인"], "controls": "조립도 및 작업순서 사전 검토 · 각종 개구부의 안전시설 확정", "controls_items": ["조립도 및 작업순서 사전 검토", "각종 개구부의 안전시설 확정"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00659", "source_row": 659, "major_type": "골조(콘크리트)", "sub_type": "콘크리트 면 보양", "detail_item": "자재 반입", "accident_type": "낙하", "severity": 5, "frequency": 1, "risk_product": 5, "risk_grade": "하", "critical_register": "X", "hazard_text": "자재 하역시 미결속으로 인한 자재 낙하 · 자재 양중 중 줄걸이 미흡으로 자재 낙하", "hazard_items": ["자재 하역시 미결속으로 인한 자재 낙하", "자재 양중 중 줄걸이 미흡으로 자재 낙하"], "controls": "자재 하역 전 자재 결속 상태 확인 · 주변 구획 설정 및 인원 통제 실시 · 양중 작업반경 통제 철저 · 동 간 이동시 신호수 2인이상 배치", "controls_items": ["자재 하역 전 자재 결속 상태 확인", "주변 구획 설정 및 인원 통제 실시", "양중 작업반경 통제 철저", "동 간 이동시 신호수 2인이상 배치"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00750", "source_row": 750, "major_type": "골조(형틀)", "sub_type": "보 슬래브", "detail_item": "시공도 작성", "accident_type": "붕괴", "severity": 3, "frequency": 3, "risk_product": 9, "risk_grade": "하", "critical_register": "X", "hazard_text": "거푸집 동바리 변위, 변형 · 거푸집 동바리 붕괴", "hazard_items": ["거푸집 동바리 변위, 변형", "거푸집 동바리 붕괴"], "controls": "구조계산서 작성 및 검토여부 확인 · 거푸집 동바리 시공도 작성 및 검토여부 확인", "controls_items": ["구조계산서 작성 및 검토여부 확인", "거푸집 동바리 시공도 작성 및 검토여부 확인"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00939", "source_row": 939, "major_type": "골조(철근)", "sub_type": "철근 가공", "detail_item": "장철 인양작업", "accident_type": "낙하", "severity": 1, "frequency": 3, "risk_product": 3, "risk_grade": "하", "critical_register": "X", "hazard_text": "과하중 양중으로 인한 장철 낙하 위험", "hazard_items": ["과하중 양중으로 인한 장철 낙하 위험"], "controls": "양중 전 작업계획서 수립 및 점검 · 적절한 슬링벨트 및 달기구 사용 · 한 번에 과하게 양중 금지", "controls_items": ["양중 전 작업계획서 수립 및 점검", "적절한 슬링벨트 및 달기구 사용", "한 번에 과하게 양중 금지"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R01008", "source_row": 1008, "major_type": "습식공사", "sub_type": "조적", "detail_item": "자재 하역", "accident_type": "협착", "severity": 5, "frequency": 1, "risk_product": 5, "risk_grade": "하", "critical_register": "X", "hazard_text": "지게차 부주의 및 무리한 자재적재로 인한 협착", "hazard_items": ["지게차 부주의 및 무리한 자재적재로 인한 협착"], "controls": "전도 등 근로자가 위험해질 우려가 있는 경우 유도자 배치 · 하역작업시 자재 후면 등에 근로자가 없도록 조치 · 적재하중을 준수 및 무리한 작업 금지", "controls_items": ["전도 등 근로자가 위험해질 우려가 있는 경우 유도자 배치", "하역작업시 자재 후면 등에 근로자가 없도록 조치", "적재하중을 준수 및 무리한 작업 금지"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R01247", "source_row": 1247, "major_type": "마감공사", "sub_type": "석공사 벽체", "detail_item": "석재 자재반입", "accident_type": "전도", "severity": 1, "frequency": 5, "risk_product": 5, "risk_grade": "하", "critical_register": "X", "hazard_text": "자재반입時 차량 이동구간內 유도자 未배치 · 자재묶음 고정해체 時 차량 상부 자재전도", "hazard_items": ["자재반입時 차량 이동구간內 유도자 未배치", "자재묶음 고정해체 時 차량 상부 자재전도"], "controls": "하역작업시 자재 후면 근로자 접근금지 · 자재하역時 차량, 적재자재 상부이동 금지", "controls_items": ["하역작업시 자재 후면 근로자 접근금지", "자재하역時 차량, 적재자재 상부이동 금지"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R01523", "source_row": 1523, "major_type": "금속공사", "sub_type": "트러스", "detail_item": "자재반입/운반", "accident_type": "협착", "severity": 2, "frequency": 4, "risk_product": 8, "risk_grade": "하", "critical_register": "X", "hazard_text": "지게차 후진 중 협착/충돌", "hazard_items": ["지게차 후진 중 협착/충돌"], "controls": "운전자외 탑승금지 및 주용도 외 사용제한 · 전도 등 근로자가 위험해질 우려가 있는 경우 유도자 배치", "controls_items": ["운전자외 탑승금지 및 주용도 외 사용제한", "전도 등 근로자가 위험해질 우려가 있는 경우 유도자 배치"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R01563", "source_row": 1563, "major_type": "창호공사", "sub_type": "현관문", "detail_item": "작업준비", "accident_type": "전도", "severity": 3, "frequency": 5, "risk_product": 15, "risk_grade": "중", "critical_register": "X", "hazard_text": "복장, 작업도구 준비불량", "hazard_items": ["복장, 작업도구 준비불량"], "controls": "안전장구, 도구준비, 하차구역 통제", "controls_items": ["안전장구, 도구준비, 하차구역 통제"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R01671", "source_row": 1671, "major_type": "토공 및 가시설", "sub_type": "벌개제근 및 벌목", "detail_item": "경계측량 및 표시", "accident_type": "전도", "severity": 1, "frequency": 2, "risk_product": 2, "risk_grade": "하", "critical_register": "X", "hazard_text": "이동시 추락 및 전도", "hazard_items": ["이동시 추락 및 전도"], "controls": "안전모 등 개인보호구 착용", "controls_items": ["안전모 등 개인보호구 착용"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R02122", "source_row": 2122, "major_type": "부대토목", "sub_type": "관로터파기", "detail_item": "사전조사", "accident_type": "기타", "severity": 1, "frequency": 5, "risk_product": 5, "risk_grade": "하", "critical_register": "X", "hazard_text": "지장매설물에 대한 충분한 사전조사 미흡으로 인한 피해 (Ex:통신선 절단, 수도관로, 가스관 파손등)", "hazard_items": ["지장매설물에 대한 충분한 사전조사 미흡으로 인한 피해 (Ex:통신선 절단, 수도관로, 가스관 파손등)"], "controls": "관로공사 작업전 기존의 지하매설물에 대한 설계도서 및 지반조사보고서 검토 후 작업 실시", "controls_items": ["관로공사 작업전 기존의 지하매설물에 대한 설계도서 및 지반조사보고서 검토 후 작업 실시"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R02227", "source_row": 2227, "major_type": "조경 및 시설물", "sub_type": "조경토 부설, 수목 식재", "detail_item": "자재, 장비 반입", "accident_type": "협착", "severity": 3, "frequency": 3, "risk_product": 9, "risk_grade": "하", "critical_register": "X", "hazard_text": "장비 점검 미실시로 인한 안전장치의 누락으로 충돌, 협착 사고", "hazard_items": ["장비 점검 미실시로 인한 안전장치의 누락으로 충돌, 협착 사고"], "controls": "장비 일일안전점검 실시 · 후진경보음/감시카메라 등 이상유무 확인 · 버킷 유압 커플러 안전핀 체결/식별 관리", "controls_items": ["장비 일일안전점검 실시", "후진경보음/감시카메라 등 이상유무 확인", "버킷 유압 커플러 안전핀 체결/식별 관리"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R02314", "source_row": 2314, "major_type": "전기/통신", "sub_type": "RACE WAY", "detail_item": "공구/자재 준비", "accident_type": "감전", "severity": 3, "frequency": 3, "risk_product": 9, "risk_grade": "하", "critical_register": "X", "hazard_text": "공도구 점검, 고소작업대 사용 수칙 等 교육 · 각종 공도구 사용 전 필증 부착 상태 확인", "hazard_items": ["공도구 점검, 고소작업대 사용 수칙 等 교육", "각종 공도구 사용 전 필증 부착 상태 확인"], "controls": "작업 전 T.B.M 실시 · 공도구 점검 철저", "controls_items": ["작업 전 T.B.M 실시", "공도구 점검 철저"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R02523", "source_row": 2523, "major_type": "소방/기계설비", "sub_type": "공조기, 외조기", "detail_item": "작업준비", "accident_type": "기타", "severity": 1, "frequency": 1, "risk_product": 1, "risk_grade": "하", "critical_register": "X", "hazard_text": "작업구간 위험요인 및 간섭 사항 확인", "hazard_items": ["작업구간 위험요인 및 간섭 사항 확인"], "controls": "타공정간 간섭사항 협의 후 작업 진행 · 작업전 위험성평가에 따른 사고예방 대책 수립", "controls_items": ["타공정간 간섭사항 협의 후 작업 진행", "작업전 위험성평가에 따른 사고예방 대책 수립"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R02785", "source_row": 2785, "major_type": "토목 전문공사", "sub_type": "가설도로", "detail_item": "벌목 및 표토제거 작업", "accident_type": "협착", "severity": 3, "frequency": 1, "risk_product": 3, "risk_grade": "하", "critical_register": "X", "hazard_text": "벌목 작업 시 쓰러지는 나무에 깔림", "hazard_items": ["벌목 작업 시 쓰러지는 나무에 깔림"], "controls": "벌목작업 시 로프 등으로 전도되는 방향 유도", "controls_items": ["벌목작업 시 로프 등으로 전도되는 방향 유도"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R04137", "source_row": 4137, "major_type": "기타공사", "sub_type": "할석", "detail_item": "작업준비", "accident_type": "감전", "severity": 3, "frequency": 3, "risk_product": 9, "risk_grade": "하", "critical_register": "X", "hazard_text": "작업공도구 및 작업전선 미 점검으로 인한 감전위험", "hazard_items": ["작업공도구 및 작업전선 미 점검으로 인한 감전위험"], "controls": "작업전 작업공구 및 작업전선 점검으로 감전사고 예방", "controls_items": ["작업전 작업공구 및 작업전선 점검으로 감전사고 예방"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R04216", "source_row": 4216, "major_type": "공통 일반", "sub_type": "양중작업", "detail_item": "이동식크레인", "accident_type": "낙하", "severity": 1, "frequency": 1, "risk_product": 1, "risk_grade": "하", "critical_register": "X", "hazard_text": "계획되지 않은 작업", "hazard_items": ["계획되지 않은 작업"], "controls": "작업계획 수립 (작업반경, 인양능력, 줄걸이 등) · 하부통제, 상/하부 감시자 배치", "controls_items": ["작업계획 수립 (작업반경, 인양능력, 줄걸이 등)", "하부통제, 상/하부 감시자 배치"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R04338", "source_row": 4338, "major_type": "재해 사례", "sub_type": "중대재해", "detail_item": "중대재해", "accident_type": "추락", "severity": 5, "frequency": 4, "risk_product": 20, "risk_grade": "상", "critical_register": "O", "hazard_text": "★★ E/V PIT 내 청소작업을 위하여 출입이 필요할 시, 사전에 작업계획 미수립으로 추락의 위험", "hazard_items": ["★★ E/V PIT 내 청소작업을 위하여 출입이 필요할 시, 사전에 작업계획 미수립으로 추락의 위험"], "controls": "명일위험작업회의시 세부일정 확인하여 작업계획 수립 · 상주 감시요원 지정 · 일일당직자는 작업계획을 근로자에게 교육", "controls_items": ["명일위험작업회의시 세부일정 확인하여 작업계획 수립", "상주 감시요원 지정", "일일당직자는 작업계획을 근로자에게 교육"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00004", "source_row": 4, "major_type": "가설공사", "sub_type": "타워크레인(T형)", "detail_item": "자재 반입 및 하역", "accident_type": "충돌", "severity": 3, "frequency": 3, "risk_product": 9, "risk_grade": "하", "critical_register": "X", "hazard_text": "자재 하역구간 통제 미실시로 자재 및 차량 충돌", "hazard_items": ["자재 하역구간 통제 미실시로 자재 및 차량 충돌"], "controls": "동선계획 수립 및 통제라인 설정 · 작업반경 내 출입금지 조치 상태 확인", "controls_items": ["동선계획 수립 및 통제라인 설정", "작업반경 내 출입금지 조치 상태 확인"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00015", "source_row": 15, "major_type": "가설공사", "sub_type": "타워크레인(T형)", "detail_item": "Basic Mast 설치", "accident_type": "기타", "severity": 3, "frequency": 3, "risk_product": 9, "risk_grade": "하", "critical_register": "X", "hazard_text": "타워 마스터 연결핀 설치 시 햄머 사용으로 인한 충격 소음 발생", "hazard_items": ["타워 마스터 연결핀 설치 시 햄머 사용으로 인한 충격 소음 발생"], "controls": "햄머 사용 작업자 귀마개 착용 · 소음 연속노출 방지를 위한 휴식시간 부여 · 귀마개 착용법 등 소음예방 관련 교육 실시", "controls_items": ["햄머 사용 작업자 귀마개 착용", "소음 연속노출 방지를 위한 휴식시간 부여", "귀마개 착용법 등 소음예방 관련 교육 실시"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00024", "source_row": 24, "major_type": "가설공사", "sub_type": "타워크레인(T형)", "detail_item": "후크설치 및 와이어링", "accident_type": "낙하", "severity": 1, "frequency": 3, "risk_product": 3, "risk_grade": "하", "critical_register": "X", "hazard_text": "와이어로프 이탈방지 장치 미설치로 인한 와이어 이탈", "hazard_items": ["와이어로프 이탈방지 장치 미설치로 인한 와이어 이탈"], "controls": "와이어로프 이탈방지 장치 설치상태 확인", "controls_items": ["와이어로프 이탈방지 장치 설치상태 확인"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
  {"chunk_id": "R00028", "source_row": 28, "major_type": "가설공사", "sub_type": "타워크레인(T형)", "detail_item": "유압실린더 작동 마스트 상승/연결", "accident_type": "낙하", "severity": 3, "frequency": 3, "risk_product": 9, "risk_grade": "하", "critical_register": "X", "hazard_text": "마스트 인양 중 와이어로프 파단으로 마스트 낙하", "hazard_items": ["마스트 인양 중 와이어로프 파단으로 마스트 낙하"], "controls": "와이어로프 반입시 자재 검수 · 정기 호이스트 와이어로프 정밀점검 시행", "controls_items": ["와이어로프 반입시 자재 검수", "정기 호이스트 와이어로프 정밀점검 시행"], "legal_refs": [], "boundary_cell": false, "is_new_detail": false, "row_status": "active", "updated_at": "2026-05-18T00:00:00+09:00", "updated_by": "etl"},
];

// ─── in-memory 상태 ──────────────────────────────────────────────────────
let store: KbRow[] = SEED.map((r) => ({ ...r }));
let newSeq = 1; // N{seq}
let indexVersion = 7;
let docCount = store.filter((r) => r.row_status === "active").length;
let reindexStatus: "idle" | "pending" | "running" = "idle";
let lastReindexAt: string | null = "2026-05-18T03:12:00+09:00";
let reindexTimer: ReturnType<typeof setTimeout> | null = null;

/** 데모 리셋(테스트 격리용). */
export function _resetKbMock() {
  store = SEED.map((r) => ({ ...r }));
  newSeq = 1;
  indexVersion = 7;
  docCount = store.filter((r) => r.row_status === "active").length;
  reindexStatus = "idle";
  lastReindexAt = "2026-05-18T03:12:00+09:00";
  if (reindexTimer) clearTimeout(reindexTimer);
  reindexTimer = null;
}

// ─── 서버 도메인 규칙 재현 ───────────────────────────────────────────────
function recompute(
  severity: number,
  frequency: number,
  boundaryRegisterInput?: CriticalRegister | "O (잠정)" | null,
): { risk_product: number; risk_grade: RiskGrade; critical_register: CriticalRegister; boundary_cell: boolean } {
  const product = severity * frequency;
  const boundary_cell = severity === 4 && frequency === 4;
  let risk_grade: RiskGrade;
  if (product >= 16) risk_grade = "상";
  else if (product >= 10) risk_grade = "중";
  else risk_grade = "하";
  let critical_register: CriticalRegister;
  if (boundary_cell) {
    // 경계셀: 입력 존중("O (잠정)"·null → 잠정 O로 수렴)
    critical_register = boundaryRegisterInput === "X" ? "X" : "O";
  } else {
    critical_register = risk_grade === "상" ? "O" : "X";
  }
  return { risk_product: product, risk_grade, critical_register, boundary_cell };
}

/** 변이 후 재인덱싱 시퀀스 스케줄(pending→running→idle). 비동기 전이로 폴링 데모. */
function scheduleReindex() {
  reindexStatus = "pending";
  if (reindexTimer) clearTimeout(reindexTimer);
  reindexTimer = setTimeout(() => {
    reindexStatus = "running";
    reindexTimer = setTimeout(() => {
      indexVersion += 1;
      docCount = store.filter((r) => r.row_status === "active").length;
      lastReindexAt = new Date().toISOString();
      reindexStatus = "idle";
      reindexTimer = null;
    }, 1600);
  }, 700);
}

// ─── CRUD API (api.ts에서 USE_MOCK 분기로 호출) ──────────────────────────
export async function listKbRows(query: KbListQuery = {}): Promise<KbRowList> {
  const {
    q,
    major_type,
    sub_type,
    accident_type,
    risk_grade,
    critical_register,
    include_deleted = false,
    offset = 0,
    limit = 50,
  } = query;
  let rows = store.slice();
  if (!include_deleted) rows = rows.filter((r) => r.row_status !== "deleted");
  if (major_type) rows = rows.filter((r) => r.major_type === major_type);
  if (sub_type) rows = rows.filter((r) => r.sub_type === sub_type);
  if (accident_type) rows = rows.filter((r) => r.accident_type === accident_type);
  if (risk_grade) rows = rows.filter((r) => r.risk_grade === risk_grade);
  if (critical_register) rows = rows.filter((r) => r.critical_register === critical_register);
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    rows = rows.filter((r) =>
      [r.hazard_text, r.controls, r.detail_item, r.sub_type, r.major_type, r.chunk_id]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle)),
    );
  }
  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  return { rows: page.map((r) => ({ ...r })), total, offset, limit };
}

export async function getKbRow(chunkId: string): Promise<KbRow> {
  const row = store.find((r) => r.chunk_id === chunkId);
  if (!row) throw new Error("NOT_FOUND");
  return { ...row };
}

function applyWrite(base: Partial<KbRow>, body: KbRowWrite): KbRow {
  const calc = recompute(body.severity, body.frequency, body.critical_register);
  const hazard_items = body.hazard_text
    .split(/[·\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const controls_items = (body.controls || "")
    .split(/[·\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const is_new_detail = isNewDetail(body);
  return {
    chunk_id: base.chunk_id || "",
    source_row: base.source_row ?? null,
    major_type: body.major_type,
    sub_type: body.sub_type,
    detail_item: body.detail_item,
    accident_type: body.accident_type || "기타",
    severity: body.severity,
    frequency: body.frequency,
    risk_product: calc.risk_product,
    risk_grade: calc.risk_grade,
    critical_register: calc.critical_register,
    boundary_cell: calc.boundary_cell,
    is_new_detail,
    hazard_text: body.hazard_text,
    hazard_items,
    controls: body.controls || "",
    controls_items,
    legal_refs: body.legal_refs || [],
    row_status: "active",
    updated_at: new Date().toISOString(),
    updated_by: "safety_manager(데모)",
  };
}

/** 세부항목이 기존 taxonomy(시드)에 없으면 신규로 표시. */
function isNewDetail(body: KbRowWrite): boolean {
  return !store.some(
    (r) => r.major_type === body.major_type && r.sub_type === body.sub_type && r.detail_item === body.detail_item,
  );
}

export async function createKbRow(body: KbRowWrite): Promise<KbRow> {
  const chunk_id = `N${String(newSeq).padStart(4, "0")}`;
  newSeq += 1;
  const row = applyWrite({ chunk_id, source_row: -newSeq }, body);
  store.unshift(row);
  scheduleReindex();
  return { ...row };
}

export async function updateKbRow(chunkId: string, body: KbRowWrite): Promise<KbRow> {
  const idx = store.findIndex((r) => r.chunk_id === chunkId);
  if (idx < 0) throw new Error("NOT_FOUND");
  const merged = applyWrite({ chunk_id: chunkId, source_row: store[idx].source_row }, body);
  store[idx] = merged;
  scheduleReindex();
  return { ...merged };
}

export async function deleteKbRow(chunkId: string): Promise<KbRow> {
  const idx = store.findIndex((r) => r.chunk_id === chunkId);
  if (idx < 0) throw new Error("NOT_FOUND");
  store[idx] = { ...store[idx], row_status: "deleted", updated_at: new Date().toISOString(), updated_by: "safety_manager(데모)" };
  scheduleReindex();
  return { ...store[idx] };
}

export async function kbStats(): Promise<KbStats> {
  const active = store.filter((r) => r.row_status !== "deleted");
  const deleted = store.filter((r) => r.row_status === "deleted");
  const byMajor: Record<string, number> = {};
  const byGrade: Record<string, number> = { 상: 0, 중: 0, 하: 0 };
  for (const r of active) {
    byMajor[r.major_type] = (byMajor[r.major_type] || 0) + 1;
    byGrade[r.risk_grade] = (byGrade[r.risk_grade] || 0) + 1;
  }
  return {
    active_rows: active.length,
    deleted_rows: deleted.length,
    new_rows: store.filter((r) => r.chunk_id.startsWith("N")).length,
    by_major_type: byMajor,
    by_risk_grade: byGrade,
    reindex_status: reindexStatus,
    index_version: indexVersion,
    last_reindex_at: lastReindexAt,
    doc_count: docCount,
    last_change_ratio: 0.0,
    regression_recommended: false,
  };
}

export async function kbReindex(): Promise<ReindexAck> {
  // 수동 트리거: 즉시 동기 완료(핫스왑).
  if (reindexTimer) clearTimeout(reindexTimer);
  indexVersion += 1;
  docCount = store.filter((r) => r.row_status === "active").length;
  lastReindexAt = new Date().toISOString();
  reindexStatus = "idle";
  reindexTimer = null;
  return {
    status: "ok",
    index_version: indexVersion,
    doc_count: docCount,
    last_reindex_at: lastReindexAt,
    last_duration_ms: 1480,
    regression_recommended: false,
  };
}
