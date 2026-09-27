"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "@/lib/i18n/navigation";
import type { LocalizedText } from "@/lib/localized";
import { ActivityForm, type ActivityFormValues } from "./activity-form";

export function EditActivityDialog({
  venueId,
  categories,
  activity,
  title,
}: {
  venueId: string;
  categories: Array<{ id: string; name: LocalizedText }>;
  activity: ActivityFormValues;
  title: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`${t("partner.activities.edit")}: ${title}`}>
          <Pencil aria-hidden="true" />
          {t("partner.activities.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("common.close")} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ActivityForm
          venueId={venueId}
          categories={categories}
          initial={activity}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
