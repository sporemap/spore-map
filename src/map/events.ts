// One shared SSE connection per events URL, opened when the first component subscribes and closed
// when the last one leaves. Reconnects with exponential backoff; a tab coming back from the
// background resets the backoff so the feed is live again immediately. Events: `pair` and
// `mapdelta` are the map's live feed (every new custom pair on pump.fun and the numbers that moved),
// `stats` the global counters, `coin` and `trade` the launchpad's own feed.
import { useEffect, useRef, useState } from "react";
import type { Coin, MapDeltaEvent, PairEvent, Stats, Trade } from "./api";

export type Handlers = { coin?: (c: Coin) => void; trade?: (t: Trade) => void; stats?: (s: Stats) => void; pair?: (p: PairEvent) => void; mapdelta?: (d: MapDeltaEvent) => void };
export type StreamStatus = "idle" | "connecting" | "live" | "reconnecting";

type Stream = { url: string; subs: Set<Handlers>; statusSubs: Set<(s: StreamStatus) => void>; source: EventSource | null; timer: ReturnType<typeof setTimeout> | null; attempt: number; status: StreamStatus };
const streams = new Map<string, Stream>();
const streamFor = (url: string): Stream => { let s = streams.get(url); if (!s) { s = { url, subs: new Set(), statusSubs: new Set(), source: null, timer: null, attempt: 0, status: "idle" }; streams.set(url, s); } return s; };

const setStatus = (st: Stream, s: StreamStatus) => { if (st.status !== s) { st.status = s; st.statusSubs.forEach((f) => f(s)); } };
const dispatch = <K extends keyof Handlers>(st: Stream, kind: K, data: Parameters<NonNullable<Handlers[K]>>[0]) => {
  for (const h of st.subs) {
    const f = h[kind] as ((d: typeof data) => void) | undefined;
    try { f?.(data); } catch (e) { console.error("sse handler", e); }
  }
};
const parse = <T,>(ev: MessageEvent): T | null => { try { return JSON.parse(ev.data) as T; } catch { return null; } };

function open(st: Stream) {
  if (st.source || st.subs.size === 0 || typeof EventSource === "undefined") return;
  setStatus(st, st.attempt ? "reconnecting" : "connecting");
  const es = new EventSource(st.url);
  st.source = es;
  es.onopen = () => { st.attempt = 0; setStatus(st, "live"); };
  es.addEventListener("coin", (ev) => { const c = parse<Coin>(ev as MessageEvent); if (c?.mint) dispatch(st, "coin", c); });
  es.addEventListener("trade", (ev) => { const t = parse<Trade>(ev as MessageEvent); if (t?.mint) dispatch(st, "trade", t); });
  es.addEventListener("stats", (ev) => { const s = parse<Stats>(ev as MessageEvent); if (s) dispatch(st, "stats", s); });
  es.addEventListener("pair", (ev) => { const p = parse<PairEvent>(ev as MessageEvent); if (p?.coin?.mint) dispatch(st, "pair", p); });
  es.addEventListener("mapdelta", (ev) => { const d = parse<MapDeltaEvent>(ev as MessageEvent); if (d && Array.isArray(d.updated)) dispatch(st, "mapdelta", d); });
  es.onerror = () => {
    es.close();
    if (st.source !== es) return;
    st.source = null;
    if (st.subs.size === 0) { setStatus(st, "idle"); return; }
    setStatus(st, "reconnecting");
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(st.attempt, 5)) * (0.8 + Math.random() * 0.4);
    st.attempt += 1;
    st.timer = setTimeout(() => { st.timer = null; open(st); }, delay);
  };
}
function closeAll(st: Stream) {
  if (st.timer) { clearTimeout(st.timer); st.timer = null; }
  st.source?.close();
  st.source = null;
  st.attempt = 0;
  setStatus(st, "idle");
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    for (const st of streams.values()) if (st.subs.size > 0 && !st.source) { if (st.timer) { clearTimeout(st.timer); st.timer = null; } st.attempt = 0; open(st); }
  });
}

export function subscribe(url: string, h: Handlers): () => void {
  const st = streamFor(url);
  st.subs.add(h);
  open(st);
  return () => { st.subs.delete(h); if (st.subs.size === 0) closeAll(st); };
}

/// Subscribe with always-fresh handlers (read through a ref) so callers can pass inline closures
/// without re-opening the stream on every render.
export function useEvents(url: string, handlers: Handlers, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    return subscribe(url, { coin: (c) => ref.current.coin?.(c), trade: (t) => ref.current.trade?.(t), stats: (s) => ref.current.stats?.(s), pair: (p) => ref.current.pair?.(p), mapdelta: (d) => ref.current.mapdelta?.(d) });
  }, [url, enabled]);
}

export function useStreamStatus(url: string): StreamStatus {
  const [s, set] = useState<StreamStatus>(() => streamFor(url).status);
  useEffect(() => { const st = streamFor(url); st.statusSubs.add(set); set(st.status); return () => { st.statusSubs.delete(set); }; }, [url]);
  return s;
}
