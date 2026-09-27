import pg from "pg";

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DB_URL });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot connect to the local Supabase database at ${DB_URL}. Start it with \`pnpm db:start\` ` +
        `and apply migrations with \`pnpm db:reset\`. (${(error as Error).message})`,
    );
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function setup(): Promise<void> {
  await withClient(async (client) => {
    const { rows } = await client.query<{ ok: string | null }>("select to_regclass('public.bookings')::text as ok");
    if (!rows[0]?.ok) {
      throw new Error("UzFit migrations are not applied. Run `pnpm db:reset` first.");
    }
    // The pinned test clock is honored only while this operator flag is set.
    await client.query(
      `insert into private.settings (key, value) values ('allow_fake_clock', 'true'::jsonb)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
    );
    await client.query(
      `insert into private.settings (key, value) values ('demo_payments_enabled', 'true'::jsonb)
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
    );
  });
}

export async function teardown(): Promise<void> {
  await withClient(async (client) => {
    await client.query(`update private.settings set value = 'false'::jsonb where key = 'allow_fake_clock'`);
  });
}
