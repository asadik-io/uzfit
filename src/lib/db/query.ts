/**
 * A small in-process implementation of the query surface the app used against PostgREST:
 * column selection with embedded relations, filters, ordering, paging, single-row modes,
 * counts and row mutations. Row visibility and write permissions are supplied by hooks so the
 * same owner-scoping rules the database enforced with RLS apply here.
 */
import { type DbError, dbError } from "./errors";
import { newId } from "./ids";

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

export interface Result<T> {
  data: T;
  error: DbError | null;
  count: number | null;
  status: number;
  statusText: string;
}

export type WriteOp = "insert" | "upsert" | "update" | "delete";

export interface EngineHooks {
  /** Whether the current actor may read a row (RLS equivalent). Applies to embedded rows too. */
  visible(table: string, row: Row): boolean;
  /** Returns an error when the actor may not perform the write on the given rows. */
  authorizeWrite(op: WriteOp, table: string, rows: Row[], patch: Row | null): DbError | null;
  onMutate(table: string): void;
}

/* ---------- select parsing ---------- */

interface SelectNode {
  alias: string;
  relation: string;
  inner: boolean;
  count: boolean;
  columns: string[];
  children: SelectNode[];
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseSelect(select: string): { columns: string[]; embeds: SelectNode[] } {
  const columns: string[] = [];
  const embeds: SelectNode[] = [];
  for (const part of splitTopLevel(select.replace(/\s+/g, " ").trim())) {
    const open = part.indexOf("(");
    if (open === -1) {
      columns.push(part.trim());
      continue;
    }
    const head = part.slice(0, open).trim();
    const body = part.slice(open + 1, part.lastIndexOf(")"));
    const colon = head.indexOf(":");
    const aliasPart = colon === -1 ? undefined : head.slice(0, colon);
    const relationPart = colon === -1 ? head : head.slice(colon + 1);
    const inner = relationPart.endsWith("!inner");
    const relation = relationPart.replace("!inner", "").trim();
    const nested = parseSelect(body);
    embeds.push({
      alias: (aliasPart ?? relation).trim(),
      relation,
      inner,
      count: body.trim() === "count",
      columns: nested.columns,
      children: nested.embeds,
    });
  }
  return { columns, embeds };
}

/* ---------- relations ---------- */

const SINGULAR: Record<string, string> = {
  activities: "activity",
  categories: "category",
  amenities: "amenity",
  cities: "city",
  profiles: "profile",
};
const singular = (table: string) => SINGULAR[table] ?? table.replace(/s$/, "");

/** Tables keyed by the user id rather than `<table>_id`. */
const USER_KEYED = new Set(["profiles"]);

interface Relation {
  kind: "one" | "many";
  /** Column on the parent (kind one) or on the child (kind many). */
  key: string;
}

function resolveRelation(parent: string, child: string, parentSample: Row): Relation {
  const parentKey = USER_KEYED.has(child) ? "user_id" : `${singular(child)}_id`;
  if (parentKey in parentSample) return { kind: "one", key: parentKey };
  const childKey = USER_KEYED.has(parent) ? "user_id" : `${singular(parent)}_id`;
  return { kind: "many", key: childKey };
}

/* ---------- filters ---------- */

type Op = "eq" | "neq" | "in" | "is" | "gte" | "gt" | "lte" | "lt" | "like" | "ilike" | "or";
export interface Filter {
  path: string;
  op: Op;
  value: unknown;
}

function likeToRegExp(pattern: string, flags: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, flags);
}

