import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/components/AppProviders";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "호반 JHA · 작업위험성평가 안전 도우미",
  description: "대화형으로 작업을 입력하면 AI가 분류·위험요인·등급·대책과 현장 기상·지형 위험까지 평가하는 호반 JHA PoC",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // 텍스트 확대 허용 (a11y — 줌 차단 금지)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppProviders>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand focus:px-3 focus:py-2 focus:text-white">
            본문 바로가기
          </a>
          <TopBar />
          <main id="main">{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
