import "@fontsource-variable/inter";
import "../globals.css";
import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BottomNav } from "@/components/layout/bottom-nav";
import { DemoBanner } from "@/components/layout/demo-banner";
import { NoticeToast } from "@/components/layout/notice-toast";
import { ServiceWorkerRegistration } from "@/components/layout/sw-register";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { Alert } from "@/components/ui/alert";
import { Toaster } from "@/components/ui/toaster";
import { isConfigured } from "@/lib/env";
import { routing } from "@/lib/i18n/routing";

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: hasLocale(routing.locales, locale) ? locale : "uz", namespace: "meta" });
  return {
    title: { default: t("title"), template: "%s · UzFit" },
    description: t("description"),
    applicationName: "UzFit",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "UzFit", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations();
  const configured = isConfigured();

  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t("common.skipToContent")}
        </a>
        <NextIntlClientProvider>
          {configured ? (
            <>
              <DemoBanner />
              <SiteHeader />
            </>
          ) : null}
          <main id="main" className="pb-safe-nav flex-1">
            {configured ? (
              children
            ) : (
              <div className="container-page py-16">
                <Alert variant="warning" title={t("setup.title")}>
                  {t("setup.description")}
                </Alert>
              </div>
            )}
          </main>
          <SiteFooter />
          <BottomNav />
          <Toaster />
          <Suspense fallback={null}>
            <NoticeToast />
          </Suspense>
          <ServiceWorkerRegistration />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
