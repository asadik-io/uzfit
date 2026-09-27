"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { type ActionResult, fail, toDomainError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

const input = z.object({ venueId: z.guid(), favorite: z.boolean() });

/** Adds or removes a favorite. RLS restricts rows to the signed-in member and public venues. */
export async function setFavoriteAction(
  venueId: string,
  favorite: boolean,
): Promise<ActionResult<{ favorite: boolean }>> {
  const parsed = input.safeParse({ venueId, favorite });
  if (!parsed.success) {
    return fail("VALIDATION_FAILED");
  }
  const viewer = await getViewer();
  if (!viewer) {
    return fail("AUTH_REQUIRED");
  }
  const supabase = await createClient();
  const { error } = parsed.data.favorite
    ? await supabase
        .from("favorites")
        .upsert(
          { user_id: viewer.id, venue_id: parsed.data.venueId },
          { onConflict: "user_id,venue_id", ignoreDuplicates: true },
        )
    : await supabase.from("favorites").delete().eq("user_id", viewer.id).eq("venue_id", parsed.data.venueId);
  if (error) {
    return fail(toDomainError(error));
  }
  revalidatePath("/[locale]/favorites", "page");
  return { ok: true, data: { favorite: parsed.data.favorite } };
}
