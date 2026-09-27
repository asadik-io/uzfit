"use client";

import { BarChart3, CalendarDays, Dumbbell, LayoutDashboard, type LucideIcon, ScanLine, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

interface Item {
  href: string;
  key: "overview" | "scanner" | "schedule" | "activities" | "venues" | "reports";
  icon: LucideIcon;
  managerOnly: boolean;
}

const ITEMS: Item[] = [
  { href: "/partner", key: "overview", icon: LayoutDashboard, managerOnly: false },
  { href: "/partner/scanner", key: "scanner", icon: ScanLine, managerOnly: false },
  { href: "/partner/schedule", key: "schedule", icon: CalendarDays, managerOnly: false },
  { href: "/partner/activities", key: "activities", icon: Dumbbell, managerOnly: true },
  { href: "/partner/venues", key: "venues", icon: Store, managerOnly: true },
  { href: "/partner/reports", key: "reports", icon: BarChart3, managerOnly: true },
];

/** Dashboard sidebar (desktop) / scrollable tabs (mobile); keeps the selected venue. */
export function PartnerNav({ isManager }: { isManager: boolean }) {
  const t = useTranslations("partner.nav");
  const pathname = usePathname();
  const params = useSearchParams();
  const venue = params.get("venue");
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.filter((item) => isManager || !item.managerOnly).map(({ href, key, icon: Icon }) => {
          const active = href === "/partner" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={venue ? { pathname: href, query: { venue } } : href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
