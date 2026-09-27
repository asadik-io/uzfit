import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm } from "@/features/admin/action-form";
import { reviewRevisionAction } from "@/features/admin/actions";
import { getRevision } from "@/features/admin/queries";
import { getReferenceData, getVenueForEditing } from "@/features/partner/queries";
import type { VenueContent } from "@/features/partner/venue-content";
import { contentFromRevision, contentFromVenue } from "@/features/partner/venue-content-server";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { venueMediaUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/revisions/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.revisions" });
  return { title: t("detailTitle"), robots: { index: false } };
}

const LANGS = ["uz", "ru", "en"] as const;

export default async function RevisionDetailPage({ params }: PageProps<"/[locale]/admin/revisions/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(id).success) {
    notFound();
  }
  await requireAdmin(locale, `/${locale}/admin/revisions/${id}`);
  const revision = await getRevision(id);
  if (!revision) {
    notFound();
  }
  const [live, reference] = await Promise.all([getVenueForEditing(revision.venue_id), getReferenceData()]);
  const t = await getTranslations();
  const proposed = contentFromRevision(revision.content);
  const current = live ? contentFromVenue(live.venue) : null;
  const name = (list: Array<{ id: string; name: LocalizedText }>, ids: string[]) =>
    ids.map((x) => localized(list.find((item) => item.id === x)?.name, locale) || x).join(", ");
  // 2024-01-01 is a Monday (ISO weekday 1).
  const weekday = (n: number) => formatDate(new Date(Date.UTC(2024, 0, n)), locale, "UTC", { weekday: "short" });
  const hours = (content: VenueContent) =>
    content.opening_hours
      .map((d) => `${weekday(d.weekday)} ${d.is_closed ? t("venue.closed") : `${d.opens_at}–${d.closes_at}`}`)
      .join(" · ");
  const localizedLines = (value: LocalizedText) =>
    LANGS.map((l) => (value[l] ? `${l}: ${value[l]}` : null))
      .filter(Boolean)
      .join("\n");

  const rows: Array<{ label: string; current: string; proposed: string }> = proposed
    ? [
        {
          label: t("partner.venue.name"),
          current: current ? localizedLines(current.name) : "",
          proposed: localizedLines(proposed.name),
        },
        {
          label: t("partner.venue.address"),
          current: current ? localizedLines(current.address) : "",
          proposed: localizedLines(proposed.address),
        },
        {
          label: t("explore.district"),
          current: current ? name(reference.districts, [current.district_id]) : "",
          proposed: name(reference.districts, [proposed.district_id]),
        },
        {
          label: t("partner.venue.phone"),
          current: current?.contact_phone ?? "",
          proposed: proposed.contact_phone ?? "",
        },
        {
          label: t("partner.venue.latitude"),
          current: current?.latitude != null ? `${current.latitude}, ${current.longitude}` : "",
          proposed: proposed.latitude != null ? `${proposed.latitude}, ${proposed.longitude}` : "",
        },
        {
          label: t("partner.venue.categories"),
          current: current ? name(reference.categories, current.category_ids) : "",
          proposed: name(reference.categories, proposed.category_ids),
        },
        {
          label: t("venue.amenities"),
          current: current ? name(reference.amenities, current.amenity_ids) : "",
          proposed: name(reference.amenities, proposed.amenity_ids),
        },
        { label: t("venue.hours"), current: current ? hours(current) : "", proposed: hours(proposed) },
        {
          label: t("partner.venue.description"),
          current: current ? localizedLines(current.description) : "",
          proposed: localizedLines(proposed.description),
        },
        {
          label: t("partner.venue.rules"),
          current: current ? localizedLines(current.rules) : "",
          proposed: localizedLines(proposed.rules),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/revisions"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("admin.nav.revisions")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{localized(revision.venue?.name, locale)}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {revision.venue?.organization?.name}
          <Badge
            variant={
              revision.status === "submitted" ? "info" : revision.status === "approved" ? "success" : "secondary"
            }
          >
            {t(`partner.revisionStatus.${revision.status}`)}
          </Badge>
          {revision.submitted_at
            ? t("admin.revisions.submittedAt", {
                time: formatDateTime(revision.submitted_at, locale, DEFAULT_TIMEZONE, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })
            : null}
        </p>
      </div>
      {revision.venue?.publication_status === "draft" ? (
        <Alert variant="info">{t("admin.revisions.firstPublicationNote")}</Alert>
      ) : null}
      {revision.review_note ? (
        <Alert variant="info" title={t("partner.venue.reviewNote")}>
          {revision.review_note}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("admin.revisions.changes")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="w-40 py-2 pr-3 font-medium">
                  {t("admin.revisions.field")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("admin.revisions.current")}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t("admin.revisions.proposed")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const changed = row.current !== row.proposed;
                return (
                  <tr
                    key={row.label}
                    className={cn("border-b border-border align-top last:border-0", changed && "bg-warning-soft/60")}
                  >
                    <th scope="row" className="py-2 pr-3 text-left font-medium">
                      {row.label}
                      {changed ? <span className="sr-only"> ({t("admin.revisions.changed")})</span> : null}
                    </th>
                    <td className="py-2 pr-3 whitespace-pre-line text-muted-foreground">{row.current || "—"}</td>
                    <td className="py-2 whitespace-pre-line">{row.proposed || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {proposed && proposed.images.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("partner.venue.photosTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {proposed.images.map((image) => (
                <li key={image.path}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- review preview straight from Storage */}
                  <img
                    src={venueMediaUrl(image.path)}
                    alt={image.alt.uz ?? ""}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {revision.status === "submitted" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t("admin.revisions.approve")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={reviewRevisionAction}
                hidden={{ revisionId: revision.id, decision: "approve" }}
                fields={[{ name: "note", label: t("admin.revisions.noteOptional"), type: "textarea" }]}
                submitLabel={t("admin.revisions.approve")}
                successMessage={t("admin.revisions.approved")}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t("admin.revisions.reject")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={reviewRevisionAction}
                hidden={{ revisionId: revision.id, decision: "reject" }}
                fields={[{ name: "note", label: t("admin.revisions.rejectNote"), type: "textarea", required: true }]}
                submitLabel={t("admin.revisions.reject")}
                submitVariant="destructive"
                successMessage={t("admin.revisions.rejected")}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
