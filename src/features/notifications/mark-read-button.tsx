"use client";

import { CheckCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/lib/i18n/navigation";
import { markAllNotificationsReadAction } from "./actions";

export function MarkAllReadButton() {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (result.ok) {
            router.refresh();
          } else {
            toast.error(t(`errors.${result.error}`));
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
      {t("notifications.markAllRead")}
    </Button>
  );
}
