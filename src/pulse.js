/* Earth Pulse — live natural events from NASA EONET */
HSG.pulse = (() => {
  const u = HSG.util;
  let shown = 60;

  async function load() {
    try {
      const data = await u.getJSON(`${HSG.CONFIG.EONET_URL}?status=open&limit=500`);
      const events = (data.events || []).map(normalize).filter(e => e.lat != null);
      events.sort((a, b) => new Date(b.date) - new Date(a.date));
      HSG.store.set('events', events);
      HSG.store.set('eventsLoaded', true);
      HSG.globe.addEventPins(filtered());
    } catch (e) {
      console.warn('EONET failed', e);
      u.toast('Event feed unavailable — check connection', 'err');
    }
  }

  function normalize(ev) {
    const geoms = ev.geometry || [];
    const g = geoms[geoms.length - 1] || {};
    let lon = null, lat = null;
    if (g.type === 'Point' && g.coordinates) { lon = g.coordinates[0]; lat = g.coordinates[1]; }
    else if (g.coordinates && g.coordinates[0]) {
      const ring = g.coordinates[0];
      let x = 0, y = 0, n = 0;
      const flat = Array.isArray(ring[0]) && Array.isArray(ring[0][0]) ? ring[0] : ring;
      flat.forEach(p => { if (Array.isArray(p)) { x += p[0]; y += p[1]; n++; } });
      if (n) { lon = x / n; lat = y / n; }
    }
    return {
      id: ev.id, title: ev.title,
      categories: ev.categories || [{ id: 'manmade', title: 'Event' }],
      date: g.date || ev.geometry?.[0]?.date,
      sources: ev.sources || [],
      link: ev.link, lon, lat,
      geomCount: geoms.length,
    };
  }

  function filtered() {
    const f = HSG.store.get('eventFilter');
    return HSG.store.get('events').filter(e => f.has(e.categories[0].id)).slice(0, shown);
  }

  function render() {
    const body = u.el('panel-body');
    if (!HSG.store.get('eventsLoaded')) {
      body.innerHTML = `<div class="sec"><h3>Earth Pulse</h3><div class="spinner"></div><p class="muted small" style="text-align:center">Contacting NASA EONET…</p></div>`;
      return;
    }
    const list = filtered();
    const counts = {};
    HSG.store.get('events').forEach(e => { const c = e.categories[0].id; counts[c] = (counts[c] || 0) + 1; });
    body.innerHTML = `
      <div class="sec">
        <h3>Earth Pulse</h3>
        <p class="small muted" style="line-height:1.6;margin-bottom:10px">${HSG.store.get('events').length} open events tracked by NASA's Earth Observatory Natural Event Tracker. Times shown are <b>observation times</b> — when the satellite saw it, not a live feed.</p>
        <div class="evt-filters">
          ${Object.entries(HSG.CATEGORIES).filter(([id]) => counts[id]).map(([id, c]) =>
            `<button class="fchip ${HSG.store.get('eventFilter').has(id) ? 'on' : ''}" data-cat="${id}">${c.label} · ${counts[id]}</button>`).join('')}
        </div>
        <div id="evt-list">
          ${list.map(evtCard).join('') || '<div class="empty"><span class="big">🛰</span>No events in this filter.</div>'}
        </div>
        ${HSG.store.get('events').length > shown ? `<button class="btn ghost sm block" id="evt-more">Show more</button>` : ''}
      </div>`;
    body.querySelectorAll('.fchip').forEach(b => b.addEventListener('click', () => {
      const f = new Set(HSG.store.get('eventFilter'));
      f.has(b.dataset.cat) ? f.delete(b.dataset.cat) : f.add(b.dataset.cat);
      HSG.store.set('eventFilter', f);
      HSG.globe.addEventPins(filtered());
      render();
    }));
    body.querySelectorAll('.evt').forEach(el => {
      el.addEventListener('click', () => openEvent(el.dataset.id));
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openEvent(el.dataset.id); } });
    });
    const more = u.el('evt-more');
    if (more) more.addEventListener('click', () => { shown += 60; HSG.globe.addEventPins(filtered()); render(); });
  }

  function evtCard(e) {
    const cat = e.categories[0];
    const meta = HSG.CATEGORIES[cat.id] || { label: cat.title, color: '#22d3ee' };
    return `<div class="evt" data-id="${u.esc(e.id)}" role="button" tabindex="0" aria-label="${u.esc(e.title)}">
      <div class="row"><span class="chip" style="color:${meta.color};border-color:${meta.color}55">${u.esc(meta.label)}</span></div>
      <b>${u.esc(e.title)}</b>
      <div class="when">${u.fmtDate(e.date)} · ${u.relTime(e.date)}${e.geomCount > 1 ? ` · ${e.geomCount} observations` : ''}</div>
    </div>`;
  }

  function openEvent(id) {
    const e = HSG.store.get('events').find(x => x.id === id);
    if (!e) return;
    HSG.store.set('selectedEvent', e);
    document.querySelectorAll('.evt').forEach(el => el.classList.toggle('sel', el.dataset.id === id));
    HSG.globe.flyTo(e.lat, e.lon, 1800000);
    HSG.globe.clearPins('event-sel');
    HSG.globe.addLocationPin(e.lat, e.lon, (HSG.CATEGORIES[e.categories[0].id] || {}).color || '#fbbf24', 'event-sel');
    const cat = e.categories[0];
    const meta = HSG.CATEGORIES[cat.id] || { label: cat.title, color: '#22d3ee' };
    HSG.ui.openInspector(`${meta.label} event`, `
      <div class="fp-hero"><h3>${u.esc(e.title)}</h3>
        <div class="coords">${u.fmtNum(e.lat, 3)}°, ${u.fmtNum(e.lon, 3)}°</div></div>
      <div class="kv">
        <div class="cell"><div class="k">Observed</div><div class="v" style="font-size:13px">${u.fmtDateTime(e.date)}</div></div>
        <div class="cell"><div class="k">Reported</div><div class="v" style="font-size:13px">${u.relTime(e.date)}</div></div>
      </div>
      <div class="sec"><h3>Evidence</h3>
        ${e.sources.length ? e.sources.map(s => `
          <div style="margin-bottom:8px"><a href="${u.esc(s.url)}" target="_blank" rel="noopener" style="color:var(--cyan);font-size:13px">🔗 ${u.esc(s.id || 'Source report')}</a></div>`).join('')
        : '<p class="small muted">Source reports linked from EONET record.</p>'}
        ${e.link ? `<div><a href="${u.esc(e.link)}" target="_blank" rel="noopener" style="color:var(--cyan);font-size:12px">View on NASA EONET →</a></div>` : ''}
      </div>
      <div class="sec"><h3>About this data</h3>
        <p class="tiny muted" style="line-height:1.7">EONET tracks natural events reported by NASA's Earth Observatory and partners. An event appears here when it is <b>detected and published</b> — the observation itself may be hours to days old. Boundaries are approximate.</p></div>
      <button class="btn sm block" id="evt-inspect">Inspect this location</button>`);
    u.el('evt-inspect').addEventListener('click', () => HSG.fingerprint.inspect(e.lat, e.lon, e.title));
  }

  return { load, render, openEvent, evtCard, filtered };
})();
