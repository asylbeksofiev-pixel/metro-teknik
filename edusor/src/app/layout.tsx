import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getI18n } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";

export const metadata: Metadata = {
  title: { default: "EduSOR", template: "%s · EduSOR" },
  description: "EduSOR — платформа для проведения и анализа СОР и СОЧ",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1b33" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
