"use client";

import {
  Building2,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  Store,
  Tags,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/i18n/navigation";
import { cn } from "@/lib/utils";

const ITEMS: Array<{ href: string; key: string; icon: LucideIcon }> = [
  { href: "/admin", key: "overview", icon: LayoutDashboard },
  { href: "/admin/revisions", key: "revisions", icon: ClipboardCheck },
  { href: "/admin/venues", key: "venues", icon: Store },
  { href: "/admin/organizations", key: "organizations", icon: Building2 },
  { href: "/admin/plans", key: "plans", icon: Tags },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/payments", key: "payments", icon: CreditCard },
  { href: "/admin/audit", key: "audit", icon: ScrollText },
];

export function AdminNav() {
  const t = useTranslations("admin.nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map(({ href, key, icon: Icon }) => {
          const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {t(key as "overview")}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
