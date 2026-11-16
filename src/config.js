/* HeatScan Globe — configuration & dataset catalog.
   Every number shown in the app traces back to one of these sources. */
window.HSG = window.HSG || {};
HSG.CONFIG = {
  CESIUM_VERSION: '1.146',
  GEMINI_MODEL: 'gemini-2.5-flash',
  KEY_STORE: 'hsg_gemini_key',
  // "latest available" offset for daily GIBS layers (processing latency)
  LATEST_OFFSET_DAYS: 3,
  MAX_COMPARE_PINS: 4,
  EONET_URL: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',
  REVERSE_URL: 'https://api-bdc.io/data/reverse-geocode-client',
  ELEV_URL: 'https://api.opentopodata.org/v1/srtm90m',
  METEO_URL: 'https://api.open-meteo.com/v1/forecast',
  METEO_ARCHIVE_URL: 'https://archive-api.open-meteo.com/v1/archive',
  ESRI_IMAGERY: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ESRI_LABELS: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
};

/* Base maps */
HSG.BASEMAPS = {
  esri: { name: 'Satellite', sub: 'Esri World Imagery' },
  gibs: { name: 'True Color', sub: 'NASA Terra / VIIRS daily' },
  dark: { name: 'Dark', sub: 'Minimal night globe' },
};

