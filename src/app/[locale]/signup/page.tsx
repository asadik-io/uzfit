import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignupForm } from "@/features/auth/signup-form";
import { getViewer } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { safeLocalePath } from "@/lib/safe-redirect";

export async function generateMetadata({ params }: PageProps<"/[locale]/signup">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "auth.signup" });
  return { title: t("title"), robots: { index: false } };
}

export default async function SignupPage({ params, searchParams }: PageProps<"/[locale]/signup">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const next = typeof query.next === "string" ? safeLocalePath(query.next, "") : "";
  if (await getViewer()) {
    redirect(next || `/${locale}/explore`);
  }
  const t = await getTranslations("auth");
  return (
    <AuthShell
      title={t("signup.title")}
      description={t("signup.description")}
      footer={
        <>
          {t("signup.haveAccount")}{" "}
          <Link
            href={next ? { pathname: "/login", query: { next } } : "/login"}
            className="font-semibold text-primary hover:underline"
          >
            {t("signup.signInLink")}
          </Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
