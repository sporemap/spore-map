// The map's node set: how API shapes (tree, flat delta, live events) become BubbleNodes, how a delta
// merges into what the client holds, and which roots a view shows. Pure functions over a
// Map<mint, BubbleNode>; the hook in use-map-data.ts owns the state. `img` resolves the API's image
// paths (`/api/img?u=…`) against the API host so the canvas can load them from any origin.
import type { MapCoin, MapDeltaEntry, MapNode, MapResponse, PairEvent } from "./api";
import type { BubbleNode, RootsLimit } from "./types";

export type NodeSet = Map<string, BubbleNode>;
export type ImageResolver = (u: string | null | undefined) => string | null;
export const rawImage: ImageResolver = (u) => u ?? null;

export const fromMapCoin = (c: MapCoin, parentMint: string | null, img: ImageResolver = rawImage): BubbleNode => ({
  mint: c.mint, parentMint, depth: c.depth, name: c.name ?? null, symbol: c.symbol ?? null, image: img(c.image),
  mcapUsd: c.mcapUsd ?? null, lockedUsd: c.lockedUsd ?? null, children: c.children ?? 0, descendants: c.descendants ?? 0, migrated: !!c.migrated,
  ours: !!c.ours, createdAt: c.createdAt ?? null, updatedAt: c.updatedAt,
});

/// Both wire shapes flattened to one list. A tree node's parent is the node above it; a flat entry
/// carries `parentMint` itself (a depth-0 entry without one is a root).
export function normalise(res: MapResponse, img: ImageResolver = rawImage): { nodes: BubbleNode[]; removed: string[]; generatedAt: number | null; tree: boolean } {
  const out: BubbleNode[] = [];
  const walk = (n: MapNode, parentMint: string | null) => { out.push(fromMapCoin(n.coin, parentMint, img)); for (const k of n.children ?? []) walk(k, n.coin.mint); };
  if (Array.isArray(res.roots)) for (const r of res.roots) walk(r, null);
  const flat = Array.isArray(res.nodes) ? res.nodes : Array.isArray(res.updated) ? res.updated : [];
  for (const c of flat) out.push(fromMapCoin(c, c.parentMint ?? null, img));
  const generatedAt = typeof res.generatedAt === "number" && Number.isFinite(res.generatedAt) ? res.generatedAt : null;
  return { nodes: out, removed: Array.isArray(res.removed) ? res.removed.filter((m) => typeof m === "string") : [], generatedAt, tree: Array.isArray(res.roots) };
}

const sameNode = (a: BubbleNode, b: BubbleNode) =>
  a.parentMint === b.parentMint && a.depth === b.depth && a.name === b.name && a.symbol === b.symbol && a.image === b.image &&
  a.mcapUsd === b.mcapUsd && a.lockedUsd === b.lockedUsd && a.children === b.children && (a.descendants ?? 0) === (b.descendants ?? 0) &&
  a.migrated === b.migrated && !!a.ours === !!b.ours;

/// Upserts into `set`, keeping the object identity of unchanged nodes (BubbleMap diffs by reference)
/// and the cached position of a changed one. Returns the records that changed (what to persist).
export function upsert(set: NodeSet, incoming: BubbleNode[]): BubbleNode[] {
  const changed: BubbleNode[] = [];
  for (const n of incoming) {
    const cur = set.get(n.mint);
    if (cur && sameNode(cur, n)) { if (n.updatedAt && n.updatedAt !== cur.updatedAt) cur.updatedAt = n.updatedAt; continue; }
    // A delta row without a parent for a non-root keeps the parent the client already knows.
    const merged: BubbleNode = cur ? { ...cur, ...n, parentMint: n.parentMint ?? cur.parentMint, x: cur.x, y: cur.y } : n;
    set.set(n.mint, merged);
    changed.push(merged);
  }
  return changed;
}

export function remove(set: NodeSet, mints: string[]): number { let k = 0; for (const m of mints) if (set.delete(m)) k++; return k; }

/// `mapdelta`: numbers and (when the server sends them) name/image patches. Rows for unknown mints are ignored.
export function applyDelta(set: NodeSet, entries: MapDeltaEntry[], img: ImageResolver = rawImage): BubbleNode[] {
  const changed: BubbleNode[] = [];
  for (const e of entries) {
    const cur = set.get(e.mint);
    if (!cur) continue;
    const next: BubbleNode = { ...cur, mcapUsd: e.mcapUsd ?? cur.mcapUsd, lockedUsd: e.lockedUsd ?? cur.lockedUsd, children: e.children ?? cur.children, descendants: e.descendants ?? cur.descendants, migrated: e.migrated ?? cur.migrated };
    if (e.name !== undefined && e.name !== null) next.name = e.name;
    if (e.symbol !== undefined && e.symbol !== null) next.symbol = e.symbol;
    if (e.image !== undefined && e.image !== null) next.image = img(e.image);
    if (sameNode(cur, next)) continue;
    set.set(e.mint, next);
    changed.push(next);
  }
  return changed;
}

/// `pair`: the child, and its parent when the map does not hold it yet (a root seen for the first time).
export function applyPair(set: NodeSet, p: PairEvent, img: ImageResolver = rawImage): BubbleNode[] {
  const out: BubbleNode[] = [];
  const parent = p.parent?.mint ? set.get(p.parent.mint) : undefined;
  if (p.parent?.mint && !parent) out.push(fromMapCoin(p.parent, p.parent.parentMint ?? null, img));
  else if (parent && p.coin.mint && !set.has(p.coin.mint)) out.push({ ...parent, children: parent.children + 1, descendants: (parent.descendants ?? 0) + 1 });
  out.push(fromMapCoin(p.coin, p.parent?.mint ?? p.coin.parentMint ?? null, img));
  return upsert(set, out);
}

/// Server order for roots: locked, then mcap, then descendants.
export const rootCmp = (a: BubbleNode, b: BubbleNode) => (b.lockedUsd ?? -1) - (a.lockedUsd ?? -1) || (b.mcapUsd ?? -1) - (a.mcapUsd ?? -1) || (b.descendants ?? 0) - (a.descendants ?? 0);

/// A root is a node whose parent the set does not hold (depth 0, or an orphaned subtree).
export const isRoot = (n: BubbleNode, set: NodeSet) => !n.parentMint || !set.has(n.parentMint);

/// The nodes drawn for a roots limit: everything, or the subtrees of the top-n roots. Orphans whose
/// parent is missing are kept under their own root so nothing silently disappears.
export function selectView(set: NodeSet, limit: RootsLimit): BubbleNode[] {
  const all = Array.from(set.values());
  if (limit === "all") return all;
  const roots = all.filter((n) => isRoot(n, set)).sort(rootCmp).slice(0, limit);
  const keep = new Set(roots.map((r) => r.mint));
  const rootOf = new Map<string, string | null>();
  const top = (n: BubbleNode): string | null => {
    const hit = rootOf.get(n.mint);
    if (hit !== undefined) return hit;
    let cur: BubbleNode | undefined = n; let hops = 0;
    while (cur.parentMint && set.has(cur.parentMint) && hops++ < 8) cur = set.get(cur.parentMint)!;
    const r = cur.mint;
    rootOf.set(n.mint, r);
    return r;
  };
  return all.filter((n) => { const r = top(n); return r !== null && keep.has(r); });
}

/// Same as `selectView` over a plain list (what `useMapData` hands out).
export function viewOf(all: BubbleNode[], limit: RootsLimit): BubbleNode[] {
  if (limit === "all") return all;
  return selectView(new Map(all.map((n) => [n.mint, n])), limit);
}
