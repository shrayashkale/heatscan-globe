/* Ask the Earth — answers grounded in loaded data.
   Two engines:
   1. A built-in local analyst (no API key needed) that answers directly from
      data the app already has or can fetch openly: NASA EONET events, the
      dataset catalog, the selected location, and live Open-Meteo temperatures
      for Maharashtra cities.
   2. Gemini (bring-your-own free key) for free-form questions, with a system
      prompt that restricts it to the same loaded data.
   The key prompt is shown ONCE, not repeated after every message. */
HSG.ask = (() => {
  const u = HSG.util;
  const history = [];
  let keyPromptShown = false;
  let mhCache = null, mhCacheAt = 0;

  function render() {
    const body = u.el('panel-body');
    body.innerHTML = `
      <div class="sec">
        <h3>Ask the Earth</h3>
        <p class="small muted" style="line-height:1.6;margin-bottom:10px">An analyst that answers <b>only</b> from real data — satellite layers, NASA's event tracker, live weather data via Open-Meteo, and your selected location. It says "I don't know" instead of guessing. Many questions work with <b>no API key</b>; add a free Gemini key for free-form questions.</p>
        ${HSG.store.get('geminiKey') ? '<button class="btn ghost sm block" id="ask-key" style="margin-bottom:12px">🔑 Change Gemini API key</button>' : '<button class="btn sm block" id="ask-key" style="margin-bottom:12px">＋ Add free Gemini API key (optional)</button>'}
        <div class="qchips">${HSG.SUGGESTIONS.map(q => `<button class="fchip" data-q="${u.esc(q)}">${u.esc(q)}</button>`).join('')}</div>
        <div id="chat-log">${history.map(m => bubble(m)).join('') || `<div class="msg ai">Hi — I'm grounded in live Earth data. Ask about current events, what a data layer shows, which Maharashtra cities are hottest right now, or click the globe first and ask about that place.</div>`}</div>
        <form id="chat-form"><input id="chat-input" placeholder="Ask about the planet…" autocomplete="off" aria-label="Ask a question"><button class="btn sm" type="submit">Ask</button></form>
      </div>`;
    body.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => ask(b.dataset.q)));
    u.el('chat-form').addEventListener('submit', e => {
      e.preventDefault();
      const v = u.el('chat-input').value.trim();
      if (v) { u.el('chat-input').value = ''; ask(v); }
    });
    const kb = u.el('ask-key');
    if (kb) kb.addEventListener('click', () => { try { u.el('key-dialog').showModal(); } catch { /* already open */ } });
    const log = u.el('chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  }

  function bubble(m) {
    return `<div class="msg ${m.role}">${m.html}${m.role === 'ai' && m.src ? `<div class="src">Sources: ${m.src}</div>` : ''}</div>`;
  }

  function push(role, html, src) {
    history.push({ role, html, src });
    const log = u.el('chat-log');
    if (log) { log.insertAdjacentHTML('beforeend', bubble({ role, html, src })); log.scrollTop = log.scrollHeight; }
  }

  function pushTyping() {
    push('ai', '<span class="typing"><i></i><i></i><i></i></span>');
    return () => {
      history.pop();
      const l = u.el('chat-log');
      if (l && l.lastElementChild) l.lastElementChild.remove();
    };
  }

  /* ---------------- local (no-key) analyst ---------------- */

  const CAT_WORDS = [
    ['wildfires', /\b(wild\s?fires?|fires?|burning)\b/],
    ['volcanoes', /\b(volcano|volcanic|erupt)/],
    ['floods', /\b(floods?|flooding)\b/],
    ['severeStorms', /\b(storms?|cyclones?|hurricanes?|typhoons?)\b/],
    ['earthquakes', /\b(earthquakes?|quakes?|seismic)\b/],
    ['drought', /\b(droughts?)\b/],
    ['landslides', /\b(landslides?|mudslides?)\b/],
    ['snow', /\b(snow|blizzards?)\b/],
    ['seaLakeIce', /\b(sea ice|lake ice|iceberg)\b/],
    ['dustHaze', /\b(dust|haze|smoke)\b/],
    ['tempExtremes', /\b(heat\s?waves?|cold snaps?|temperature extremes?)\b/],
  ];

  function eventList(events, emptyMsg) {
    if (!events.length) return emptyMsg;
    return events.slice(0, 6).map(e =>
      `• <b>${u.esc(e.title)}</b> — observed ${u.fmtDate(e.date)} (${u.relTime(e.date)})`).join('<br>');
  }

  async function maharashtraTemps() {
    if (mhCache && Date.now() - mhCacheAt < 10 * 60 * 1000) return mhCache;
    const lats = HSG.MH_CITIES.map(c => c.lat).join(',');
    const lons = HSG.MH_CITIES.map(c => c.lon).join(',');
    const data = await u.getJSON(`${HSG.CONFIG.METEO_URL}?latitude=${lats}&longitude=${lons}&current=temperature_2m&timezone=auto`);
    const rows = (Array.isArray(data) ? data : [data]).map((d, i) => ({
      name: HSG.MH_CITIES[i].name, temp: d.current?.temperature_2m,
    })).filter(r => r.temp != null).sort((a, b) => b.temp - a.temp);
    mhCache = rows; mhCacheAt = Date.now();
    return rows;
  }

  /* Returns an HTML answer, or null when the local analyst can't answer. */
  async function localAnswer(q) {
    const s = ' ' + q.toLowerCase().replace(/\s+/g, ' ') + ' ';

    // greeting
    if (/^\s*(hi+|hello|hey|namaste|hola)\b/.test(q.toLowerCase()) && q.trim().length <= 14) {
      return `Hi! I can answer from real data right now — try "Which cities in Maharashtra are hottest?", "What wildfires are burning right now?", or tap a suggestion above. For free-form questions, add a free Gemini key below.`;
    }

    // Maharashtra temperature ranking (live Open-Meteo, no key needed)
    if (s.includes('maharashtra') && /(tem|hot|heat|warm|weather)/.test(s)) {
      const rows = await maharashtraTemps();
      if (!rows.length) return null;
      const top = rows.slice(0, 8).map((r, i) => `${i + 1}. <b>${u.esc(r.name)}</b> — ${u.fmtNum(r.temp, 1)}°C`).join('<br>');
      return { src: 'Open-Meteo live', html: `Hottest in Maharashtra <b>right now</b> (live data, updated hourly):<br>${top}<br><span class="tiny muted">Coolest of the ${rows.length} cities checked: ${u.esc(rows[rows.length - 1].name)} at ${u.fmtNum(rows[rows.length - 1].temp, 1)}°C.</span>` };
    }

    // plantation / greening priority — readable from two layers in this app:
    // hottest on Land Surface Temperature AND barest on Vegetation (NDVI).
    if (/(plantation|plant(ing)? trees|afforest|green cover|greenery|more trees|tree cover)/.test(s)) {
      const method = `Plant where the land is <b>hot and bare</b>: open <b>Layers → Land Surface Temperature</b> for the hottest ground, then <b>Layers → Vegetation (NDVI)</b> — the areas that stay hot on the first and pale/bare on the second are the plantation priorities. Greening those gives the biggest cooling per tree.`;
      if (s.includes('nashik')) {
        return { src: 'HeatScan Nashik · Landsat 9 (May 2026) + NASA GIBS', html: `For <b>Nashik</b> this is already measured — your HeatScan analysis of Landsat 9 imagery (May 2026) found the hottest, least-green zones at:<br>• <b>Gangapur industrial belt (SW)</b> — 59.2°C peak, the city\u2019s hottest ground<br>• <b>Nashik Road East</b> — 56.0°C peak<br>• <b>Meri–Mhasrul belt</b> — 55.4°C peak<br>Those three are the plantation priorities for Nashik.<br><span class="tiny muted">${method}</span>` };
      }
      return { src: 'NASA GIBS (in-app layers)', html: method + `<br>Tap any place on the globe first and I can tell you its current conditions too.` };
    }

    // explain a layer
    if (/(explain|what is|what do|tell me about|how does)/.test(s)) {
      const layer = HSG.LAYERS.find(l =>
        s.includes(l.id) ||
        (l.id === 'ndvi' && /(ndvi|vegetation|green)/.test(s)) ||
        (l.id === 'lst' && /(land surface temp|surface temperature|heat layer|lst)/.test(s)) ||
        (l.id === 'night' && /(night light)/.test(s)) ||
        (l.id === 'aerosol' && /(aerosol|air quality|pollution)/.test(s)) ||
        (l.id === 'truecolor' && /(true colou?r|satellite image)/.test(s)));
      if (layer) {
        return `<b>${u.esc(layer.name)}</b> — ${u.esc(layer.desc)}<br><span class="tiny muted">${u.esc(layer.satellite.platform)} · ${u.esc(layer.satellite.sensor)} · ${u.esc(layer.satellite.resolution)} · ${u.esc(layer.satellite.revisit)}. Open Layers to see it on the globe.</span>`;
      }
    }

    // events by category
    const events = HSG.store.get('events');
    if (!HSG.store.get('eventsLoaded')) {
      if (/(event|fire|volcano|flood|storm|earthquake)/.test(s)) {
        return 'The NASA event feed is still loading — give it a few seconds and ask again.';
      }
    } else {
      for (const [catId, re] of CAT_WORDS) {
        if (re.test(s)) {
          const inCat = events.filter(e => e.categories[0].id === catId);
          const meta = HSG.CATEGORIES[catId];
          if (!inCat.length) return `No open ${meta ? meta.label.toLowerCase() : catId} events are being tracked by NASA EONET right now.`;
          return `${inCat.length} open ${meta ? meta.label.toLowerCase() : catId} event${inCat.length > 1 ? 's' : ''} tracked by NASA EONET. Most recent:<br>` +
            eventList(inCat, '');
        }
      }
      if (/(significant|important|biggest|major|top events|happening|going on)/.test(s) || /(events? (this week|today|now)|current events|right now on)/.test(s)) {
        const week = events.filter(e => (u.daysAgo(e.date) ?? 99) <= 7);
        const list = (week.length ? week : events);
        return `The most recent tracked events${week.length ? ' from the last 7 days' : ''} (NASA EONET, newest first):<br>` +
          eventList(list, 'No open events are being tracked right now.');
      }
    }

    // "where is it hot" without a named region
    if (/(where.*(hot|warm)|hottest|hot right now|unusually hot)/.test(s)) {
      const loc = HSG.store.get('location');
      const locBit = loc && loc.weather && loc.weather.temp != null
        ? `<br>Your selected place, ${u.esc(loc.name)}, is currently ${u.fmtNum(loc.weather.temp, 0)}°C.` : '';
      return `For a measured answer, open <b>Layers → Land Surface Temperature</b> — it shows the satellite-measured skin temperature of the land (red = hottest), observed daily by MODIS. For city rankings I can do Maharashtra right now: ask "Which cities in Maharashtra are hottest?"${locBit}`;
    }

    // selected location
    if (/\b(this place|this location|here|selected)\b/.test(s)) {
      const loc = HSG.store.get('location');
      if (!loc) return 'No location is selected yet — click anywhere on the globe first, then ask about that place.';
      const w = loc.weather || {};
      return `<b>${u.esc(loc.name)}</b> at ${loc.lat.toFixed(2)}°, ${loc.lon.toFixed(2)}°` +
        `${loc.elevation != null ? ` · elevation ${Math.round(loc.elevation)} m` : ''}` +
        `${w.temp != null ? ` · currently ${u.fmtNum(w.temp, 0)}°C${w.hum != null ? `, humidity ${w.hum}%` : ''}` : ''}.` +
        `${w.trend ? `<br>Its 5-year annual mean temperatures are in the fingerprint panel (ERA5 via Open-Meteo).` : ''}`;
    }

    return null;
  }

  /* ---------------- Gemini (BYO key) ---------------- */

  function contextBlock() {
    const events = HSG.store.get('events').slice(0, 40).map(e =>
      `- ${e.title} [${e.categories.map(c => c.title).join(', ')}] observed ${e.date?.slice(0, 10)}, at ${e.lat?.toFixed(1)},${e.lon?.toFixed(1)}${e.sources?.[0] ? ` (${e.sources[0].url})` : ''}`).join('\n');
    const layers = HSG.LAYERS.map(l =>
      `- ${l.name}: ${l.desc} Satellite: ${l.satellite.platform}/${l.satellite.sensor}, ${l.satellite.resolution} resolution, ${l.satellite.revisit}.`).join('\n');
    const loc = HSG.store.get('location');
    const locStr = loc ? `Selected location: ${loc.name} at ${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}${loc.elevation != null ? `, elevation ${Math.round(loc.elevation)} m` : ''}${loc.weather ? `, current temp ${loc.weather.temp ?? '?'}°C` : ''}.` : 'No location selected.';
    return `AVAILABLE DATA LAYERS:\n${layers}\n\nOPEN NATURAL EVENTS (NASA EONET, newest first):\n${events || '(event feed unavailable)'}\n\n${locStr}\nActive data layer on globe: ${HSG.store.get('layer') || 'none'}.`;
  }

  const SYSTEM = `You are the analyst inside HeatScan Globe, a 3D Earth exploration app. Rules you must never break:
1. Answer ONLY from the AVAILABLE DATA provided below. If the question needs data not listed, say plainly "I don't have that data in the app right now" and suggest what IS available.
2. Never invent numbers, dates, place statistics, event counts, or citations. If a number isn't in the data, don't give one.
3. When you mention an event or layer, name its source (e.g. "NASA EONET", "MODIS via NASA GIBS").
4. Distinguish observation time from "now" — satellite data is hours to days old, never live.
5. Keep answers under 120 words unless the user asks for detail. Use plain language.`;

  let workingModel = null; // first model that answers successfully this session

  async function geminiCall(model, q, key) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          { role: 'user', parts: [{ text: contextBlock() + '\n\nUser question: ' + q }] },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error?.message || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || "I couldn't form an answer from the available data.";
  }

  async function geminiAnswer(q, key) {
    // Try the configured model, then fall back across known-good Flash
    // models, with one pause-and-retry for transient network/5xx/429
    // failures (campus networks and free-tier rate limits both produce
    // these). A rejected KEY (400/401/403) is fatal — no model retry can
    // fix it, so surface it immediately for the key-specific message.
    const chain = [...new Set([workingModel, HSG.CONFIG.GEMINI_MODEL, 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.0-flash'].filter(Boolean))];
    let lastErr = null;
    for (const model of chain) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await geminiCall(model, q, key);
          workingModel = model;
          return u.esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>');
        } catch (e) {
          lastErr = e;
          const keyBad = /api key|api_key|invalid|unauthenticated|permission/i.test(e.message || '') || e.status === 400 || e.status === 401 || e.status === 403;
          if (keyBad) throw e;
          if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
        }
      }
    }
    throw lastErr;
  }

  /* ---------------- ask orchestration ---------------- */

  async function ask(q) {
    push('user', u.esc(q));

    // 1) local analyst first — real fetched data beats a key demand
    let drop = null;
    try {
      if (/maharashtra/.test(q.toLowerCase())) drop = pushTyping();
      const local = await localAnswer(q);
      if (drop) { drop(); drop = null; }
      if (local) {
        const html = typeof local === 'string' ? local : local.html;
        const src = (typeof local === 'object' && local.src) || 'NASA EONET · NASA GIBS (in-app data)';
        push('ai', html, src);
        return;
      }
    } catch (e) {
      if (drop) drop();
      console.warn('[ask] local answer failed', e);
    }

    // 2) Gemini for free-form questions
    const key = HSG.store.get('geminiKey');
    if (!key) {
      if (!keyPromptShown) {
        keyPromptShown = true;
        push('ai', 'That one needs free-form reasoning, which runs on a <b>free Gemini API key</b> — tap <b>＋ Add free Gemini API key</b> at the top of this panel (it stays in your browser, sent only to Google). Questions about events, data layers, Maharashtra temperatures and your selected place work here with no key at all.');
        try { u.el('key-dialog').showModal(); } catch { /* dialog busy */ }
      } else {
        push('ai', 'Still needs a Gemini key for that kind of question — the <b>＋ Add free Gemini API key</b> button at the top of this panel opens the dialog. Or ask me about events, layers, or Maharashtra temperatures, which I can answer directly.');
      }
      return;
    }
    const dropTyping = pushTyping();
    try {
      const text = await geminiAnswer(q, key);
      dropTyping();
      push('ai', text, 'NASA EONET · NASA GIBS');
    } catch (e) {
      dropTyping();
      console.warn('[ask] gemini failed', e);
      const keyBad = /api key|api_key|invalid|unauthenticated|permission/i.test(e.message || '') || e.status === 400 || e.status === 401 || e.status === 403;
      push('ai', keyBad
        ? 'Google rejected that API key — tap <b>＋ Add free Gemini API key</b> at the top of this panel and re-check it. Questions about events, layers, Maharashtra temperatures and plantation needs work here with no key at all.'
        : 'The model could not be reached just now — give it a few seconds and ask again. Questions about events, layers and Maharashtra temperatures work here with no key at all.');
    }
  }

  return { render, ask };
})();
