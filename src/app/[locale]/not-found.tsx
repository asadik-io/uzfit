import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Link } from "@/lib/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={SearchX}
        title={t("title")}
        description={t("description")}
        action={
          <Button asChild>
            <Link href="/">{t("home")}</Link>
          </Button>
        }
      />
    </div>
  );
}
