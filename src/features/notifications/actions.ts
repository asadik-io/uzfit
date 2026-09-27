"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { type ActionResult, fail, toDomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Marks all of the member's notifications as read. */
export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  if (!(await getViewer())) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read", {});
  if (error) {
    return fail(toDomainError(error));
  }
  // The unread badge lives in the shared layout.
  revalidatePath("/[locale]", "layout");
  return { ok: true };
}
