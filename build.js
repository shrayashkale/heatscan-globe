#!/usr/bin/env node
/* Build: concatenate src modules + css into a single-file dist/index.html */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const order = ['config.js', 'util.js', 'state.js', 'globe.js', 'layers.js', 'search.js',
  'pulse.js', 'moments.js', 'timemachine.js', 'fingerprint.js', 'compare.js', 'ask.js', 'ui.js', 'main.js'];
let js = order.map(f => `\n/* ===== ${f} ===== */\n` + read('src/' + f)).join('\n');
// strip the "use strict"-unsafe bits? none. Basic safety: ensure no </script> inside strings
js = js.replace(/<\/script/gi, '<\\/script');

const css = read('src/styles.css').replace(/<\/style/gi, '<\\/style');
let html = read('index.html');
html = html.replace('<!--APP_CSS-->', `<style>\n${css}\n</style>`);
html = html.replace('<!--APP_JS-->', `<script type="module">\n${js}\n</script>`);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
const kb = (fs.statSync(path.join(root, 'dist', 'index.html')).size / 1024).toFixed(1);
console.log(`dist/index.html built — ${kb} KB`);
