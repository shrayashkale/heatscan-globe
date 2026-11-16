/* UI shell — modes, panels, inspector, popovers, dialogs */
HSG.ui = (() => {
  const u = HSG.util;
  const TITLES = {
    explore: 'Explore', layers: 'Data Layers', time: 'Time Machine',
    pulse: 'Earth Pulse', moments: 'Earth Moments', ask: 'Ask the Earth', compare: 'Compare Places',
  };
  const RENDER = {
    explore: renderExplore, layers: () => HSG.layersUI.render(), time: () => HSG.timeMachine.render(),
    pulse: () => HSG.pulse.render(), moments: () => HSG.moments.render(),
    ask: () => HSG.ask.render(), compare: () => HSG.compare.render(),
  };

  function init() {
    document.querySelectorAll('.rail-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    u.el('panel-close').addEventListener('click', () => u.el('panel').classList.add('hidden-panel'));
    u.el('inspector-close').addEventListener('click', () => HSG.fingerprint.close());
    u.el('btn-base').addEventListener('click', e => { e.stopPropagation(); u.el('base-pop').hidden = !u.el('base-pop').hidden; });
    document.addEventListener('click', e => {
      if (!u.el('base-pop').hidden && !e.target.closest('#base-pop') && !e.target.closest('#btn-base'))
        u.el('base-pop').hidden = true;
    });
    document.querySelectorAll('.base-opt').forEach(b => b.addEventListener('click', () => {
      try {
        HSG.globe.setBase(b.dataset.base);
        u.el('base-pop').hidden = true;
        u.toast(`Base map: ${HSG.BASEMAPS[b.dataset.base].name}`);
      } catch (e) {
        console.error('[ui] setBase failed', e);
        u.toast('Base map failed: ' + (e && e.message ? e.message : e), 'err');
      }
    }));
    u.el('btn-help').addEventListener('click', () => { fillHelp(); u.el('help-dialog').showModal(); });
    u.el('key-save').addEventListener('click', e => {
      const v = u.el('key-input').value.trim();
      if (!v) { e.preventDefault(); u.toast('Paste a key first — or use Cancel', 'err'); return; }
      if (v) {
        localStorage.setItem(HSG.CONFIG.KEY_STORE, v);
        HSG.store.set('geminiKey', v);
        u.toast('API key saved in this browser');
        if (HSG.store.get('mode') === 'ask') RENDER.ask();
      }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') HSG.fingerprint.close(); });
    HSG.timeMachine.initSplitter();
  }

  function setMode(mode) {
    if (HSG.store.get('mode') === 'time' && mode !== 'time') HSG.timeMachine.stop();
    HSG.store.set('mode', mode);
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    u.el('panel-title').textContent = TITLES[mode];
    u.el('panel').classList.remove('hidden-panel');
    RENDER[mode]();
    if (mode === 'compare') HSG.compare.redrawPins();
    else HSG.globe.clearPins('cmp');
    HSG.globe.requestRender();
  }

  function renderExplore() {
    const loc = HSG.store.get('location');
    u.el('panel-body').innerHTML = `
      <div class="sec"><h3>Explore Earth</h3>
        <p class="small muted" style="line-height:1.7">Drag to spin the planet. Scroll to dive from orbit to street level. <b>Click anywhere</b> for its location fingerprint — elevation, weather, climate trend, nearby events.</p></div>
      <div class="sec"><h3>Right now on the planet</h3><div id="exp-pulse"><div class="spinner"></div></div></div>
      <div class="sec"><h3>Try</h3>
        <div class="qchips">
          <button class="fchip" data-go="pulse">🔥 Live events</button>
          <button class="fchip" data-go="time">🕰 Time travel</button>
          <button class="fchip" data-go="layers">🌡 Heat layer</button>
          <button class="fchip" data-go="moments">✨ Discoveries</button>
        </div></div>`;
    u.el('panel-body').querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.go)));
    const paint = () => {
      const host = u.el('exp-pulse');
      if (!host || !HSG.store.get('eventsLoaded')) return;
      const top = HSG.store.get('events').slice(0, 4);
      host.innerHTML = top.map(e => HSG.pulse.evtCard(e)).join('');
      host.querySelectorAll('.evt').forEach(el => {
        el.addEventListener('click', () => HSG.pulse.openEvent(el.dataset.id));
        el.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); HSG.pulse.openEvent(el.dataset.id); } });
      });
    };
    if (HSG.store.get('eventsLoaded')) paint();
    else { const iv = setInterval(() => { if (HSG.store.get('eventsLoaded')) { paint(); clearInterval(iv); } }, 800); }
  }

  function openInspector(title, html) {
    u.el('inspector-title').textContent = title;
    u.el('inspector-body').innerHTML = html;
    u.el('inspector').hidden = false;
    // wire dynamic buttons
    const cmp = u.el('fp-compare'), askB = u.el('fp-ask');
    if (cmp) cmp.addEventListener('click', () => {
      const loc = HSG.store.get('location');
      if (loc) {
        const pins = HSG.store.get('pins');
        if (pins.length < HSG.CONFIG.MAX_COMPARE_PINS && !pins.some(p => Math.abs(p.lat - loc.lat) < 0.01 && Math.abs(p.lon - loc.lon) < 0.01)) {
          HSG.store.set('pins', [...pins, { lat: loc.lat, lon: loc.lon, name: loc.name, temp: loc.weather?.temp ?? null, elev: loc.elevation ?? null, trend: loc.weather?.trend || null }]);
          u.toast('Added to comparison');
        }
        setMode('compare');
      }
    });
    if (askB) askB.addEventListener('click', () => setMode('ask'));
    u.el('inspector-body').querySelectorAll('[data-eid]').forEach(el => {
      el.addEventListener('click', () => HSG.pulse.openEvent(el.dataset.eid));
    });
  }

  function closeInspector() { u.el('inspector').hidden = true; }

  function fillHelp() {
    u.el('help-sources').innerHTML = `
      <li><b>Imagery</b> — Esri World Imagery; NASA GIBS (Terra/MODIS, Suomi NPP/VIIRS)</li>
      <li><b>Environment layers</b> — NASA MODIS & VIIRS via GIBS <a href="https://earthdata.nasa.gov" target="_blank" rel="noopener">earthdata.nasa.gov</a></li>
      <li><b>Events</b> — NASA EONET <a href="https://eonet.gsfc.nasa.gov" target="_blank" rel="noopener">eonet.gsfc.nasa.gov</a></li>
      <li><b>Places</b> — OpenStreetMap Nominatim; BigDataCloud reverse geocoding</li>
      <li><b>Elevation</b> — OpenTopoData (SRTM 90m)</li>
      <li><b>Weather & climate</b> — Open-Meteo (nowcast + ERA5 reanalysis)</li>
      <li><b>AI answers</b> — your own Gemini key, grounded on loaded data only</li>`;
  }

  return { init, setMode, openInspector, closeInspector, renderExplore };
})();
