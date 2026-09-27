import { z } from "zod";

/**
 * Client-side schemas for immediate feedback. Messages are keys of the `validation` dictionary.
 * The server re-validates every submission with its own schemas.
 */
export const clientEmail = z.string().trim().min(1, "required").max(254, "tooLong").email("email");

export const clientPassword = z
  .string()
  .min(8, "passwordLength")
  .max(128, "tooLong")
  .regex(/[A-Za-z]/, "passwordStrength")
  .regex(/\d/, "passwordStrength");

export const clientDisplayName = z.string().trim().min(1, "required").max(80, "nameLength");
