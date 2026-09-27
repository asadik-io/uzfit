"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations();
  useEffect(() => {
    // The server already logged the error with this digest; never show error details to users.
    console.error("page_error", error.digest);
  }, [error]);
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={AlertTriangle}
        title={t("errorPage.title")}
        description={
          <>
            {t("errorPage.description")}
            {error.digest ? (
              <span className="mt-2 block text-xs">{t("errorPage.reference", { id: error.digest })}</span>
            ) : null}
          </>
        }
        action={<Button onClick={reset}>{t("common.retry")}</Button>}
      />
    </div>
  );
}
