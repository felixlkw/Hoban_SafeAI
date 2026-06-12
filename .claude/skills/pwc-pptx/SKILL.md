---
name: pwc-pptx
description: "PwC 딜리버리 스타일 PPTX 프레젠테이션 생성 스킬 (48 패턴 + 삼일 PwC 표준 프레임 + 강욱님 보고 문체). pptxgenjs 기반. 'PwC 스타일', 'PwC 덱', '컨설팅 덱', '딜리버리 자료' 등 언급 시 사용. 일반 pptx 스킬 대신 우선 사용. 구조/비교/차트/리스크/프로세스/거버넌스/메시징/전략프레임워크/운영모델 등 전 영역 지원."
---

# PwC 딜리버리 스타일 PPTX (48 Patterns + 삼일 PwC 표준 프레임)

에셋의 `pwc_template.js`를 복사·수정하여 슬라이드 생성.

## 퀵 스타트

```bash
cp <스킬_디렉터리>/assets/pwc_template.js /home/claude/gen_slides.js
npm install -g pptxgenjs react react-dom react-icons sharp
export NODE_PATH=$(npm root -g)
# gen_slides.js의 DECK 객체와 build() 수정 후:
node /home/claude/gen_slides.js
cp /home/claude/slides.pptx /mnt/user-data/outputs/
```

## 삼일 PwC 표준 프레임 (실제 딜리버리 덱 기준 — 모든 슬라이드에 적용)

실제 삼일 PwC 산출물 덱을 기준으로 표준화된 5대 프레임 요소. 이 프레임을 벗어나지 않는다.

| 요소 | 표준 | 헬퍼 |
|------|------|------|
| **표지** | 좌측 백색 패널(pwc 로고+'삼일회계법인' 락업, 세리프 볼드 타이틀, 좌하단 날짜) + 우측 비주얼 패널 + 오렌지 평행사변형 모티프 오버레이 | `coverSamil()` |
| **목차** | 세리프 'Contents' 대제목 + 오렌지 볼드 번호 + 항목명 볼드 + 우측 페이지 번호 | `contentsList()` |
| **섹션 디바이더** | 피치(`C.peach`) 풀배경 + 우중앙 초대형(220pt) 오렌지 세리프 숫자 + 좌하단 세리프 볼드 타이틀 | `sectionDividerContent()` |
| **본문 타이틀** | 세리프 볼드 22pt 제목 + **거버닝 메시지**(완결된 서술형 리드 문장 1~2줄, 10.5pt). 키워드 나열 금지 — 슬라이드의 결론을 문장으로 선언 | `addTitle(slide, title, lead)` |
| **푸터** | 좌측 'Samil PwC'(볼드) + 덱 제목(회색) / 우측 페이지 번호 | `addFooter()` — `DECK.title` 자동 표기 |

**본문 밀도 원칙 (첨부 덱 수준)**: 본문 영역(y 1.4~5.1)을 멀티 패널로 꽉 채움. 좌측 아이콘 레일 + 중앙 다이어그램 + 우측 패널, 하단 `iconBand` 요약 밴드가 전형 구성. 폰트 8~10pt 고밀도 허용.

## 단일 오브젝트 원칙 (필수)

배경색 박스(addShape) 위에 텍스트박스(addText)를 겹쳐 올리는 **이중 오브젝트 생성 금지**. 수정 시 도형과 텍스트가 따로 움직여 편집성이 크게 떨어짐.

- **도형 안에 텍스트 직접 작성**: `slide.addText(text, {shape:'rect'|'roundRect'|'ellipse', fill:{color}, line:{color,width}, ...})` — 도형과 텍스트가 하나의 오브젝트가 됨
- **다단 구성은 텍스트 런(run)으로**: 레이블·수치·캡션처럼 스타일이 다른 다단 텍스트는 `[{text,options:{fontSize,bold,color,breakLine}},...]` 런 배열을 한 오브젝트에 작성 (statCard 참조)
- **표 형태는 addTable**: 키-값 스펙, KPI 목록, 매트릭스 등 행·열 구조는 셀별 fill을 가진 `slide.addTable()` 단일 오브젝트로 작성. rect 격자 + 텍스트 조합으로 표를 그리지 않음
- **허용되는 레이어링**: 텍스트 없는 순수 장식(악센트 바, 커넥터 라인, 배경 이미지)과 그 위의 독립 오브젝트 조합은 허용. 금지 대상은 "동일 영역에 박스 따로 + 텍스트 따로"인 경우임
- **텍스트 여백·줄간격 규칙**: 박스 텍스트의 내부 여백(inset)은 상하좌우 모두 0(`margin:0`)으로 통일. 줄간격은 기본값(single)을 유지하며, 폰트 크기보다 작은 `lineSpacing` 강제 지정 금지 — 글자 상하 겹침이 발생함. 항목 간 간격 조정은 `lineSpacing` 압축이 아닌 `paraSpaceAfter`로 처리
- 모든 기본 헬퍼(flowBox, calloutBand, statCard, numBadge, milestoneTag, phaseBanner, calloutNote, sectionPanel)는 이 원칙으로 구현되어 있음. sectionPanel은 `opts.body`에 문자열/런 배열을 넘기면 본문 박스에 텍스트를 직접 작성함

