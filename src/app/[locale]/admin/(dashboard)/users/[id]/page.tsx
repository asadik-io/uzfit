import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionDialog, ActionForm } from "@/features/admin/action-form";
import {
  anonymizeUserAction,
  correctBookingAction,
  grantMembershipAction,
  revokeMembershipAction,
  setAccountStatusAction,
} from "@/features/admin/actions";
import { getUserDetail, listPublishedPlanVersions } from "@/features/admin/queries";
import { BookingStateBadge } from "@/features/booking/booking-state-badge";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Link } from "@/lib/i18n/navigation";
import { DEFAULT_TIMEZONE, type Locale } from "@/lib/i18n/routing";
import { localized } from "@/lib/localized";
import { formatPhone } from "@/lib/phone";
import { renderTimeMs } from "@/lib/server-time";

export async function generateMetadata({ params }: PageProps<"/[locale]/admin/users/[id]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "admin.nav" });
  return { title: t("users"), robots: { index: false } };
}

export default async function AdminUserPage({ params }: PageProps<"/[locale]/admin/users/[id]">) {
  const { locale, id } = (await params) as { locale: Locale; id: string };
  setRequestLocale(locale);
  if (!z.guid().safeParse(id).success) {
    notFound();
  }
  const { viewer } = await requireAdmin(locale, `/${locale}/admin/users/${id}`);
  const [detail, planVersions] = await Promise.all([getUserDetail(id), listPublishedPlanVersions()]);
  if (!detail) {
    notFound();
  }
  const t = await getTranslations();
  const { user } = detail;
  const now = renderTimeMs();
  const at = (value: string | null) =>
    value ? formatDateTime(value, locale, DEFAULT_TIMEZONE, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const reasonField = { name: "reason", label: t("common.reason"), type: "textarea" as const, required: true };
  const activeMembership = detail.memberships.find((m) => m.status === "active" && new Date(m.ends_at).getTime() > now);
  const isSelf = viewer.id === user.user_id;
  const anonymized = Boolean(user.anonymized_at);

  const facts = [
    { label: t("auth.email"), value: user.email },
    { label: t("auth.displayName"), value: user.display_name || "—" },
    { label: t("profile.phone"), value: user.phone_e164 ? formatPhone(user.phone_e164) : "—" },
    { label: t("profile.language"), value: t(`locales.${user.locale}`) },
    { label: t("admin.users.createdAt"), value: at(user.created_at) },
    { label: t("admin.users.emailConfirmed"), value: at(user.email_confirmed_at) },
    { label: t("admin.users.lastSignIn"), value: at(user.last_sign_in_at) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin/users"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("admin.nav.users")}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
          {user.display_name || user.email}
          {user.is_admin ? <Badge variant="info">{t("admin.users.adminBadge")}</Badge> : null}
          {user.account_status === "suspended" ? (
            <Badge variant="destructive">{t("admin.users.suspended")}</Badge>
          ) : null}
          {anonymized ? <Badge variant="secondary">{t("admin.users.anonymized")}</Badge> : null}
        </h1>
        {!anonymized && !isSelf ? (
          <div className="flex flex-wrap gap-2">
            <ActionDialog
              trigger={user.account_status === "active" ? t("admin.users.suspend") : t("admin.users.reactivate")}
              title={
                user.account_status === "active" ? t("admin.users.suspendTitle") : t("admin.users.reactivateTitle")
              }
              description={user.account_status === "active" ? t("admin.users.suspendText") : undefined}
              action={setAccountStatusAction}
              hidden={{ userId: user.user_id, status: user.account_status === "active" ? "suspended" : "active" }}
              fields={[reasonField]}
              submitLabel={user.account_status === "active" ? t("admin.users.suspend") : t("admin.users.reactivate")}
              submitVariant={user.account_status === "active" ? "destructive" : "default"}
              successMessage={t("admin.saved")}
            />
            <ActionDialog
              trigger={t("admin.users.anonymize")}
              triggerVariant="ghost"
              title={t("admin.users.anonymizeTitle")}
              description={t("admin.users.anonymizeText")}
              action={anonymizeUserAction}
              hidden={{ userId: user.user_id }}
              fields={[
                reasonField,
                { name: "confirm", label: t("admin.users.anonymizeConfirm"), type: "checkbox", required: true },
              ]}
              submitLabel={t("admin.users.anonymize")}
              submitVariant="destructive"
              successMessage={t("admin.saved")}
            />
          </div>
        ) : null}
      </div>
      {user.status_reason ? <Alert variant="warning">{user.status_reason}</Alert> : null}

      <Card>
        <CardContent className="pt-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-muted-foreground">{fact.label}</dt>
                <dd className="font-medium break-all">{fact.value}</dd>
              </div>
            ))}
            {detail.organizations.length > 0 ? (
              <div>
                <dt className="text-muted-foreground">{t("admin.nav.organizations")}</dt>
                <dd className="font-medium">
                  {detail.organizations
                    .map((o) => `${o.organization?.name} (${t(`partner.role.${o.role}`)})`)
                    .join(", ")}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("admin.users.memberships")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("membership.historyEmpty")}</p>
          ) : null}
          <ul className="flex flex-col divide-y divide-border">
            {detail.memberships.map((m) => {
              const active = m.status === "active" && new Date(m.ends_at).getTime() > now;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {localized(m.plan_version?.name, locale)} v{m.plan_version?.version}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {at(m.starts_at)} – {at(m.ends_at)} · {t(`admin.users.source.${m.source}`)}
                    </span>
                    {m.grant_reason ? (
                      <span className="block text-xs text-muted-foreground">
                        {t("common.reason")}: {m.grant_reason}
                      </span>
                    ) : null}
                    {m.revoke_reason ? (
                      <span className="block text-xs text-muted-foreground">
                        {t("admin.users.revokedBecause", { reason: m.revoke_reason })}
                      </span>
                    ) : null}
                  </span>
                  <Badge variant={active ? "success" : m.status === "revoked" ? "destructive" : "secondary"}>
                    {active
                      ? t("membership.state.active")
                      : m.status === "revoked"
                        ? t("membership.state.revoked")
                        : t("membership.state.expired")}
                  </Badge>
                  {active ? (
                    <ActionDialog
                      trigger={t("admin.users.revoke")}
                      triggerVariant="ghost"
                      title={t("admin.users.revokeTitle")}
                      description={t("admin.users.revokeText")}
                      action={revokeMembershipAction}
                      hidden={{ membershipId: m.id }}
                      fields={[reasonField]}
                      submitLabel={t("admin.users.revoke")}
                      submitVariant="destructive"
                      successMessage={t("admin.saved")}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!activeMembership && !anonymized ? (
            <div className="rounded-xl border border-border p-4">
              <h3 className="mb-3 text-sm font-semibold">{t("admin.users.grant")}</h3>
              <ActionForm
                action={grantMembershipAction}
                hidden={{ userId: user.user_id }}
                fields={[
                  {
                    name: "planVersionId",
                    label: t("checkout.plan"),
                    type: "select",
                    required: true,
                    options: planVersions.map((pv) => ({
                      value: pv.id,
                      label: `${localized(pv.name, locale)} v${pv.version} · ${formatMoney(pv.price_minor, locale, t("common.currency"))}${pv.is_demo ? ` · ${t("demo.badge")}` : ""}`,
                    })),
                  },
                  reasonField,
                ]}
                submitLabel={t("admin.users.grant")}
                successMessage={t("admin.saved")}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("admin.users.bookings")}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("bookings.emptyPastTitle")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {detail.bookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{localized(b.session?.activity?.title, locale)}</span>{" "}
                    <span className="text-muted-foreground">
                      {localized(b.venue?.name, locale)} · {at(b.session_starts_at)}
                    </span>
                  </span>
                  <BookingStateBadge state={b.state} sessionEnded={new Date(b.session_ends_at).getTime() <= now} />
                  {b.state === "no_show" || b.state === "cancelled_late" ? (
                    <ActionDialog
                      trigger={t("admin.users.correct")}
                      triggerVariant="ghost"
                      title={t("admin.users.correctTitle")}
                      description={t("admin.users.correctText")}
                      action={correctBookingAction}
                      hidden={{ bookingId: b.id }}
                      fields={[
                        {
                          name: "newState",
                          label: t("admin.users.newState"),
                          type: "select",
                          options: [
                            ...(b.state === "no_show"
                              ? [{ value: "checked_in", label: t("bookingState.checked_in") }]
                              : []),
                            { value: "cancelled_on_time", label: t("admin.users.releaseVisit") },
                          ],
                        },
                        reasonField,
                      ]}
                      submitLabel={t("admin.users.correct")}
                      successMessage={t("admin.saved")}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("membership.paymentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("membership.paymentsEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {detail.orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{localized(o.plan_version?.name, locale)}</span>{" "}
                    <span className="text-muted-foreground">
                      {at(o.created_at)} · {formatMoney(o.amount_minor, locale, t("common.currency"))} · {o.provider}
                    </span>
                  </span>
                  {o.is_demo ? <Badge variant="demo">{t("demo.badge")}</Badge> : null}
                  {o.needs_reconciliation ? <Badge variant="warning">{t("membership.underReview")}</Badge> : null}
                  <Badge variant="secondary">{t(`orderStatus.${o.status}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
