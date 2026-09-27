import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-2 p-6 pb-2">
          <CardTitle as="h1" className="text-2xl">
            {title}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="p-6 pt-4">{children}</CardContent>
        {footer ? <div className="border-t border-border px-6 py-4 text-sm text-muted-foreground">{footer}</div> : null}
      </Card>
    </div>
  );
}
