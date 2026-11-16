# HeatScan Globe

Immersive 3D environmental-intelligence globe — real observations only (NASA GIBS layers,
NASA EONET events, Open-Meteo weather), CesiumJS, no backend, single-file build.

## Layout
- `index.html` — the built single-file app (this is what GitHub Pages serves)
- `src/` — source modules (config, globe, layers, ask, ui, …) + `styles.css`
- `index.template.html` — HTML shell with `<!--APP_CSS-->` / `<!--APP_JS-->` placeholders
- `build.js` — concatenates `src/` into the single-file build

## Build
```bash
node build.js   # writes dist/index.html
```

## Live
- GitHub Pages: https://shrayashkale.github.io/heatscan-globe/
- Vercel: https://heatscan-globe-beyondagentic-2867.vercel.app/
