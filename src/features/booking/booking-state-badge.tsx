import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/database.types";

type BookingState = Database["public"]["Enums"]["booking_state"];

const VARIANTS: Record<BookingState, BadgeProps["variant"]> = {
  confirmed: "default",
  checked_in: "success",
  cancelled_on_time: "secondary",
  cancelled_late: "warning",
  venue_cancelled: "info",
  no_show: "destructive",
};

/**
 * A confirmed booking whose session already ended is waiting for the no-show job; it is shown as
 * "awaiting attendance" rather than as still upcoming.
 */
export function BookingStateBadge({ state, sessionEnded = false }: { state: BookingState; sessionEnded?: boolean }) {
  const t = useTranslations("bookingState");
  if (state === "confirmed" && sessionEnded) {
    return <Badge variant="secondary">{t("awaiting")}</Badge>;
  }
  return <Badge variant={VARIANTS[state]}>{t(state)}</Badge>;
}
