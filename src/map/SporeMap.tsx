// The embeddable map: data (cache + delta + live events) and the canvas in one component.
//   <SporeMap apiBase="https://sporepad.com" height={600} onSelect={(n) => console.log(n)} />
// `roots` limits the drawn clusters to the top-n roots by locked value; `onData` reports the data
// state (node count, source, errors) so a host can show its own counters.
import { useEffect, useMemo, type Ref } from "react";
import { DEFAULT_API_BASE } from "./api";
import BubbleMap, { type BubbleMapHandle, type Inset } from "./BubbleMap";
import { ErrorBox, Skeleton } from "./bits";
import { viewOf } from "./nodes";
import type { BubbleNode, RootsLimit, SizeMode } from "./types";
import { useMapData, type MapData } from "./use-map-data";

export type SporeMapProps = {
  /// Origin of the Spore API (default https://sporepad.com). "" when `/api` is served same-origin (a dev proxy).
  apiBase?: string;
  /// Draw everything (default) or only the subtrees of the top 200 / 60 roots.
  roots?: RootsLimit;
  /// Bubble area: value locked by children (default) or market cap.
  mode?: SizeMode;
  onModeChange?: (m: SizeMode) => void;
  /// Controlled selection: the mint to centre on; `onSelect` fires on click (null on Esc / empty click).
  select?: string | null;
  onSelect?: (n: BubbleNode | null) => void;
  height?: number | string;
  className?: string;
  /// Screen area your overlays cover, so "fit" centres the bubbles in what is visible.
  inset?: Inset;
  ref?: Ref<BubbleMapHandle>;
  /// Data state for the host's counters: total nodes, cache/network source, sync errors.
  onData?: (d: MapData) => void;
};

export function SporeMap({ apiBase = DEFAULT_API_BASE, roots = "all", mode, onModeChange, select, onSelect, height = 600, className = "", inset, ref, onData }: SporeMapProps) {
  const data = useMapData({ apiBase });
  const nodes = useMemo(() => viewOf(data.nodes, roots), [data.nodes, roots]);
  const { version, loading, syncing, error, source } = data;
  useEffect(() => { onData?.(data); }, [version, loading, syncing, error, source]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !loading || data.nodes.length > 0;
  if (!ready && !error) return <div className={`bm bm-state ${className}`} style={{ height }}><Skeleton h={0} r={0} style={{ height: "100%" }} /></div>;
  if (error && data.nodes.length === 0) return <div className={`bm bm-state ${className}`} style={{ height }}><ErrorBox error={error} retry={data.reload} /></div>;
  return <BubbleMap ref={ref} nodes={nodes} height={height} mode={mode} onModeChange={onModeChange} className={className} inset={inset} select={select} onSelect={onSelect} fresh={data.fresh} onLayout={data.persistPositions} />;
}
