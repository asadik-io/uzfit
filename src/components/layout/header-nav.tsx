"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/explore", key: "explore", auth: false },
  { href: "/plans", key: "plans", auth: false },
  { href: "/bookings", key: "bookings", auth: true },
  { href: "/membership", key: "membership", auth: true },
] as const;

export function HeaderNav({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("main")} className="hidden items-center gap-1 md:flex">
      {items
        .filter((item) => signedIn || !item.auth)
        .map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
              )}
            >
              {t(item.key)}
            </Link>
          );
        })}
    </nav>
  );
}
