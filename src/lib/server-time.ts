import "server-only";

/**
 * Wall-clock time for the current server render, used only for presentation (for example
 * labelling a booking whose session has ended). Server components render once per request;
 * every business rule is decided with database time inside the transactional functions.
 */
export function renderTimeMs(): number {
  return Date.now();
}
