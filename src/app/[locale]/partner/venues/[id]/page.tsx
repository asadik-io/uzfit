import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { partnerContext } from "@/features/partner/context";
import { VenueStatusBadges } from "@/features/partner/partner-header";
import { getReferenceData, getVenueForEditing } from "@/features/partner/queries";
import { contentFromRevision, contentFromVenue } from "@/features/partner/venue-content-server";
import { VenueEditor } from "@/features/partner/venue-editor";
import { formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";

export async function generateMetadata({ params }: PageProps<"/[locale]/partner/venues/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "partner.venue" });
  return { title: t("editTitle"), robots: { index: false } };
}

export default async function EditVenuePage({ params }: PageProps<"/[locale]/partner/venues/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(id).success) {
    notFound();
  }
  const { venues } = await partnerContext(locale, `/${locale}/partner/venues/${id}`, undefined);
  const staffVenue = venues.find((v) => v.id === id && v.role === "manager");
  if (!staffVenue) {
    notFound();
  }
  const [data, reference] = await Promise.all([getVenueForEditing(id), getReferenceData()]);
  if (!data) {
    notFound();
  }
  const t = await getTranslations();
  const revision = data.latestRevision;
  const open =
    revision && (revision.status === "draft" || revision.status === "submitted" || revision.status === "rejected");
  const initial = (open ? contentFromRevision(revision.content) : null) ?? contentFromVenue(data.venue);
  const at = (value: string | null) =>
    value ? formatDateTime(value, locale, DEFAULT_TIMEZONE, { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <>
      <Link
        href="/partner/venues"
        className="mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("partner.nav.venues")}
      </Link>
      <div className="flex flex-col gap-2 pb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{localized(data.venue.name, locale)}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <VenueStatusBadges venue={staffVenue} />
          {data.venue.publication_status === "published" ? (
            <Link
              href={`/venues/${data.venue.slug}`}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {t("partner.venue.viewPublic")}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </p>
        <p className="text-sm text-muted-foreground">{t("partner.venue.approvalNote")}</p>
      </div>
      {revision?.status === "submitted" ? (
        <Alert variant="info" className="mb-5" title={t("partner.revisionStatus.submitted")}>
          {t("partner.venue.submittedAt", { time: at(revision.submitted_at) })} {t("partner.venue.lockedText")}
        </Alert>
      ) : null}
      {revision?.status === "rejected" ? (
        <Alert variant="warning" className="mb-5" title={t("partner.revisionStatus.rejected")}>
          {revision.review_note ? `${t("partner.venue.reviewNote")}: ${revision.review_note}` : null}
          <span className="mt-1 block">{t("partner.venue.rejectedHelp")}</span>
        </Alert>
      ) : null}
      {revision?.status === "approved" ? (
        <Alert variant="success" className="mb-5" title={t("partner.revisionStatus.approved")}>
          {t("partner.venue.approvedAt", { time: at(revision.reviewed_at) })}
        </Alert>
      ) : null}
      <VenueEditor
        key={revision?.updated_at ?? "live"}
        mode="edit"
        venueId={id}
        initial={initial}
        reference={reference}
        locked={revision?.status === "submitted"}
      />
    </>
  );
}
