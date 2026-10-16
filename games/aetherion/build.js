// Build: inline three (as global) + core + main + css into one index.html
const fs = require('fs'), path = require('path');
const BUILD = process.env.BUILD || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
let three = fs.readFileSync('/workspace/starfall/vendor/three/three.module.js', 'utf8');
const m = three.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
if (!m) throw new Error('no export block');
const pairs = m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => { const [a, b] = s.split(/\s+as\s+/); return (b || a) + ':' + a; });
three = three.slice(0, m.index) + ';window.THREE={' + pairs.join(',') + '};';
const core = fs.readFileSync('src/core.js', 'utf8'), main = fs.readFileSync('src/main.js', 'utf8'), css = fs.readFileSync('src/style.css', 'utf8');
let html = fs.readFileSync('src/shell.html', 'utf8');
const esc = s => s.replace(/<\/script/gi, '<\\/script');
html = html.replace('/*CSS*/', () => css).replace('/*THREE*/', () => esc('(function(){' + three + '})();')).replace('/*CORE*/', () => esc(core)).replace('/*MAIN*/', () => esc(main.replace(/__BUILD__/g, BUILD)));
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
let sw = fs.readFileSync('src/sw.js', 'utf8').replace(/__BUILD__/g, BUILD);
fs.writeFileSync('dist/sw.js', sw);
fs.copyFileSync('src/manifest.json', 'dist/manifest.json');
for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) if (fs.existsSync('assets/' + f)) fs.copyFileSync('assets/' + f, 'dist/' + f);
console.log('built', BUILD, (html.length / 1024).toFixed(0) + 'KB');
