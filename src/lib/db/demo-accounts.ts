/**
 * Demo accounts shared by the seed and the sign-in page. All of them use the same password
 * (DEMO_PASSWORD, default below); the demo deliberately has no secrets.
 */
export const DEFAULT_DEMO_PASSWORD = "UzFitDemo2026";

export interface DemoAccount {
  key: string;
  email: string;
  name: string;
  locale: "uz" | "ru" | "en";
  /** Translation key under auth.login.demoAccounts for the sign-in page; hidden when absent. */
  roleKey?: "member" | "memberNew" | "memberExpired" | "memberRevoked" | "manager" | "reception" | "admin";
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { key: "member", email: "member@uzfit.test", name: "Dilnoza (demo)", locale: "uz", roleKey: "member" },
  { key: "memberNew", email: "member.new@uzfit.test", name: "Jasur (demo)", locale: "ru", roleKey: "memberNew" },
  {
    key: "memberExpired",
    email: "member.expired@uzfit.test",
    name: "Malika (demo)",
    locale: "en",
    roleKey: "memberExpired",
  },
  {
    key: "memberRevoked",
    email: "member.revoked@uzfit.test",
    name: "Timur (demo)",
    locale: "uz",
    roleKey: "memberRevoked",
  },
  { key: "partnerA", email: "partner.a.manager@uzfit.test", name: "Demo Manager A", locale: "uz", roleKey: "manager" },
  {
    key: "receptionA",
    email: "partner.a.reception@uzfit.test",
    name: "Demo Reception A",
    locale: "uz",
    roleKey: "reception",
  },
  { key: "partnerB", email: "partner.b.manager@uzfit.test", name: "Demo Manager B", locale: "ru" },
  { key: "partnerC", email: "partner.c.manager@uzfit.test", name: "Demo Manager C", locale: "ru" },
  { key: "admin", email: "admin@uzfit.test", name: "Demo Admin", locale: "en", roleKey: "admin" },
  { key: "filler1", email: "filler.1@uzfit.test", name: "Demo Filler 1", locale: "uz" },
  { key: "filler2", email: "filler.2@uzfit.test", name: "Demo Filler 2", locale: "uz" },
];

/** Accounts offered as one-click sign-ins, in display order. */
export const SIGN_IN_ACCOUNTS = DEMO_ACCOUNTS.filter((a) => a.roleKey);

export function demoAccountByKey(key: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((a) => a.key === key);
}
