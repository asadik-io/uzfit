import type { Actor } from "../core";
import type { Tables } from "../query";
import type { Store } from "../store";

export interface RpcContext {
  actor: Actor;
  store: Store;
  tables: Tables;
}

export type Args = Record<string, unknown>;
export type RpcFunction = (ctx: RpcContext, args: Args) => unknown;