## 디자인 토큰 (변경 금지)

| 토큰 | 값 | 용도 |
|------|-----|------|
| `C.orange` | `EB6B16` | PwC 시그니처 |
| `C.peach` | `FBEEE2` | 피치 배경 |
| `C.ink` | `1A1A1A` | 제목, 다크 헤더 |
| `FONT_TITLE` | Noto Serif CJK KR | 세리프 제목 |
| `FONT_BODY` | 맑은 고딕 | 산세리프 본문 |
| `FONT_MONO` | Consolas | 코드, 수치 |

> **색상 규칙**: 슬라이드 본문에는 반드시 `C.orange` 계열만 사용. `C.green/red`는 KPI 증감·SWOT·리스크 히트맵 등 표준 상태 표시에만 허용. 부서/팀 구분에 blue/green 사용 금지 → `C.orangeLight/orangeDeep/peach` 계열로 대체.

## 콘텐츠 원칙 (중요)

- **원문 충실**: 사용자가 제공한 원문 콘텐츠만 사용한다. 외부 벤치마크·통계·사례(예: 타사 컨설팅펌 사례, 'ROI n% 향상' 류 리서치 수치, 프레임워크 용어)를 임의로 추가하지 않는다. 빈 공간은 원문의 다른 요소로 채우거나 레이아웃을 조정한다.
- **두괄식 거버닝 메시지**: 각 본문 슬라이드 타이틀 아래에는 슬라이드의 **결론·판단**을 선언하는 완결형 문장을 배치한다. 현상 묘사("~를 살펴봄")가 아니라 판단("~가 적절함", "~ 필요함")으로 쓴다.
- **음슴체 기본**: 거버닝 메시지·본문 모두 한국 기업 보고문체 음슴체("~함/~임")가 기본. 박스 내 항목은 명사형 종결("~ 필요", "~ 가능", "~ 확보"). 다나까체·구어체·실리콘밸리 영어 용어는 평이한 한국어로 치환.

## 문체 원칙 — 번역투 제거 (필수, 상세는 references/writing-style.md)

슬라이드 문구는 사용자의 보고 문체를 따른다. AI 특유의 번역투를 쓰지 않는다.

**번역투 → 보고 문체 변환**

| 번역투 (금지) | 보고 문체 (사용) |
|---|---|
| ~를 수행할 수 있습니다 / ~하는 것이 가능합니다 | ~ 가능 |
| ~하는 것이 필요합니다 / ~해야 할 것입니다 | ~ 필요 |
| ~를 통해 …를 달성합니다 | ~로 … 확보 |
| ~에 대한 검토가 요구됩니다 | ~ 검토 필요 |
| ~되어집니다 / ~로 여겨집니다 (피동 남용) | ~임 / ~로 판단 |
| 성공적으로 / 효과적으로 / 강력한 (수식어) | 삭제하거나 구체 수치·기준으로 대체 |
| ~라고 할 수 있습니다 | ~임 |
| ~하는 것을 목표로 합니다 | 목표: ~ / ~ 목표 |

**선호 표현**: "~로 정리 가능", "~ 관점에서 접근 필요", "~ 구조로 가져가는 것이 적절", "~ 리스크 존재", "~ 기준으로 우선순위화 필요", "~까지는 OO가 리드, 이후 확산은 담당 조직 이관"

**금지 표현**: "아마", "약간", "느낌", "일단 해보면", "지원해드리겠습니다" 류 정성 표현, 장황한 배경, 마케팅 수식어

**관점 전환 ("지원"보다 "구조")**: 단발성 지원 → 표준 운영모델 / 개별 PoC → 재사용 자산 / 요청 대응 → 우선순위 기반 수요관리 / 프로젝트 수행 → 사업화 플랫폼. 가능하면 리스크·판단 포인트를 함께 드러낸다.

## 48개 패턴 카탈로그

### A. 구조 (5)
| # | 패턴 | 헬퍼 |
|---|------|------|
| 1 | Cover | `coverSamil()` (삼일 표준) / `makeCoralBg()` |
| 2 | Agenda | `contentsList()` (삼일 표준) / `agendaItems()` |
| 3 | Section Divider | `sectionDividerContent()` |
| 4 | Executive Summary | `execSummaryColumns()` |
| 5 | Closing / Next Steps | 수동 |

