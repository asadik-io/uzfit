import { getTranslations } from "next-intl/server";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import type { StaffVenue } from "./queries";
import { VenueSwitcher } from "./venue-switcher";

export async function VenueStatusBadges({
  venue,
}: {
  venue: Pick<StaffVenue, "publicationStatus" | "operationalStatus">;
}) {
  const t = await getTranslations("partner.venueStatus");
  return (
    <>
      <Badge
        variant={
          venue.publicationStatus === "published"
            ? "success"
            : venue.publicationStatus === "draft"
              ? "secondary"
              : "warning"
        }
      >
        {t(venue.publicationStatus)}
      </Badge>
      {venue.operationalStatus === "suspended" ? <Badge variant="destructive">{t("suspended")}</Badge> : null}
    </>
  );
}

export async function PartnerHeader({
  title,
  description,
  venues,
  venue,
  locale,
  actions,
}: {
  title: string;
  description?: string;
  venues: StaffVenue[];
  venue: StaffVenue | null;
  locale: Locale;
  actions?: React.ReactNode;
}) {
  const t = await getTranslations("partner");
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {venue ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{localized(venue.name, locale)}</span>
              <VenueStatusBadges venue={venue} />
              <span>· {t(`role.${venue.role}`)}</span>
            </p>
          ) : null}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      {venue ? <VenueSwitcher venues={venues.map((v) => ({ id: v.id, name: v.name }))} selectedId={venue.id} /> : null}
    </div>
  );
}
