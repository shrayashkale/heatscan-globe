/* Earth Moments — discovery engine.
   Every "moment" is derived from real EONET observations. Nothing is invented:
   scoring uses recency, category significance, observation count and source count. */
HSG.moments = (() => {
  const u = HSG.util;
  const CAT_W = { volcanoes: 5, wildfires: 4, floods: 4, severeStorms: 3, earthquakes: 4, drought: 2, tempExtremes: 3, landslides: 3, seaLakeIce: 1, snow: 1, dustHaze: 2, manmade: 1, waterColor: 1 };

  function score(e) {
    const days = Math.max(0, u.daysAgo(e.date) ?? 365);
    const recency = Math.max(0, 30 - days) / 30;
    const cat = (CAT_W[e.categories[0].id] || 1) / 5;
    const obs = Math.min(1, (e.geomCount || 1) / 6);
    const src = Math.min(1, (e.sources || []).length / 4);
    return recency * 0.45 + cat * 0.3 + obs * 0.15 + src * 0.1;
  }

  function build() {
    const events = HSG.store.get('events');
    return events.map(e => ({ e, s: score(e) }))
      .sort((a, b) => b.s - a.s).slice(0, 12).map(({ e, s }) => momentFor(e, s));
  }

  function momentFor(e, s) {
    const cat = e.categories[0];
    const meta = HSG.CATEGORIES[cat.id] || { label: cat.title, color: '#22d3ee' };
    const days = u.daysAgo(e.date);
    const headline = headlineFor(e, meta, days);
    const why = [];
    if (days != null && days <= 7) why.push(`observed <b>${u.relTime(e.date)}</b> — fresh on the satellite record`);
    if ((CAT_W[cat.id] || 0) >= 4) why.push(`a <b>high-impact ${meta.label.toLowerCase()}</b> class event`);
    if ((e.geomCount || 1) > 2) why.push(`tracked across <b>${e.geomCount} observations</b>`);
    if ((e.sources || []).length > 1) why.push(`corroborated by <b>${e.sources.length} source reports</b>`);
    if (!why.length) why.push('selected from the current open-event record');
    return { e, meta, headline, why: why.join('; '), conf: s > 0.6 ? 'High' : s > 0.35 ? 'Medium' : 'Low' };
  }

  function headlineFor(e, meta, days) {
    const place = e.title.replace(/^(Wildfire|Volcano|Flood|Storm|Earthquake|Drought)[s]? (in|near|-) /i, '').trim();
    switch (e.categories[0].id) {
      case 'wildfires': return `Fire on the landscape near ${place}`;
      case 'volcanoes': return `Volcanic unrest at ${place}`;
      case 'floods': return `Flooding reported around ${place}`;
      case 'severeStorms': return `Severe storm tracked over ${place}`;
      case 'earthquakes': return `Earthquake detected near ${place}`;
      default: return `${meta.label} event: ${place}`;
    }
  }

  function render() {
    const body = u.el('panel-body');
    if (!HSG.store.get('eventsLoaded')) {
      body.innerHTML = `<div class="sec"><h3>Earth Moments</h3><div class="spinner"></div><p class="muted small" style="text-align:center">Scanning the planet for noteworthy events…</p></div>`;
      return;
    }
    const moments = build();
    body.innerHTML = `
      <div class="sec">
        <h3>Earth Moments</h3>
        <p class="small muted" style="line-height:1.6;margin-bottom:12px">Noteworthy happenings, selected by the discovery engine from today's open-event record — ranked by freshness, impact class and corroboration. No invented stories.</p>
        ${moments.length ? moments.map((m, i) => `
          <div class="moment" data-id="${u.esc(m.e.id)}" role="button" tabindex="0">
            <div class="kicker" style="color:${m.meta.color}">Moment ${String(i + 1).padStart(2, '0')} · ${u.esc(m.meta.label)}</div>
            <h4>${u.esc(m.headline)}</h4>
            <p>${u.esc(m.e.title)} — observed ${u.fmtDate(m.e.date)} (${u.relTime(m.e.date)}).</p>
            <div class="why"><b>Why selected:</b> ${m.why}.<br><span class="tiny">Confidence ${m.conf} · dataset: NASA EONET · <a href="${u.esc(m.e.link || '#')}" target="_blank" rel="noopener" style="color:var(--cyan)">evidence ↗</a></span></div>
          </div>`).join('') : '<div class="empty"><span class="big">🛰</span>The event feed is empty or unreachable right now.</div>'}
      </div>`;
    body.querySelectorAll('.moment').forEach(el => {
      const go = () => HSG.pulse.openEvent(el.dataset.id);
      el.addEventListener('click', go);
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
    });
  }

  return { render };
})();
