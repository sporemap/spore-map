// Small presentational pieces shared by the map, its tooltip and the demo page's side panel.
import { useState, type CSSProperties } from "react";
import { useStreamStatus, type StreamStatus } from "./events";
import { short } from "./format";

export const sym = (c: { symbol: string | null; mint: string } | null | undefined) => (c ? (c.symbol ? `$${c.symbol}` : short(c.mint)) : "—");
export const nameOf = (c: { name: string | null; symbol: string | null; mint: string }) => c.name || c.symbol || short(c.mint, 6);

/// Coin image with a letter fallback; a broken image swaps to the letter instead of a browser placeholder icon.
export function Logo({ src, label, size = 36, className = "", style }: { src: string | null | undefined; label: string | null | undefined; size?: number; className?: string; style?: CSSProperties }) {
  const [broken, setBroken] = useState(false);
  const letter = (label || "?").replace(/^\$/, "").slice(0, 1).toUpperCase();
  const s = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)), ...style };
  return src && !broken
    ? <img className={`logo ${className}`} src={src} alt="" width={size} height={size} style={s} loading="lazy" decoding="async" onError={() => setBroken(true)} />
    : <div className={`logo letter ${className}`} style={s} aria-hidden="true">{letter}</div>;
}

/// d0 lime (roots) · d1 teal · d2 violet · d3+ amber: the depth is the first thing to read.
export const DepthBadge = ({ depth, title }: { depth: number; title?: string }) => <span className={`depth d${Math.min(depth, 3)}`} title={title ?? `depth ${depth}: ${depth === 0 ? "root, quoted in a listed mint" : `${depth} hop${depth === 1 ? "" : "s"} from a root`}`}>d{depth}</span>;

export const ProgressBar = ({ value, label }: { value: number; label?: string }) => (
  <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} title={label}>
    <i style={{ width: `${Math.max(1, Math.min(100, value * 100))}%` }} />
  </div>
);

export const Skeleton = ({ w, h = 14, r, className = "", style }: { w?: number | string; h?: number; r?: number; className?: string; style?: CSSProperties }) => <span className={`sk ${className}`} style={{ width: w ?? "100%", height: h, borderRadius: r, ...style }} aria-hidden="true" />;

export const ErrorBox = ({ error, retry, compact = false }: { error: string; retry?: () => void; compact?: boolean }) => (
  <div className={`notice bad ${compact ? "compact" : ""}`} role="alert">
    <span><b>Could not load.</b> {error}</span>
    {retry && <button type="button" className="btn sm ghost" onClick={retry}>Retry</button>}
  </div>
);

export const STATUS_LABEL: Record<StreamStatus, string> = { idle: "offline", connecting: "connecting", live: "live", reconnecting: "reconnecting" };
/// The event-stream status as a dot (green and pulsing when live).
export function LiveDot({ url, short = false }: { url: string; short?: boolean }) {
  const s = useStreamStatus(url);
  return <span className={`live ${s}`} title={`event stream: ${STATUS_LABEL[s]}`}><i aria-hidden="true" />{short ? null : STATUS_LABEL[s]}</span>;
}
