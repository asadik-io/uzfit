import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MfaPanel } from "@/features/admin/mfa-panel";
import { getAccess, requireViewer } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/routing";
import { safeLocalePath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/mfa">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.mfa" });
  return { title: t("title"), robots: { index: false } };
}

/** Second-factor gate for admin tools (outside the dashboard layout to avoid a redirect loop). */
export default async function AdminMfaPage({ params, searchParams }: PageProps<"/[locale]/admin/mfa">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const viewer = await requireViewer(locale, `/${locale}/admin/mfa`);
  const access = await getAccess();
  if (!access?.hasAdminRole) {
    redirect(`/${locale}`);
  }
  const next = safeLocalePath(query.next, `/${locale}/admin`);
  if (viewer.aal === "aal2") {
    redirect(next);
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp.find((factor) => factor.status === "verified") ?? null;
  const t = await getTranslations("admin.mfa");
  return (
    <div className="container-page flex max-w-lg flex-col py-10">
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-2xl">
            {t("title")}
          </CardTitle>
          <CardDescription>{verified ? t("verifyText") : t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <MfaPanel verifiedFactorId={verified?.id ?? null} next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
