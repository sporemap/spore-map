// Typed client for the public Spore API endpoints the map reads (see README "Public API"). Every call
// is a plain GET on `apiBase` (the Spore host, or "" when a dev proxy serves /api same-origin).
// Types mirror the server contract field for field so a server change shows up as a type error.

export type CoinRef = { mint: string; name: string | null; symbol: string | null; image: string | null; depth: number };
/// One bubble of the ecosystem map: a CoinRef plus the few numbers a bubble is sized and labelled by.
/// `parentMint` and `updatedAt` arrive on the flat delta variant; `ours` marks a coin launched on Spore.
export type MapCoin = CoinRef & {
  mcapUsd: number | null; lockedUsd: number | null; children: number; descendants: number; migrated: boolean; createdAt: number | null;
  ours?: boolean; oursPending?: boolean; otherChildren?: number; parentMint?: string | null; updatedAt?: number;
};
export type MapNode = { coin: MapCoin; children: MapNode[] };
/// `GET /api/map`. Full form: a tree of every root. Delta form (`since=<ms>`): only the nodes whose
/// `updatedAt` moved, flat, each with its `parentMint`; `removed` is reserved. The client treats
/// whichever list is present as upserts.
export type MapResponse = { roots?: MapNode[]; nodes?: MapCoin[]; updated?: MapCoin[]; removed?: string[]; scope?: string; version?: number | string; generatedAt?: number; total?: number };
export type MapQuery = { limit?: number | "all"; depth?: number; scope?: "ours" | "all"; since?: number };
/// SSE `pair`: a child the live stream saw whose parent is tracked; `parent` lets the client add a root it has not drawn.
export type PairEvent = { coin: MapCoin; parent: MapCoin };
/// SSE `mapdelta`: numbers that moved since the last batch (≤ every 3 s, ≤ 500 entries).
export type MapDeltaEntry = { mint: string; mcapUsd: number | null; lockedUsd: number | null; children: number; descendants: number; migrated: boolean; name?: string | null; symbol?: string | null; image?: string | null };
export type MapDeltaEvent = { at: number; updated: MapDeltaEntry[] };
export type Stats = {
  coins: number; roots: number; byDepth: number[]; lockedUsd: number; volume24hUsd: number; solUsd: number | null; maxDepth: number;
  backfill: { done: boolean; total: number; resolved: number; failed?: number }; updatedAt: number;
  mode?: "ours" | "all"; ourCoins?: number; otherChildren?: number;
};
/// `GET /api/coin/:mint` → `{ coin, children, trades }`. Only the fields the side panel reads are typed
/// here; the full record is documented in the README.
export type Coin = CoinRef & {
  parent: CoinRef | null; root: CoinRef | null; ancestors: CoinRef[];
  complete: boolean; migrated: boolean; createdAt: number | null;
  mcapUsd: number | null; progress: number; children: number; descendants: number; lockedUsd: number | null; volume24hUsd: number; trades24h: number;
  updatedAt: number; ours?: boolean; oursPending?: boolean; mayhem?: boolean;
};
export type Trade = { sig: string; mint: string; slot: number; time: number; isBuy: boolean; user: string; baseAmount: string; quoteAmount: string; priceQuote: number; priceUsd: number | null };
export type CoinPage = { coin: Coin; children: Coin[]; trades: Trade[]; otherChildren?: number };

export const DEFAULT_API_BASE = "https://sporepad.com";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "ApiError"; this.status = status; }
}
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export type SporeApi = ReturnType<typeof createApi>;

/// `apiBase` is the origin of the Spore API ("https://sporepad.com"), or "" when `/api` is served
/// same-origin (the dev proxy). Trailing slashes are dropped.
export function createApi(apiBase: string = DEFAULT_API_BASE) {
  const base = apiBase.replace(/\/+$/, "");
  async function request<T>(path: string, timeoutMs = 15_000, init: RequestInit = {}): Promise<T> {
    const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, signal, headers: { accept: "application/json", ...init.headers } });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ApiError("The API is unreachable", 0);
    }
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body: handled below */ }
    if (!res.ok) {
      const msg = (json as { error?: string } | null)?.error || (res.status === 429 ? "Rate limited, try again in a minute" : res.status === 502 || res.status === 504 ? "The API is down" : `Request failed (${res.status})`);
      throw new ApiError(msg, res.status);
    }
    if (json === null) throw new ApiError("Empty response", res.status);
    return json as T;
  }
  return {
    base,
    stats: () => request<Stats>("/api/stats"),
    coin: (mint: string) => request<CoinPage>(`/api/coin/${encodeURIComponent(mint)}`),
    /// `limit: "all"` = the whole forest (no root or fan-out cap); `since` = only what changed after that
    /// `generatedAt`. The full tree is a few MB, so it gets a longer timeout. With `limit: "all"` the depth
    /// is left to the server so every client shares one cached build.
    map: ({ limit = "all", depth, scope = "all", since }: MapQuery = {}) => request<MapResponse>(`/api/map${qs({ scope, limit, depth: depth ?? (limit === "all" ? undefined : 2), since })}`, 60_000),
    eventsUrl: `${base}/api/events`,
    /// Image URLs the API hands out are paths on the API host (`/api/img?u=…`); absolute ones pass through.
    image: (u: string | null | undefined): string | null => (!u ? null : /^(https?:)?\/\//.test(u) ? u : `${base}${u.startsWith("/") ? "" : "/"}${u}`),
  };
}
