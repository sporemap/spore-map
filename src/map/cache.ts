// IndexedDB cache of the whole map: every node keyed by mint, its last layout position, and the
// server's `generatedAt` so the next open only asks for what changed (`since=`). No dependency: three
// object stores and a handful of promisified requests. Every call swallows a missing or broken
// IndexedDB (private mode, storage pressure) and the caller falls back to the network. One database
// per API base, so two embeds pointed at different hosts never mix nodes.
import type { BubbleNode } from "./types";

/// Bump when the record shape changes: the upgrade handler drops every store, so an old cache is cleared.
export const CACHE_V = 2;
const CHUNK = 2500;

export type CacheMeta = { generatedAt: number; savedAt: number; count: number };
export type CachedMap = { nodes: BubbleNode[]; meta: CacheMeta };
type Pos = { mint: string; x: number; y: number };
export type MapCache = { load: () => Promise<CachedMap | null>; saveNodes: (nodes: BubbleNode[], generatedAt: number | null, removed?: string[]) => Promise<void>; savePositions: (pos: Pos[]) => Promise<void>; clear: () => Promise<void> };

const hasIdb = () => typeof indexedDB !== "undefined";
const req = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error ?? new Error("idb")); });
const done = (tx: IDBTransaction): Promise<void> => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error ?? new Error("idb tx")); tx.onabort = () => rej(tx.error ?? new Error("idb abort")); });

const dbs = new Map<string, Promise<IDBDatabase | null>>();
function open(name: string): Promise<IDBDatabase | null> {
  const hit = dbs.get(name);
  if (hit) return hit;
  const p = new Promise<IDBDatabase | null>((res) => {
    if (!hasIdb()) return res(null);
    let r: IDBOpenDBRequest;
    try { r = indexedDB.open(name, CACHE_V); } catch { return res(null); }
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const n of Array.from(db.objectStoreNames)) db.deleteObjectStore(n);
      db.createObjectStore("nodes", { keyPath: "mint" });
      db.createObjectStore("pos", { keyPath: "mint" });
      db.createObjectStore("meta", { keyPath: "key" });
    };
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => { db.close(); dbs.delete(name); }; res(db); };
    r.onerror = () => res(null);
    r.onblocked = () => res(null);
  });
  dbs.set(name, p);
  return p;
}

export const cacheName = (apiBase: string) => `spore-map${apiBase ? `:${apiBase.replace(/^https?:\/\//, "")}` : ""}`;

export function createCache(apiBase: string): MapCache {
  const name = cacheName(apiBase);
  return {
    /// Everything cached, positions joined in, or null on a cold/broken cache.
    async load() {
      try {
        const db = await open(name);
        if (!db) return null;
        const tx = db.transaction(["nodes", "pos", "meta"], "readonly");
        const [nodes, pos, meta] = await Promise.all([
          req(tx.objectStore("nodes").getAll() as IDBRequest<BubbleNode[]>),
          req(tx.objectStore("pos").getAll() as IDBRequest<Pos[]>),
          req(tx.objectStore("meta").get("map") as IDBRequest<(CacheMeta & { key: string }) | undefined>),
        ]);
        if (!meta || !nodes.length) return null;
        const at = new Map<string, Pos>();
        for (const p of pos) at.set(p.mint, p);
        for (const n of nodes) { const p = at.get(n.mint); if (p) { n.x = p.x; n.y = p.y; } }
        return { nodes, meta: { generatedAt: meta.generatedAt, savedAt: meta.savedAt, count: meta.count } };
      } catch { return null; }
    },
    /// Upserts nodes in chunks (one transaction each, so a 15 k write never blocks the page), then the
    /// meta record last: a write that dies halfway leaves the old `generatedAt`, and the next open simply
    /// re-asks for that span. `removed` drops rows (reserved on the server side, honoured here).
    async saveNodes(nodes, generatedAt, removed = []) {
      try {
        const db = await open(name);
        if (!db) return;
        for (let i = 0; i < nodes.length; i += CHUNK) {
          const tx = db.transaction("nodes", "readwrite");
          const st = tx.objectStore("nodes");
          for (const n of nodes.slice(i, i + CHUNK)) { const { x: _x, y: _y, ...rec } = n; st.put(rec); }
          await done(tx);
        }
        if (removed.length) {
          const tx = db.transaction(["nodes", "pos"], "readwrite");
          for (const m of removed) { tx.objectStore("nodes").delete(m); tx.objectStore("pos").delete(m); }
          await done(tx);
        }
        if (generatedAt != null) {
          const tx = db.transaction(["meta", "nodes"], "readwrite");
          const count = await req(tx.objectStore("nodes").count());
          tx.objectStore("meta").put({ key: "map", generatedAt, savedAt: Date.now(), count });
          await done(tx);
        }
      } catch { /* cache is best effort */ }
    },
    async savePositions(pos) {
      try {
        const db = await open(name);
        if (!db) return;
        for (let i = 0; i < pos.length; i += CHUNK) {
          const tx = db.transaction("pos", "readwrite");
          const st = tx.objectStore("pos");
          for (const p of pos.slice(i, i + CHUNK)) st.put(p);
          await done(tx);
        }
      } catch { /* best effort */ }
    },
    async clear() {
      try {
        const db = await open(name);
        if (!db) return;
        const tx = db.transaction(["nodes", "pos", "meta"], "readwrite");
        tx.objectStore("nodes").clear(); tx.objectStore("pos").clear(); tx.objectStore("meta").clear();
        await done(tx);
      } catch { /* best effort */ }
    },
  };
}
