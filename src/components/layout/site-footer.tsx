import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Link } from "@/lib/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations();
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <div className="container-page flex flex-col gap-6 py-8 text-sm text-muted-foreground md:flex-row md:justify-between">
        <div className="flex max-w-md flex-col gap-3">
          <Logo />
          <p>{t("footer.tagline")}</p>
          <p className="text-xs">{t("footer.independent")}</p>
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-foreground">{t("footer.support")}</p>
          <p className="max-w-xs">{t("footer.supportText")}</p>
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href="/explore" className="hover:text-foreground">
              {t("nav.explore")}
            </Link>
            <Link href="/plans" className="hover:text-foreground">
              {t("nav.plans")}
            </Link>
            <Link href="/profile" className="hover:text-foreground">
              {t("nav.profile")}
            </Link>
          </nav>
          <p className="text-xs">{t("footer.rights", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
