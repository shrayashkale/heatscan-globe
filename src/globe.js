/* Cesium globe — boot, camera, base maps, picking */
HSG.globe = (() => {
  let viewer = null, Cesium = null;
  let baseLayer = null, underLayer = null, labelsLayer = null, dataLayer = null, compareLayers = [];
  let pinEntities = [];
  let effDate = HSG.util.isoDay(-HSG.CONFIG.LATEST_OFFSET_DAYS); // actual observation date of active layer
  let tileErrs = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(max-width: 860px)').matches;

  async function init() {
    Cesium = await import('cesium');
    const container = HSG.util.el('scene');
    viewer = new Cesium.Viewer(container, {
      // baseLayer:false is LOAD-BEARING: Cesium >=1.104 silently adds its own
      // default ArcGIS base layer when this is omitted, and that phantom layer
      // sits ABOVE our base slot and hides base switches (Dark never showed).
      baseLayer: false,
      baseLayerPicker: false, geocoder: false, homeButton: false,
      sceneModePicker: false, navigationHelpButton: false,
      animation: false, timeline: false, fullscreenButton: false,
      vrButton: false, infoBox: false, selectionIndicator: false,
      requestRenderMode: true, maximumRenderTimeChange: Infinity,
      contextOptions: { webgl: { antialias: true, powerPreference: 'high-performance' } },
    });
    // Lighting OFF: a day/night terminator shading half the disc reads as
    // "black globe" breakage and hides the imagery this app exists to show.
    // Satellite mosaics are daytime composites — display them uniformly lit.
    viewer.scene.globe.enableLighting = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = true;
    viewer.scene.globe.baseColor = new Cesium.Color(0.02, 0.04, 0.08, 1);
    if (isMobile) viewer.resolutionScale = Math.min(devicePixelRatio, 1.5);
    else viewer.resolutionScale = Math.min(devicePixelRatio, 2);

    // hide default credits handled via CSS; add our own attribution line
    // Belt-and-braces: no pre-existing imagery layers may survive construction.
    while (viewer.imageryLayers.length) viewer.imageryLayers.remove(viewer.imageryLayers.get(0), true);
    setBase('esri');
    addLabels();

    // camera start: whole earth, gentle cinematic angle
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(20, 18, 24000000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });
    if (!reduced) startIdleDrift();

    wirePicking();
    wirePerf();
    wireTilePump();
    viewer.camera.moveEnd.addEventListener(HSG.util.debounce(reclipDataLayer, 250));
    HSG.store.set('ready', true);
    requestRender();
  }

  function requestRender() { if (viewer) viewer.scene.requestRender(); }

  /* requestRenderMode means Cesium only draws when told to. Tiles that finish
     downloading after the last explicit render otherwise stay invisible —
     the globe shows black quadtree-shaped holes and slits until the next drag.
     Pump renders for as long as the tile queue is non-empty. */
  let tilePump = null, tilePumpSince = 0;
  function wireTilePump() {
    viewer.scene.globe.tileLoadProgressEvent.addEventListener(queued => {
      if (queued > 0) {
        if (!tilePump) {
          tilePumpSince = performance.now();
          tilePump = setInterval(() => {
            requestRender();
            if (performance.now() - tilePumpSince > 30000) { clearInterval(tilePump); tilePump = null; }
          }, 100);
        }
      } else if (tilePump) {
        clearInterval(tilePump); tilePump = null;
        requestRender();
      }
    });
  }

  /* ---------- base maps ---------- */
  function esriProvider() {
    return new Cesium.UrlTemplateImageryProvider({ url: HSG.CONFIG.ESRI_IMAGERY, maximumLevel: 18 });
  }
  function setBase(id) {
    if (!viewer) return;
    HSG.store.set('base', id);
    if (baseLayer) viewer.imageryLayers.remove(baseLayer, true);
    if (underLayer) viewer.imageryLayers.remove(underLayer, true);
    baseLayer = null; underLayer = null;
    const layers = viewer.imageryLayers;
    if (id === 'esri') {
      baseLayer = layers.addImageryProvider(esriProvider(), 0);
    } else {
      // NASA bases sit ON TOP of Esri: where a daily mosaic has a genuine
      // no-observation gap (made transparent by the JPEG scrubber) or a tile
      // fails, Esri satellite shows through instead of a black hole.
      underLayer = layers.addImageryProvider(esriProvider(), 0);
      if (id === 'gibs') {
        baseLayer = layers.addImageryProvider(gibsProvider('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'image/jpeg', 'GoogleMapsCompatible_Level9', 9, HSG.store.get('layerDate')), 1);
      } else { // dark
        baseLayer = layers.addImageryProvider(gibsProvider('VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance', 'image/png', 'GoogleMapsCompatible_Level8', 8, HSG.store.get('layerDate')), 1);
      }
    }
    document.querySelectorAll('.base-opt').forEach(b => b.classList.toggle('active', b.dataset.base === id));
    requestRender();
  }

  function gibsProvider(layer, format, matrix, maxLevel, date, snap, rect, raw) {
    // GIBS Web-Mercator (epsg3857) endpoint — the standard GoogleMapsCompatible
    // grid, identical to the Esri base grid, so NASA imagery registers exactly
    // on the globe. (The epsg4326 grids don't double per level and misalign in
    // Cesium.) Date is baked into the URL — no clock/times machinery.
    let eff = snap === 'modis8day' ? HSG.util.snapModis8day(date) : (snap === 'modis16day' ? HSG.util.snapModis16day(date) : (snap === 'modis8dayLst' ? HSG.util.snapModis8dayLst(date) : date));
    // Composite layers fall back by whole periods, daily layers by days.
    const stepDays = snap === 'modis16day' ? 16 : (snap ? 8 : 1);
    // Night-lights (Black Marble gap-filled) lags ~2 days behind the other
    // layers: requesting yesterday returns 404 for EVERY tile (verified
    // 2026-10-26: Oct 25 = all 404, Oct 24 = fine). Clamp its date so the
    // Dark base and Night Lights layer can never go fully black.
    if (layer === 'VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance') {
      const latest = HSG.util.isoDay(-2);
      if (eff > latest) eff = latest;
    }
    const ext = format === 'image/jpeg' ? 'jpg' : 'png';
    const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${eff}/${matrix}/{z}/{y}/{x}.${ext}`;
    const opts = {
      url, maximumLevel: maxLevel,
      tileWidth: 256, tileHeight: 256,
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
      credit: 'NASA GIBS',
    };
    if (rect) opts.rectangle = rect; // only fetch/render tiles inside the region being viewed
    const prov = new Cesium.UrlTemplateImageryProvider(opts);
    prov._hsgEffDate = eff;
    if (!raw) {
      if (format === 'image/jpeg') enhanceJpegProvider(prov, layer, format, matrix, maxLevel, eff, rect, stepDays);
      else enhanceRetryProvider(prov, layer, format, matrix, maxLevel, eff, rect, stepDays);
    }
    return prov;
  }

  /* Any GIBS layer can have a bad day (a 404 date, a transient 502 — both seen
     in audits). On a tile load error, retry the same tile up to 3 days back
     before giving up, so one missing date never holes the planet. */
  function shiftDay(iso, days) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function dateFallbacks(layer, format, matrix, maxLevel, effDate, rect, stepDays = 1) {
    return [-1, -2, -3].map(k => gibsProvider(layer, format, matrix, maxLevel, shiftDay(effDate, k * stepDays), null, rect, true));
  }
  function enhanceRetryProvider(prov, layer, format, matrix, maxLevel, effDate, rect, stepDays = 1) {
    let fallbacks = null;
    const orig = prov.requestImage.bind(prov);
    prov.requestImage = (x, y, level, request) => {
      if (!fallbacks) fallbacks = dateFallbacks(layer, format, matrix, maxLevel, effDate, rect, stepDays);
      const chain = (providers, req) => {
        const [head, ...rest] = providers;
        const r = head === prov ? orig(x, y, level, req) : head.requestImage(x, y, level, req);
        // CRITICAL: Cesium's requestImage returns undefined (NOT a promise)
        // when its request throttle is full — Cesium then retries the tile
        // itself. Pass undefined straight through; calling .catch/.then on
        // it crashes the renderer ("Cannot read properties of undefined").
        if (r === undefined || !rest.length) return r;
        return Promise.resolve(r).catch(err => {
          const fb = chain(rest, undefined);
          if (fb === undefined) throw err; // fallback throttled too — report the real error
          return fb;
        });
      };
      return chain([prov, ...fallbacks], request);
    };
  }

  /* GIBS JPEG mosaics encode "no observation" as a solid black tile (or a tile
     with black swath wedges). Rendered raw, the planet gets black holes.
     Fix per tile: near-black pixels become transparent (the layer beneath —
     Esri or the active base — shows through), and a tile that fails to load
     or comes back fully black is retried against the previous two days. */
  const sampleCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  function blackFraction(img) {
    if (!sampleCanvas || !img || !img.width || !img.height) return 0;
    try {
      const w = 64, h = 64;
      sampleCanvas.width = w; sampleCanvas.height = h;
      const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      let black = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) {
        n++;
        if (d[i] < 12 && d[i + 1] < 12 && d[i + 2] < 12) black++;
      }
      return n ? black / n : 0;
    } catch { return 0; } // tainted canvas etc. — leave the tile untouched
  }
  function scrubbed(img) {
    const frac = blackFraction(img);
    if (frac < 0.02) return { img, frac };
    try {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const im = ctx.getImageData(0, 0, cv.width, cv.height);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 14 && d[i + 1] < 14 && d[i + 2] < 14) d[i + 3] = 0;
      }
      ctx.putImageData(im, 0, 0);
      return { img: cv, frac };
    } catch { return { img, frac }; }
  }
  function enhanceJpegProvider(prov, layer, format, matrix, maxLevel, effDate, rect, stepDays = 1) {
    // NOTE: do NOT assign prov.hasAlphaChannel — Cesium defines it get-only,
    // and in a module (strict mode) the assignment throws, killing every JPEG
    // provider (True Color base, Time Machine). UrlTemplate defaults it true.
    let fallbacks = null;
    const getFallbacks = () => {
      if (!fallbacks) fallbacks = dateFallbacks(layer, format, matrix, maxLevel, effDate, rect, stepDays);
      return fallbacks;
    };
    const orig = prov.requestImage.bind(prov);
    prov.requestImage = (x, y, level, request) => {
      const attempt = (p, req) => p === prov ? orig(x, y, level, req) : p.requestImage(x, y, level, req);
      const loadBest = (providers, req) => {
        const [head, ...rest] = providers;
        const r = attempt(head, req);
        if (r === undefined) return undefined; // Cesium throttle — see enhanceRetryProvider note
        return Promise.resolve(r).then(img => {
          const s = scrubbed(img);
          if (s.frac > 0.97 && rest.length) {
            const fb = loadBest(rest, undefined);
            if (fb === undefined) return s.img;
            return fb.catch(() => s.img);
          }
          return s.img;
        }).catch(err => {
          if (!rest.length) throw err;
          const fb = loadBest(rest, undefined);
          if (fb === undefined) throw err;
          return fb;
        });
      };
      return loadBest([prov, ...getFallbacks()], request);
    };
  }

  /* The region the user is actually looking at, padded — data layers are
     scoped to this so the app never loads whole-planet tiles for a city view. */
  let clipKey = '';
  function currentViewRect(alwaysClip) {
    if (!viewer) return null;
    if (!alwaysClip && viewer.camera.positionCartographic.height > 6000000) return null; // near-hemisphere view: no clip
    let r = null;
    try { r = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid); } catch { /* not ready */ }
    if (!r) return null;
    let west = Cesium.Math.toDegrees(r.west), east = Cesium.Math.toDegrees(r.east);
    let south = Cesium.Math.toDegrees(r.south), north = Cesium.Math.toDegrees(r.north);
    const w = east - west, h = north - south;
    if (!(w > 0) || w > 340 || !(h > 0)) return null; // whole globe or antimeridian wrap
    west = Math.max(-180, west - w * 0.35); east = Math.min(180, east + w * 0.35);
    // clamp to the Web-Mercator limit (±85°) with margin — beyond it no tiles exist
    south = Math.max(-84.9, south - h * 0.35); north = Math.min(84.9, north + h * 0.35);
    return Cesium.Rectangle.fromDegrees(west, south, east, north);
  }
  function rectKey(r) {
    if (!r) return 'full';
    const d = Cesium.Math.toDegrees;
    return [r.west, r.south, r.east, r.north].map(v => Math.round(d(v))).join(',');
  }

  function addLabels() {
    labelsLayer = viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
      url: HSG.CONFIG.ESRI_LABELS, maximumLevel: 12,
    }));
    labelsLayer.alpha = 0;
    // curated fade: labels appear as you zoom in (Google-Earth-smooth feel)
    viewer.camera.changed.addEventListener(() => {
      const h = viewer.camera.positionCartographic.height;
      const target = h < 9000000 ? Math.min(1, Math.max(0, (9000000 - h) / 6000000)) : 0;
      if (Math.abs(labelsLayer.alpha - target) > 0.02) {
        labelsLayer.alpha += (target - labelsLayer.alpha) * 0.15;
        requestRender();
      }
    });
  }

  /* ---------- data layer ---------- */
  function setDataLayer(layerId, opacity) {
    if (!viewer) return;
    if (dataLayer) { viewer.imageryLayers.remove(dataLayer, true); dataLayer = null; }
    HSG.store.set('layer', layerId);
    HSG.store.set('layerOpacity', opacity);
    clipKey = '';
    if (!layerId) { updateLayerStatus(); requestRender(); return; }
    buildDataLayer(HSG.LAYERS.find(l => l.id === layerId), opacity, true);
    updateLayerStatus();
  }

  function buildDataLayer(def, opacity, fade) {
    const rect = currentViewRect(def && def.alwaysClip);
    clipKey = rectKey(rect);
    const prov = gibsProvider(def.gibs.layer, def.gibs.format, def.gibs.matrix, def.gibs.maxLevel, HSG.store.get('layerDate'), def.gibs.snap, rect);
    effDate = prov._hsgEffDate;
    // surface tile failures instead of failing silently
    tileErrs = 0;
    const onTileErr = () => {
      tileErrs++;
      if (tileErrs === 15) {
        HSG.util.toast('Layer tiles are failing to load — the satellite server may be unreachable from your network. Try another layer.', 'err');
        prov.errorEvent.removeEventListener(onTileErr);
      }
    };
    prov.errorEvent.addEventListener(onTileErr);
    dataLayer = viewer.imageryLayers.addImageryProvider(prov);
    if (labelsLayer) viewer.imageryLayers.raiseToTop(labelsLayer); // place names stay above data
    const me = dataLayer;
    if (!fade || reduced) { me.alpha = opacity; requestRender(); return; }
    me.alpha = 0;
    // cinematic reveal: fade in
    const t0 = performance.now();
    (function step() {
      if (dataLayer !== me) return; // superseded by a newer layer
      const k = Math.min(1, (performance.now() - t0) / 900);
      me.alpha = (k * k * (3 - 2 * k)) * opacity;
      requestRender();
      if (k < 1) requestAnimationFrame(step);
    })();
  }

  /* Re-scope the active layer to the region in view after the camera settles */
  function reclipDataLayer() {
    const id = HSG.store.get('layer');
    if (!id || !dataLayer || !viewer) return;
    const def = HSG.LAYERS.find(l => l.id === id);
    const rect = currentViewRect(def && def.alwaysClip);
    const key = rectKey(rect);
    const prev = clipKey.split(',').map(Number), next = key.split(',').map(Number);
    const moved = key === 'full' || clipKey === 'full' || prev.some((v, i) => Math.abs(v - next[i]) > 1);
    if (!moved) return;
    const alpha = dataLayer.alpha;
    viewer.imageryLayers.remove(dataLayer, true);
    dataLayer = null;
    buildDataLayer(HSG.LAYERS.find(l => l.id === id), HSG.store.get('layerOpacity'), false);
    if (dataLayer) dataLayer.alpha = alpha;
  }

  function setDataLayerOpacity(v) {
    HSG.store.set('layerOpacity', v);
    if (dataLayer) { dataLayer.alpha = v; requestRender(); }
  }

  function setLayerDate(date) {
    HSG.store.set('layerDate', date);
    const id = HSG.store.get('layer');
    if (id) setDataLayer(id, HSG.store.get('layerOpacity'));
    if (HSG.store.get('base') === 'gibs' || HSG.store.get('base') === 'dark') setBase(HSG.store.get('base'));
    updateLayerStatus();
  }

  function updateLayerStatus() {
    const el = HSG.util.el('layer-status');
    const id = HSG.store.get('layer');
    if (!id) { el.textContent = ''; return; }
    const def = HSG.LAYERS.find(l => l.id === id);
    el.textContent = `◈ ${def.name} · observed ≈ ${HSG.util.fmtDate(effDate)} · ${def.satellite.source}`;
  }

  /* ---------- time machine compare layers ---------- */
  function setCompare(dateA, dateB, split) {
    clearCompare();
    try { setCompareInner(dateA, dateB, split); }
    catch (e) { clearCompare(); throw e; } // never leave half-applied compare layers on the globe
  }
  function setCompareInner(dateA, dateB, split) {
    let warned = false, errs = 0;
    const mk = (date) => {
      const prov = gibsProvider('MODIS_Terra_CorrectedReflectance_TrueColor', 'image/jpeg', 'GoogleMapsCompatible_Level9', 9, date);
      prov.errorEvent.addEventListener(() => {
        errs++;
        if (errs === 4 && !warned) {
          warned = true;
          HSG.util.toast('Some imagery for those dates is unavailable — try dates a few days apart from today, or a different year.', 'err');
        }
      });
      const l = viewer.imageryLayers.addImageryProvider(prov);
      l.alpha = 1;
      return l;
    };
    const la = mk(dateA), lb = mk(dateB);
    la.splitDirection = Cesium.SplitDirection.LEFT;
    lb.splitDirection = Cesium.SplitDirection.RIGHT;
    viewer.scene.splitPosition = split;
    compareLayers = [la, lb];
    if (labelsLayer) viewer.imageryLayers.raiseToTop(labelsLayer);
    requestRender();
  }
  function setSplit(v) {
    HSG.store.set('split', v);
    if (viewer) { viewer.scene.splitPosition = v; requestRender(); }
  }
  function clearCompare() {
    compareLayers.forEach(l => viewer.imageryLayers.remove(l, true));
    compareLayers = [];
    if (viewer) requestRender();
  }

  /* ---------- events / pins ---------- */
  function pinImage(color) {
    const c = document.createElement('canvas'); c.width = c.height = 40;
    const x = c.getContext('2d');
    x.beginPath(); x.arc(20, 16, 11, 0, 7); x.fillStyle = color; x.fill();
    x.lineWidth = 2.5; x.strokeStyle = 'rgba(255,255,255,.9)'; x.stroke();
    x.beginPath(); x.moveTo(13, 24); x.lineTo(20, 38); x.lineTo(27, 24); x.closePath();
    x.fillStyle = color; x.fill();
    return c.toDataURL();
  }

  function addEventPins(events) {
    clearPins('event');
    events.forEach(ev => {
      const [lon, lat] = eventLonLat(ev);
      if (lon == null) return;
      const cat = ev.categories[0].id;
      const color = (HSG.CATEGORIES[cat] || {}).color || '#22d3ee';
      const e = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        billboard: { image: pinImage(color), width: 26, height: 26, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, scaleByDistance: new Cesium.NearFarScalar(2e6, 1.4, 2e7, 0.6) },
        properties: { kind: 'event', id: ev.id },
      });
      e._hsgKind = 'event'; e._hsgId = ev.id;
      pinEntities.push(e);
    });
    requestRender();
  }

  function addLocationPin(lat, lon, color = '#22d3ee', id = 'loc', clearFirst = true) {
    if (clearFirst) clearPins(id);
    const e = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      billboard: { image: pinImage(color), width: 30, height: 30, verticalOrigin: Cesium.VerticalOrigin.BOTTOM },
    });
    e._hsgKind = id;
    pinEntities.push(e);
    requestRender();
    return e;
  }

  function clearPins(kind) {
    pinEntities = pinEntities.filter(e => {
      if (!kind || e._hsgKind === kind || (kind === 'event' && e._hsgKind === 'event')) {
        viewer.entities.remove(e); return false;
      }
      return true;
    });
    requestRender();
  }

  function eventLonLat(ev) {
    const g = ev.geometry || [];
    const last = g[g.length - 1];
    if (!last) return [null, null];
    const c = last.coordinates;
    if (last.type === 'Point') return [c[0], c[1]];
    // polygon: centroid of first ring
    const ring = c[0] || [];
    let x = 0, y = 0;
    ring.forEach(p => { x += p[0]; y += p[1]; });
    return ring.length ? [x / ring.length, y / ring.length] : [null, null];
  }

  /* ---------- camera ---------- */
  function flyTo(lat, lon, height = 2500000, dur) {
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-70), roll: 0 },
      duration: reduced ? 0 : (dur || 2.4),
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  }

  function startIdleDrift() {
    let last = 0;
    viewer.clock.onTick.addEventListener((clock) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      if (HSG.store.get('mode') === 'explore' && !HSG.store.get('location')) {
        const h = viewer.camera.positionCartographic.height;
        if (h > 18000000) { viewer.camera.rotateLeft(0.00012); requestRender(); }
      }
    });
  }

  /* ---------- picking ---------- */
  let downPos = null, downTime = 0;
  function wirePicking() {
    const canvas = viewer.scene.canvas;
    canvas.addEventListener('pointerdown', e => { downPos = [e.clientX, e.clientY]; downTime = Date.now(); });
    canvas.addEventListener('pointerup', e => {
      if (!downPos) return;
      const dx = e.clientX - downPos[0], dy = e.clientY - downPos[1];
      const dt = Date.now() - downTime;
      downPos = null;
      if (Math.hypot(dx, dy) > 6 || dt > 400) return; // was a drag
      const picked = viewer.scene.pick(new Cesium.Cartesian2(e.clientX, e.clientY));
      if (picked && picked.id && picked.id._hsgKind === 'event') {
        HSG.pulse.openEvent(picked.id._hsgId);
        return;
      }
      const cart = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(e.clientX, e.clientY), viewer.scene.globe.ellipsoid);
      if (!cart) return;
      const c = Cesium.Cartographic.fromCartesian(cart);
      const lat = Cesium.Math.toDegrees(c.latitude), lon = Cesium.Math.toDegrees(c.longitude);
      if (HSG.store.get('mode') === 'compare') HSG.compare.pickFromMap(lat, lon);
      else HSG.fingerprint.inspect(lat, lon);
    });
    // coordinate readout
    canvas.addEventListener('pointermove', HSG.util.debounce(e => {
      const cart = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(e.clientX, e.clientY), viewer.scene.globe.ellipsoid);
      const el = HSG.util.el('coords');
      if (!cart) { el.textContent = '—'; return; }
      const c = Cesium.Cartographic.fromCartesian(cart);
      el.textContent = `${Math.abs(Cesium.Math.toDegrees(c.latitude)).toFixed(2)}°${c.latitude >= 0 ? 'N' : 'S'}  ${Math.abs(Cesium.Math.toDegrees(c.longitude)).toFixed(2)}°${c.longitude >= 0 ? 'E' : 'W'}`;
    }, 60));
  }

  function wirePerf() {
    let frames = 0, t0 = performance.now();
    viewer.scene.postRender.addEventListener(() => {
      frames++;
      const now = performance.now();
      if (now - t0 > 2000) {
        const fps = Math.round(frames * 1000 / (now - t0));
        HSG.util.el('perf').textContent = viewer.requestRenderMode ? `render-on-demand · ${fps} fps` : `${fps} fps`;
        frames = 0; t0 = now;
      }
    });
  }

  function cameraHeight() { return viewer ? viewer.camera.positionCartographic.height : 0; }
  function viewCenter() {
    if (!viewer) return null;
    const cart = viewer.camera.pickEllipsoid(
      new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2),
      viewer.scene.globe.ellipsoid);
    if (!cart) return null;
    const c = Cesium.Cartographic.fromCartesian(cart);
    return { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude) };
  }

  return {
    init, flyTo, setBase, setDataLayer, setDataLayerOpacity, setLayerDate,
    setCompare, setSplit, clearCompare,
    addEventPins, addLocationPin, clearPins, eventLonLat,
    requestRender, cameraHeight, viewCenter,
    get viewer() { return viewer; }, get cesium() { return Cesium; },
  };
})();
