import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Locale } from "@/lib/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export interface Viewer {
  id: string;
  email: string | null;
  aal: "aal1" | "aal2";
}

export interface OrganizationAccess {
  id: string;
  name: string;
  status: Database["public"]["Enums"]["org_status"];
  role: Database["public"]["Enums"]["org_role"];
}

export interface Access {
  accountStatus: Database["public"]["Enums"]["account_status"];
  hasAdminRole: boolean;
  adminMfaRequired: boolean;
  adminAuthorized: boolean;
  organizations: OrganizationAccess[];
}

/**
 * Verified identity for this request. getClaims() validates the JWT signature (locally with
 * asymmetric keys, or against the Auth server otherwise); a cookie alone is never trusted.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    return null;
  }
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
  };
});

/**
 * Capabilities used to render navigation and gate pages. The database re-checks every one of
 * them on each operation, so this is never the authorization decision itself.
 */
export const getAccess = cache(async (): Promise<Access | null> => {
  const viewer = await getViewer();
  if (!viewer) {
    return null;
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_access").maybeSingle();
  if (!data) {
    return null;
  }
  return {
    accountStatus: data.account_status,
    hasAdminRole: data.has_admin_role,
    adminMfaRequired: data.admin_mfa_required,
    adminAuthorized: data.admin_authorized,
    organizations: (data.organizations as unknown as OrganizationAccess[]) ?? [],
  };
});

export function loginPath(locale: Locale, next: string): string {
  return `/${locale}/login?next=${encodeURIComponent(next)}`;
}

/** Redirects to sign-in when there is no verified session. */
export async function requireViewer(locale: Locale, next: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(loginPath(locale, next));
  }
  return viewer;
}

export async function requireStaff(locale: Locale, next: string): Promise<{ viewer: Viewer; access: Access }> {
  const viewer = await requireViewer(locale, next);
  const access = await getAccess();
  if (!access || access.accountStatus !== "active" || !access.organizations.some((o) => o.status === "active")) {
    redirect(`/${locale}`);
  }
  return { viewer, access };
}

/** Admin pages additionally require a verified second factor when the operator enables it. */
export async function requireAdmin(locale: Locale, next: string): Promise<{ viewer: Viewer; access: Access }> {
  const viewer = await requireViewer(locale, next);
  const access = await getAccess();
  if (!access?.hasAdminRole) {
    redirect(`/${locale}`);
  }
  if (!access.adminAuthorized) {
    redirect(`/${locale}/admin/mfa?next=${encodeURIComponent(next)}`);
  }
  return { viewer, access };
}
