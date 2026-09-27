import pg from "pg";
import { DB_URL } from "./fixtures";

/**
 * The suite signs in and signs up many times; persistent rate limits (correctly) count those
 * attempts across runs. Before each run, clear the rate-limit windows of the local test database
 * only — never a remote one.
 */
export default async function globalSetup() {
  const host = new URL(DB_URL).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    return;
  }
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query("delete from private.rate_limits");
  } finally {
    await client.end();
  }
}
