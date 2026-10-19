/**
 * Demo authentication over the in-memory user table and a signed cookie. Demo accounts share
 * one password; accounts created through sign-up get a salted hash and live until the demo
 * instance restarts. No email is ever sent.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type Actor, insertRow, nowIso, rowsWhere } from "./core";
import { DEFAULT_DEMO_PASSWORD } from "./demo-accounts";
import type { Row } from "./query";
import { createSessionCookie, SESSION_COOKIE, sessionCookieOptions } from "./session";
import type { Store } from "./store";

export interface AuthError {
  name: string;
  message: string;
  code?: string;
  status?: number;
}

export interface CookieAdapter {
  get(name: string): string | undefined;
  set(name: string, value: string, options: ReturnType<typeof sessionCookieOptions>): void;
  delete(name: string): void;
}

export interface Claims {
  sub: string;
  email: string | null;
  aal: "aal1" | "aal2";
  role: "authenticated";
}

export interface AuthUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}

type AuthResult<T> = Promise<{ data: T; error: AuthError | null }>;

const authError = (code: string, status: number, message: string): AuthError => ({
  name: "AuthApiError",
  code,
  status,
  message,
});

export function demoPassword(): string {
  return process.env.DEMO_PASSWORD || DEFAULT_DEMO_PASSWORD;
}

function hashPassword(password: string, salt = randomBytes(8).toString("hex")): string {
  return `${salt}$${createHash("sha256").update(`${salt}:${password}`).digest("hex")}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyPassword(user: Row, password: string): boolean {
  if (user.password_hash === null || user.password_hash === undefined) {
    return safeEqual(password, demoPassword());
  }
  const [salt] = String(user.password_hash).split("$");
  return safeEqual(String(user.password_hash), hashPassword(password, salt));
}

function toAuthUser(user: Row): AuthUser {
  return {
    id: String(user.id),
    email: (user.email as string | null) ?? null,
    user_metadata: (user.raw_user_meta_data as Record<string, unknown>) ?? {},
  };
}

export function findUser(store: Store, id: string | null): Row | undefined {
  if (!id) return undefined;
  return store.tables.auth_users!.find((u) => u.id === id && u.deleted_at === null);
}

export function createAuth(store: Store, actor: Actor & { email: string | null }, cookies: CookieAdapter | null) {
  const users = () => store.tables.auth_users!;

  async function establishSession(user: Row): Promise<void> {
    user.last_sign_in_at = nowIso();
    if (cookies) {
      cookies.set(
        SESSION_COOKIE,
        await createSessionCookie({ id: String(user.id), email: (user.email as string) ?? null }),
        sessionCookieOptions(),
      );
    }
  }

  return {
    async getClaims(): AuthResult<{ claims: Claims } | null> {
      const user = findUser(store, actor.uid);
      if (!user) {
        return { data: null, error: authError("session_not_found", 401, "Auth session missing") };
      }
      return {
        data: {
          claims: {
            sub: String(user.id),
            email: (user.email as string | null) ?? null,
            aal: actor.aal,
            role: "authenticated",
          },
        },
        error: null,
      };
    },

    async signInWithPassword(credentials: { email: string; password: string }): AuthResult<{ user: AuthUser | null }> {
      const email = credentials.email.trim().toLowerCase();
      const user = users().find((u) => String(u.email).toLowerCase() === email && u.deleted_at === null);
      if (!user || !verifyPassword(user, credentials.password)) {
        return { data: { user: null }, error: authError("invalid_credentials", 400, "Invalid login credentials") };
      }
      await establishSession(user);
      return { data: { user: toAuthUser(user) }, error: null };
    },

    async signUp(input: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown>; emailRedirectTo?: string };
    }): AuthResult<{ user: AuthUser | null; session: { user: AuthUser } | null }> {
      const email = input.email.trim().toLowerCase();
      if (users().some((u) => String(u.email).toLowerCase() === email && u.deleted_at === null)) {
        return {
          data: { user: null, session: null },
          error: authError("user_already_exists", 422, "User already registered"),
        };
      }
      if (input.password.length < 8 || !/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
        return { data: { user: null, session: null }, error: authError("weak_password", 422, "Password is too weak") };
      }
      const metadata = input.options?.data ?? {};
      const displayName = String(metadata.display_name ?? "")
        .trim()
        .slice(0, 80);
      const locale = ["uz", "ru", "en"].includes(String(metadata.locale)) ? String(metadata.locale) : "uz";
      const now = nowIso();
      const user = insertRow(store.tables, "auth_users", {
        email,
        email_confirmed_at: now,
        last_sign_in_at: null,
        raw_user_meta_data: { display_name: displayName, locale },
        password_hash: hashPassword(input.password),
        is_demo: false,
        deleted_at: null,
      });
      insertRow(store.tables, "profiles", {
        id: user.id,
        display_name: displayName,
        phone_e164: null,
        locale,
        anonymized_at: null,
      });
      insertRow(store.tables, "account_statuses", {
        user_id: user.id,
        status: "active",
        reason: null,
        updated_by: null,
      });
      await establishSession(user);
      const authUser = toAuthUser(user);
      return { data: { user: authUser, session: { user: authUser } }, error: null };
    },

    async signOut(options?: { scope?: "local" | "global" | "others" }): Promise<{ error: AuthError | null }> {
      void options;
      cookies?.delete(SESSION_COOKIE);
      return { error: null };
    },

    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }): AuthResult<Record<string, never>> {
      void email;
      void options;
      // The demo sends no email. Demo accounts use the shared password shown on the sign-in page.
      return { data: {}, error: null };
    },

    async updateUser(attributes: {
      password?: string;
      data?: Record<string, unknown>;
    }): AuthResult<{ user: AuthUser | null }> {
      const user = findUser(store, actor.uid);
      if (!user) {
        return { data: { user: null }, error: authError("session_not_found", 401, "Auth session missing") };
      }
      if (attributes.password !== undefined && user.is_demo !== true) {
        user.password_hash = hashPassword(attributes.password);
      }
      if (attributes.data) {
        user.raw_user_meta_data = {
          ...((user.raw_user_meta_data as Record<string, unknown>) ?? {}),
          ...attributes.data,
        };
      }
      return { data: { user: toAuthUser(user) }, error: null };
    },

    admin: {
      async deleteUser(id: string, soft = false): AuthResult<Record<string, never>> {
        void soft;
        if (actor.role !== "service_role") {
          return { data: {}, error: authError("not_admin", 403, "User not allowed") };
        }
        const user = users().find((u) => u.id === id);
        if (!user) {
          return { data: {}, error: authError("user_not_found", 404, "User not found") };
        }
        user.deleted_at = nowIso();
        return { data: {}, error: null };
      },
    },
  };
}

export type DemoAuth = ReturnType<typeof createAuth>;

export function usersByEmail(store: Store, email: string): Row | undefined {
  return rowsWhere(
    store.tables,
    "auth_users",
    (u) => String(u.email).toLowerCase() === email.toLowerCase() && u.deleted_at === null,
  )[0];
}
