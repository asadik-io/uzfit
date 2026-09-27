"use client";

import { Heart, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setFavoriteAction } from "@/features/favorites/actions";
import { useRouter } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

/** Favorite toggle. The icon changes only after the server confirms the change. */
export function FavoriteButton({
  venueId,
  initial,
  signedIn,
  loginHref,
  variant = "icon",
}: {
  venueId: string;
  initial: boolean;
  signedIn: boolean;
  loginHref: string;
  variant?: "icon" | "full";
}) {
  const t = useTranslations();
  const router = useRouter();
  const [favorite, setFavorite] = useState(initial);
  const [pending, startTransition] = useTransition();
  const label = favorite ? t("venue.removeFavorite") : t("venue.addFavorite");

  function toggle() {
    if (!signedIn) {
      router.push(loginHref);
      return;
    }
    startTransition(async () => {
      const result = await setFavoriteAction(venueId, !favorite);
      if (result.ok) {
        setFavorite(result.data.favorite);
        toast.success(result.data.favorite ? t("venue.favoriteSaved") : t("venue.favoriteRemoved"));
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  const icon = pending ? (
    <Loader2 className="animate-spin" aria-hidden="true" />
  ) : (
    <Heart aria-hidden="true" className={cn(favorite && "fill-destructive text-destructive")} />
  );

  if (variant === "full") {
    return (
      <Button variant="outline" onClick={toggle} disabled={pending} aria-pressed={favorite}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorite}
      aria-label={label}
      title={label}
      className="rounded-full bg-card/90 backdrop-blur"
    >
      {icon}
    </Button>
  );
}
