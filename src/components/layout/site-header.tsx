import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getAccess, getViewer } from "@/lib/auth";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { HeaderNav } from "./header-nav";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

async function headerData() {
  const viewer = await getViewer();
  if (!viewer) {
    return null;
  }
  const supabase = await createClient();
  const [access, profile, unread] = await Promise.all([
    getAccess(),
    supabase.from("profiles").select("display_name").eq("id", viewer.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  return {
    viewer,
    displayName: profile.data?.display_name ?? "",
    unread: unread.count ?? 0,
    isStaff: Boolean(access?.organizations.some((o) => o.status === "active")),
    isAdmin: Boolean(access?.hasAdminRole),
  };
}

export async function SiteHeader() {
  const t = await getTranslations("nav");
  const data = await headerData();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="container-page flex h-16 items-center gap-3">
        <Link href="/" aria-label={t("home")} className="rounded-lg">
          <Logo />
        </Link>
        <div className="ml-4 hidden md:block">
          <HeaderNav signedIn={Boolean(data)} />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
          <Suspense fallback={null}>
            <LocaleSwitcher signedIn={Boolean(data)} />
          </Suspense>
          {data ? (
            <>
              <Button asChild variant="ghost" size="icon" className="relative">
                <Link
                  href="/notifications"
                  aria-label={`${t("notifications")}${data.unread ? ` — ${t("unread", { count: data.unread })}` : ""}`}
                >
                  <Bell className="size-5" aria-hidden="true" />
                  {data.unread > 0 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-destructive-foreground"
                    >
                      {data.unread > 9 ? "9+" : data.unread}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <UserMenu
                displayName={data.displayName}
                email={data.viewer.email}
                isStaff={data.isStaff}
                isAdmin={data.isAdmin}
              />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">{t("signIn")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/signup">{t("signUp")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
