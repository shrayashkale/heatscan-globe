/* Small utilities */
HSG.util = {
  el(id) { return document.getElementById(id); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  fmtNum(n, d = 1) { if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d); },
  fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  },
  fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  },
  isoDay(offsetDays = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  },
  daysAgo(iso) {
    if (!iso) return null;
    return Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  },
  relTime(iso) {
    const days = this.daysAgo(iso);
    if (days == null) return '';
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    const m = Math.round(days / 30);
    return m === 1 ? 'a month ago' : m + ' months ago';
  },
  debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  },
  haversineKm(a, b, c, d) {
    const R = 6371, r = Math.PI / 180;
    const s1 = Math.sin((c - a) / 2 * r) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) / 2 * r) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s1));
  },
  async getJSON(url, opts = {}) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), opts.timeout || 15000);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(to); }
  },
  toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    HSG.util.el('toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3200);
  },
  /* annual mean temps from Open-Meteo archive daily arrays (robust to variable names) */
  annualTrend(daily) {
    if (!daily || !daily.time) return null;
    const n = daily.time.length;
    const mean = daily.temperature_2m_mean;
    const mx = daily.temperature_2m_max, mn = daily.temperature_2m_min;
    const byYear = {};
    for (let i = 0; i < n; i++) {
      let v = mean ? mean[i] : null;
      if (v == null && mx && mn && mx[i] != null && mn[i] != null) v = (mx[i] + mn[i]) / 2;
      if (v == null) continue;
      const y = daily.time[i].slice(0, 4);
      (byYear[y] = byYear[y] || []).push(v);
    }
    const years = Object.keys(byYear).sort();
    if (years.length < 2) return null;
    return { years, values: years.map(y => byYear[y].reduce((s, v) => s + v, 0) / byYear[y].length) };
  },
  /* Snap a date to the MODIS 8-day composite grid (periods start Jan 1 each year).
     Only a COMPLETED period is ever requested: an in-progress period is not yet
     published by GIBS and would return missing tiles, so step back one period
     when this period hasn't ended at least 2 days ago (processing lag). */
  snapModis8day(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d)) return iso;
    const start = Date.UTC(d.getUTCFullYear(), 0, 1);
    const doy = Math.floor((d.getTime() - start) / 864e5) + 1;
    let pStart = Math.floor((doy - 1) / 8) * 8 + 1;
    let s = new Date(start + (pStart - 1) * 864e5);
    const periodEnd = s.getTime() + 7 * 864e5;
    const lastUsable = Date.now() - 2 * 864e5;
    if (periodEnd > lastUsable) {
      s = new Date(s.getTime() - 8 * 864e5);
    }
    return s.toISOString().slice(0, 10);
  },
  /* 8-day snap for the L3 Land Surface Temperature composite, whose
     publication lag is much longer than the daily products: GIBS inventory
     checked 2026-10-27 ended at the period starting Oct 8 (~19 days back).
     Require the period to have ended at least 12 days ago; the tile-level
     period-step fallbacks absorb any remaining lag. */
  snapModis8dayLst(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d)) return iso;
    const start = Date.UTC(d.getUTCFullYear(), 0, 1);
    const doy = Math.floor((d.getTime() - start) / 864e5) + 1;
    let pStart = Math.floor((doy - 1) / 8) * 8 + 1;
    let s = new Date(start + (pStart - 1) * 864e5);
    const lastUsable = Date.now() - 12 * 864e5;
    // Loop (not a single step): the publication lag can exceed one period.
    for (let i = 0; i < 8 && s.getTime() + 7 * 864e5 > lastUsable; i++) {
      s = new Date(s.getTime() - 8 * 864e5);
    }
    return s.toISOString().slice(0, 10);
  },
  /* Same completed-period rule for the MODIS 16-day composite grid. */
  snapModis16day(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d)) return iso;
    const start = Date.UTC(d.getUTCFullYear(), 0, 1);
    const doy = Math.floor((d.getTime() - start) / 864e5) + 1;
    let pStart = Math.floor((doy - 1) / 16) * 16 + 1;
    let s = new Date(start + (pStart - 1) * 864e5);
    const periodEnd = s.getTime() + 15 * 864e5;
    const lastUsable = Date.now() - 2 * 864e5;
    if (periodEnd > lastUsable) {
      s = new Date(s.getTime() - 16 * 864e5);
    }
    return s.toISOString().slice(0, 10);
  },
  spark(values, w = 300, h = 64, color = '#22d3ee') {
    const v = values.filter(x => x != null);
    if (v.length < 2) return '<span class="muted tiny">insufficient data</span>';
    const min = Math.min(...v), max = Math.max(...v), rng = (max - min) || 1;
    const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 4 - (x - min) / rng * (h - 10)).toFixed(1)}`).join(' ');
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>
      <circle cx="${w}" cy="${(h - 4 - (v[v.length - 1] - min) / rng * (h - 10)).toFixed(1)}" r="3" fill="${color}"/></svg>
    <div class="row tiny muted" style="justify-content:space-between"><span>${this.fmtNum(min)}°</span><span>${this.fmtNum(max)}°</span></div>`;
  },
};
