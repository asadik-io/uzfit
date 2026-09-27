/**
 * Normalizes a contact phone number to E.164. Uzbekistan numbers may be written with or
 * without the +998 country code, with the legacy domestic "8" prefix, or with spaces, dashes,
 * and parentheses. Other international numbers must already include "+" and a country code.
 * A contact number is not identity verification.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s\-().]/g, "");
  if (compact === "") {
    return null;
  }
  let match = /^\+?998(\d{9})$/.exec(compact);
  if (match) {
    return `+998${match[1]}`;
  }
  match = /^8(\d{9})$/.exec(compact);
  if (match) {
    return `+998${match[1]}`;
  }
  match = /^(\d{9})$/.exec(compact);
  if (match) {
    return `+998${match[1]}`;
  }
  if (/^\+(?!998)[1-9]\d{7,14}$/.test(compact)) {
    return compact;
  }
  return null;
}

/** "+998901234567" -> "+998 90 123 45 67" for display. */
export function formatPhone(e164: string): string {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return match ? `+998 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : e164;
}
