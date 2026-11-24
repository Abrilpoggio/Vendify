'use strict';
/* ===== Utilidades ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const call = (c, a) => window.native.call(c, a);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nfmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const money = n => '$ ' + nfmt.format(n || 0);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const METHOD = { cash: 'Efectivo', mp: 'Mercado Pago / QR', card: 'Transferencia / Tarjeta' };
const fdate = iso => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const pnum = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; };

function toast(msg, kind = '', ms = 2200) {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
}
let beepCtx;
function beep(freq = 880, dur = 0.08) {
  try {
    beepCtx = beepCtx || new AudioContext();
    const o = beepCtx.createOscillator(), g = beepCtx.createGain();
    o.frequency.value = freq; g.gain.value = 0.08; o.connect(g); g.connect(beepCtx.destination);
    o.start(); o.stop(beepCtx.currentTime + dur);
  } catch (e) { /* sin audio */ }
}

/** Modal genérico. Devuelve {el, close}. onClose se llama siempre al cerrar. */
const modalStack = [];
function openModal(html, { wide = false, onClose } = {}) {
  const back = document.createElement('div'); back.className = 'back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog">${html}</div>`;
  $('#modalRoot').appendChild(back);
  const m = { el: back.firstElementChild, close() { const i = modalStack.indexOf(m); if (i >= 0) modalStack.splice(i, 1); back.remove(); onClose && onClose(); } };
  modalStack.push(m);
  back.addEventListener('mousedown', e => { if (e.target === back && !m.keepOpenOnBackdrop) m.close(); });
  $$('[data-close]', back).forEach(b => b.addEventListener('click', () => m.close()));
  return m;
}
const modalOpen = () => modalStack.length > 0;

/** Pide un valor (monto, texto) en un modal. */
function promptModal({ title, fields, ok = 'Aceptar' }) {
  return new Promise(res => {
    let done = false;
    const m = openModal(`<h2>${esc(title)}</h2><form>${fields.map(f =>
      `<label class="f">${esc(f.label)}</label><input name="${f.name}" type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''} ${f.big ? 'class="big-input"' : ''} value="${esc(f.value ?? '')}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} autocomplete="off" ${f.required ? 'required' : ''}>`).join('')}
      <div class="row"><button type="button" class="btn" data-close>Cancelar (Esc)</button><button class="btn primary">${esc(ok)}</button></div></form>`,
      { onClose: () => { if (!done) res(null); } });
    const form = $('form', m.el);
    const first = $('input', m.el); first.focus(); first.select();
    form.addEventListener('submit', e => { e.preventDefault(); done = true; const o = {}; $$('input', form).forEach(i => o[i.name] = i.value); m.close(); res(o); });
  });
}
const confirmModal = (title, text, ok = 'Confirmar') => new Promise(res => {
  let done = false;
  const m = openModal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="cfOk">${esc(ok)}</button></div>`, { onClose: () => { if (!done) res(false); } });
  const b = $('#cfOk', m.el); b.focus(); b.addEventListener('click', () => { done = true; m.close(); res(true); });
});

/* ===== Estado ===== */
const S = { products: [], cart: [], admin: false, adminTab: 'stats' };

