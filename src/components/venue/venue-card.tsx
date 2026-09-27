import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { categoryIcon } from "./icons";
import { VenueImage } from "./venue-image";

export interface VenueCardProps {
  slug: string;
  name: LocalizedText;
  districtName: LocalizedText;
  coverPath: string | null;
  coverAlt?: LocalizedText | null;
  categories: Array<{ slug: string; name: LocalizedText }>;
  /** Omit to hide plan information (e.g. in favorites). */
  planNames?: string[];
  isDemo: boolean;
  distanceKm?: number | null;
  memberEligible?: boolean | null;
  locale: Locale;
  priority?: boolean;
}

export async function VenueCard(props: VenueCardProps) {
  const t = await getTranslations();
  const name = localized(props.name, props.locale);
  const district = localized(props.districtName, props.locale);
  const primaryCategory = props.categories[0]?.slug;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition-shadow hover:shadow-lg">
      <VenueImage
        path={props.coverPath}
        alt={localized(props.coverAlt, props.locale) || name}
        category={primaryCategory}
        className="aspect-[4/3] w-full"
        priority={props.priority}
      />
      {props.isDemo ? (
        <Badge variant="demo" className="absolute top-3 left-3">
          {t("demo.badge")}
        </Badge>
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-base leading-snug font-semibold">
            <Link
              href={`/venues/${props.slug}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {name}
            </Link>
          </h3>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden="true" />
            {district}
            {props.distanceKm != null ? (
              <span className="ml-1">· {t("explore.distance", { km: props.distanceKm.toFixed(1) })}</span>
            ) : null}
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label={t("explore.category")}>
          {props.categories.map((category) => {
            const Icon = categoryIcon(category.slug);
            return (
              <li key={category.slug}>
                <Badge variant="secondary">
                  <Icon aria-hidden="true" />
                  {localized(category.name, props.locale)}
                </Badge>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs">
          {props.memberEligible === true ? (
            <Badge variant="success">{t("venue.includedInYourPlan")}</Badge>
          ) : props.memberEligible === false ? (
            <Badge variant="outline">{t("venue.notIncludedInYourPlan")}</Badge>
          ) : !props.planNames ? null : props.planNames.length > 0 ? (
            <span className="text-muted-foreground">
              {t("venue.includedIn")}:{" "}
              <span className="font-medium text-foreground">{props.planNames.join(" · ")}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{t("venue.notInAnyPlan")}</span>
          )}
        </div>
      </div>
      <span
        className="pointer-events-none absolute inset-0 rounded-2xl ring-primary group-focus-within:ring-2"
        aria-hidden="true"
      />
    </article>
  );
}
