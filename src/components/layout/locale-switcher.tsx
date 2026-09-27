"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { NativeSelect } from "@/components/ui/form-controls";
import { setPreferredLocaleAction } from "@/features/profile/actions";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { isLocale, locales } from "@/lib/i18n/routing";

export function LocaleSwitcher({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (!isLocale(next) || next === locale) {
      return;
    }
    const query = searchParams.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { locale: next });
      if (signedIn) {
        void setPreferredLocaleAction(next);
      }
    });
  }

  return (
    <label className="relative flex items-center">
      <span className="sr-only">{t("nav.language")}</span>
      <Globe aria-hidden="true" className="pointer-events-none absolute left-2.5 z-10 size-4 text-muted-foreground" />
      <NativeSelect
        value={locale}
        onChange={onChange}
        disabled={pending}
        className="h-10 w-auto border-transparent bg-transparent pl-8 text-sm font-medium hover:bg-muted"
        wrapperClassName="w-auto"
      >
        {locales.map((code) => (
          <option key={code} value={code} lang={code}>
            {t(`locales.${code}`)}
          </option>
        ))}
      </NativeSelect>
    </label>
  );
}