/* ===== Licencia ===== */
async function boot() {
  const st = await call('license:status');
  if (st.activated) return startApp();
  const box = $('#license'); box.classList.remove('hidden');
  box.innerHTML = `<div class="box"><h1>🔐 Activar Vendify Kiosco</h1>
    <p>Pasale este <b>ID de Máquina</b> a tu proveedor para recibir la clave de activación:</p>
    <div class="mid">${esc(st.machineId)}</div>
    <input id="licKey" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" maxlength="19" autofocus>
    <div class="err-t" id="licErr"></div>
    <div class="row" style="margin-top:14px"><button class="btn primary" id="licBtn" style="width:100%;font-size:20px">Activar</button></div>
    <div class="credit">Creado por <a href="https://abrilpoggio.github.io/TheWebLab/" target="_blank" rel="noopener">Abril Poggio · TheWebLab</a></div></div>`;
  const go = async () => {
    try { const r = await call('license:activate', $('#licKey').value); if (r.ok) { box.classList.add('hidden'); startApp(); } else $('#licErr').textContent = 'Clave incorrecta para este equipo.'; }
    catch (e) { $('#licErr').textContent = e.message; }
  };
  $('#licBtn').addEventListener('click', go);
  $('#licKey').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

async function startApp() {
  $('#app').classList.remove('hidden');
  const cfg = await call('config:get'); $('#shopName').textContent = cfg.shopName;
  await loadProducts(); renderCart(); renderResults(); $('#search').focus();
  setInterval(() => $('#clock').textContent = new Date().toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' }), 1000);
  $('#clock').textContent = new Date().toLocaleString('es-AR', { dateStyle: 'full', timeStyle: 'short' });
}
async function loadProducts() { S.products = await call('products:list'); renderQuick(); }

/* ===== Tema ===== */
const THEMES = ['theme-dark', 'theme-contrast', 'theme-light'];
function applyTheme(t) { document.body.classList.remove(...THEMES); document.body.classList.add(t); localStorage.setItem('theme', t); if (S.admin) renderAdmin(); }
applyTheme(localStorage.getItem('theme') || 'theme-dark');
$('#btnTheme').addEventListener('click', () => { const cur = THEMES.findIndex(t => document.body.classList.contains(t)); applyTheme(THEMES[(cur + 1) % THEMES.length]); });

/* ===== Carrito ===== */
const cartTotal = () => S.cart.reduce((s, l) => s + l.qty * l.price, 0);
function addProduct(p, price) {
  if (p.askPrice && !price) return askPriceFor(p);
  const unit = p.askPrice ? price : p.price;
  const ex = S.cart.find(l => l.pid === p.id && l.price === unit);
  if (p.stock != null && p.stock <= 0) toast(`⚠ ${p.name}: sin stock registrado`, 'warn');
  if (ex) ex.qty++; else S.cart.push({ key: Math.random().toString(36).slice(2), pid: p.id, name: p.name, price: unit, qty: 1, askPrice: p.askPrice });
  beep(); renderCart();
}
async function askPriceFor(p) {
  const r = await promptModal({ title: p.name, fields: [{ name: 'price', label: 'Monto ($)', type: 'number', step: 'any', big: true, required: true }], ok: 'Agregar' });
  const v = r && pnum(r.price); if (v > 0) addProduct(p, v);
}
async function addFree() {
  const r = await promptModal({ title: 'Monto libre / Varios', fields: [
    { name: 'price', label: 'Monto ($)', type: 'number', step: 'any', big: true, required: true },
    { name: 'name', label: 'Descripción (opcional)', value: 'Varios' }], ok: 'Agregar' });
  const v = r && pnum(r.price);
  if (v > 0) { S.cart.push({ key: Math.random().toString(36).slice(2), pid: null, name: (r.name || 'Varios').trim() || 'Varios', price: v, qty: 1 }); beep(); renderCart(); }
}
function renderCart() {
  const el = $('#cart');
  el.innerHTML = S.cart.length ? S.cart.map(l => `<div class="line" data-k="${l.key}">
    <div><div class="nm">${esc(l.name)}</div><div class="un">${money(l.price)} c/u</div></div>
    <div class="qty"><button data-a="dec">−</button><span>${nfmt.format(l.qty)}</span><button data-a="inc">+</button></div>
    <div style="display:flex;align-items:center;gap:4px"><div class="sub">${money(l.qty * l.price)}</div><button class="del" data-a="del" title="Quitar">✕</button></div></div>`).join('')
    : '<div class="empty">Escaneá un producto o elegí uno para empezar</div>';
  $('#total').textContent = money(cartTotal());
  el.scrollTop = el.scrollHeight;
}
$('#cart').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const l = S.cart.find(x => x.key === b.closest('.line').dataset.k); if (!l) return;
  if (b.dataset.a === 'inc') l.qty++;
  else if (b.dataset.a === 'dec') { l.qty--; if (l.qty <= 0) S.cart = S.cart.filter(x => x !== l); }
  else S.cart = S.cart.filter(x => x !== l);
  renderCart();
});
$('#btnClear').addEventListener('click', () => { S.cart = []; renderCart(); $('#search').focus(); });

