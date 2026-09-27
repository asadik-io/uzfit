import type messages from "../messages/en.json";
import type { locales } from "../lib/i18n/routing";

// Type-checks every translation key against the English dictionary at compile time.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
    Messages: typeof messages;
  }
}