### B. 비교 & 분석 (5)
| # | 패턴 | 헬퍼 |
|---|------|------|
| 6 | Two-Column Compare | 수동 + `calloutBand()` |
| 7 | Numbered Cards | `numberedCard()` |
| 8 | 2×2 Matrix | `matrix2x2()` |
| 9 | Harvey Ball Table | `makeHarveyBall()` |
| 10 | SWOT | `swotQuadrant()` |

### C. 데이터 & 차트 (8)
| # | 패턴 | 헬퍼 |
|---|------|------|
| 11 | Data Table | 수동 |
| 12 | Waterfall Chart | `waterfallChart()` |
| 13 | KPI Dashboard | `kpiCard()` |
| 14 | Funnel | `funnelDiagram()` |
| 23 | Stacked Bar | `stackedBarChart()` |
| 24 | Donut Chart | `donutChart()` (네이티브) |
| 25 | Line Trend | `lineTrendChart()` (네이티브) |
| 35 | Mekko Chart | `mekkoChart()` |

### D. 리스크 & 평가 (4)
| # | 패턴 | 헬퍼 |
|---|------|------|
| 26 | Tornado / Sensitivity | `tornadoChart()` |
| 27 | Risk Heatmap | `riskHeatmap()` |
| 30 | Maturity Assessment | `maturityAssessment()` |
| 33 | Checkmark Grid | `checkmarkGrid()` |

### E. 프로세스 & 일정 (5)
| # | 패턴 | 헬퍼 |
|---|------|------|
| 15 | Process Chevron | `processChevron()` |
| 16 | Timeline Milestone | `timelineMilestones()` |
| 17 | Gantt / Roadmap | `ganttRow()` |
| 18 | Swimlane | `swimlaneRow()` |
| 19 | Demo / Step | `progressStrip()` + 수동 |

### F. 구조 & 거버넌스 (5)
| # | 패턴 | 헬퍼 |
|---|------|------|
| 20 | Pyramid | `pyramidLayers()` |
| 28 | Org Chart | `orgChart()` |
| 29 | Venn Diagram | `vennDiagram()` |
| 34 | RACI Matrix | `raciMatrix()` |
| 36 | Value Chain | `valueChain()` |

### G. 메시징 & 의사결정 (4)
| # | 패턴 | 헬퍼 |
|---|------|------|
| 21 | Icon Grid | `iconTextTile()` |
| 22 | Quote / Key Message | `quoteBlock()` |
| 31 | Before/After Metrics | `beforeAfterMetrics()` |
| 32 | Scenario Comparison | `scenarioColumns()` |

### H. 전략 프레임워크 (6) ← NEW
| # | 패턴 | 헬퍼 | 출처 |
|---|------|------|------|
| 37 | Strategic House | `strategicHouse()` | 비전→미션→Pillars→기반 |
| 38 | 4-Quadrant Trend | `quadTrendAnalysis()` | 시장·기술·규제·경쟁 분석 |
| 39 | Alignment Cascade | `alignmentCascade()` | 비전→경영→실행 연계 |
| 41 | Option Scoring | `optionScoringTable()` | 가중치 평가 매트릭스 |
| 47 | Project Scope | `scopeTable()` | In/Out-Scope 정의 |
| 48 | Gap Analysis | `gapAnalysis()` | As-Is→Gap→To-Be |

### I. 운영 모델 & 실행 (6) ← NEW
| # | 패턴 | 헬퍼 | 출처 |
|---|------|------|------|
| 40 | Architecture Layers | `architectureLayers()` | IT 아키텍처 계층도 |
| 42 | Investment Plan | `investmentPlan()` | CAPEX/OPEX 산정 |
| 43 | Root Cause Tree | `rootCauseTree()` | Why-Why 원인 분석 |
| 44 | Target Operating Model | `tomModel()` | 5대 요소 TOM |
| 45 | Initiative Detail | `initiativeCard()` | 과제 상세 카드 |
| 46 | ADKAR Change Mgmt | `adkarModel()` | 변화관리 5단계 |

---

## 산출물별 패턴 매핑

| 산출물 | 추천 패턴 조합 |
|--------|---------------|
| 전략 보고서 | 1→2→3→4→37→8→10→6→7→5 |
| 시장 분석 | 1→2→38→35→25→14→23→5 |
| 프로젝트 계획 | 1→2→47→15→16→17→18→34→13→5 |
| 실사/평가 | 1→2→9→11→12→30→33→41→5 |
| 경영진 보고 | 1→4→13→12→31→25→8→7→5 |
| 제안서 | 1→2→38→10→37→15→7→17→32→13→22→5 |
| 운영 개선 (PI) | 1→2→48→43→45→36→15→31→18→46→5 |
| ISP (정보화전략) | 1→2→38→39→40→30→44→17→42→5 |
| 재무 분석 | 1→2→12→26→23→24→25→42→11→5 |
| 리스크 관리 | 1→2→27→30→33→34→17→13→5 |
| IT 트랜스포메이션 | 1→2→40→48→44→28→18→31→46→5 |
| M&A / 실사 | 1→4→38→35→12→26→41→32→11→5 |

