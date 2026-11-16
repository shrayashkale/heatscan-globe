/* Time Machine — before/after true-color comparison with split slider */
HSG.timeMachine = (() => {
  const u = HSG.util;
  let active = false;

  function render() {
    const body = u.el('panel-body');
    const a = HSG.store.get('timeA'), b = HSG.store.get('timeB');
    body.innerHTML = `
      <div class="sec">
        <h3>Earth Time Machine</h3>
        <p class="small muted" style="line-height:1.6;margin-bottom:12px">Travel through real satellite observations. Drag the glowing divider on the globe to wipe between two dates.</p>
        <div class="date-row">
          <div class="date-field"><label>Then</label><input type="date" id="tm-a" value="${a}" min="2000-02-24" max="${u.isoDay(-1)}"></div>
          <div class="date-field"><label>Now</label><input type="date" id="tm-b" value="${b}" min="2000-02-24" max="${u.isoDay(-1)}"></div>
        </div>
        <button class="btn block" id="tm-go">Compare these dates</button>
        <button class="btn ghost sm block" id="tm-season">Same season, one year apart</button>
        <div class="caveat"><b>Read images carefully.</b> Differences in season, sun angle, cloud cover and sensor calibration can look like change. Compare the <b>same season</b> across years for honest change detection — the button above does this for you.</div>
      </div>
      <div class="sec">
        <h3>Satellite replay</h3>
        <div class="sat-info"><b>Terra</b> · MODIS<br>Resolution <b>250 m</b> · Daily since <b>Feb 2000</b><br>Corrected reflectance, clear-sky pixels preferred.<br>Source: <a href="https://earthdata.nasa.gov" target="_blank" rel="noopener">NASA GIBS</a></div>
      </div>`;
    u.el('tm-go').addEventListener('click', start);
    u.el('tm-season').addEventListener('click', () => {
      const bDate = u.el('tm-b').value;
      if (!bDate) { u.toast('Pick the "Now" date first', 'err'); return; }
      const d = new Date(bDate + 'T00:00:00Z');
      if (isNaN(d)) { u.toast('That date looks invalid', 'err'); return; }
      d.setUTCFullYear(d.getUTCFullYear() - 1);
      u.el('tm-a').value = d.toISOString().slice(0, 10);
      start();
    });
    ['tm-a', 'tm-b'].forEach(id => u.el(id).addEventListener('change', () => { if (active) start(); }));
  }

  function start() {
    const a = u.el('tm-a').value, b = u.el('tm-b').value;
    if (!a || !b) { u.toast('Pick both dates first', 'err'); return; }
    if (a === b) { u.toast('Pick two different dates', 'err'); return; }
    const min = '2000-02-24', max = u.isoDay(-1);
    for (const [label, v] of [['Then', a], ['Now', b]]) {
      if (isNaN(new Date(v + 'T00:00:00Z'))) { u.toast(`${label} date looks invalid`, 'err'); return; }
      if (v < min) { u.toast(`${label} date is before satellite coverage starts (Feb 24, 2000)`, 'err'); return; }
      if (v > max) { u.toast(`${label} date is in the future — yesterday is the latest available`, 'err'); return; }
    }
    HSG.store.set('timeA', a); HSG.store.set('timeB', b);
    active = true;
    try {
      HSG.globe.setCompare(a, b, HSG.store.get('split'));
    } catch (e) {
      console.error('[time] setCompare failed', e);
      active = false;
      u.toast('Time comparison failed: ' + (e && e.message ? e.message : e), 'err');
      return;
    }
    // satellite pixels are 250 m — street-level zoom turns them into mush,
    // so pull back to a readable altitude before comparing
    if (HSG.globe.cameraHeight() < 300000) {
      const c = HSG.globe.viewCenter();
      if (c) HSG.globe.flyTo(c.lat, c.lon, 900000, 1.6);
    }
    u.el('split-label-a').textContent = 'Then · ' + u.fmtDate(a);
    u.el('split-label-b').textContent = 'Now · ' + u.fmtDate(b);
    u.el('splitter').hidden = false;
    u.el('panel').classList.add('hidden-panel'); // give the comparison the full screen
    positionHandle();
    u.toast(`Comparing ${u.fmtDate(a)} vs ${u.fmtDate(b)}`);
  }

  function positionHandle() {
    const h = document.querySelector('.split-handle');
    if (h) h.style.left = (HSG.store.get('split') * 100) + '%';
  }

  function stop() {
    active = false;
    HSG.globe.clearCompare();
    u.el('splitter').hidden = true;
  }

  function initSplitter() {
    const handle = document.querySelector('.split-handle');
    let drag = false;
    const move = x => {
      const r = u.el('splitter').getBoundingClientRect();
      HSG.globe.setSplit(Math.min(0.98, Math.max(0.02, (x - r.left) / r.width)));
      positionHandle();
      handle.setAttribute('aria-valuenow', Math.round(HSG.store.get('split') * 100));
    };
    handle.addEventListener('pointerdown', e => { drag = true; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', e => { if (drag) move(e.clientX); });
    handle.addEventListener('pointerup', () => drag = false);
    handle.addEventListener('keydown', e => {
      const s = HSG.store.get('split');
      if (e.key === 'ArrowLeft') { HSG.globe.setSplit(Math.max(0.02, s - 0.05)); positionHandle(); }
      if (e.key === 'ArrowRight') { HSG.globe.setSplit(Math.min(0.98, s + 0.05)); positionHandle(); }
    });
  }

  return { render, start, stop, initSplitter, get active() { return active; } };
})();
