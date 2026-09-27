import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/lib/i18n/routing";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = (await params) as { locale: Locale };
  setRequestLocale(locale);
  const t = await getTranslations("meta");
  return (
    <div className="container-page py-16">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
    </div>
  );
}
