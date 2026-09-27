import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { getViewer } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.reset" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ResetPasswordPage({ params }: PageProps<"/[locale]/reset-password">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("auth.reset");
  // The recovery link establishes a session in /auth/callback before redirecting here.
  const viewer = await getViewer();
  return (
    <AuthShell title={t("title")} description={viewer ? t("description") : undefined}>
      {viewer ? (
        <ResetPasswordForm />
      ) : (
        <div className="flex flex-col gap-4">
          <Alert variant="info">{t("needsLink")}</Alert>
          <Button asChild variant="outline">
            <Link href="/forgot-password">{t("requestNew")}</Link>
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
