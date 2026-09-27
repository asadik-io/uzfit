import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { isDemoMode } from "@/lib/env";

/** Persistent label for demo deployments (fictional data, no real payments). */
export async function DemoBanner() {
  if (!isDemoMode()) {
    return null;
  }
  const t = await getTranslations("demo");
  return (
    <div role="note" className="border-b border-warning/20 bg-warning-soft text-warning">
      <p className="container-page flex items-center gap-2 py-2 text-xs font-medium sm:text-sm">
        <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
        {t("banner")}
      </p>
    </div>
  );
}
