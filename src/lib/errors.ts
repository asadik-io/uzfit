/**
 * Stable domain error codes. Database functions raise them as SQLSTATE P0001 with the code as
 * the message; the UI maps each code to a translated message (messages/*.json -> errors.CODE).
 */
export const DOMAIN_ERROR_CODES = [
  // Access
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "MFA_REQUIRED",
  "ACCOUNT_SUSPENDED",
  "RATE_LIMITED",
  "VALIDATION_FAILED",
  "CONCURRENT_UPDATE",
  "NOT_FOUND",
  "USER_NOT_FOUND",
  // Booking
  "SESSION_NOT_FOUND",
  "SESSION_NOT_BOOKABLE",
  "SESSION_CANCELLED",
  "BOOKING_CLOSED",
  "MEMBERSHIP_REQUIRED",
  "MEMBERSHIP_EXPIRES_BEFORE_SESSION",
  "PLAN_NOT_ELIGIBLE",
  "BOOKING_WINDOW_EXCEEDED",
  "ALREADY_BOOKED",
  "TIME_CONFLICT",
  "DAILY_LIMIT_REACHED",
  "FUTURE_BOOKING_LIMIT_REACHED",
  "VISIT_LIMIT_REACHED",
  "SESSION_FULL",
  "IDEMPOTENCY_KEY_REUSED",
  "BOOKING_NOT_FOUND",
  "BOOKING_NOT_CANCELLABLE",
  "CANCELLATION_CLOSED",
  "LATE_CANCELLATION_UNCONFIRMED",
  "ALREADY_CHECKED_IN",
  "BOOKING_NOT_ACTIVE",
  // Check-in
  "OUTSIDE_CHECKIN_WINDOW",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_ALREADY_USED",
  "WRONG_VENUE",
  // Partner operations
  "CAPACITY_BELOW_OCCUPIED",
  "SESSION_TIME_IMMUTABLE",
  "SESSION_ENDED",
  "SESSION_IN_PAST",
  "SESSION_DUPLICATE",
  "ACTIVITY_INACTIVE",
  "REASON_REQUIRED",
  "INVALID_CONTENT",
  "SLUG_TAKEN",
  "REVISION_LOCKED",
  "REVISION_NOT_FOUND",
  "REVISION_NOT_SUBMITTED",
  "VENUE_NOT_FOUND",
  "INVALID_TRANSITION",
  "ORGANIZATION_NOT_FOUND",
  // Plans, memberships, payments
  "PLAN_NOT_AVAILABLE",
  "PLAN_NOT_FOUND",
  "PLAN_CODE_TAKEN",
  "PLAN_VERSION_IMMUTABLE",
  "PLAN_VERSION_NOT_FOUND",
  "MEMBERSHIP_ALREADY_ACTIVE",
  "MEMBERSHIP_NOT_FOUND",
  "PAYMENT_UNAVAILABLE",
  "ORDER_NOT_FOUND",
  "ORDER_NOT_REFUNDABLE",
  "REFERENCE_REQUIRED",
  // Application-level
  "INVALID_CREDENTIALS",
  "EMAIL_NOT_CONFIRMED",
  "EMAIL_IN_USE",
  "WEAK_PASSWORD",
  "SAME_PASSWORD",
  "INVALID_LINK",
  "UPLOAD_INVALID_TYPE",
  "UPLOAD_TOO_LARGE",
  "CONFIGURATION_REQUIRED",
  "UNEXPECTED_ERROR",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

const CODES = new Set<string>(DOMAIN_ERROR_CODES);

export function isDomainErrorCode(value: unknown): value is DomainErrorCode {
  return typeof value === "string" && CODES.has(value);
}

interface ErrorLike {
  code?: string | null;
  message?: string | null;
}

/** Maps a PostgREST / Postgres error to a stable domain code. Unknown errors never leak details. */
export function toDomainError(error: ErrorLike | null | undefined): DomainErrorCode {
  if (!error) {
    return "UNEXPECTED_ERROR";
  }
  if (error.code === "P0001" && isDomainErrorCode(error.message)) {
    return error.message;
  }
  if (isDomainErrorCode(error.code)) {
    return error.code;
  }
  switch (error.code) {
    case "42501": // insufficient privilege
      return "FORBIDDEN";
    case "PGRST301": // JWT expired or invalid
    case "PGRST302":
      return "AUTH_REQUIRED";
    case "23505": // unique violation that slipped past a function check
      return "CONCURRENT_UPDATE";
    case "23514": // check violation
    case "22P02": // invalid input syntax
      return "VALIDATION_FAILED";
    default:
      return "UNEXPECTED_ERROR";
  }
}

/** Result type returned by Server Actions to Client Components. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: DomainErrorCode; fieldErrors?: Record<string, string> };

export function fail(
  error: DomainErrorCode,
  fieldErrors?: Record<string, string>,
): { ok: false; error: DomainErrorCode; fieldErrors?: Record<string, string> } {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}
