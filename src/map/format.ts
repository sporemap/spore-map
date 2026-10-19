// One number vocabulary for the panel, tooltip and side panel. Everything degrades to "—" for
// null/NaN so a missing API field never renders as "undefined" or "NaN".
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const UNITS: [number, string][] = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];

/// Three significant figures with a unit suffix: 1.23M · 45.6K · 789
const sig3 = (n: number): string => {
  const [k, u] = UNITS.find(([k]) => n >= k) ?? [1, ""];
  const m = n / k;
  const d = m < 10 ? 2 : m < 100 ? 1 : 0;
  return m.toFixed(d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") + u;
};

/// Counts: separators under 100 000, compact above. 17 · 1,284 · 128K
export const count = (n: number | null | undefined) => (!finite(n) ? "—" : n < 100_000 ? Math.round(n).toLocaleString("en-US") : sig3(n));
/// 0.000000368 → 0.0₆368: the subscript carries the zero count so dust prices stay readable.
const subscriptSmall = (n: number) => {
  const zeros = -Math.floor(Math.log10(n)) - 1;
  if (zeros < 3) return n.toPrecision(3);
  const digits = Math.round(n * 10 ** (zeros + 3)).toString().padStart(3, "0").slice(0, 3);
  return `0.0${[...String(zeros)].map((c) => SUB[Number(c)]).join("")}${digits}`;
};
/// Dollars at every magnitude: $3.68K · $11.91 · $0.4218 · $0.0₅368
export const usd = (n: number | null | undefined): string => {
  if (!finite(n)) return "—";
  if (n < 0) return `-${usd(-n)}`;
  if (n >= 1e3) return `$${sig3(n)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toPrecision(4)}`;
  if (n === 0) return "$0";
  return `$${subscriptSmall(n)}`;
};
/// Ratios 0..1 → 0.32% · 12.4% · 100%
export const pct = (x: number | null | undefined) => {
  if (!finite(x)) return "—";
  const p = x * 100;
  if (p >= 100) return "100%";
  if (p >= 10) return `${p.toFixed(1)}%`;
  if (p >= 1) return `${p.toFixed(2)}%`;
  return `${p.toPrecision(2)}%`;
};
export const short = (addr: string | null | undefined, n = 4) => (!addr ? "—" : addr.length > 2 * n + 2 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr);
const ago = (unix: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - unix);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
/// Age without "ago", for dense rows: 12s · 3m · 5h · 2d (unix seconds)
export const age = (unix: number | null | undefined) => (!finite(unix) ? "—" : ago(unix));
