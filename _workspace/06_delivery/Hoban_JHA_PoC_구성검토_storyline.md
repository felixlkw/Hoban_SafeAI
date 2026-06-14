# 호반그룹 JHA AI 에이전트 PoC 구성(안) 검토 — 스토리라인

> 작성: pwc-consultant (삼일 PwC AX) · 대상: 호반그룹 오픈이노베이션팀·EHS
> 산출물: `Hoban_JHA_PoC_구성검토.pptx` (22장) · 생성 스크립트: `gen_slides.js` · 최신 산출본: `Hoban_JHA_PoC_구성검토_v2.pptx`(원본·`_baseline` 잠김 대비 산출명)
> 취지: "이렇게 PoC를 구성하려고 하는데, 함께 검토해 주시기 바랍니다" — PoC 구성 검토 요청 자료
> 원칙: 두괄식 거버닝 메시지 · 음슴체 · 산출물 실측 수치만 · Mock 검증 항목은 "실 LLM 검증 필요" 정직 표기

---

## 슬라이드별 거버닝 메시지

| # | 제목 | 거버닝 메시지 (한 줄) |
|---|------|----------------------|
| 1 | (표지) 호반그룹 작업위험성평가(JHA) AI 에이전트 PoC 구성(안) | PoC 구성 검토 요청 자료 — 오픈이노베이션팀·EHS 협의용 표지 |
| 2 | 목차 (Contents) | 추진 배경 → PoC 개요 → 데이터 → 아키텍처 → 검증 → 검토 안건 6개 섹션 구성 |
| 3 | (섹션1 디바이더) 추진 배경 | 수기 위험성평가의 한계를 자연어·AI 추천 구조로 전환 |
| 4 | 추진 배경 — As-Is의 3대 부담을 AI 추천 구조로 전환 | 현 평가는 수기 입력·수동 검색·주관적 등급에 의존해 업무 부하·역량 편차·데이터 휘발이 누적됨. 자연어 입력→AI 분류·기준 제안→객관적 등급 가이드→ERP 자동 등록 구조로 전환 필요 |
| 5 | **(NEW) 추진 배경 — 동종사도 안전 AI 전환 중, 자연어·RAG·ERP 연동이 차별점** | 중대재해처벌법(2022 시행·2024 5인↑ 전면확대) 대응으로 동종사가 안전 AI 전환 가속(공개 자료 기준). 현대건설 재해예측AI(3,900만 건 빅데이터)·삼성물산 현장 AI안전·스마트 위험성평가 SaaS 확산·글로벌 RAG/LLM 기반 JSA 연구가 흐름. 다수가 영상AI·예측에 집중한 가운데 호반은 자연어→RAG 근거검색→ERP 자동등록의 평가 생성 자동화로 차별화 가능(동향은 공개 자료 기반·경쟁사 내부정보 추정 아님) |
| 6 | (섹션2 디바이더) PoC 개요 | 자연어 입력부터 ERP 등록까지 5단계 파이프라인을 데모로 시연 |
| 7 | PoC 범위 — 입력부터 등록까지 5단계 파이프라인 | 입력→분류→위험요인·등급→검토·확정→ERP 등록을 PoC 범위로 정의. 작업자 입력·검토, 안전관리자 확정·등록의 역할 분기 구조 |
| 8 | 데모 시나리오 — 난이도·재해형태·가드레일 다양화 5건 | 추락·붕괴·복합재해·갭(밀폐공간)을 고루 포함해 분류·등급·인용·refuse 거동 시연. Mock 어댑터로 외부 LLM 호출 없이 결정적 재현 가능 |
| 9 | (섹션3 디바이더) 데이터 구성 | 전사 위험요인 4,469행을 정제·청킹·인덱스로 자산화 |
| 10 | 데이터 구성 — 전사 위험요인 4,469행을 단일 자산으로 | 대공종20·중공종254·세부1,182·재해형태21의 3계층 체계. 결측·범위위반·인코딩손상 0건으로 정제 품질 확보(실측). 등급 상 518행 TOP4가 전체 상의 73.8% |
| 11 | 데이터 구성 — KRAS 5×5 등급 체계와 자산화 파이프라인 | 실데이터 역산으로 등급 임계곱 확정(하≤9/중10~15/상≥16). 곱16만 상·중 혼합인 경계셀로 자동확정 않고 안전관리자 판단에 위임. 정제→청킹→BM25 인덱스(dense는 차기), PII 0건·화이트리스트 |
| 12 | 데이터 구성 — 운영 가능한 Data Pipeline 구성계획 | 안전관리자가 위험요인 데이터를 직접 관리하면 무결성 강제·자동 재인덱싱을 거쳐 AI 지식베이스가 즉시 갱신되는 운영 파이프라인을 구성함. 타 현장 우수사례·신규 위험요인이 휘발되지 않고 전사 지식자산으로 축적됨(Problem #3 데이터 휘발 대응). 신규 계획부는 ‘구성 계획(구현 중)’으로 정직 구분 표기 |
| 13 | (섹션4 디바이더) AI 에이전트 아키텍처 | RAG 파이프라인·신뢰성 가드레일·Human-in-the-loop·ERP 연동 |
| 14 | AI 아키텍처 — RAG 파이프라인 7단계 (검색→생성→검산) | 의도추출·메타필터로 검색공간을 4,469→수십 건 축소 후 LLM 추천. 등급·중점등록·인용은 LLM 불신·백엔드가 결정적 재계산·검증. LLM은 공급자 추상화(기본 OpenAI gpt-4.1, 모델 env 교체 가능)로 어댑터 격리, 동적 위험(기상·지형)은 차기 확장 |
| 15 | AI 아키텍처 — 신뢰성 가드레일과 Human-in-the-loop | AI 신뢰성을 코드로 강제 — 인용 강제·등급 재계산·경계셀 인간판단·갭영역 거절. 안전관리자 확정 전 ERP 등록을 finalize 409 + 어댑터 ErpFatal 이중 게이트로 차단 |
| 16 | (섹션5 디바이더) 검증 현황 | 실 LLM baseline 실측 — 핵심 품질축 임계 충족, 인용 정밀축은 측정방법 개선 과제 |
| 17 | 검증 현황 — 실 LLM(gpt-4.1) baseline 실측 결과 | 분류0.897·hazard0.882·등급0.790·refuse1.0·faithfulness4.71·control0.795·legal0.909 등 핵심 품질축 임계 충족(judge 편향점검 통과). citation_precision0.336·recall0.618은 미달이나 원인은 환각 아닌 gold 행-ID 입도 불일치(동등 중복행 인용) → 평가(동등행 집합)·모델(canonical 정규화) 병행 개선 과제. critical 과소 2건(GS-0001·GS-0010)은 지배재해 강제후보 주입으로 보강. 측정 기준상 미달은 미달로 정직 표기 |
| 18 | 검증 현황 — 테스트 커버리지와 데모 화면 구성 | 백엔드55·프론트엔드72·E2E12건 테스트로 메커니즘 검증. 챗+상시 동반 패널로 분류·매트릭스·인용 원문·등록 결과를 단계별 시연 |
| 19 | (섹션6 디바이더) 검토 요청 사항 | 함께 결정할 안건 — ERP I/F·DB 접근·검증 계획·데이터 범위 |
| 20 | 검토 요청 사항 — 고객과 함께 결정할 안건 | 실 LLM baseline 측정 완료(2026-06-12). 운영 전환 위해 ERP I/F 확정(P0)·DB 접근 ETL 배치 승인·전문가 검증(≥200건) 계획·데이터 추가 범위, 그리고 인용 평가 기준 개선(동등행 집합 합의)·등급 과소 2건 보강 후 회귀 재측정을 함께 결정 필요 |
| 21 | **(NEW) PwC 구축방안 — PoC 검증을 토대로 단계적 확장(Phase별 게이트·역할분담)** | 검증된 PoC를 기준으로 PoC(현재)→파일럿(실데이터·실 LLM·전문가 검증 ≥200건)→운영(실 ERP·동적위험 실 API·전사 확산)을 의사결정 게이트로 단계 확장. 각 단계 산출물·게이트 조건을 명시하고, 호반 결정사항(ERP I/F·DB 접근·검증 리소스·데이터 범위)과 삼일 PwC(AX) 제공자산(RAG·가드레일·평가 프레임워크 재사용·단계 게이트 방법론·어댑터 격리)을 분리해 추진 |
| 22 | 마무리 — 운영 전환 로드맵 및 협의 요청 | PoC→운영 전환은 dense·실 LLM baseline·refuse 보강·실 ERP 연동·전문가 검증을 순차 게이트로 진행. 각 단계 진입 전 검토 안건 결정을 전제로 협의 요청 |

---

## 콘텐츠 출처 매핑 (원문 충실 — 외부 수치 무첨가)

| 슬라이드 | 근거 산출물 |
|---------|------------|
| 4 As-Is/To-Be | 고객 요구사항 원문(As-Is/Problem/To-Be/핵심기술/제약사항) |
| **5 동종사 동향(NEW)** | **WebSearch 공개 자료(2024~2026): 현대건설 재해예측AI(hdec.kr 뉴스룸·hyundai.co.kr·m-i.kr — 10년 3,900만 건 빅데이터), 삼성물산 성수 K-프로젝트 AI안전(sedaily.com), 클라우드랩 스마트위험성평가 SaaS 채택(enetnews.co.kr·fntoday.co.kr — 100위내 주요사 포함 5,000여 기업·7만 사용자), 중대재해처벌법 2024 5인↑ 전면확대(saige.ai·boannews.com), 글로벌 RAG/LLM 기반 JSA 연구(ascelibrary.org·link.springer.com·arxiv.org). 경쟁사 내부정보 추정 없음, 모두 공개 보도/발표 수준** |
| 7 범위·역할 | `03_design/session_state_machine.md`, `ux_user_journey`, `ux_companion_panel.md` |
| 8 데모 5건 | `01_discovery/safety_scope.md §4`, `05_integration/demo_script.md` |
| 10 데이터 개요 | `01_discovery/data_profile.md`, `safety_scope.md §1~2` |
| 11 KRAS·파이프라인 | `02_foundation/safety_risk_matrix_spec.md`, `data_profile.md §7`, `data_security_policy` |
| 12 Data Pipeline 구성계획 | 확정 계획(2026-06-12) — 안전관리자 CRUD·무결성 자동강제·자동 재인덱싱·품질 게이트. 등급 임계곱은 `safety_risk_matrix_spec.md` 정합. 신규부는 ‘구성 계획(구현 중)’ 정직 표기 |
| 14 RAG | `02_foundation/rag_architecture.md`, `rag_retrieval_spec.md` |
| 15 가드레일·HITL | `02_foundation/rag_guardrails.md`, `03_design/session_state_machine.md`, `erp_access_strategy.md` |
| 17 검증(실측) | `04_build/eval/reports/20260612_openai_gpt41_baseline.md` + `..._analysis.md` (gpt-4.1 baseline 35건 실측·judge 편향점검·에러분석) |
| 20 검토 안건 | `01_discovery/erp_interface_inventory.md §5`, `03_design/erp_access_strategy.md`, `eval_final_report.md §7` |
| **21 PwC 구축방안(NEW)** | **`05_integration/eval_final_report.md §7`(운영 전환 게이트 6단계), `03_design/erp_access_strategy.md §5`(PoC→운영1차 webhook→운영2차 CDC→운영대안 ERP API 전환), `05_integration/safety_final_review.md §7`, `.claude/skills/jha-dynamic-risk/references/api_onboarding_runbook.md`(기상청·V-World 실 API 차기 연동). 외부 수치 무첨가·프로젝트 실측/계획 기반** |
| 22 로드맵 | `eval_final_report.md §7`, `safety_final_review.md §7`, `erp_access_strategy.md §5` |

---

## 수치 기준·정직 표기 메모

- **데이터**: 4,469행 / 대공종20·중공종254·세부1,182·재해형태21 / 하2,444·중1,507·상518 — `data_profile.md` 실측.
- **등급 임계곱**: 하≤9 / 중10~15 / 상≥16, 99.22% 재현, 곱16 경계셀 상249·중35 — `safety_risk_matrix_spec.md` 실데이터 역산(SKILL 가설값 아님).
- **테스트 카운트(실측)**: 백엔드 55(pytest collected, gap_guardrail parametrize 20 포함 — `eval_final_report.md §2.6` 기준), 프론트엔드 단위 72(`tests/*.test.tsx` it-block 실집계), E2E 12(`e2e/*.spec.ts` test() 실집계).
  - **기준 시점 각주**: `eval_final_report.md`(2026-06-10)는 프론트 13으로 기재하나, 이후 companion 패널 작업(`ux_companion_panel.md`, 2026-06-11)으로 프론트 테스트가 72(단위)+12(e2e)로 증가함. 본 덱은 **최신 실집계치**를 사용. 백엔드 55는 최신 보고서와 일치.
- **검증 실측(2026-06-12)**: gpt-4.1 baseline 35건 실측으로 그간 "Mock 종속 보류"였던 품질 메트릭이 처음 측정됨. 핵심 품질축(분류0.897·hazard0.882·등급0.790·refuse1.0·faithfulness4.71·control0.795·legal0.909) 임계 충족. citation_precision0.336·citation_recall0.618만 미달 — 원인은 환각이 아닌 gold 행-ID 입도 불일치(동등 중복행 인용)이며 legal_recall0.909·faithfulness4.71이 인용 내용 신뢰성을 교차검증. 단 측정 기준상 미달은 미달로 표기(과장 금지). 개선은 평가(동등행 집합화)·모델(canonical 행 정규화) 병행. critical 과소평가 2건(GS-0001 해체 추락 누락·GS-0010 열풍기 폭발 과소)은 지배재해 강제후보 주입으로 보강.
- **ERP 가정**: 모든 ERP I/F·SLA·보안 수치는 `[검증 필요]` 가정(운영팀 인터뷰 부재) — 슬라이드는 확정 표현 회피, "확정 필요(P0)"로 안건화.

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-12 | 초판 작성 — 19장 PoC 구성 검토 덱(표지·목차·6섹션·마무리) | 호반 오픈이노베이션팀·EHS 대상 PoC 구성 검토 요청 |
| 2026-06-12 | §3 데이터 구성에 11번 ‘Data Pipeline 구성계획’ 1장 추가(KRAS 뒤·§4 디바이더 앞) → 20장. 목차 페이지 정합 갱신(§4 12·§5 15·§6 18). 기존 파일 `_v1` 백업. 안전관리자 CRUD→무결성 자동강제→자동 재인덱싱→품질게이트 흐름, 신규부 ‘구성 계획(구현 중)’ 정직 구분 표기 | 운영 가능 데이터 파이프라인 계획 확정 반영 — Problem #3 ‘데이터 휘발’ 대응 서사 강화 |
| 2026-06-12 | 실 LLM(gpt-4.1) baseline 실측 반영 3곳: ① §5 슬라이드16을 ‘메커니즘 검증/실LLM 보류’에서 실측 메트릭 표+FAIL 정직해석으로 전면 교체(11 PASS·2 FAIL), ② §6 슬라이드19 ‘baseline 측정 시점’ 안건을 완료 처리하고 후속 2건(인용 평가 기준 동등행 집합 합의·등급 과소 2건 보강 후 회귀 재측정)으로 교체, ③ §4 슬라이드13 LLM 표기를 ‘공급자 추상화(기본 OpenAI gpt-4.1, 모델 env 교체 가능)’로 갱신(기존 Claude/Sonnet→Opus 표기 정리). 원본·`_new.pptx` 모두 PowerPoint 점유로 잠김 → 검증 완료본을 `_baseline.pptx`(20장)로 산출. 근거: `04_build/eval/reports/20260612_openai_gpt41_baseline{,_analysis}.md` | 실 LLM baseline 실측 결과 반영 — 핵심 품질축 임계 충족 확인 + 인용 정밀축 측정방법 개선 과제 정직 고지 |
| 2026-06-14 | 콘텐츠 2장 추가 → **22장**: ① §1 추진 배경에 슬라이드5 ‘동종사 AI 기반 JHA 적용 동향’(WebSearch 공개 자료 — 현대건설 재해예측AI·삼성물산 현장AI안전·스마트위험성평가 SaaS 확산·중대재해처벌법 가속·글로벌 RAG/LLM JSA 연구. 좌 동종사 4카드 / 우 호반 차별점 3카드 + 시사점 밴드. 동향은 공개 보도/발표 수준·경쟁사 내부정보 추정 없음), ② §6 검토안건 뒤 슬라이드21 ‘PwC 구축방안’(PoC→파일럿→운영 3-Phase 게이트 + 호반 결정/삼일 PwC 제공 역할분담. 근거 `eval_final_report.md §7`·`erp_access_strategy.md §5`·`api_onboarding_runbook.md`, 외부 수치 무첨가). 목차 페이지 정합 갱신(§2 06·§3 09·§4 13·§5 16·§6 19), 슬라이드 페이지 전수 재계산(동종사 삽입 후 +1, PwC방안은 §6 내 삽입으로 마무리만 22로 밀림). 원본·`_baseline.pptx` 잠김 대비 `_v2.pptx`(22장)로 산출 — zip 무결성 OK·slide XML 22개 확인 | 동종사 동향(추진 배경 강화)·PwC 단계 구축방안(딜리버리 가치) 추가 요청 |
| 2026-06-14 | **박스 텍스트 서식 규칙 적용 재생성**(콘텐츠·수치·서사 불변, 서식만 개선) → **22장 유지**. pwc-pptx SKILL.md ‘단일 오브젝트 원칙’ 하위에 ‘박스 텍스트 정렬·여백 규칙’ 신설: 박스 내 제목/중심주제(헤더·라벨·매트릭스 셀 라벨·KPI 라벨)=가운데 정렬(`align:'center'`), 하위 내용(설명·세부항목)=불릿(`bullet:{indent:8}`) + 도형 좌측 inset 0.3cm(8.5pt) — 표·일반 단락 제외. gen_slides.js는 `sectionPanel`(헤더 center + body 불릿/좌측 inset)·`calloutNote`(불릿/좌측 inset) 헬퍼에 중앙 적용하고 `BODY_INSET=[8.5,2,2,2]` 상수 신설(pptxgenjs `margin` 배열이 `[lIns,rIns,bIns,tIns]` 순임을 라이브러리 소스 5389~5392 확인 후 좌측=`margin[0]`으로 교정 — 초안의 `[2,2,2,8.5]`는 8.5pt가 상단에 들어가 오작동했음). 기존 body 수동 `· ` 마커 4곳 제거(불릿 중복 방지). 원본·`_v2.pptx` 잠김 대비 `_v3.pptx`로 산출 — zip 무결성 OK·slide XML 22개·`algn="ctr"` 225개·body box `lIns="107950"`(8.5pt)·`buChar •` 반영 XML 확인 | 박스 내부 텍스트 가독성·심미성(제목 중앙 집중·하위 좌측 정렬축) 개선 — 전 슬라이드 일관 적용 |
