import { describe, expect, it } from "vitest";
import { normalizeScannedToken, QR_PREFIX } from "@/lib/checkin";
import { csvCell, toCsv } from "@/lib/csv";
import { sniffImageType } from "@/lib/image-type";
import { localized } from "@/lib/localized";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { safeInternalPath, safeLocalePath, safeRedirectTarget } from "@/lib/safe-redirect";

describe("phone numbers", () => {
  it("normalizes Uzbekistan numbers to E.164", () => {
    expect(normalizePhone("90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("+998 (90) 123-45-67")).toBe("+998901234567");
    expect(normalizePhone("998901234567")).toBe("+998901234567");
    expect(normalizePhone("8 90 123 45 67")).toBe("+998901234567");
  });

  it("accepts other international numbers with a country code and rejects the rest", () => {
    expect(normalizePhone("+7 912 345 67 89")).toBe("+79123456789");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("+998 90 123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("formats +998 numbers for display", () => {
    expect(formatPhone("+998901234567")).toBe("+998 90 123 45 67");
  });
});

describe("redirect targets", () => {
  it("keeps same-site relative paths", () => {
    expect(safeInternalPath("/uz/plans?x=1", "/uz")).toBe("/uz/plans?x=1");
  });

  it("rejects external, protocol-relative, and backslash targets", () => {
    for (const value of ["https://evil.test", "//evil.test/x", "/\\evil.test", "javascript:alert(1)", "/uz\u0000"]) {
      expect(safeInternalPath(value, "/uz")).toBe("/uz");
    }
  });

  it("accepts absolute URLs only on the app's own origin", () => {
    expect(safeRedirectTarget("http://localhost:3000/ru/explore", "http://localhost:3000", "/uz")).toBe("/ru/explore");
    expect(safeRedirectTarget("https://evil.test/ru", "http://localhost:3000", "/uz")).toBe("/uz");
  });

  it("requires a locale prefix for app pages", () => {
    expect(safeLocalePath("/en/bookings", "/uz")).toBe("/en/bookings");
    expect(safeLocalePath("/api/jobs/reconcile", "/uz")).toBe("/uz");
  });
});

describe("CSV export", () => {
  it("neutralizes spreadsheet formulas and quotes special characters", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+998")).toBe("'+998");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell(null)).toBe("");
  });

  it("starts with a UTF-8 byte order mark and uses CRLF", () => {
    expect(toCsv([["a", "b"]])).toBe("﻿a,b\r\n");
  });
});

describe("localized database fields", () => {
  it("falls back to Uzbek, then to any translation", () => {
    expect(localized({ uz: "Zal", ru: "Зал" }, "ru")).toBe("Зал");
    expect(localized({ uz: "Zal" }, "en")).toBe("Zal");
    expect(localized({ ru: "Зал" }, "en")).toBe("Зал");
    expect(localized(null, "uz")).toBe("");
  });
});

describe("check-in codes", () => {
  const token = "A".repeat(20) + "b-_9" + "c".repeat(19);

  it("accepts scanned or pasted codes with the prefix and stray whitespace", () => {
    expect(normalizeScannedToken(`${QR_PREFIX}${token}`)).toBe(token);
    expect(normalizeScannedToken(` uzfit1:${token.slice(0, 20)}\n${token.slice(20)} `)).toBe(token);
    expect(normalizeScannedToken(token)).toBe(token);
  });

  it("rejects anything that cannot be a token", () => {
    expect(normalizeScannedToken("UZFIT1:short")).toBeNull();
    expect(normalizeScannedToken(`${token}!`)).toBeNull();
    expect(normalizeScannedToken("https://example.test")).toBeNull();
  });
});

describe("image uploads", () => {
  it("detects JPEG, PNG, and WebP from their signatures", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(sniffImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("webp");
  });

  it("rejects SVG, HTML, and GIF regardless of the file name", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("<!doctype html>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
  });
});
