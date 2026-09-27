"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { usePathname, useRouter } from "@/lib/i18n/navigation";

const NOTICES = ["signed_out", "email_confirmed", "confirm_sign_in", "password_updated", "welcome"] as const;
type Notice = (typeof NOTICES)[number];

function isNotice(value: string | null): value is Notice {
  return value !== null && (NOTICES as readonly string[]).includes(value);
}

/** Shows a one-time toast for ?notice=... set by server redirects, then removes the parameter. */
export function NoticeToast() {
  const t = useTranslations("notices");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const notice = params.get("notice");

  useEffect(() => {
    if (!isNotice(notice)) {
      return;
    }
    toast.success(t(notice));
    const next = new URLSearchParams(params.toString());
    next.delete("notice");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [notice, params, pathname, router, t]);

  return null;
}
