import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-xl border p-4 text-sm [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0", {
  variants: {
    variant: {
      info: "border-info/20 bg-info-soft text-info",
      success: "border-success/20 bg-success-soft text-success",
      warning: "border-warning/20 bg-warning-soft text-warning",
      destructive: "border-destructive/20 bg-destructive-soft text-destructive",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, destructive: XCircle } as const;

export interface AlertProps extends Omit<React.ComponentProps<"div">, "title">, VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
}

export function Alert({ className, variant = "info", title, children, role, ...props }: AlertProps) {
  const Icon = icons[variant ?? "info"];
  return (
    <div
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-foreground/80">{children}</div> : null}
      </div>
    </div>
  );
}
