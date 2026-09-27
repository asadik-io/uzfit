"use client";

import { CalendarCheck, Compass, CreditCard, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/explore", key: "explore", icon: Compass },
  { href: "/bookings", key: "bookings", icon: CalendarCheck },
  { href: "/membership", key: "membership", icon: CreditCard },
  { href: "/profile", key: "profile", icon: UserRound },
] as const;

/** Mobile bottom navigation: Explore, Bookings, Membership, Profile. */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("main")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {items.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground",
                  active && "text-primary",
                )}
              >
                <Icon className="size-6" aria-hidden="true" strokeWidth={active ? 2.4 : 2} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
