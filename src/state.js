/* Central state store — tiny pub/sub */
HSG.store = (() => {
  const s = {
    mode: 'explore',
    base: 'esri',
    layer: null,          // active data layer id
    layerOpacity: 0.85,
    layerDate: HSG.util.isoDay(-HSG.CONFIG.LATEST_OFFSET_DAYS),
    timeA: HSG.util.isoDay(-365),   // time machine: "then"
    timeB: HSG.util.isoDay(-HSG.CONFIG.LATEST_OFFSET_DAYS), // "now"
    split: 0.5,
    events: [],           // EONET events
    eventsLoaded: false,
    eventFilter: new Set(Object.keys(HSG.CATEGORIES)),
    selectedEvent: null,
    location: null,       // fingerprint {lat, lon, name, ...}
    pins: [],             // compare pins
    geminiKey: localStorage.getItem(HSG.CONFIG.KEY_STORE) || '',
    ready: false,
  };
  const subs = {};
  return {
    get(k) { return s[k]; },
    set(k, v) {
      s[k] = v;
      (subs[k] || []).forEach(fn => { try { fn(v); } catch (e) { console.error(e); } });
    },
    on(k, fn) { (subs[k] = subs[k] || []).push(fn); },
    snapshot() { return { ...s }; },
  };
})();