/* ===== Productos: acceso rápido + búsqueda ===== */
function renderQuick() {
  $('#quick').innerHTML = S.products.filter(p => p.quick).map(p =>
    `<button class="qbtn" data-id="${p.id}">${esc(p.name)}<small>${p.askPrice ? 'Ingresar monto' : money(p.price)}</small></button>`).join('')
    + '<button class="qbtn free" id="qFree">✏️ Monto libre / Varios<small>F8</small></button>';
  $('#qFree').addEventListener('click', addFree);
}
$('#quick').addEventListener('click', e => { const b = e.target.closest('.qbtn[data-id]'); if (b) addProduct(S.products.find(p => p.id == b.dataset.id)); });
function searchProducts(q) {
  const t = norm(q).trim().split(/\s+/).filter(Boolean);
  if (!t.length) return S.products.filter(p => !p.quick).slice(0, 24);
  return S.products.filter(p => { const h = norm(p.name + ' ' + p.code + ' ' + p.category); return t.every(w => h.includes(w)); }).slice(0, 60);
}
function renderResults() {
  const q = $('#search').value; const list = searchProducts(q);
  $('#resultsTitle').textContent = q.trim() ? `Resultados (${list.length})` : 'Productos';
  $('#results').innerHTML = list.length ? list.map(p => {
    const low = p.stock != null && p.stock <= (p.minStock || 0);
    return `<button class="pcard ${p.stock === 0 ? 'out' : ''}" data-id="${p.id}"><div class="n">${esc(p.name)}</div><div class="p">${p.askPrice ? 'Monto libre' : money(p.price)}</div>
    <div class="m">${esc(p.category)} · ${esc(p.code)}${p.stock != null ? ` · <span style="color:var(${p.stock === 0 ? '--bad' : low ? '--warn' : '--muted'})">${p.stock === 0 ? 'AGOTADO' : 'Stock ' + nfmt.format(p.stock)}</span>` : ''}</div></button>`;
  }).join('') : '<div class="empty" style="grid-column:1/-1">Sin resultados</div>';
}
$('#results').addEventListener('click', e => { const b = e.target.closest('.pcard'); if (b) { addProduct(S.products.find(p => p.id == b.dataset.id)); $('#search').focus(); } });
$('#search').addEventListener('input', renderResults);
$('#search').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const v = e.target.value.trim(); if (!v) return;
  const exact = S.products.find(p => p.code === v);
  const hit = exact || (searchProducts(v).length === 1 ? searchProducts(v)[0] : null);
  if (hit) { addProduct(hit); e.target.value = ''; renderResults(); }
  else if (!searchProducts(v).length) { beep(200, .25); toast('Producto no encontrado: ' + v, 'err'); }
  else toast('Elegí uno de los resultados', 'warn');
});

/* ===== Lector USB (teclado rápido) ===== */
let kbuf = '', klast = 0;
function codeScanned(code) {
  const p = S.products.find(x => x.code === code);
  if (p) { addProduct(p); return true; }
  beep(200, .3); toast('Código no registrado: ' + code, 'err'); return false;
}
document.addEventListener('keydown', e => {
  if (!$('#adminView').classList.contains('hidden') || $('#app').classList.contains('hidden')) return;
  if (modalOpen()) { return; }
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''));
  // Atajos
  const map = { F1: () => $('#search').focus(), F2: () => pay('cash'), F3: () => pay('mp'), F4: () => pay('card'), F8: addFree };
  if (map[e.key]) { e.preventDefault(); map[e.key](); return; }
  if (e.key === 'Delete' && !inField) { S.cart = []; renderCart(); return; }
  if (e.key === 'Escape') { $('#search').value = ''; renderResults(); $('#search').focus(); return; }
  if (inField) return; // en el buscador se maneja aparte
  // Lector de código de barras: ráfaga de teclas rápidas + Enter, sin necesidad de foco
  const now = performance.now();
  if (e.key === 'Enter') {
    const code = kbuf; kbuf = '';
    if (code.length >= 3) { e.preventDefault(); codeScanned(code); }
  } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (now - klast > 120) kbuf = '';
    kbuf += e.key; klast = now;
  }
});

