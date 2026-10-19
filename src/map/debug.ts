// The map's debug hooks (`window.__sporeMap`, `window.__sporeMapPage`) let a headless check script read
// timings and poke the map. They are always on in development and, on a production build, only when
// the page is opened with `?debug`, so the real bundle can be measured.
export const DEBUG_HOOKS: boolean = import.meta.env.DEV || (typeof location !== "undefined" && new URLSearchParams(location.search).has("debug"));
