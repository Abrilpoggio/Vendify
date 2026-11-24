'use strict';
// Genera una DEMO de un solo archivo HTML (corre en el navegador, datos en memoria/localStorage).
// Reutiliza el código real (db.js, api.js, app.js, admin.js). Uso: node tools/build-demo.js salida.html
const fs = require('fs'); const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'demo.html');

const shim = `
(function(){
  try { localStorage.setItem('_t','1'); } catch (e) {
    const m = {}; Object.defineProperty(window, 'localStorage', { value: { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } } });
  }
  const mem = {}; const ls = window.localStorage;
  const get = k => ls.getItem('demo:' + k), set = (k, v) => ls.setItem('demo:' + k, v);
  const fakeFs = {
    mkdirSync() {}, existsSync: p => get(p) != null,
    readFileSync: p => get(p), writeFileSync: (p, d) => set(p, d),
    copyFileSync: (a, b) => set(b, get(a)), renameSync: (a, b) => { set(b, get(a)); ls.removeItem('demo:' + a); },
  };
  const fnv = s => { let h1 = 0x811c9dc5, h2 = 0x1b873593; for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = Math.imul(h2 + s.charCodeAt(i), 2246822519) ^ (h2 >>> 13); } return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'); };
  const fakeCrypto = {
    createHash: () => { let s = ''; return { update(x) { s += x; return this; }, digest: () => fnv(s) + fnv(s + '#') + fnv('#' + s) + fnv(s + '##') }; },
    randomBytes: n => ({ toString: () => Array.from({ length: n }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('') }),
  };
  const defs = {}, cache = {};
  const req = n => {
    if (n === 'fs') return fakeFs; if (n === 'path') return { dirname: p => p }; if (n === 'crypto') return fakeCrypto;
    const k = n.replace('./', ''); if (cache[k]) return cache[k].exports;
    const m = cache[k] = { exports: {} }; defs[k](m, m.exports, req); return m.exports;
  };
  window.__def = (n, f) => { defs[n] = f; };
  window.__boot = () => {
    const { Store } = req('db'); const { createApi } = req('api');
    const api = createApi(new Store('vendify-data.json'), { machineId: 'KSC-DEMO-0000', isActivated: () => true, activate: () => true });
    window.native = {
      call: async (c, a) => api.handle(c, JSON.parse(JSON.stringify(a ?? null))),
      saveCsv: async (name, content) => { const u = URL.createObjectURL(new Blob(['\\uFEFF' + content], { type: 'text/csv' })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); return { ok: true, path: name + ' (descargado)' }; },
    };
  };
})();`;
const wrap = (n, code) => `__def(${JSON.stringify(n)}, function(module, exports, require){\n${code}\n});`;
let html = R('renderer/index.html')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  .replace('<link rel="stylesheet" href="styles.css">', `<style>${R('renderer/styles.css')}</style>`)
  .replace(/<script src="vendor\/zxing.min.js"><\/script>\s*<script src="app.js"><\/script>\s*<script src="admin.js"><\/script>/, () =>
    `<div style="position:fixed;top:0;left:0;right:0;background:#ffb020;color:#000;text-align:center;font:600 12px sans-serif;padding:2px;z-index:200">DEMO en navegador — los datos se guardan solo en esta página. La cámara, la licencia y el .exe real funcionan solo en la app instalada.</div>
<script>${safe(shim)}${safe(wrap('db', R('db.js')))}${safe(wrap('api', R('api.js')))}__boot();</script>
<script>${safe(fs.readFileSync(path.join(__dirname, '..', 'src/renderer/vendor/zxing.min.js'), 'utf8'))}</script>
<script>${safe(R('renderer/app.js'))}</script>
<script>${safe(R('renderer/admin.js'))}</script>`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Demo escrita en', out, (html.length / 1024).toFixed(0) + ' KB');
