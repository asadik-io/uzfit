import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Mirrors the Supabase Auth password policy (8+ characters, letters and digits). */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Za-z]/)
  .regex(/\d/);
