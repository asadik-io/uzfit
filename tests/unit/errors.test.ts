import { describe, expect, it } from "vitest";
import { DOMAIN_ERROR_CODES, fail, isDomainErrorCode, toDomainError } from "@/lib/errors";

describe("toDomainError", () => {
  it("passes through domain codes raised by database functions", () => {
    expect(toDomainError({ code: "P0001", message: "SESSION_FULL" })).toBe("SESSION_FULL");
    expect(toDomainError({ code: "P0001", message: "DAILY_LIMIT_REACHED" })).toBe("DAILY_LIMIT_REACHED");
  });

  it("never leaks unknown database messages", () => {
    expect(toDomainError({ code: "P0001", message: "relation secret does not exist" })).toBe("UNEXPECTED_ERROR");
    expect(toDomainError({ code: "XX000", message: "internal" })).toBe("UNEXPECTED_ERROR");
    expect(toDomainError(null)).toBe("UNEXPECTED_ERROR");
  });

  it("maps common PostgREST and Postgres failures", () => {
    expect(toDomainError({ code: "42501" })).toBe("FORBIDDEN");
    expect(toDomainError({ code: "PGRST301" })).toBe("AUTH_REQUIRED");
    expect(toDomainError({ code: "23505" })).toBe("CONCURRENT_UPDATE");
    expect(toDomainError({ code: "22P02" })).toBe("VALIDATION_FAILED");
  });
});

describe("error helpers", () => {
  it("recognises only declared codes", () => {
    expect(isDomainErrorCode("SESSION_FULL")).toBe(true);
    expect(isDomainErrorCode("session_full")).toBe(false);
    expect(isDomainErrorCode(42)).toBe(false);
  });

  it("builds failed results with optional field errors", () => {
    expect(fail("VALIDATION_FAILED")).toEqual({ ok: false, error: "VALIDATION_FAILED" });
    expect(fail("VALIDATION_FAILED", { phone: "invalid" })).toEqual({
      ok: false,
      error: "VALIDATION_FAILED",
      fieldErrors: { phone: "invalid" },
    });
  });

  it("has no duplicate codes", () => {
    expect(new Set(DOMAIN_ERROR_CODES).size).toBe(DOMAIN_ERROR_CODES.length);
  });
});
