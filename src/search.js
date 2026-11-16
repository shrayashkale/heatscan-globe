/* Geographic search — Nominatim */
HSG.search = (() => {
  const u = HSG.util;
  let items = [], activeIdx = -1;

  function init() {
    const input = u.el('search'), box = u.el('search-results');
    input.addEventListener('input', u.debounce(onType, 350));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return;
        e.preventDefault();
        activeIdx = (activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        paint();
      } else if (e.key === 'Enter') {
        if (items[activeIdx]) choose(items[activeIdx]);
        else if (items[0]) choose(items[0]);
      } else if (e.key === 'Escape') { box.hidden = true; }
    });
    document.addEventListener('click', e => {
      if (!u.el('search-wrap').contains(e.target)) box.hidden = true;
    });
  }

  async function onType() {
    const q = u.el('search').value.trim();
    const box = u.el('search-results');
    if (q.length < 3) { box.hidden = true; items = []; return; }
    try {
      const url = `${HSG.CONFIG.NOMINATIM_URL}?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
      items = await u.getJSON(url);
      activeIdx = -1;
      paint();
    } catch { box.hidden = true; }
  }

  function paint() {
    const box = u.el('search-results');
    if (!items.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = items.map((r, i) => `
      <button class="sr-item ${i === activeIdx ? 'active' : ''}" data-i="${i}" role="option">
        <b>${u.esc(r.name || r.display_name.split(',')[0])}</b>
        <small>${u.esc(r.display_name)}</small>
      </button>`).join('');
    box.querySelectorAll('.sr-item').forEach(b => b.addEventListener('click', () => choose(items[+b.dataset.i])));
  }

  function choose(r) {
    u.el('search-results').hidden = true;
    u.el('search').value = r.name || r.display_name.split(',')[0];
    const lat = +r.lat, lon = +r.lon;
    const bb = r.boundingbox ? r.boundingbox.map(Number) : null;
    const h = bb ? Math.max(200000, (bb[1] - bb[0]) * 111000 * 4) : 2500000;
    HSG.globe.flyTo(lat, lon, Math.min(h, 12000000));
    HSG.fingerprint.inspect(lat, lon, r.display_name.split(',').slice(0, 2).join(','));
  }

  return { init };
})();
