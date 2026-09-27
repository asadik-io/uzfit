"use client";

import { Bell, Building2, CalendarCheck, CreditCard, Heart, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/features/auth/actions";
import { Link } from "@/lib/i18n/navigation";

export function UserMenu({
  displayName,
  email,
  isStaff,
  isAdmin,
}: {
  displayName: string;
  email: string | null;
  isStaff: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const initial = (displayName || email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <form ref={formRef} action={signOutAction} className="hidden">
        <input type="hidden" name="locale" value={locale} />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground hover:bg-primary-hover"
          aria-label={t("account")}
        >
          <span aria-hidden="true">{initial}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            <span className="block truncate font-semibold text-foreground">{displayName || email}</span>
            {displayName && email ? <span className="block truncate">{email}</span> : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <UserRound aria-hidden="true" />
              {t("profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/membership">
              <CreditCard aria-hidden="true" />
              {t("membership")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/bookings">
              <CalendarCheck aria-hidden="true" />
              {t("bookings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/favorites">
              <Heart aria-hidden="true" />
              {t("favorites")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/notifications">
              <Bell aria-hidden="true" />
              {t("notifications")}
            </Link>
          </DropdownMenuItem>
          {isStaff || isAdmin ? <DropdownMenuSeparator /> : null}
          {isStaff ? (
            <DropdownMenuItem asChild>
              <Link href="/partner">
                <Building2 aria-hidden="true" />
                {t("partner")}
              </Link>
            </DropdownMenuItem>
          ) : null}
          {isAdmin ? (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <ShieldCheck aria-hidden="true" />
                {t("admin")}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => formRef.current?.requestSubmit()}>
            <LogOut aria-hidden="true" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