function parseOrValue(raw: string): unknown {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function parseOr(expression: string): Filter[] {
  return splitTopLevel(expression).map((term) => {
    const [column, op, ...rest] = term.split(".");
    return { path: column ?? "", op: (op ?? "eq") as Op, value: parseOrValue(rest.join(".")) };
  });
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const left = String(a);
  const right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function same(a: unknown, b: unknown): boolean {
  return a === b || (a != null && b != null && String(a) === String(b));
}

function matches(row: Row, filter: Filter, column: string): boolean {
  const v = row[column];
  switch (filter.op) {
    case "eq":
      return same(v, filter.value);
    case "neq":
      return !same(v, filter.value);
    case "in":
      return (filter.value as unknown[]).some((x) => same(x, v));
    case "is":
      return filter.value === null ? v === null || v === undefined : v === filter.value;
    case "gte":
      return v != null && compare(v, filter.value) >= 0;
    case "gt":
      return v != null && compare(v, filter.value) > 0;
    case "lte":
      return v != null && compare(v, filter.value) <= 0;
    case "lt":
      return v != null && compare(v, filter.value) < 0;
    case "like":
      return likeToRegExp(String(filter.value), "").test(String(v ?? ""));
    case "ilike":
      return likeToRegExp(String(filter.value), "i").test(String(v ?? ""));
    case "or":
      return (filter.value as Filter[]).some((f) => matches(row, f, f.path));
  }
}

/* ---------- projection ---------- */

function project(
  tables: Tables,
  hooks: EngineHooks,
  table: string,
  row: Row,
  columns: string[],
  embeds: SelectNode[],
  embedFilters: Filter[],
): Row | null {
  const out: Row = {};
  if (columns.includes("*") || columns.length === 0) {
    Object.assign(out, row);
  } else {
    for (const col of columns) {
      const colon = col.indexOf(":");
      const alias = colon === -1 ? col : col.slice(0, colon);
      const source = colon === -1 ? col : col.slice(colon + 1);
      out[alias.trim()] = row[source.trim()];
    }
  }
  for (const embed of embeds) {
    const relation = resolveRelation(table, embed.relation, row);
    const related = tables[embed.relation] ?? [];
    const mine = embedFilters.filter((f) => f.path.startsWith(`${embed.alias}.`));
    const direct = mine.filter((f) => f.path.split(".").length === 2);
    const deeper = mine
      .filter((f) => f.path.split(".").length > 2)
      .map((f) => ({ ...f, path: f.path.split(".").slice(1).join(".") }));

    let rows =
      relation.kind === "one"
        ? related.filter((r) => r.id === row[relation.key])
        : related.filter((r) => r[relation.key] === row.id);
    rows = rows.filter((r) => hooks.visible(embed.relation, r));
    rows = rows.filter((r) => direct.every((f) => matches(r, f, f.path.split(".")[1]!)));

    if (embed.count) {
      out[embed.alias] = [{ count: rows.length }];
      continue;
    }
    const projected = rows
      .map((r) => project(tables, hooks, embed.relation, r, embed.columns, embed.children, deeper))
      .filter((r): r is Row => r !== null);
    if (relation.kind === "one") {
      const value = projected[0] ?? null;
      if (embed.inner && value === null) return null;
      out[embed.alias] = value;
    } else {
      if (embed.inner && projected.length === 0) return null;
      out[embed.alias] = projected;
    }
  }
  return out;
}

/* ---------- defaults for inserted rows ---------- */

const TIMESTAMPED = new Set([
  "activities",
  "audit_logs",
  "auth_users",
  "bookings",
  "checkin_tokens",
  "checkins",
  "favorites",
  "memberships",
  "notifications",
  "orders",
  "organization_members",
  "organizations",
  "payments",
  "plan_versions",
  "plans",
  "platform_roles",
  "profiles",
  "sessions",
  "venue_images",
  "venue_revisions",
  "venues",
]);
const UPDATED = new Set([
  "account_statuses",
  "activities",
  "bookings",
  "orders",
  "organizations",
  "payments",
  "profiles",
  "sessions",
  "venue_revisions",
  "venues",
]);
const NO_ID = new Set([
  "account_statuses",
  "favorites",
  "organization_members",
  "plan_version_venues",
  "platform_roles",
  "venue_amenities",
  "venue_categories",
  "venue_opening_hours",
]);
/** Composite keys used for upserts when the caller gives none. */
const CONFLICT_KEYS: Record<string, string[]> = {
  favorites: ["user_id", "venue_id"],
  organization_members: ["organization_id", "user_id"],
  platform_roles: ["user_id"],
  account_statuses: ["user_id"],
};

let auditSequence = 1000;

export function withDefaults(table: string, row: Row, now = new Date().toISOString()): Row {
  const out: Row = { ...row };
  if (!NO_ID.has(table) && out.id === undefined) out.id = table === "audit_logs" ? ++auditSequence : newId();
  if (TIMESTAMPED.has(table) && out.created_at === undefined) out.created_at = now;
  if (UPDATED.has(table) && out.updated_at === undefined) out.updated_at = now;
  if (table === "payment_events" && out.received_at === undefined) out.received_at = now;
  return out;
}

/* ---------- typed facade ---------- */

export interface Filterable<Self> {
  eq(column: string, value: unknown): Self;
  neq(column: string, value: unknown): Self;
  in(column: string, values: readonly unknown[]): Self;
  is(column: string, value: unknown): Self;
  gte(column: string, value: unknown): Self;
  gt(column: string, value: unknown): Self;
  lte(column: string, value: unknown): Self;
  lt(column: string, value: unknown): Self;
  like(column: string, pattern: string): Self;
  ilike(column: string, pattern: string): Self;
  or(filters: string): Self;
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): Self;
  limit(count: number): Self;
  range(from: number, to: number): Self;
}

export interface ManyQuery<R> extends Filterable<ManyQuery<R>>, PromiseLike<Result<R[]>> {
  single(): OneQuery<R>;
  maybeSingle(): OneQuery<R | null>;
}
export interface OneQuery<R> extends Filterable<OneQuery<R>>, PromiseLike<Result<R>> {}
export interface HeadQuery extends Filterable<HeadQuery>, PromiseLike<Result<null>> {}
export interface MutationQuery<R> extends Filterable<MutationQuery<R>>, PromiseLike<Result<null>> {
  select(columns?: string): ManyQuery<R>;
}
export interface TableQuery<R> {
  select(columns?: string): ManyQuery<R>;
  select(columns: string, options: { count: "exact"; head: true }): HeadQuery;
  select(columns: string, options: { count: "exact"; head?: false }): ManyQuery<R>;
  insert(rows: Partial<R> | Partial<R>[]): MutationQuery<R>;
  upsert(
    rows: Partial<R> | Partial<R>[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): MutationQuery<R>;
  update(patch: Partial<R>): MutationQuery<R>;
  delete(): MutationQuery<R>;
}

/* ---------- the builder ---------- */

type Mode = "many" | "single" | "maybeSingle";

export class QueryBuilder implements PromiseLike<Result<unknown>> {
  private operation: "select" | WriteOp = "select";
  private selection = "*";
  private countMode: "exact" | null = null;
  private head = false;
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
  private limitCount: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private mode: Mode = "many";
  private payload: Row | Row[] | null = null;
  private onConflict: string[] | null = null;
  private ignoreDuplicates = false;
  private returning = false;

  constructor(
    private readonly tables: Tables,
    private readonly table: string,
    private readonly hooks: EngineHooks,
  ) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }) {
    this.selection = columns;
    this.countMode = options?.count ?? this.countMode;
    this.head = options?.head ?? false;
    if (this.operation !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.operation = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.operation = "upsert";
    this.payload = rows;
    this.onConflict = options?.onConflict
      ? options.onConflict.split(",").map((s) => s.trim())
      : (CONFLICT_KEYS[this.table] ?? ["id"]);
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }
  update(patch: Row) {
    this.operation = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }

  private add(op: Op, path: string, value: unknown) {
    this.filters.push({ path, op, value });
    return this;
  }
  eq(c: string, v: unknown) {
    return this.add("eq", c, v);
  }
  neq(c: string, v: unknown) {
    return this.add("neq", c, v);
  }
  in(c: string, v: readonly unknown[]) {
    return this.add("in", c, [...v]);
  }
  is(c: string, v: unknown) {
    return this.add("is", c, v);
  }
  gte(c: string, v: unknown) {
    return this.add("gte", c, v);
  }
  gt(c: string, v: unknown) {
    return this.add("gt", c, v);
  }
  lte(c: string, v: unknown) {
    return this.add("lte", c, v);
  }
  lt(c: string, v: unknown) {
    return this.add("lt", c, v);
  }
  like(c: string, v: string) {
    return this.add("like", c, v);
  }
  ilike(c: string, v: string) {
    return this.add("ilike", c, v);
  }
  or(expression: string) {
    return this.add("or", "", parseOr(expression));
  }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true, nullsFirst: options?.nullsFirst ?? false });
    return this;
  }
  limit(n: number) {
    this.limitCount = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  then<R1 = Result<unknown>, R2 = never>(
    onfulfilled?: ((value: Result<unknown>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }

  private baseFilters() {
    return this.filters.filter((f) => f.op === "or" || !f.path.includes("."));
  }
  private embedFilters() {
    return this.filters.filter((f) => f.op !== "or" && f.path.includes("."));
  }

  private execute(): Result<unknown> {
    const rows = this.tables[this.table];
    if (!rows) {
      return {
        data: null,
        error: dbError("42P01", `relation "public.${this.table}" does not exist`),
        count: null,
        status: 404,
        statusText: "Not Found",
      };
    }
    switch (this.operation) {
      case "select":
        return this.executeSelect(rows);
      case "insert":
      case "upsert":
        return this.executeInsert(rows);
      case "update":
        return this.executeUpdate(rows);
      case "delete":
        return this.executeDelete(rows);
    }
  }

  private finish(data: Row[], count: number | null): Result<unknown> {
    if (this.mode === "single") {
      if (data.length !== 1) {
        return {
          data: null,
          error: dbError(
            "PGRST116",
            "JSON object requested, multiple (or no) rows returned",
            `Results contain ${data.length} rows`,
          ),
          count,
          status: 406,
          statusText: "Not Acceptable",
        };
      }
      return { data: data[0], error: null, count, status: 200, statusText: "OK" };
    }
    if (this.mode === "maybeSingle") {
      return { data: data[0] ?? null, error: null, count, status: 200, statusText: "OK" };
    }
    return { data, error: null, count, status: 200, statusText: "OK" };
  }

  private matched(rows: Row[]): Row[] {
    const base = this.baseFilters();
    return rows.filter((row) => this.hooks.visible(this.table, row) && base.every((f) => matches(row, f, f.path)));
  }

  private executeSelect(rows: Row[]): Result<unknown> {
    let matched = this.matched(rows);
    for (const order of [...this.orders].reverse()) {
      matched = [...matched].sort((a, b) => {
        const av = a[order.column];
        const bv = b[order.column];
        if (av == null && bv == null) return 0;
        if (av == null) return order.nullsFirst ? -1 : 1;
        if (bv == null) return order.nullsFirst ? 1 : -1;
        const cmp = compare(av, bv);
        return order.ascending ? cmp : -cmp;
      });
    }
    const { columns, embeds } = parseSelect(this.selection);
    const projected = matched
      .map((row) => project(this.tables, this.hooks, this.table, row, columns, embeds, this.embedFilters()))
      .filter((row): row is Row => row !== null);
    const count = this.countMode ? projected.length : null;
    let page = projected;
    if (this.rangeFrom !== null) page = page.slice(this.rangeFrom, (this.rangeTo ?? page.length - 1) + 1);
    if (this.limitCount !== null) page = page.slice(0, this.limitCount);
    if (this.head) return { data: null, error: null, count, status: 200, statusText: "OK" };
    return this.finish(page, count);
  }

  private returningResult(rows: Row[]): Result<unknown> {
    if (!this.returning) return { data: null, error: null, count: null, status: 204, statusText: "No Content" };
    const { columns, embeds } = parseSelect(this.selection);
    return this.finish(
      rows
        .map((row) => project(this.tables, this.hooks, this.table, row, columns, embeds, []))
        .filter((row): row is Row => row !== null),
      null,
    );
  }

  private executeInsert(rows: Row[]): Result<unknown> {
    const incoming = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
    const prepared = incoming.map((item) => withDefaults(this.table, item));
    const denied = this.hooks.authorizeWrite(this.operation as WriteOp, this.table, prepared, null);
    if (denied) return { data: null, error: denied, count: null, status: 403, statusText: "Forbidden" };
    const written: Row[] = [];
    for (const [index, row] of prepared.entries()) {
      if (this.operation === "upsert") {
        const keys = this.onConflict ?? ["id"];
        const existing = rows.find((r) => keys.every((k) => r[k] === row[k]));
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, incoming[index]);
          written.push(existing);
          continue;
        }
      } else if ("id" in row && rows.some((r) => r.id === row.id)) {
        return {
          data: null,
          error: dbError("23505", `duplicate key value violates unique constraint "${this.table}_pkey"`),
          count: null,
          status: 409,
          statusText: "Conflict",
        };
      }
      rows.push(row);
      written.push(row);
    }
    this.hooks.onMutate(this.table);
    return this.returningResult(written);
  }

  private executeUpdate(rows: Row[]): Result<unknown> {
    const targets = this.matched(rows);
    const patch = (this.payload as Row) ?? {};
    const denied = this.hooks.authorizeWrite("update", this.table, targets, patch);
    if (denied) return { data: null, error: denied, count: null, status: 403, statusText: "Forbidden" };
    for (const row of targets) {
      Object.assign(row, patch, UPDATED.has(this.table) ? { updated_at: new Date().toISOString() } : {});
    }
    this.hooks.onMutate(this.table);
    return this.returningResult(targets);
  }

  private executeDelete(rows: Row[]): Result<unknown> {
    const targets = this.matched(rows);
    const denied = this.hooks.authorizeWrite("delete", this.table, targets, null);
    if (denied) return { data: null, error: denied, count: null, status: 403, statusText: "Forbidden" };
    const removed = new Set(targets);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (removed.has(rows[i]!)) rows.splice(i, 1);
    }
    this.hooks.onMutate(this.table);
    return this.returningResult(targets);
  }
}
