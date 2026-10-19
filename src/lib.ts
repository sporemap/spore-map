// Library entry (`npm run build:lib` → dist-lib/spore-map.js + spore-map.css).
//
//   import { SporeMap } from "spore-map";
//   import "spore-map/style.css";
//   <SporeMap apiBase="https://sporepad.com" height={600} onSelect={(node) => ...} />
export { SporeMap, type SporeMapProps } from "./map/SporeMap";
export { default as BubbleMap, COLORS, type BubbleMapHandle, type BubbleMapProps, type FrameStats, type Inset } from "./map/BubbleMap";
export { useMapData, type MapData, type MapSource } from "./map/use-map-data";
export { createApi, DEFAULT_API_BASE, ApiError, errorMessage, type SporeApi, type CoinRef, type MapCoin, type MapNode, type MapResponse, type MapQuery, type PairEvent, type MapDeltaEntry, type MapDeltaEvent, type Stats, type Coin, type CoinPage, type Trade } from "./map/api";
export { subscribe, useEvents, useStreamStatus, type Handlers, type StreamStatus } from "./map/events";
export { createCache, cacheName, type MapCache } from "./map/cache";
export { viewOf, selectView, normalise, upsert, applyDelta, applyPair, rootCmp, isRoot, type NodeSet } from "./map/nodes";
export { useStats, useAsync, useDebounced } from "./map/hooks";
export { nameOf, sym, Logo, DepthBadge, LiveDot } from "./map/bits";
export { count, usd, pct, age, short } from "./map/format";
export type { BubbleNode, SizeMode, RootsLimit } from "./map/types";
