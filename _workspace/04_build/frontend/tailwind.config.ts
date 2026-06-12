import type { Config } from "tailwindcss";

/**
 * 호반 공식 브랜드 4색 조합 팔레트.
 * 출처: 프로젝트 루트 "HOBAN 브랜드 컬러  색상 가이드.txt" (3색) + 사용자 지시(White 추가).
 *   - HOBAN Orange     #EE7500 (RGB 238/117/0,  PANTONE 152C)         → primary/CTA/포커스/활성
 *   - HOBAN Gray       #89898A (RGB 137/137/137, PANTONE Cool Gray 8C) → 보조텍스트/비활성/구분선/아이콘
 *   - HOBAN Dark Gray  #575553 (RGB 87/85/83,    PANTONE Cool Gray 11C)→ 본문/헤딩(잉크)
 *   - White            #FFFFFF                                          → 배경/서피스
 * 각 색의 50~900 tint/shade는 위 기준색에서 파생(기준색은 ★ 표기 단계에 고정).
 */

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: ["class", '[data-contrast="high"]'],
  theme: {
    extend: {
      colors: {
        // ── KRAS 위험등급(법적 의미 — 불변). 항상 텍스트 라벨 병행. lib/tokens.ts 참조.
        risk: {
          high: "#DC2626", // 상
          medium: "#F97316", // 중
          low: "#16A34A", // 하
        },

        // ── 호반 공식 브랜드 4색 조합 ────────────────────────────────
        // Orange (대표 컬러) — primary/CTA/포커스/활성. ★500 = 공식 #EE7500.
        brand: {
          50: "#FFF7EE",
          100: "#FFE9D2",
          200: "#FCCFA3",
          300: "#F8B070",
          400: "#F49038",
          500: "#EE7500", // ★ HOBAN Orange (공식)
          600: "#C75F00", // hover/active (White 위 텍스트 대비 ↑)
          700: "#9E4B00",
          800: "#763800",
          900: "#532700",
          DEFAULT: "#EE7500",
          dark: "#C75F00",
        },
        // Ink — 본문/헤딩. ★700 = 공식 Dark Gray #575553. (White 위 ≥7:1은 800/900 사용)
        ink: {
          50: "#F4F3F3",
          100: "#E4E3E2",
          200: "#C8C6C4",
          300: "#A8A5A3",
          400: "#807D7B",
          500: "#6A6866",
          600: "#5F5D5B",
          700: "#575553", // ★ HOBAN Dark Gray (공식)
          800: "#403E3C", // 본문 권장(White 대비 ≥9:1)
          900: "#2B2A29", // 헤딩 강조
          DEFAULT: "#403E3C",
        },
        // Gray — 보조텍스트/비활성/구분선/아이콘. ★500 = 공식 #89898A.
        steel: {
          50: "#F6F6F6",
          100: "#ECECEC",
          200: "#DCDCDD",
          300: "#C4C4C5",
          400: "#A6A6A7",
          500: "#89898A", // ★ HOBAN Gray (공식)
          600: "#6F6F70",
          700: "#58585A", // White 위 보조텍스트 대비 확보(≥7:1)
          800: "#424243",
          900: "#2E2E2F",
          DEFAULT: "#89898A",
        },
        // 서피스/배경 — White 중심 + 아주 옅은 Gray 틴트로 위계.
        surface: {
          DEFAULT: "#FFFFFF", // 카드/패널 기본
          page: "#FAFAFA", // 페이지 배경(White에 미세 Gray 틴트)
          sunken: "#F4F4F4", // 가라앉은 영역(코드/인용)
          tint: "#FFF7EE", // 브랜드 옅은 강조 서피스
        },
        line: {
          DEFAULT: "#E6E6E6", // 구분선/보더(Gray 옅은 단계)
          strong: "#DCDCDD",
        },

        // 하위호환 별칭(기존 hoban.* 사용처 유지)
        hoban: {
          orange: "#EE7500",
          "orange-dark": "#C75F00",
          gray: "#89898A",
          "dark-gray": "#575553",
          ink: "#2B2A29",
          warm: "#FFFFFF", // warm 배경 → White 중심으로 전환
        },
      },
      minHeight: {
        touch: "44px", // 터치 타겟 최소(장갑 고려)
      },
      minWidth: {
        touch: "44px",
      },
      height: {
        touch: "44px",
      },
      width: {
        touch: "44px",
      },
      keyframes: {
        "typing-bounce": {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "40%": { transform: "translateY(-4px)", opacity: "1" },
        },
        "msg-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "typing-bounce": "typing-bounce 1.2s infinite ease-in-out",
        "msg-in": "msg-in 0.28s ease-out both",
        "fade-in": "fade-in 0.18s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
