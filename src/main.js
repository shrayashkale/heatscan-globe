/* Boot sequence */
(async function boot() {
  const u = HSG.util;
  const msg = u.el('boot').querySelector('.boot-msg');
  try {
    msg.textContent = 'Lighting up the globe…';
    await HSG.globe.init();
    msg.textContent = 'Waking the interface…';
    HSG.ui.init();
    HSG.search.init();
    HSG.ui.setMode('explore');
    // events load in background — never block the globe
    HSG.pulse.load();
    msg.textContent = 'Ready.';
    setTimeout(() => u.el('boot').classList.add('done'), 350);
  } catch (e) {
    console.error(e);
    msg.innerHTML = 'Couldn\'t start the 3D engine.<br><span class="tiny">WebGL may be unavailable on this device.</span>';
    u.toast('3D engine failed to start', 'err');
  }
})();
