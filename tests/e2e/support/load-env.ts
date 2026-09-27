import { existsSync, readFileSync } from "node:fs";

/** Loads KEY=VALUE pairs from a dotenv file without overriding variables that are already set. */
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith("#")) {
      continue;
    }
    const [, key, raw] = match as unknown as [string, string, string];
    const value = raw.replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
