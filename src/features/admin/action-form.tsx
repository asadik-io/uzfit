"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox, Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/errors";

export interface ActionField {
  name: string;
  label: string;
  type?: "text" | "textarea" | "select" | "checkbox" | "number";
  required?: boolean;
  hint?: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
  maxLength?: number;
}

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

interface ActionFormProps {
  action: Action;
  fields?: ActionField[];
  hidden?: Record<string, string>;
  submitLabel: string;
  submitVariant?: ButtonProps["variant"];
  successMessage: string;
  onSuccess?: () => void;
  /** Horizontal layout for single-field inline forms. */
  inline?: boolean;
}

/**
 * Generic form for an admin Server Action: renders the fields, submits once, shows the
 * translated server error, and reports success only after the server committed the change.
 */
export function ActionForm({
  action,
  fields = [],
  hidden = {},
  submitLabel,
  submitVariant,
  successMessage,
  onSuccess,
  inline = false,
}: ActionFormProps) {
  const t = useTranslations();
  // Success feedback is given when the server action resolves: the form itself may disappear in
  // the same render (for example a removed row), so it cannot rely on an effect after commit.
  const [state, formAction] = useActionState(async (prev: ActionResult | null, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      toast.success(successMessage);
      onSuccess?.();
    }
    return result;
  }, null);

  const fieldError = (name: string) =>
    state && !state.ok && state.fieldErrors?.[name] ? t("admin.invalidField") : undefined;

  return (
    <form action={formAction} className={inline ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-4"}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field) => {
        const fieldId = `af-${field.name}-${Object.values(hidden).join("-").slice(0, 40)}`;
        if (field.type === "checkbox") {
          return (
            <div key={field.name} className="flex items-start gap-2">
              <Checkbox
                id={fieldId}
                name={field.name}
                defaultChecked={field.defaultValue === "on"}
                required={field.required}
              />
              <Label htmlFor={fieldId} className="font-normal">
                {field.label}
              </Label>
            </div>
          );
        }
        return (
          <Field
            key={field.name}
            id={fieldId}
            label={field.label}
            hint={field.hint}
            required={field.required}
            error={fieldError(field.name)}
            className={inline ? "min-w-48 flex-1" : undefined}
          >
            {field.type === "textarea" ? (
              <Textarea
                id={fieldId}
                name={field.name}
                required={field.required}
                defaultValue={field.defaultValue}
                maxLength={field.maxLength ?? 500}
              />
            ) : field.type === "select" ? (
              <NativeSelect id={fieldId} name={field.name} required={field.required} defaultValue={field.defaultValue}>
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id={fieldId}
                name={field.name}
                type={field.type ?? "text"}
                required={field.required}
                defaultValue={field.defaultValue}
                maxLength={field.type === "number" ? undefined : (field.maxLength ?? 200)}
              />
            )}
          </Field>
        );
      })}
      <FormError code={state && !state.ok ? state.error : null} />
      <div>
        <SubmitButton variant={submitVariant}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** An ActionForm in a dialog, reset each time it opens. */
export function ActionDialog({
  trigger,
  triggerVariant = "outline",
  triggerSize = "sm",
  title,
  description,
  ...form
}: Omit<ActionFormProps, "onSuccess" | "inline"> & {
  trigger: string;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  title: string;
  description?: string;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setVersion((v) => v + 1);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t("close")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ActionForm key={version} {...form} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
