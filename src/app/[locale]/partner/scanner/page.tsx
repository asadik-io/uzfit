import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckinScanner } from "@/features/partner/checkin-scanner";
import { partnerContext } from "@/features/partner/context";
import { PartnerHeader } from "@/features/partner/partner-header";
import type { Locale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/scanner">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner.scanner" });
  return { title: t("title"), robots: { index: false } };
}

export default async function ScannerPage({ params, searchParams }: PageProps<"/[locale]/partner/scanner">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const query = await searchParams;
  const { venues, venue } = await partnerContext(locale, `/${locale}/partner/scanner`, query.venue);
  if (!venue) {
    redirect(`/${locale}/partner`);
  }
  const t = await getTranslations("partner.scanner");
  return (
    <>
      <PartnerHeader title={t("title")} description={t("description")} venues={venues} venue={venue} locale={locale} />
      <CheckinScanner key={venue.id} venueId={venue.id} timeZone={venue.timezone} />
    </>
  );
}
