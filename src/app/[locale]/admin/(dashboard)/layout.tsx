import { AdminNav } from "@/features/admin/admin-nav";
import { requireAdmin } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/routing";

export default async function AdminLayout({ children, params }: LayoutProps<"/[locale]/admin">) {
  const { locale } = (await params) as { locale: Locale };
  await requireAdmin(locale, `/${locale}/admin`);
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:flex-row lg:gap-8">
      <aside className="shrink-0 lg:w-52">
        <AdminNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