---

## 마이크로 빌딩 블록 (17개 — 복합 슬라이드 구성용)

단일 패턴(1-48)으로 커버할 수 없는 **복잡한 슬라이드**를 구성할 때, 아래 빌딩 블록을 자유롭게 조합한다.

### 도형 & 플로우
| 블록 | 시그니처 | 용도 |
|------|----------|------|
| `flowBox` | `(slide,x,y,w,h,text,{fill,border,rounded,fontSize})` | 프로세스 박스 |
| `flowArrow` | `(slide,x1,y1,x2,y2,{color,label,dashed})` | 화살표 커넥터 (수평/수직/L자) |
| `decisionBox` | `(slide,x,y,w,h,text)` | Y/N 의사결정 분기 박스 |
| `dashedBox` | `(slide,x,y,w,h,text)` | 점선 박스 (옵션/조건부 영역) |
| `milestoneTag` | `(slide,x,y,code)` | M1/M2 마일스톤 뱃지 |
| `numBadge` | `(slide,x,y,num,{size,fill})` | '01' '02' 오렌지 원형 넘버링 (삼일 덱 시그니처) |

### 주석 & 레이블
| 블록 | 시그니처 | 용도 |
|------|----------|------|
| `annotItem` | `(slide,x,y,w,num,title,desc,{badgeFill})` | 번호+제목+설명 주석 항목 |
| `actorIcon` | `(slide,x,y,label,{color,size})` | 인물 실루엣 아이콘 |
| `gradeBadges` | `(slide,x,y,grades[],activeRange)` | 직급 뱃지 행 (MD/D/SM/M/SA/A) |
| `calloutNote` | `(slide,x,y,w,h,text,{accent})` | 좌측 악센트 바 콜아웃 박스 |
| `resultBand` | `(slide,y,items[])` | 하단 결과 체인 (→ 연결) |
| `statCard` | `(slide,x,y,w,h,label,value,caption)` | 대형 오렌지 수치 강조 카드 (KPI·목표) |
| `iconBand` | `await (slide,y,items[{icon,title,caption}])` | 하단 아이콘+제목+캡션 요약 밴드 (react-icons) |

### 레이아웃 구조
| 블록 | 시그니처 | 용도 |
|------|----------|------|
| `phaseBanner` | `(slide,x,y,w,label,{fill})` | 단계/섹션 헤더 배너 |
| `sectionPanel` | `(slide,x,y,w,h,{header,headerFill,fill,border})` | 패널 박스 (헤더 포함 가능) |
| `splitLine` | `(slide,x,y1,y2)` | 수직 구분선 |

---

## 복합 슬라이드 작성 가이드 (50+ shape 수준)

### 원칙
1. `addTitle()` + `addFooter()`로 상하단 프레임 확보 (본문 영역: y 1.3~5.1)
2. 좌우 분할 시: `LX=0.4, LW=4.35, RX=5.05, RW=4.55` (15px 갭)
3. 상하 분할 시: 상단 비주얼 + 하단 테이블/체크리스트 + 최하단 calloutBand
4. 빌딩 블록을 **좌표 기반**으로 자유 배치 — 한 슬라이드에 제한 없이 조합

### 예시 구성 (C1-C3, 첨부 PPTX 수준 데모)

**C1. 듀얼 패널 프로세스 비교** (60+ shapes)
```
좌: sectionPanel(gray) + flowBox×3 + annotItem×4 + resultBand
우: sectionPanel(orange) + flowBox×3 + annotItem×5 + resultBand
```

**C2. 멀티 액터 프로세스 플로우** (70+ shapes)
```
상단: phaseBanner×3 (단계별 헤더)
중단: 4개 스윔레인 (직접 rect 배치) + flowBox + milestoneTag + dashedBox
하단: 3개 milestoneTag + sectionPanel (상세 설명)
```

**C3. 멀티 스테이지 리뷰 + 액터** (60+ shapes)
```
상단: 3개 sectionPanel + flowBox + actorIcon + milestoneTag
하단: 5-column 체크리스트 (rect + text 직접 배치)
최하단: calloutNote (주의사항)
```

### 복합 구성 시 좌표 계산 팁
- 컬럼 폭: `colW = (totalW - gap*(n-1)) / n`
- 카드 간 갭: 0.08~0.15 인치
- 폰트: 밀도 높은 슬라이드는 fontSize 8~9 사용
- 레인 높이: 스윔레인은 0.5~0.6 인치/레인
