import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/** Link-based pagination that keeps every other query parameter. */
export async function Pagination({
  page,
  pages,
  pathname,
  query,
}: {
  page: number;
  pages: number;
  pathname: string;
  query: Record<string, string | undefined>;
}) {
  if (pages <= 1) {
    return null;
  }
  const t = await getTranslations("common");
  const href = (target: number) => {
    const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v)) as Record<string, string>;
    if (target > 1) {
      params.page = String(target);
    } else {
      delete params.page;
    }
    return { pathname, query: params };
  };
  const linkClass = buttonVariants({ variant: "outline", size: "sm" });
  return (
    <nav aria-label={t("pageOf", { page, pages })} className="flex items-center justify-center gap-3 py-6">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass} rel="prev">
          <ChevronLeft aria-hidden="true" />
          {t("previous")}
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-50")} aria-disabled="true">
          <ChevronLeft aria-hidden="true" />
          {t("previous")}
        </span>
      )}
      <span className="text-sm text-muted-foreground">{t("pageOf", { page, pages })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className={linkClass} rel="next">
          {t("next")}
          <ChevronRight aria-hidden="true" />
        </Link>
      ) : (
        <span className={cn(linkClass, "pointer-events-none opacity-50")} aria-disabled="true">
          {t("next")}
          <ChevronRight aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
