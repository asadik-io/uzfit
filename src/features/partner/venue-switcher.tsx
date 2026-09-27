"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/form-controls";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";

export function VenueSwitcher({
  venues,
  selectedId,
}: {
  venues: Array<{ id: string; name: LocalizedText }>;
  selectedId: string;
}) {
  const t = useTranslations("partner");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (venues.length < 2) {
    return null;
  }
  return (
    <label className="flex flex-col gap-1 text-sm font-medium sm:max-w-xs">
      {t("selectVenue")}
      <NativeSelect
        value={selectedId}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.set("venue", event.target.value);
          router.replace(`${pathname}?${next.toString()}`);
        }}
      >
        {venues.map((venue) => (
          <option key={venue.id} value={venue.id}>
            {localized(venue.name, locale)}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
