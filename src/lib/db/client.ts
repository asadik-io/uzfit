/**
 * The client the app talks to. It keeps the surface the feature code already used (`from`,
 * `rpc`, `auth`, `storage`) but runs against the in-memory demo database. Row results are typed
 * loosely: the generated `Row` types give known columns, embedded relations come through as
 * `any`, exactly as before but without compile-time select parsing.
 */
import { type Actor, hasVenueRole } from "./core";
import { type CookieAdapter, createAuth } from "./auth";
import type { Database } from "./database.types";
import {
  type EngineHooks,
  type ManyQuery,
  type MutationQuery,
  type OneQuery,
  QueryBuilder,
  type Result,
  type Row,
  type TableQuery,
} from "./query";
import { createHooks } from "./policy";
import { callRpc } from "./rpc";
import type { Store } from "./store";

type Schema = Database["public"];
export type TableName = keyof Schema["Tables"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
/** Relations the app embeds with `select("..., relation(...)")`; lists on the left, single rows on the right. */
interface Embedded {
  venue_categories: Any[];
  venue_amenities: Any[];
  venue_images: Any[];
  venue_opening_hours: Any[];
  plan_version_venues: Any[];
  plan_versions: Any[];
  organization_members: Any[];
  venues: Any[];
  payments: Any[];
  plan: Any;
  plan_version: Any;
  venue: Any;
  session: Any;
  activity: Any;
  category: Any;
  amenity: Any;
  district: Any;
  city: Any;
  organization: Any;
  profile: Any;
}
export type Loose<T> = T & Embedded;
export type LooseRow<T extends TableName> = Loose<Schema["Tables"][T]["Row"]>;
type Functions = Schema["Functions"];
type Single<T> = T extends readonly (infer U)[] ? U : T;

export interface RpcQuery<T> extends PromiseLike<Result<T>> {
  single(): PromiseLike<Result<Single<T>>>;
  maybeSingle(): PromiseLike<Result<Single<T> | null>>;
}

export interface DbActor extends Actor {
  email: string | null;
}

class RpcBuilder<T> implements RpcQuery<T> {
  private mode: "many" | "single" | "maybeSingle" = "many";
  constructor(private readonly run: () => Result<unknown>) {}

  single() {
    this.mode = "single";
    return this as unknown as PromiseLike<Result<Single<T>>>;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this as unknown as PromiseLike<Result<Single<T> | null>>;
  }
  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => {
        const result = this.run();
        if (result.error || this.mode === "many") return result as Result<T>;
        const rows = Array.isArray(result.data) ? result.data : result.data === null ? [] : [result.data];
        if (this.mode === "single" && rows.length !== 1) {
          return {
            ...result,
            data: null,
            error: {
              code: "PGRST116",
              message: "JSON object requested, multiple (or no) rows returned",
              details: `Results contain ${rows.length} rows`,
              hint: null,
            },
            status: 406,
            statusText: "Not Acceptable",
          } as Result<T>;
        }
        return { ...result, data: rows[0] ?? null } as Result<T>;
      })
      .then(onfulfilled, onrejected);
  }
}

function storageFor(store: Store, actor: DbActor) {
  return {
    from(bucket: string) {
      void bucket;
      return {
        async upload(
          path: string,
          bytes: Uint8Array | ArrayBuffer | Blob,
          options?: { contentType?: string; cacheControl?: string; upsert?: boolean },
        ): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
          const match = /^venues\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(path);
          if (!match || (actor.role !== "service_role" && !hasVenueRole(store.tables, actor, match[1], ["manager"]))) {
            return { data: null, error: { message: "new row violates row-level security policy" } };
          }
          if (store.uploads.has(path) && !options?.upsert) {
            return { data: null, error: { message: "The resource already exists" } };
          }
          const data =
            bytes instanceof Uint8Array
              ? bytes
              : bytes instanceof ArrayBuffer
                ? new Uint8Array(bytes)
                : new Uint8Array(await bytes.arrayBuffer());
          store.uploads.set(path, { bytes: data, contentType: options?.contentType ?? "application/octet-stream" });
          return { data: { path }, error: null };
        },
      };
    },
  };
}

export function createDbClient(store: Store, actor: DbActor, cookies: CookieAdapter | null) {
  const hooks: EngineHooks = createHooks(store.tables, actor);
  return {
    from<T extends TableName>(table: T): TableQuery<LooseRow<T>> {
      return new QueryBuilder(store.tables, table, hooks) as unknown as TableQuery<LooseRow<T>>;
    },
    rpc<N extends keyof Functions>(name: N, args?: Functions[N]["Args"]): RpcQuery<Functions[N]["Returns"]> {
      return new RpcBuilder<Functions[N]["Returns"]>(() =>
        callRpc(store, actor, name, args as Record<string, unknown> | undefined),
      );
    },
    auth: createAuth(store, actor, cookies),
    storage: storageFor(store, actor),
  };
}

export type DbClient = ReturnType<typeof createDbClient>;
export type { ManyQuery, MutationQuery, OneQuery, Result, Row };
