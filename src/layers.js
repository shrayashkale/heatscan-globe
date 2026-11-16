/* Layers mode — data layer picker, opacity, legends, satellite facts */
HSG.layersUI = (() => {
  const u = HSG.util;

  function render() {
    const body = u.el('panel-body');
    const active = HSG.store.get('layer');
    const date = HSG.store.get('layerDate');
    body.innerHTML = `
      <div class="sec">
        <h3>Planetary X-Ray</h3>
        <p class="small muted" style="line-height:1.6;margin-bottom:12px">Reveal hidden dimensions of the same planet. Every layer is a real satellite observation — never a simulation. Data loads only for the region on your screen and follows as you pan and zoom.</p>
        ${HSG.LAYERS.map(l => `
          <div class="layer-card ${active === l.id ? 'active' : ''}" data-layer="${l.id}" role="button" tabindex="0" aria-pressed="${active === l.id}">
            <div class="row"><b>${u.esc(l.name)}</b><span class="dot" style="background:${l.color}"></span></div>
            <p>${u.esc(l.desc)}</p>
          </div>`).join('')}
      </div>
      <div class="sec" id="layer-detail"></div>
      <div class="sec">
        <h3>Observation date</h3>
        <div class="date-field"><input type="date" id="layer-date" value="${date}" max="${u.isoDay(-1)}" min="2000-02-24" aria-label="Layer observation date"></div>
        <p class="tiny muted" style="margin-top:6px;line-height:1.5">Layers follow the satellite's actual revisit schedule. If the exact day has no acquisition, the nearest available observation is shown.</p>
      </div>`;
    body.querySelectorAll('.layer-card').forEach(c => {
      const toggle = () => select(c.dataset.layer);
      c.addEventListener('click', toggle);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
    u.el('layer-date').addEventListener('change', e => {
      HSG.globe.setLayerDate(e.target.value);
      render();
    });
    renderDetail();
  }

  function select(id) {
    try {
      const cur = HSG.store.get('layer');
      const next = cur === id ? null : id;
      if (next) {
        const def = HSG.LAYERS.find(l => l.id === next);
        u.toast('Loading ' + def.name + '…');
      }
      HSG.globe.setDataLayer(next, HSG.store.get('layerOpacity'));
      render();
    } catch (e) {
      console.error('[layers] select failed', e);
      u.toast('Layer failed: ' + (e && e.message ? e.message : e), 'err');
    }
  }

  function renderDetail() {
    const host = u.el('layer-detail');
    if (!host) return;
    const id = HSG.store.get('layer');
    if (!id) { host.innerHTML = ''; return; }
    const l = HSG.LAYERS.find(x => x.id === id);
    const op = Math.round(HSG.store.get('layerOpacity') * 100);
    const grad = l.legend ? `background:linear-gradient(90deg,${l.legend.stops.join(',')})` : 'background:rgba(255,255,255,.06)';
    host.innerHTML = `
      <h3>Layer controls</h3>
      <label class="tiny muted">Opacity — ${op}%</label>
      <input type="range" class="slider" id="layer-opacity" min="10" max="100" value="${op}" aria-label="Layer opacity">
      ${l.legend ? `<div class="legend"><div class="legend-bar" style="${grad}"></div>
        <div class="legend-labels"><span>${l.legend.min}${l.unit}</span><span>${l.unit}</span><span>${l.legend.max}${l.unit}</span></div></div>` : ''}
      ${l.note ? `<p class="tiny muted" style="margin-top:10px;line-height:1.6">◈ ${u.esc(l.note)}</p>` : ''}
      <div style="height:12px"></div>
      <h3>Satellite replay</h3>
      <div class="sat-info">
        <b>${u.esc(l.satellite.platform)}</b> · ${u.esc(l.satellite.sensor)}<br>
        Resolution <b>${u.esc(l.satellite.resolution)}</b> · Revisit <b>${u.esc(l.satellite.revisit)}</b><br>
        ${u.esc(l.satellite.processing)}<br>
        Source: <a href="${l.satellite.link}" target="_blank" rel="noopener">${u.esc(l.satellite.source)}</a>
      </div>
      <button class="btn ghost sm block" id="layer-off">Remove layer</button>`;
    u.el('layer-opacity').addEventListener('input', e => {
      HSG.globe.setDataLayerOpacity(e.target.value / 100);
      e.target.previousElementSibling.textContent = `Opacity — ${e.target.value}%`;
    });
    u.el('layer-off').addEventListener('click', () => select(id));
  }

  return { render };
})();
