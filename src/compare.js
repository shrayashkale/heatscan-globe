/* Earth Connections — pin places, compare honestly */
HSG.compare = (() => {
  const u = HSG.util;
  const COLORS = ['#22d3ee', '#fbbf24', '#f87171', '#a78bfa'];

  function render() {
    const body = u.el('panel-body');
    const pins = HSG.store.get('pins');
    body.innerHTML = `
      <div class="sec">
        <h3>Compare places</h3>
        <p class="small muted" style="line-height:1.6;margin-bottom:12px">Click up to ${HSG.CONFIG.MAX_COMPARE_PINS} places on the globe (or use search, then ＋ Compare). Same period, same units, same sources.</p>
        <div id="pin-list">
          ${pins.length ? pins.map((p, i) => `
            <div class="pin-row"><span class="pin-dot" style="background:${COLORS[i % 4]}"></span>
              <span class="grow"><b>${u.esc(p.name)}</b><br><span class="tiny muted">${u.fmtNum(p.lat, 2)}°, ${u.fmtNum(p.lon, 2)}°</span></span>
              <button class="btn ghost sm" data-rm="${i}">✕</button></div>`).join('')
          : '<div class="empty"><span class="big">📍</span>Click the globe to drop your first pin.</div>'}
        </div>
        ${pins.length >= 2 ? '<button class="btn block" id="cmp-run">Run comparison</button>' : ''}
        ${pins.length ? '<button class="btn ghost sm block" id="cmp-clear">Clear all</button>' : ''}
      </div>
      <div class="sec" id="cmp-result"></div>`;
    body.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const ps = HSG.store.get('pins').filter((_, i) => i !== +b.dataset.rm);
      HSG.store.set('pins', ps);
      redrawPins(); render();
    }));
    const clr = u.el('cmp-clear');
    if (clr) clr.addEventListener('click', () => { HSG.store.set('pins', []); redrawPins(); render(); });
    const run = u.el('cmp-run');
    if (run) run.addEventListener('click', runCompare);
  }

  function pickFromMap(lat, lon) {
    const pins = HSG.store.get('pins');
    if (pins.length >= HSG.CONFIG.MAX_COMPARE_PINS) { u.toast(`Max ${HSG.CONFIG.MAX_COMPARE_PINS} pins`, 'err'); return; }
    const pin = { lat, lon, name: `${u.fmtNum(lat, 2)}°, ${u.fmtNum(lon, 2)}°`, temp: null, elev: null, trend: null };
    HSG.store.set('pins', [...pins, pin]);
    redrawPins(); render();
    enrich(pin);
    reverseName(pin);
  }

  async function reverseName(pin) {
    try {
      const d = await u.getJSON(`${HSG.CONFIG.REVERSE_URL}?latitude=${pin.lat}&longitude=${pin.lon}&localityLanguage=en`);
      const name = d.city || d.locality || d.principalSubdivision;
      if (name) {
        pin.name = name + (d.countryCode ? `, ${d.countryCode}` : '');
        HSG.store.set('pins', [...HSG.store.get('pins')]);
        if (HSG.store.get('mode') === 'compare') render();
      }
    } catch { /* keep coordinates */ }
  }

  async function enrich(pin) {
    try {
      const [wx, el] = await Promise.allSettled([
        u.getJSON(`${HSG.CONFIG.METEO_URL}?latitude=${pin.lat}&longitude=${pin.lon}&current=temperature_2m&timezone=auto`),
        u.getJSON(`${HSG.CONFIG.ELEV_URL}?locations=${pin.lat},${pin.lon}`),
      ]);
      if (wx.status === 'fulfilled') pin.temp = wx.value.current?.temperature_2m ?? null;
      if (el.status === 'fulfilled') pin.elev = el.value.results?.[0]?.elevation ?? null;
      if (pin.elev == null && wx.status === 'fulfilled' && typeof wx.value.elevation === 'number') pin.elev = wx.value.elevation;
      HSG.store.set('pins', [...HSG.store.get('pins')]);
      if (HSG.store.get('mode') === 'compare') render();
    } catch { /* best effort */ }
  }

  function redrawPins() {
    HSG.globe.clearPins('cmp');
    HSG.store.get('pins').forEach((p, i) => HSG.globe.addLocationPin(p.lat, p.lon, COLORS[i % 4], 'cmp', false));
  }

  async function runCompare() {
    const host = u.el('cmp-result');
    const pins = HSG.store.get('pins');
    host.innerHTML = '<div class="spinner"></div>';
    // 5-year annual means for each pin (same period → fair comparison)
    await Promise.all(pins.map(async p => {
      if (p.trend) return;
      try {
        const end = new Date(); end.setUTCFullYear(end.getUTCFullYear() - 1);
        const start = new Date(end); start.setUTCFullYear(start.getUTCFullYear() - 4);
        const f = d => d.toISOString().slice(0, 10);
        const a = await u.getJSON(`${HSG.CONFIG.METEO_ARCHIVE_URL}?latitude=${p.lat}&longitude=${p.lon}&start_date=${f(start)}&end_date=${f(end)}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min&timezone=auto`);
        p.trend = u.annualTrend(a.daily);
      } catch { p.trend = null; }
    }));
    const temps = pins.map(p => p.temp).filter(t => t != null);
    const tmin = temps.length ? Math.min(...temps) - 2 : 0;
    const tmax = temps.length ? Math.max(...temps) + 2 : 1;
    host.innerHTML = `
      <h3>Comparison</h3>
      <table class="cmp-table">
        <tr><th>Place</th><th>Now</th><th>Elev.</th><th>5-yr mean</th></tr>
        ${pins.map((p, i) => {
          const mean = p.trend ? p.trend.values.reduce((s, v) => s + v, 0) / p.trend.values.length : null;
          return `<tr><td><span class="pin-dot" style="background:${COLORS[i % 4]};display:inline-block;margin-right:6px"></span>${u.esc(p.name)}</td>
            <td>${p.temp != null ? u.fmtNum(p.temp, 1) + '°C' : '—'}</td>
            <td>${p.elev != null ? Math.round(p.elev) + ' m' : '—'}</td>
            <td>${mean != null ? u.fmtNum(mean, 1) + '°C' : '—'}</td></tr>`;
        }).join('')}
      </table>
      <div style="margin-top:14px"><h3 style="margin-bottom:8px">Current temperature</h3>
        ${pins.map((p, i) => `
          <div style="margin-bottom:7px"><div class="row" style="justify-content:space-between;margin-bottom:3px">
            <span class="tiny">${u.esc(p.name)}</span><span class="tiny" style="font-variant-numeric:tabular-nums">${p.temp != null ? u.fmtNum(p.temp, 1) + '°' : '—'}</span></div>
            <div style="height:7px;background:rgba(255,255,255,.06);border-radius:4px">
              <div style="height:100%;width:${p.temp != null ? ((p.temp - tmin) / (tmax - tmin) * 100).toFixed(1) : 0}%;background:${COLORS[i % 4]};border-radius:4px"></div></div></div>`).join('')}
      </div>
      <p class="tiny muted" style="margin-top:10px;line-height:1.6">Same observation window for all places. Temperatures: Open-Meteo nowcast · 5-yr means: ERA5 reanalysis. Differences reflect climate, elevation and land cover — not causation by any single factor.</p>`;
  }

  return { render, pickFromMap, redrawPins };
})();
