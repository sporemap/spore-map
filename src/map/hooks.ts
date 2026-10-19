import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, type SporeApi, type Stats } from "./api";
import { useEvents } from "./events";

export type Async<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/// Load-per-deps with a stale-result guard. When the deps change the old data is dropped and the
/// skeleton shows, so a panel never displays the previous record under a new selection; `reload()`
/// keeps what is on screen and swaps it when the new result lands.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const key = JSON.stringify(deps);
  const lastKey = useRef(key);
  useEffect(() => {
    let alive = true;
    if (lastKey.current !== key) { lastKey.current = key; setData(null); setError(null); setLoading(true); }
    else setLoading((l) => l || data === null);
    fnRef.current().then((d) => { if (alive) { setData(d); setError(null); setLoading(false); } })
      .catch((e) => { if (alive) { setError(errorMessage(e)); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, set] = useState(value);
  useEffect(() => { const t = setTimeout(() => set(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/// Global stats: polled every 30 s and pushed over SSE (`stats` event).
export function useStats(api: SporeApi, intervalMs = 30_000) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => api.stats().then((s) => { if (alive) { setStats(s); setError(null); } }).catch((e) => { if (alive) setError(errorMessage(e)); });
    tick();
    const t = setInterval(tick, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, [api, intervalMs]);
  useEvents(api.eventsUrl, { stats: (s) => { setStats(s); setError(null); } });
  return { stats, error };
}
