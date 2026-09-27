"use client";

import { LocateFixed, LocateOff, Search, SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form-controls";
import { Link, useRouter } from "@/lib/i18n/navigation";
import { localized, type LocalizedText } from "@/lib/localized";

interface Option {
  slug: string;
  name: LocalizedText;
}

export interface ExploreFilterValues {
  q: string;
  city: string;
  district: string;
  category: string;
  date: string;
  plan: string;
  near: string;
}

export function ExploreFilters({
  values,
  cities,
  districts,
  categories,
  plans,
  dates,
}: {
  values: ExploreFilterValues;
  cities: Option[];
  districts: Array<Option & { citySlug: string }>;
  categories: Option[];
  plans: Array<{ code: string; name: LocalizedText }>;
  dates: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations("explore");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [city, setCity] = useState(values.city);
  const [geoState, setGeoState] = useState<"idle" | "locating" | "denied">("idle");
  const [showFilters, setShowFilters] = useState(false);
  const activeCount = [values.district, values.category, values.date, values.plan].filter(Boolean).length;

  function navigate(overrides: Partial<ExploreFilterValues> = {}) {
    const form = formRef.current;
    if (!form) {
      return;
    }
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const key of ["q", "city", "district", "category", "date", "plan"] as const) {
      const value = key in overrides ? overrides[key] : String(data.get(key) ?? "");
      if (value && value.trim() !== "") {
        params.set(key, value.trim());
      }
    }
    const near = "near" in overrides ? overrides.near : values.near;
    if (near) {
      params.set("near", near);
    }
    const query = params.toString();
    startTransition(() => router.push(query ? `/explore?${query}` : "/explore", { scroll: false }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate();
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoState("denied");
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoState("idle");
        // Rounded to about 100 m; the position is only used for sorting and is never stored.
        const near = `${position.coords.latitude.toFixed(3)},${position.coords.longitude.toFixed(3)}`;
        navigate({ near });
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  const cityDistricts = districts.filter((d) => d.citySlug === (city || cities[0]?.slug));

  return (
    <form
      ref={formRef}
      action={`/${locale}/explore`}
      method="get"
      role="search"
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:p-4"
      aria-busy={pending}
    >
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t("search")}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="q"
            defaultValue={values.q}
            placeholder={t("search")}
            className="pl-9"
            maxLength={80}
            enterKeyHint="search"
          />
        </label>
        <Button type="submit" disabled={pending} className="hidden sm:inline-flex">
          {tc("search")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="sm:hidden"
          aria-expanded={showFilters}
          aria-controls="explore-filter-fields"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t("filters")}
          {activeCount ? (
            <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>
          ) : null}
        </Button>
      </div>

      <div
        id="explore-filter-fields"
        className={`${showFilters ? "grid" : "hidden"} gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4`}
      >
        {cities.length > 1 ? (
          <Field id="filter-city" label={t("city")}>
            <NativeSelect
              id="filter-city"
              name="city"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                navigate({ city: e.target.value, district: "" });
              }}
            >
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {localized(c.name, locale as "uz")}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <input type="hidden" name="city" value={values.city} />
        )}
        <Field id="filter-district" label={t("district")}>
          <NativeSelect id="filter-district" name="district" defaultValue={values.district} onChange={() => navigate()}>
            <option value="">{tc("all")}</option>
            {cityDistricts.map((d) => (
              <option key={d.slug} value={d.slug}>
                {localized(d.name, locale as "uz")}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="filter-category" label={t("category")}>
          <NativeSelect id="filter-category" name="category" defaultValue={values.category} onChange={() => navigate()}>
            <option value="">{tc("all")}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {localized(c.name, locale as "uz")}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="filter-date" label={t("date")}>
          <NativeSelect id="filter-date" name="date" defaultValue={values.date} onChange={() => navigate()}>
            <option value="">{t("anyDate")}</option>
            {dates.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="filter-plan" label={t("plan")}>
          <NativeSelect id="filter-plan" name="plan" defaultValue={values.plan} onChange={() => navigate()}>
            <option value="">{t("anyPlan")}</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {localized(p.name, locale as "uz")}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Button type="submit" disabled={pending} className="sm:hidden">
          {t("apply")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {values.near ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => navigate({ near: "" })}>
            <LocateOff aria-hidden="true" />
            {t("nearMeClear")}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={geoState === "locating"}>
            <LocateFixed aria-hidden="true" />
            {geoState === "locating" ? t("locating") : t("nearMe")}
          </Button>
        )}
        {values.near ? <span className="text-sm text-muted-foreground">{t("nearMeActive")}</span> : null}
        {geoState === "denied" ? (
          <span role="status" className="text-sm text-warning">
            {t("locationDenied")}
          </span>
        ) : null}
        {activeCount || values.q || values.near ? (
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link href="/explore">
              <X aria-hidden="true" />
              {t("reset")}
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
