import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
import { getViewer } from "@/lib/auth";
import { isDomainErrorCode } from "@/lib/errors";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { safeLocalePath } from "@/lib/safe-redirect";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.login" });
  return { title: t("title"), robots: { index: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const next = typeof query.next === "string" ? safeLocalePath(query.next, "") : "";
  if (await getViewer()) {
    redirect(next || `/${locale}/explore`);
  }
  const t = await getTranslations("auth");
  const error = typeof query.error === "string" && isDomainErrorCode(query.error) ? query.error : null;

  return (
    <AuthShell
      title={t("login.title")}
      description={t("login.description")}
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link
            href={next ? { pathname: "/signup", query: { next } } : "/signup"}
            className="font-semibold text-primary hover:underline"
          >
            {t("login.signUpLink")}
          </Link>
        </>
      }
    >
      <LoginForm next={next} initialError={error} />
    </AuthShell>
  );
}
