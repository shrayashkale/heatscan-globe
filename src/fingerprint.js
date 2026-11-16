/* Location Fingerprint — click anywhere, get that place's story */
HSG.fingerprint = (() => {
  const u = HSG.util;
  let token = 0;

  async function inspect(lat, lon, knownName) {
    const my = ++token;
    HSG.globe.addLocationPin(lat, lon, '#22d3ee', 'loc');
    const loc = { lat, lon, name: knownName || 'Locating…' };
    HSG.store.set('location', loc);
    HSG.ui.openInspector('Location', fpSkeleton(loc));
    // parallel enrichment
    const [place, elev, wx] = await Promise.allSettled([
      reverse(lat, lon), elevation(lat, lon), weather(lat, lon),
    ]);
    if (my !== token) return; // superseded
    const placeV = place.status === 'fulfilled' ? place.value : null;
    const wxV = wx.status === 'fulfilled' ? wx.value : null;
    Object.assign(loc, {
      name: knownName || (placeV && placeV.name) || `${u.fmtNum(lat, 2)}°, ${u.fmtNum(lon, 2)}°`,
      country: (placeV && placeV.country) || '',
      // OpenTopoData can rate-limit/fail; Open-Meteo's response carries the
      // grid elevation for the same point — use it as the fallback so the
      // Elevation cell is not left blank.
      elevation: (elev.status === 'fulfilled' && elev.value != null) ? elev.value
        : (wxV && wxV.meteoElev != null ? wxV.meteoElev : null),
      weather: wxV,
    });
    HSG.store.set('location', { ...loc });
    if (my === token) HSG.ui.openInspector('Location', fpFull(loc));
  }

  function fpSkeleton(loc) {
    return `<div class="fp-hero"><h3>${u.esc(loc.name)}</h3>
      <div class="coords">${u.fmtNum(loc.lat, 4)}°, ${u.fmtNum(loc.lon, 4)}°</div></div>
      <div class="spinner"></div><p class="muted small" style="text-align:center">Reading this place…</p>`;
  }

  function fpFull(loc) {
    const w = loc.weather || {};
    const nearby = HSG.store.get('events')
      .map(e => ({ e, d: u.haversineKm(loc.lat, loc.lon, e.lat, e.lon) }))
      .filter(x => x.d < 500).sort((a, b) => a.d - b.d).slice(0, 4);
    const wxCode = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Violent showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + hail' };
    return `
      <div class="fp-hero"><h3>${u.esc(loc.name)}</h3>
        <div class="coords">${u.fmtNum(loc.lat, 4)}°${loc.lat >= 0 ? 'N' : 'S'}, ${u.fmtNum(Math.abs(loc.lon), 4)}°${loc.lon >= 0 ? 'E' : 'W'}${loc.country ? ' · ' + u.esc(loc.country) : ''}</div></div>
      <div class="kv">
        <div class="cell"><div class="k">Elevation</div><div class="v">${loc.elevation != null ? u.fmtNum(loc.elevation, 0) + '<small> m</small>' : '—'}</div></div>
        <div class="cell"><div class="k">Right now</div><div class="v">${w.temp != null ? u.fmtNum(w.temp, 0) + '<small> °C</small>' : '—'}</div></div>
        <div class="cell"><div class="k">Conditions</div><div class="v" style="font-size:13px">${u.esc(wxCode[w.code] || w.desc || '—')}</div></div>
        <div class="cell"><div class="k">Humidity</div><div class="v">${w.hum != null ? w.hum + '<small> %</small>' : '—'}</div></div>
      </div>
      <div class="sec"><h3>Annual mean temperature — 5 years</h3>
        ${w.trend ? u.spark(w.trend.values, 300, 64, '#fbbf24') : '<p class="tiny muted">Trend unavailable for this location.</p>'}
        <p class="tiny muted" style="margin-top:6px">ERA5 reanalysis via Open-Meteo · ${w.trend ? w.trend.years[0] + '–' + w.trend.years[w.trend.years.length - 1] : ''}</p></div>
      <div class="sec"><h3>Events nearby (500 km)</h3>
        ${nearby.length ? nearby.map(({ e, d }) => `
          <div class="evt" data-eid="${u.esc(e.id)}" role="button" tabindex="0">
            <b>${u.esc(e.title)}</b><div class="when">${Math.round(d)} km away · ${u.relTime(e.date)}</div></div>`).join('')
        : '<p class="small muted">No tracked events near here right now.</p>'}</div>
      <div class="row" style="gap:8px">
        <button class="btn sm grow" id="fp-compare">＋ Compare</button>
        <button class="btn ghost sm grow" id="fp-ask">Ask about here</button>
      </div>`;
  }

  async function reverse(lat, lon) {
    const d = await u.getJSON(`${HSG.CONFIG.REVERSE_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    return { name: d.city || d.locality || d.principalSubdivision || '', country: d.countryName || '' };
  }
  async function elevation(lat, lon) {
    const d = await u.getJSON(`${HSG.CONFIG.ELEV_URL}?locations=${lat},${lon}`);
    return d.results?.[0]?.elevation ?? null;
  }
  async function weather(lat, lon) {
    const cur = await u.getJSON(`${HSG.CONFIG.METEO_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`);
    let trend = null;
    try {
      const end = new Date(); end.setUTCFullYear(end.getUTCFullYear() - 1);
      const start = new Date(end); start.setUTCFullYear(start.getUTCFullYear() - 4);
      const f = d => d.toISOString().slice(0, 10);
      const a = await u.getJSON(`${HSG.CONFIG.METEO_ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=${f(start)}&end_date=${f(end)}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min&timezone=auto`);
      trend = u.annualTrend(a.daily);
    } catch { /* trend optional */ }
    return {
      temp: cur.current?.temperature_2m, hum: cur.current?.relative_humidity_2m,
      code: cur.current?.weather_code, trend,
      meteoElev: typeof cur.elevation === 'number' ? cur.elevation : null,
    };
  }

  function close() {
    token++;
    HSG.store.set('location', null);
    HSG.globe.clearPins('loc');
    HSG.ui.closeInspector();
  }

  return { inspect, close };
})();
