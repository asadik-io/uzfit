/**
 * CSV encoding for attendance exports. Cells that a spreadsheet would interpret as a formula
 * (starting with =, +, -, @, tab, or carriage return) are prefixed with an apostrophe.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** RFC 4180 CSV with a UTF-8 byte order mark so spreadsheet apps read Cyrillic correctly. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