/* Data layers — id, GIBS layer name, format, matrix set, legend, satellite facts */
HSG.LAYERS = [
  {
    id: 'lst', color: '#f87171',
    name: 'Land Surface Temperature',
    desc: 'Skin temperature of the land surface from MODIS thermal infrared — the "feels-like-from-space" view of heat.',
    gibs: { layer: 'MODIS_Terra_L3_Land_Surface_Temp_8Day_Day', format: 'image/png', matrix: 'GoogleMapsCompatible_Level7', maxLevel: 7, snap: 'modis8dayLst' },
    unit: '°C', legend: { min: -25, max: 55, stops: ['#313695','#4575b4','#74add1','#abd9e9','#e0f3f8','#ffffbf','#fee090','#fdae61','#f46d43','#d73027','#a50026'] },
    satellite: { platform: 'Terra (EOS AM-1)', sensor: 'MODIS', resolution: '1 km', revisit: '8-day composite', processing: 'Level 3, 8-day composite of clear-sky observations', source: 'NASA GIBS / LP DAAC', link: 'https://earthdata.nasa.gov' },
    note: 'Eight days of clear-sky passes composited into one map, so coverage is nearly complete — a single day only ever shows the cloud-free patches. It shows the most recent completed 8-day period; this dataset publishes more slowly than the daily ones.',
  },
  {
    id: 'ndvi', color: '#34d399',
    name: 'Vegetation Index (NDVI)',
    desc: 'How green and photosynthetically active the land is — from bare soil and rock to dense forest canopy.',
    gibs: { layer: 'MODIS_Terra_L3_NDVI_16Day', format: 'image/png', matrix: 'GoogleMapsCompatible_Level9', maxLevel: 9, snap: 'modis16day' },
    alwaysClip: true,
    unit: 'NDVI', legend: { min: -0.2, max: 1, stops: ['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e','#003c30'] },
    satellite: { platform: 'Terra (EOS AM-1)', sensor: 'MODIS', resolution: '500 m', revisit: '16-day composite', processing: 'Level 3 vegetation index, 16-day composite', source: 'NASA GIBS / LP DAAC', link: 'https://earthdata.nasa.gov' },
    note: 'Rendered for the region in view, from the most recent completed 16-day composite — sixteen days of satellite passes merged, so coverage is far more complete than any single day. In this palette, barren plateaus, snow and lakes read pale blue-green: that is the dataset\u2019s true colour for near-zero vegetation, not an error.',
  },
  {
    id: 'aerosol', color: '#a78bfa',
    name: 'Aerosol & Smoke',
    desc: 'Tiny particles hanging in the air — wildfire smoke, dust storms and urban haze — as seen by MODIS.',
    gibs: { layer: 'MODIS_Combined_MAIAC_L2G_AerosolOpticalDepth', format: 'image/png', matrix: 'GoogleMapsCompatible_Level7', maxLevel: 7 },
    unit: 'AOD', legend: { min: 0, max: 1, stops: ['transparent', '#fde68a', '#f59e0b', '#b45309', '#451a03'] },
    satellite: { platform: 'Terra + Aqua', sensor: 'MODIS (MAIAC)', resolution: '1 km', revisit: 'Daily', processing: 'MAIAC daily gridded aerosol retrieval', source: 'NASA GIBS', link: 'https://earthdata.nasa.gov' },
    note: 'A daily composite gridded from both MODIS satellites (MAIAC) — no orbit strips. Aerosol can only be measured where surface and sky allow it, so gaps over bright desert, cloud and parts of the ocean are real: the base map shows through there.',
  },
  {
    id: 'night', color: '#60a5fa',
    name: 'Night Lights',
    desc: 'City lights and human activity after dark — gap-filled, moonlight-corrected Black Marble from Suomi NPP.',
    gibs: { layer: 'VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance', format: 'image/png', matrix: 'GoogleMapsCompatible_Level8', maxLevel: 8 },
    unit: 'radiance', legend: { min: 0, max: 1, stops: ['#000000', '#0b1e3a', '#1d4ed8', '#93c5fd', '#ffffff'] },
    satellite: { platform: 'Suomi NPP', sensor: 'VIIRS Day/Night Band', resolution: '500 m', revisit: 'Daily', processing: 'Black Marble, gap-filled & BRDF-corrected', source: 'NASA GIBS', link: 'https://earthdata.nasa.gov' },
  },
  {
    id: 'truecolor', color: '#22d3ee',
    name: 'True Color (Daily)',
    desc: 'What the satellites actually saw — natural-color imagery from Terra MODIS and VIIRS, refreshed daily.',
    gibs: { layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', format: 'image/jpeg', matrix: 'GoogleMapsCompatible_Level9', maxLevel: 9 },
    unit: '', legend: null,
    satellite: { platform: 'Terra', sensor: 'MODIS', resolution: '250 m', revisit: 'Daily', processing: 'Corrected reflectance', source: 'NASA GIBS', link: 'https://earthdata.nasa.gov' },
  },
];

/* EONET category styling */
HSG.CATEGORIES = {
  wildfires:      { label: 'Wildfires',      color: '#f87171' },
  volcanoes:      { label: 'Volcanoes',      color: '#fb923c' },
  floods:         { label: 'Floods',         color: '#60a5fa' },
  severeStorms:   { label: 'Storms',         color: '#a78bfa' },
  drought:        { label: 'Drought',        color: '#fbbf24' },
  earthquakes:    { label: 'Earthquakes',    color: '#f472b6' },
  landslides:     { label: 'Landslides',     color: '#d6a35c' },
  seaLakeIce:     { label: 'Sea & Lake Ice', color: '#a5f3fc' },
  snow:           { label: 'Snow',            color: '#e0f2fe' },
  tempExtremes:   { label: 'Heat / Cold',    color: '#fca5a5' },
  dustHaze:       { label: 'Dust & Haze',    color: '#d4b483' },
  manmade:        { label: 'Man-made',       color: '#94a3b8' },
  waterColor:     { label: 'Water Color',    color: '#2dd4bf' },
};

/* Maharashtra cities used by Ask the Earth's built-in (no-key) temperature ranking.
   Coordinates are city centres; temperatures are fetched live from Open-Meteo. */
HSG.MH_CITIES = [
  { name: 'Chandrapur', lat: 19.9615, lon: 79.2961 },
  { name: 'Solapur', lat: 17.6599, lon: 74.9064 },
  { name: 'Jalgaon', lat: 21.0077, lon: 75.5626 },
  { name: 'Nagpur', lat: 21.1458, lon: 79.0882 },
  { name: 'Akola', lat: 20.7002, lon: 77.0082 },
  { name: 'Amravati', lat: 20.9374, lon: 77.7796 },
  { name: 'Dhule', lat: 20.9042, lon: 74.7749 },
  { name: 'Nashik', lat: 19.9975, lon: 73.7898 },
  { name: 'Chhatrapati Sambhajinagar', lat: 19.8762, lon: 75.3433 },
  { name: 'Nanded', lat: 19.1383, lon: 77.3210 },
  { name: 'Latur', lat: 18.4088, lon: 76.5604 },
  { name: 'Ahilyanagar', lat: 19.0948, lon: 74.7480 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Kolhapur', lat: 16.7050, lon: 74.2433 },
  { name: 'Thane', lat: 19.2183, lon: 72.9781 },
  { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
];

/* Suggested questions for Ask the Earth */
HSG.SUGGESTIONS = [
  'What wildfires are burning right now?',
  'Show me the most significant events this week',
  'Where is it unusually hot on land today?',
  'Explain what the vegetation index tells us',
  'What do the night lights reveal about this region?',
];
