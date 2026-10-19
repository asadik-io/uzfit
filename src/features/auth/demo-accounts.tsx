import { KeyRound, LogIn } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { demoPassword } from "@/lib/db/auth";
import { SIGN_IN_ACCOUNTS } from "@/lib/db/demo-accounts";
import type { Locale } from "@/lib/i18n/routing";
import { demoSignInAction } from "./actions";

/** One-click demo sign-ins shown under the sign-in form. */
export async function DemoAccounts({ locale, next }: { locale: Locale; next?: string }) {
  const t = await getTranslations("auth.login");
  return (
    <section aria-labelledby="demo-accounts-title" className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
      <h2 id="demo-accounts-title" className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound className="size-4 text-primary" aria-hidden="true" />
        {t("demoTitle")}
      </h2>
      <p className="text-xs text-muted-foreground">
        {t("demoText")}{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{demoPassword()}</code>
      </p>
      <ul className="flex flex-col gap-2">
        {SIGN_IN_ACCOUNTS.map((account) => (
          <li key={account.key}>
            <form action={demoSignInAction} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
              <input type="hidden" name="account" value={account.key} />
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="next" value={next ?? ""} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{account.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t(`demoAccounts.${account.roleKey!}`)}</p>
              </div>
              <Button type="submit" size="sm" variant="outline" aria-label={t("demoSignIn", { name: account.name })}>
                <LogIn className="size-4" aria-hidden="true" />
                {t("submit")}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
