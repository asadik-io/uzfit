import {
  Bell,
  Building2,
  CalendarCheck,
  ChevronRight,
  CreditCard,
  Heart,
  KeyRound,
  LifeBuoy,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOutAction } from "@/features/auth/actions";
import { ProfileForm } from "@/features/profile/profile-form";
import { getAccess, requireViewer } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/profile">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "profile" });
  return { title: t("title"), robots: { index: false } };
}

function supportEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/profile">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const viewer = await requireViewer(locale, `/${locale}/profile`);
  const supabase = await createClient();
  const [{ data: profile, error }, access] = await Promise.all([
    supabase.from("profiles").select("display_name, phone_e164").eq("id", viewer.id).maybeSingle(),
    getAccess(),
  ]);
  if (error) {
    throw new Error("profile_query_failed");
  }
  const t = await getTranslations();
  const email = supportEmail();
  const isStaff = Boolean(access?.organizations.some((o) => o.status === "active"));
  const links = [
    { href: "/membership", label: t("nav.membership"), icon: CreditCard },
    { href: "/bookings", label: t("nav.bookings"), icon: CalendarCheck },
    { href: "/favorites", label: t("nav.favorites"), icon: Heart },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell },
    ...(isStaff ? [{ href: "/partner", label: t("nav.partner"), icon: Building2 }] : []),
    ...(access?.hasAdminRole ? [{ href: "/admin", label: t("nav.admin"), icon: ShieldCheck }] : []),
  ];

  return (
    <div className="container-page flex max-w-3xl flex-col gap-5 pb-8">
      <PageHeader title={t("profile.title")} description={t("profile.description")} />

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("profile.detailsTitle")}</CardTitle>
          <CardDescription>{t("profile.detailsText")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initial={{
              displayName: profile?.display_name ?? "",
              phone: profile?.phone_e164 ? formatPhone(profile.phone_e164) : "",
              // The interface language is the preference: switching languages stores it too.
              locale,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("profile.accountTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="text-sm">
            <dt className="text-muted-foreground">{t("auth.email")}</dt>
            <dd className="font-medium break-all">{viewer.email}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/reset-password"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted"
            >
              <KeyRound className="size-4" aria-hidden="true" />
              {t("profile.changePassword")}
            </Link>
            <form action={signOutAction}>
              <input type="hidden" name="locale" value={locale} />
              <SubmitButton variant="outline" className="text-destructive">
                <LogOut aria-hidden="true" />
                {t("nav.signOut")}
              </SubmitButton>
            </form>
          </div>
        </CardContent>
      </Card>

      <nav aria-label={t("profile.linksTitle")}>
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className="flex min-h-14 items-center gap-3 px-4 font-medium hover:bg-muted">
                <Icon className="size-5 text-primary" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2">
            <LifeBuoy className="size-5 text-primary" aria-hidden="true" />
            {t("profile.supportTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {email ? (
            <p>
              {t("profile.supportEmail")}{" "}
              <a href={`mailto:${email}`} className="font-semibold text-primary underline">
                {email}
              </a>
            </p>
          ) : (
            <p className="text-muted-foreground">{t("profile.supportUnconfigured")}</p>
          )}
          <p className="text-muted-foreground">{t("profile.supportTip")}</p>
          <p className="text-muted-foreground">{t("profile.privacy")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
