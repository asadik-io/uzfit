"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/**
 * Submit button for <form action={serverAction}>: disabled while the action is pending so the
 * same form cannot be submitted twice. The server still enforces idempotency.
 */
export function SubmitButton({ children, pendingLabel, disabled, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-disabled={pending || disabled} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
