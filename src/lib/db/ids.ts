import { createHash, randomUUID } from "node:crypto";

/**
 * Deterministic UUID derived from a name. Seed records use these so links and
 * bookings stay valid across server instances, which each build their own copy
 * of the demo dataset.
 */
export function uuidFrom(name: string): string {
  const hex = createHash("sha1").update(name).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16]!, 16) % 4]!;
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Random UUID for records created at runtime. */
export function newId(): string {
  return randomUUID();
}

/** Fixed ids from the original seed, kept so demo links match the old database. */
export const fixed = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
