import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.forgot" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("auth.forgot");
  return (
    <AuthShell
      title={t("title")}
      description={t("description")}
      footer={
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
