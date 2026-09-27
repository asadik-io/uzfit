import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { partnerContext } from "@/features/partner/context";
import { getReferenceData } from "@/features/partner/queries";
import { blankContent } from "@/features/partner/venue-content-server";
import { VenueEditor } from "@/features/partner/venue-editor";
import type { Locale } from "@/lib/i18n/routing";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/venues/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner" });
  return { title: t("newVenue"), robots: { index: false } };
}

export default async function NewVenuePage({ params }: PageProps<"/[locale]/partner/venues/new">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const { managerOrgs } = await partnerContext(locale, `/${locale}/partner/venues/new`, undefined);
  if (managerOrgs.length === 0) {
    redirect(`/${locale}/partner`);
  }
  const t = await getTranslations("partner");
  const reference = await getReferenceData();
  return (
    <>
      <div className="pb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("newVenue")}</h1>
        <p className="text-sm text-muted-foreground">{t("venue.newDescription")}</p>
      </div>
      <VenueEditor
        mode="create"
        organizations={managerOrgs.map((o) => ({ id: o.id, name: o.name }))}
        initial={blankContent()}
        reference={reference}
        locked={false}
      />
    </>
  );
}
