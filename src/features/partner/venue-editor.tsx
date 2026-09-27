"use client";

import { ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/form-controls";
import type { DomainErrorCode } from "@/lib/errors";
import { useRouter } from "@/lib/i18n/navigation";
import type { Locale } from "@/lib/i18n/routing";
import { localized, type LocalizedText } from "@/lib/localized";
import { venueMediaUrl } from "@/lib/storage";
import { createVenueAction, saveVenueDraftAction, uploadVenueImageAction, withdrawVenueDraftAction } from "./actions";
import type { VenueContent } from "./venue-content";

const LANGS = ["uz", "ru", "en"] as const;
type TextField = "name" | "address" | "description" | "rules";

interface Reference {
  districts: Array<{ id: string; name: LocalizedText }>;
  categories: Array<{ id: string; name: LocalizedText }>;
  amenities: Array<{ id: string; name: LocalizedText }>;
}

export interface VenueEditorProps {
  mode: "create" | "edit";
  venueId?: string;
  organizations?: Array<{ id: string; name: string }>;
  initial: VenueContent;
  reference: Reference;
  /** A submitted draft is read-only until it is withdrawn or reviewed. */
  locked: boolean;
}

/**
 * Partner venue draft editor. Changes are saved as a draft revision and only reach the public
 * listing after an admin approves them. The database validates every field again.
 */
export function VenueEditor({ mode, venueId, organizations = [], initial, reference, locked }: VenueEditorProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState<VenueContent>(initial);
  const [slug, setSlug] = useState("");
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [error, setError] = useState<DomainErrorCode | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [uploading, startUpload] = useTransition();
  const disabled = locked || pending;

  const setText = (field: TextField, lang: (typeof LANGS)[number], value: string) =>
    setContent((c) => ({ ...c, [field]: { ...c[field], [lang]: value } }));
  const toggle = (field: "category_ids" | "amenity_ids", id: string, on: boolean) =>
    setContent((c) => ({ ...c, [field]: on ? [...c[field], id] : c[field].filter((x) => x !== id) }));
  const invalid = (name: string) => (fieldErrors[name] ? t("partner.venue.invalid") : undefined);

  function report(result: { ok: false; error: DomainErrorCode; fieldErrors?: Record<string, string> }) {
    setError(result.error);
    setFieldErrors(result.fieldErrors ?? {});
  }

  function save(submit: boolean) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      if (mode === "create") {
        const result = await createVenueAction(organizationId, slug, content);
        if (!result.ok) {
          report(result);
          return;
        }
        toast.success(t("partner.venue.created"));
        router.push(`/partner/venues/${result.data.venueId}`);
        return;
      }
      const result = await saveVenueDraftAction(venueId ?? "", content, submit);
      if (!result.ok) {
        report(result);
        return;
      }
      toast.success(submit ? t("partner.venue.submitted") : t("partner.venue.saved"));
      router.refresh();
    });
  }

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawVenueDraftAction(venueId ?? "");
      if (!result.ok) {
        report(result);
        return;
      }
      toast.success(t("partner.venue.withdrawn"));
      router.refresh();
    });
  }

  function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file || !venueId) {
      return;
    }
    const data = new FormData();
    data.set("venueId", venueId);
    data.set("file", file);
    startUpload(async () => {
      const result = await uploadVenueImageAction(data);
      if (fileInput.current) {
        fileInput.current.value = "";
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setContent((c) => ({ ...c, images: [...c.images, { path: result.data.path, alt: { uz: "" } }] }));
      toast.success(t("partner.venue.photoUploaded"));
    });
  }

  function moveImage(index: number, delta: number) {
    setContent((c) => {
      const images = [...c.images];
      const target = index + delta;
      if (target < 0 || target >= images.length) {
        return c;
      }
      [images[index], images[target]] = [images[target]!, images[index]!];
      return { ...c, images };
    });
  }

  const weekdayName = (weekday: number) =>
    new Intl.DateTimeFormat(locale === "uz" ? "uz-Latn-UZ" : locale === "ru" ? "ru-RU" : "en-GB", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, weekday))); // 2024-01-01 is a Monday

  return (
    <div className="flex flex-col gap-5">
      <FormError code={error} />

      <fieldset disabled={disabled} className="flex flex-col gap-5">
        {mode === "create" ? (
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t("partner.venue.identityTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {organizations.length > 1 ? (
                <Field id="organization" label={t("partner.venue.organization")} required>
                  <NativeSelect
                    id="organization"
                    value={organizationId}
                    onChange={(e) => setOrganizationId(e.target.value)}
                  >
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              <Field
                id="slug"
                label={t("partner.venue.slug")}
                hint={t("partner.venue.slugHint")}
                required
                error={invalid("slug")}
              >
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  minLength={3}
                  maxLength={80}
                  required
                />
              </Field>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("partner.venue.basicsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {(["name", "address"] as const).map((field) => (
              <fieldset key={field} className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-1 text-sm font-medium">{t(`partner.venue.${field}`)}</legend>
                {LANGS.map((lang) => (
                  <Field
                    key={lang}
                    id={`${field}-${lang}`}
                    label={t(`locales.${lang}`)}
                    required={lang === "uz"}
                    error={lang === "uz" ? invalid(field) : undefined}
                  >
                    <Input
                      id={`${field}-${lang}`}
                      value={content[field][lang] ?? ""}
                      onChange={(e) => setText(field, lang, e.target.value)}
                      maxLength={field === "name" ? 120 : 300}
                      required={lang === "uz"}
                    />
                  </Field>
                ))}
              </fieldset>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="district" label={t("explore.district")} required error={invalid("district_id")}>
                <NativeSelect
                  id="district"
                  value={content.district_id}
                  onChange={(e) => setContent((c) => ({ ...c, district_id: e.target.value }))}
                  required
                >
                  <option value="">—</option>
                  {reference.districts.map((district) => (
                    <option key={district.id} value={district.id}>
                      {localized(district.name, locale)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="contact_phone" label={t("partner.venue.phone")} error={invalid("contact_phone")}>
                <Input
                  id="contact_phone"
                  type="tel"
                  value={content.contact_phone ?? ""}
                  onChange={(e) => setContent((c) => ({ ...c, contact_phone: e.target.value || null }))}
                  placeholder="+998 71 000 00 00"
                  maxLength={20}
                />
              </Field>
              <Field
                id="latitude"
                label={t("partner.venue.latitude")}
                hint={t("partner.venue.coordinatesHint")}
                error={invalid("coordinates") ?? invalid("latitude")}
              >
                <Input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  min={-90}
                  max={90}
                  value={content.latitude ?? ""}
                  onChange={(e) =>
                    setContent((c) => ({ ...c, latitude: e.target.value === "" ? null : Number(e.target.value) }))
                  }
                />
              </Field>
              <Field id="longitude" label={t("partner.venue.longitude")} error={invalid("coordinates")}>
                <Input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  min={-180}
                  max={180}
                  value={content.longitude ?? ""}
                  onChange={(e) =>
                    setContent((c) => ({ ...c, longitude: e.target.value === "" ? null : Number(e.target.value) }))
                  }
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("partner.venue.aboutTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {(["description", "rules"] as const).map((field) => (
              <fieldset key={field} className="grid gap-3 lg:grid-cols-3">
                <legend className="mb-1 text-sm font-medium">{t(`partner.venue.${field}`)}</legend>
                {LANGS.map((lang) => (
                  <Field
                    key={lang}
                    id={`${field}-${lang}`}
                    label={t(`locales.${lang}`)}
                    error={lang === "uz" ? invalid(field) : undefined}
                  >
                    <Textarea
                      id={`${field}-${lang}`}
                      value={content[field][lang] ?? ""}
                      onChange={(e) => setText(field, lang, e.target.value)}
                      maxLength={4000}
                    />
                  </Field>
                ))}
              </fieldset>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("partner.venue.offerTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <fieldset aria-invalid={Boolean(invalid("category_ids"))}>
              <legend className="mb-2 text-sm font-medium">
                {t("partner.venue.categories")}
                <span aria-hidden="true" className="ml-0.5 text-destructive">
                  *
                </span>
              </legend>
              <ul className="flex flex-col gap-2">
                {reference.categories.map((category) => (
                  <li key={category.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`cat-${category.id}`}
                      checked={content.category_ids.includes(category.id)}
                      onChange={(e) => toggle("category_ids", category.id, e.target.checked)}
                    />
                    <Label htmlFor={`cat-${category.id}`} className="font-normal">
                      {localized(category.name, locale)}
                    </Label>
                  </li>
                ))}
              </ul>
              {invalid("category_ids") ? (
                <p className="mt-1 text-xs font-medium text-destructive">{t("partner.venue.categoriesHint")}</p>
              ) : null}
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("venue.amenities")}</legend>
              <ul className="flex flex-col gap-2">
                {reference.amenities.map((amenity) => (
                  <li key={amenity.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`amenity-${amenity.id}`}
                      checked={content.amenity_ids.includes(amenity.id)}
                      onChange={(e) => toggle("amenity_ids", amenity.id, e.target.checked)}
                    />
                    <Label htmlFor={`amenity-${amenity.id}`} className="font-normal">
                      {localized(amenity.name, locale)}
                    </Label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("venue.hours")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {invalid("opening_hours") ? (
              <p className="text-xs font-medium text-destructive">{t("partner.venue.hoursInvalid")}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {content.opening_hours.map((day, index) => (
                <li
                  key={day.weekday}
                  className="grid grid-cols-[7rem_1fr] items-center gap-2 sm:grid-cols-[9rem_auto_1fr]"
                >
                  <span className="text-sm font-medium capitalize">{weekdayName(day.weekday)}</span>
                  <span className="flex items-center gap-2">
                    <Checkbox
                      id={`closed-${day.weekday}`}
                      checked={day.is_closed}
                      onChange={(e) =>
                        setContent((c) => ({
                          ...c,
                          opening_hours: c.opening_hours.map((d, i) =>
                            i === index
                              ? {
                                  ...d,
                                  is_closed: e.target.checked,
                                  opens_at: d.opens_at ?? "08:00",
                                  closes_at: d.closes_at ?? "22:00",
                                }
                              : d,
                          ),
                        }))
                      }
                    />
                    <Label htmlFor={`closed-${day.weekday}`} className="font-normal">
                      {t("venue.closed")}
                    </Label>
                  </span>
                  {!day.is_closed ? (
                    <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
                      <Input
                        type="time"
                        aria-label={`${weekdayName(day.weekday)}: ${t("partner.venue.opens")}`}
                        value={day.opens_at ?? ""}
                        onChange={(e) =>
                          setContent((c) => ({
                            ...c,
                            opening_hours: c.opening_hours.map((d, i) =>
                              i === index ? { ...d, opens_at: e.target.value } : d,
                            ),
                          }))
                        }
                        className="w-32"
                      />
                      <span aria-hidden="true">–</span>
                      <Input
                        type="time"
                        aria-label={`${weekdayName(day.weekday)}: ${t("partner.venue.closes")}`}
                        value={day.closes_at === "24:00" ? "23:59" : (day.closes_at ?? "")}
                        onChange={(e) =>
                          setContent((c) => ({
                            ...c,
                            opening_hours: c.opening_hours.map((d, i) =>
                              i === index ? { ...d, closes_at: e.target.value } : d,
                            ),
                          }))
                        }
                        className="w-32"
                      />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("partner.venue.photosTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("partner.venue.photosHint")}</p>
            {invalid("images") ? (
              <p className="text-xs font-medium text-destructive">{t("partner.venue.photosInvalid")}</p>
            ) : null}
            {content.images.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {content.images.map((image, index) => (
                  <li key={image.path} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- previews come straight from Storage */}
                    <img
                      src={venueMediaUrl(image.path)}
                      alt={image.alt.uz ?? ""}
                      className="aspect-[4/3] w-full rounded-lg object-cover"
                    />
                    <Field id={`alt-${index}`} label={t("partner.venue.altText")}>
                      <Input
                        id={`alt-${index}`}
                        value={image.alt.uz ?? ""}
                        maxLength={200}
                        onChange={(e) =>
                          setContent((c) => ({
                            ...c,
                            images: c.images.map((img, i) =>
                              i === index ? { ...img, alt: { ...img.alt, uz: e.target.value } } : img,
                            ),
                          }))
                        }
                      />
                    </Field>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("partner.venue.moveUp")}
                        onClick={() => moveImage(index, -1)}
                        disabled={index === 0}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("partner.venue.moveDown")}
                        onClick={() => moveImage(index, 1)}
                        disabled={index === content.images.length - 1}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("partner.venue.removePhoto")}
                        onClick={() => setContent((c) => ({ ...c, images: c.images.filter((_, i) => i !== index) }))}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {mode === "edit" ? (
              <div>
                <input
                  ref={fileInput}
                  id="photo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => upload(e.target.files)}
                  disabled={disabled || uploading || content.images.length >= 12}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled || uploading || content.images.length >= 12}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <ImagePlus aria-hidden="true" />
                  )}
                  {t("partner.venue.addPhoto")}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("partner.venue.photosAfterCreate")}</p>
            )}
          </CardContent>
        </Card>
      </fieldset>

      <div className="sticky bottom-20 z-10 flex flex-wrap gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur md:bottom-4">
        {mode === "create" ? (
          <Button onClick={() => save(false)} disabled={disabled || !organizationId}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t("partner.venue.createDraft")}
          </Button>
        ) : locked ? (
          <Button variant="outline" onClick={withdraw} disabled={pending}>
            {t("partner.venue.withdraw")}
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => save(false)} disabled={disabled}>
              {t("partner.venue.saveDraft")}
            </Button>
            <Button onClick={() => save(true)} disabled={disabled}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {t("partner.venue.submit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
