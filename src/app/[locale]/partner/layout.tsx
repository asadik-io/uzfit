import { PartnerNav } from "@/features/partner/partner-nav";
import { getStaffVenues } from "@/features/partner/queries";
import { requireStaff } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/routing";

export default async function PartnerLayout({ children, params }: LayoutProps<"/[locale]/partner">) {
  const { locale } = (await params) as { locale: Locale };
  const { access } = await requireStaff(locale, `/${locale}/partner`);
  const venues = await getStaffVenues(access);
  const isManager =
    venues.some((v) => v.role === "manager") ||
    access.organizations.some((o) => o.status === "active" && o.role === "manager");
  return (
    <div className="container-page flex flex-col gap-6 py-6 lg:flex-row lg:gap-8">
      <aside className="shrink-0 lg:w-52">
        <PartnerNav isManager={isManager} />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
