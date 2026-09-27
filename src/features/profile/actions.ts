"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { type ActionResult, fail, toDomainError } from "@/lib/errors";
import { isLocale, type Locale } from "@/lib/i18n/routing";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

/** Remembers the interface language on the profile and in auth metadata (used by emails). */
export async function setPreferredLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) {
    return;
  }
  const viewer = await getViewer();
  if (!viewer) {
    return;
  }
  const supabase = await createClient();
  await supabase.from("profiles").update({ locale }).eq("id", viewer.id);
  await supabase.auth.updateUser({ data: { locale } });
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(32),
  locale: z.string().refine(isLocale),
});

export async function updateProfileAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) {
    return fail("AUTH_REQUIRED");
  }
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone") ?? "",
    locale: formData.get("locale"),
  });
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return fail("VALIDATION_FAILED", field ? { [field]: "invalid" } : undefined);
  }
  const phone = parsed.data.phone === "" ? null : normalizePhone(parsed.data.phone);
  if (parsed.data.phone !== "" && !phone) {
    return fail("VALIDATION_FAILED", { phone: "invalid" });
  }
  const locale = parsed.data.locale as Locale;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, phone_e164: phone, locale })
    .eq("id", viewer.id);
  if (error) {
    return fail(toDomainError(error));
  }
  await supabase.auth.updateUser({ data: { locale, display_name: parsed.data.displayName } });
  revalidatePath(`/${locale}/profile`);
  return { ok: true };
}