/* ===== Cobro ===== */
function pay(method) {
  if (modalOpen()) return;
  if (!S.cart.length) { toast('El ticket está vacío', 'warn'); return; }
  const total = cartTotal();
  if (method === 'cash') return cashModal(total);
  const m = openModal(`<h2>${METHOD[method]}</h2><div class="bigline"><span>Total a cobrar</span><b>${money(total)}</b></div>
    <div class="row"><button class="btn" data-close>Cancelar (Esc)</button><button class="btn ok" id="okPay" style="font-size:20px">✔ Confirmar cobro (Enter)</button></div>`);
  const b = $('#okPay', m.el); b.focus(); b.addEventListener('click', () => finishSale(method, null, m));
}
function cashModal(total) {
  const m = openModal(`<h2>💵 Cobro en Efectivo</h2>
    <div class="bigline"><span>Total</span><b>${money(total)}</b></div>
    <label class="f">El cliente paga con ($) — vacío = justo</label>
    <input id="paid" type="number" step="any" min="0" class="big-input" autocomplete="off">
    <div class="bills"><button class="btn" data-b="0">Justo</button>${[1000, 2000, 5000, 10000, 20000].map(b => `<button class="btn" data-b="${b}">${nfmt.format(b)}</button>`).join('')}</div>
    <div class="change" id="chg"><span>VUELTO</span><strong>$ 0</strong></div>
    <div class="row"><button class="btn" data-close>Cancelar (Esc)</button><button class="btn ok" id="okPay" style="font-size:20px">✔ Cobrar (Enter)</button></div>`);
  const inp = $('#paid', m.el), chg = $('#chg', m.el); inp.focus();
  const upd = () => {
    const raw = inp.value.trim(); const paid = raw === '' ? total : pnum(raw); const diff = paid - total;
    chg.classList.toggle('short', diff < 0);
    chg.innerHTML = diff < 0 ? `<span>FALTAN</span><strong>${money(-diff)}</strong>` : `<span>VUELTO</span><strong>${money(diff)}</strong>`;
    return { paid, diff };
  };
  inp.addEventListener('input', upd);
  $$('[data-b]', m.el).forEach(b => b.addEventListener('click', () => { inp.value = +b.dataset.b || ''; upd(); inp.focus(); }));
  const go = () => { const { paid, diff } = upd(); if (diff < 0) { beep(200, .2); return; } finishSale('cash', paid, m); };
  $('#okPay', m.el).addEventListener('click', go);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
}
let paying = false;
async function finishSale(method, paid, m) {
  if (paying) return; paying = true;
  try {
    const sale = await call('sale:create', { items: S.cart.map(l => ({ pid: l.pid, name: l.name, price: l.price, qty: l.qty })), method, paid: paid == null ? '' : paid });
    m.close(); S.cart = []; renderCart(); beep(1200, .12);
    toast(`✔ Venta #${sale.id} · ${money(sale.total)}${method === 'cash' && sale.change ? ' · Vuelto ' + money(sale.change) : ''}`, 'ok', 3500);
    await loadProducts(); renderResults(); $('#search').value = ''; $('#search').focus();
  } catch (e) { toast(e.message, 'err', 4000); } finally { paying = false; }
}
$$('.pay-btn').forEach(b => b.addEventListener('click', () => pay(b.dataset.pay)));

/* ===== Cámara (QR + códigos de barras) ===== */
let camReader = null;
$('#btnCam').addEventListener('click', () => {
  if (modalOpen()) return;
  const m = openModal(`<h2>📷 Escanear con cámara</h2><div class="camwrap"><video id="camVid" muted playsinline></video></div>
    <p id="camMsg" style="color:var(--muted)">Iniciando cámara…</p>
    <div class="row"><button class="btn primary" data-close>Listo (Esc)</button></div>`, { wide: false, onClose: stopCam });
  const Z = window.ZXing; let last = '', lastAt = 0;
  const hints = new Map(); hints.set(Z.DecodeHintType.TRY_HARDER, true);
  camReader = new Z.BrowserMultiFormatReader(hints, 300);
  camReader.decodeFromVideoDevice(null, 'camVid', (res) => {
    if (!res) return;
    const code = res.getText(); const t = Date.now();
    if (code === last && t - lastAt < 2000) return; last = code; lastAt = t;
    if (codeScanned(code)) $('#camMsg') && ($('#camMsg').textContent = '✔ Agregado: ' + code);
  }).then(() => { const x = $('#camMsg'); if (x) x.textContent = 'Apuntá al código de barras o QR. Podés escanear varios seguidos.'; })
    .catch(err => { const x = $('#camMsg'); if (x) x.textContent = 'No se pudo abrir la cámara: ' + (err.message || err); });
});
function stopCam() { try { camReader && camReader.reset(); } catch (e) {} camReader = null; $('#search').focus(); }

/* ===== Cierre de caja ===== */
$('#btnClose').addEventListener('click', async () => {
  if (modalOpen()) return;
  const sum = await call('shift:summary');
  const m = openModal(`<h2>🧾 Cierre de Caja / Fin de Turno</h2>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><span>💵 Efectivo</span><strong>${money(sum.cash)}</strong></div>
      <div class="kpi"><span>📱 Mercado Pago / QR</span><strong>${money(sum.mp)}</strong></div>
      <div class="kpi"><span>💳 Transf. / Tarjeta</span><strong>${money(sum.card)}</strong></div></div>
    <div class="bigline"><span>Tickets vendidos: <b>${sum.count}</b></span><span>Total recaudado: <b>${money(sum.total)}</b></span></div>
    <hr style="border-color:var(--line)"><h3>Arqueo de caja</h3>
    <div class="grid2"><div><label class="f">Fondo de caja inicial ($)</label><input id="cFund" type="number" step="any" min="0" value="${sum.defaultFloat}"></div>
    <div><label class="f">Efectivo contado en el cajón ($)</label><input id="cCount" type="number" step="any" min="0" autocomplete="off"></div></div>
    <label class="f">Observaciones (opcional)</label><input id="cNote" type="text" maxlength="200">
    <div class="bigline" style="margin-top:12px"><span>Efectivo esperado (fondo + ventas)</span><b id="cExp"></b></div>
    <div class="change" id="cRes"><span>RESULTADO</span><strong style="font-size:44px">Ingresá el efectivo contado</strong></div>
    <div class="row"><button class="btn" data-close>Cancelar</button><button class="btn ok" id="cOk" disabled>Confirmar cierre</button></div>`, { wide: true });
  const fund = $('#cFund', m.el), cnt = $('#cCount', m.el), res = $('#cRes', m.el), ok = $('#cOk', m.el);
  const upd = () => {
    const exp = pnum(fund.value) + sum.cash; $('#cExp', m.el).textContent = money(exp);
    if (cnt.value.trim() === '') { ok.disabled = true; return; }
    ok.disabled = false; const d = Math.round((pnum(cnt.value) - exp) * 100) / 100;
    res.classList.toggle('short', d < 0);
    res.innerHTML = d === 0 ? '<span>RESULTADO</span><strong style="font-size:44px">✔ Caja perfecta</strong>'
      : d > 0 ? `<span>SOBRAN</span><strong style="font-size:56px;color:var(--warn)">${money(d)}</strong>` : `<span>FALTAN</span><strong style="font-size:56px">${money(-d)}</strong>`;
  };
  fund.addEventListener('input', upd); cnt.addEventListener('input', upd); upd(); cnt.focus();
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    try {
      const c = await call('shift:close', { openingFloat: fund.value, counted: cnt.value, note: $('#cNote', m.el).value });
      m.close(); toast(c.status === 'perfect' ? '✔ Caja cerrada: perfecta' : c.status === 'over' ? `Caja cerrada: sobran ${money(c.difference)}` : `Caja cerrada: faltan ${money(-c.difference)}`, c.status === 'perfect' ? 'ok' : 'warn', 5000);
    } catch (e) { toast(e.message, 'err'); ok.disabled = false; }
  });
});

/* ===== Admin: acceso ===== */
$('#btnAdmin').addEventListener('click', async () => {
  if (S.admin) return setAdmin(false);
  if (modalOpen()) return;
  const r = await promptModal({ title: '🔒 Modo Admin', fields: [{ name: 'pin', label: 'PIN', type: 'password', big: true, required: true }], ok: 'Entrar' });
  if (!r) return;
  const a = await call('admin:login', r.pin);
  if (a.ok) setAdmin(true); else { beep(200, .3); toast('PIN incorrecto', 'err'); }
});
async function setAdmin(on) {
  S.admin = on; if (!on) await call('admin:lock');
  $('#posView').classList.toggle('hidden', on); $('#adminView').classList.toggle('hidden', !on);
  $('#btnAdmin').textContent = on ? '🔓 Salir de Admin' : '🔒 Modo Admin';
  $('#btnClose').classList.toggle('hidden', on);
  await loadProducts();
  if (on) { S.adminTab = 'stats'; renderAdmin(); } else { renderResults(); $('#search').focus(); }
}
$('#adminTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { S.adminTab = b.dataset.tab; renderAdmin(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalOpen()) modalStack[modalStack.length - 1].close(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && modalOpen()) { /* los formularios/botones enfocados manejan Enter */ }
});

boot();
