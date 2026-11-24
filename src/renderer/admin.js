'use strict';
/* ===== Panel Admin (se carga después de app.js y comparte su ámbito global) ===== */
const cssv = n => getComputedStyle(document.body).getPropertyValue(n).trim();
const csvCell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
async function exportCsv(name, rows) {
  const r = await window.native.saveCsv(name, rows.map(r => r.map(csvCell).join(';')).join('\r\n'));
  if (r.ok) toast('Archivo guardado: ' + r.path, 'ok', 4000);
}
const saleProfit = s => s.items.reduce((a, i) => a + i.qty * (i.price - i.cost), 0);

function renderAdmin() {
  $$('#adminTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === S.adminTab));
  ({ stats: tabStats, products: tabProducts, sales: tabSales, closures: tabClosures, settings: tabSettings })[S.adminTab]();
}

/* ---------- Estadísticas ---------- */
let statRange = 'day';
function rangeStart(r) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (r === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (r === 'month') d.setDate(1);
  return d;
}
function setupCanvas(c) {
  const dpr = window.devicePixelRatio || 1; const w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  g.font = '12px Jakarta, Segoe UI, sans-serif'; return { g, w, h };
}
function drawBars(canvas, labels, values, color, fmt = money, minMax = 1) {
  const { g, w, h } = setupCanvas(canvas); const L = 50, B = 24, T = 14; const raw = Math.max(...values, minMax);
  const pw = Math.pow(10, Math.floor(Math.log10(raw))); const max = [1, 2, 2.5, 5, 10].map(m => m * pw).find(v => v >= raw);
  const short = v => fmt === money ? (v >= 1e6 ? '$' + +(v / 1e6).toFixed(1) + 'M' : v >= 1000 ? '$' + +(v / 1000).toFixed(1) + 'k' : '$' + Math.round(v)) : fmt(v);
  g.strokeStyle = cssv('--line'); g.fillStyle = cssv('--muted'); g.textAlign = 'right';
  for (let i = 0; i <= 4; i++) { const y = T + (h - T - B) * (1 - i / 4); g.beginPath(); g.moveTo(L, y); g.lineTo(w, y); g.stroke(); g.fillText(short(max * i / 4), L - 6, y + 4); }
  const bw = (w - L) / values.length; g.textAlign = 'center';
  values.forEach((v, i) => {
    const bh = (h - T - B) * v / max; g.fillStyle = color; g.fillRect(L + i * bw + bw * 0.15, h - B - bh, bw * 0.7, bh);
    if (values.length <= 16 || i % Math.ceil(values.length / 16) === 0) { g.fillStyle = cssv('--muted'); g.fillText(labels[i], L + i * bw + bw / 2, h - 8); }
  });
}
function drawDonut(canvas, parts) {
  const { g, w, h } = setupCanvas(canvas); const tot = parts.reduce((a, p) => a + p.v, 0);
  const r = Math.min(w, h) / 2 - 12, cx = w / 2, cy = h / 2; let a0 = -Math.PI / 2;
  if (!tot) { g.fillStyle = cssv('--muted'); g.textAlign = 'center'; g.fillText('Sin datos', cx, cy); return; }
  parts.forEach(p => { const a = p.v / tot * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a0, a0 + a); g.closePath(); g.fillStyle = p.c; g.fill(); a0 += a; });
  g.beginPath(); g.arc(cx, cy, r * 0.55, 0, Math.PI * 2); g.fillStyle = cssv('--panel'); g.fill();
  g.fillStyle = cssv('--text'); g.textAlign = 'center'; g.font = 'bold 15px Jakarta, Segoe UI, sans-serif'; g.fillText(money(tot), cx, cy + 5);
}
async function tabStats() {
  const body = $('#adminBody'); const all = await call('sales:list');
  const start = rangeStart(statRange); const sales = all.filter(s => new Date(s.date) >= start);
  const rev = sales.reduce((a, s) => a + s.total, 0), prof = sales.reduce((a, s) => a + saleProfit(s), 0);
  const avg = sales.length ? rev / sales.length : 0;
  body.innerHTML = `<div class="toolbar">${[['day', 'Hoy'], ['week', 'Esta semana'], ['month', 'Este mes']].map(([k, l]) => `<button class="btn ${statRange === k ? 'primary' : ''}" data-r="${k}">${l}</button>`).join('')}</div>
  <div class="kpis"><div class="kpi"><span>Facturación total</span><strong>${money(rev)}</strong></div>
    <div class="kpi"><span>Ganancia neta real</span><strong class="pos">${money(prof)}</strong></div>
    <div class="kpi"><span>Ticket promedio</span><strong>${money(avg)}</strong></div>
    <div class="kpi"><span>Tickets</span><strong>${sales.length}</strong></div></div>
  <div class="panels"><div class="panel"><h3>Ventas por día</h3><canvas id="chDay"></canvas></div>
    <div class="panel"><h3>Horarios pico (cantidad de tickets)</h3><canvas id="chHour"></canvas></div>
    <div class="panel"><h3>Medios de pago</h3><canvas id="chPay" style="height:200px"></canvas><div class="legend" id="payLeg"></div></div></div>
  <div class="panels"><div class="panel"><h3>🏆 Más vendidos (unidades)</h3><div id="topQty"></div></div>
    <div class="panel"><h3>💰 Los que más ganancia dejan</h3><div id="topProf"></div></div></div>`;
  $$('[data-r]', body).forEach(b => b.addEventListener('click', () => { statRange = b.dataset.r; tabStats(); }));
  // por día
  const days = []; const n = statRange === 'month' ? new Date().getDate() : 7;
  for (let i = n - 1; i >= 0; i--) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i); days.push(d); }
  const key = d => d.toDateString(); const byDay = new Map(days.map(d => [key(d), 0]));
  all.forEach(s => { const k = key(new Date(s.date)); if (byDay.has(k)) byDay.set(k, byDay.get(k) + s.total); });
  drawBars($('#chDay'), days.map(d => `${d.getDate()}/${d.getMonth() + 1}`), days.map(d => byDay.get(key(d))), cssv('--accent'));
  const hours = Array(24).fill(0); sales.forEach(s => hours[new Date(s.date).getHours()]++);
  drawBars($('#chHour'), hours.map((_, i) => i + 'h'), hours, cssv('--warn'), v => String(Math.round(v)), 4);
  const pm = { cash: 0, mp: 0, card: 0 }; sales.forEach(s => pm[s.method] += s.total);
  const cols = { cash: cssv('--cash'), mp: cssv('--mp'), card: cssv('--card') };
  drawDonut($('#chPay'), Object.keys(pm).map(k => ({ v: pm[k], c: cols[k] })));
  $('#payLeg').innerHTML = Object.keys(pm).map(k => `<span><i style="background:${cols[k]}"></i>${METHOD[k]}: <b>${rev ? (pm[k] / rev * 100).toFixed(1) : 0}%</b> (${money(pm[k])})</span>`).join('');
  const agg = new Map();
  sales.forEach(s => s.items.forEach(i => { const k = i.name; const a = agg.get(k) || { name: k, qty: 0, prof: 0, rev: 0 }; a.qty += i.qty; a.prof += i.qty * (i.price - i.cost); a.rev += i.qty * i.price; agg.set(k, a); }));
  const tbl = (arr, f) => `<table><tr><th>#</th><th>Producto</th><th class="r">${f[0]}</th><th class="r">${f[1]}</th></tr>${arr.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.name)}</td><td class="r">${f[2](a)}</td><td class="r">${f[3](a)}</td></tr>`).join('') || '<tr><td colspan=4>Sin ventas</td></tr>'}</table>`;
  const vals = [...agg.values()];
  $('#topQty').innerHTML = tbl(vals.sort((a, b) => b.qty - a.qty).slice(0, 10), ['Unid.', 'Facturado', a => nfmt.format(a.qty), a => money(a.rev)]);
  $('#topProf').innerHTML = tbl(vals.sort((a, b) => b.prof - a.prof).slice(0, 10), ['Ganancia', 'Unid.', a => `<span class="pos">${money(a.prof)}</span>`, a => nfmt.format(a.qty)]);
}

/* ---------- Productos y stock ---------- */
let prodFilter = { q: '', cat: '', stock: '' };
const stockState = p => p.stock == null ? 'n' : p.stock <= 0 ? 'out' : p.stock <= p.minStock ? 'low' : 'ok';
async function tabProducts() {
  await loadProducts(); const all = S.products;
  const cats = [...new Set(all.map(p => p.category))].sort();
  const out = all.filter(p => stockState(p) === 'out'), low = all.filter(p => stockState(p) === 'low');
  const list = all.filter(p => (!prodFilter.cat || p.category === prodFilter.cat)
    && (!prodFilter.stock || (prodFilter.stock === 'alert' ? ['low', 'out'].includes(stockState(p)) : true))
    && (!prodFilter.q || norm(p.name + p.code + p.category).includes(norm(prodFilter.q))));
  $('#adminBody').innerHTML = `${out.length || low.length ? `<div class="alert">⚠ ${out.length} agotado(s) · ${low.length} con stock bajo — <a href="#" id="showAlert" style="color:inherit">ver solo lo que hay que reponer</a></div>` : ''}
  <div class="toolbar"><input id="pq" placeholder="Buscar…" value="${esc(prodFilter.q)}" style="width:240px">
    <select id="pc"><option value="">Todas las categorías</option>${cats.map(c => `<option ${c === prodFilter.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <button class="btn primary" id="pNew">+ Nuevo producto</button><button class="btn warn" id="pBulk">％ Aumento masivo</button>
    <button class="btn" id="pCsv">⬇ Exportar CSV</button>${prodFilter.stock ? '<button class="btn" id="pAll">Ver todos</button>' : ''}</div>
  <div class="tw"><table><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th class="r">Costo</th><th class="r">Venta</th><th class="r">Margen</th><th class="r">Stock</th><th class="r">Mín.</th><th>Estado</th><th></th></tr>
  ${list.map(p => { const st = stockState(p); return `<tr class="${st === 'out' ? 'rowout' : st === 'low' ? 'rowlow' : ''}"><td>${esc(p.code)}</td><td><b>${esc(p.name)}</b>${p.quick ? ' ⚡' : ''}</td><td>${esc(p.category)}</td>
    <td class="r">${money(p.cost)}</td><td class="r">${p.askPrice ? 'Libre' : money(p.price)}</td><td class="r">${p.price > 0 ? Math.round((p.price - p.cost) / p.price * 100) + '%' : '-'}</td>
    <td class="r">${p.stock == null ? '∞' : nfmt.format(p.stock)}</td><td class="r">${p.stock == null ? '-' : p.minStock}</td>
    <td><span class="badge ${st}">${{ out: 'AGOTADO', low: 'STOCK BAJO', ok: 'OK', n: 'Sin control' }[st]}</span></td>
    <td style="white-space:nowrap"><button class="btn small" data-e="${p.id}">✏️</button> <button class="btn small danger" data-d="${p.id}">🗑</button></td></tr>`; }).join('')}</table></div>`;
  const b = $('#adminBody');
  $('#pq').addEventListener('input', e => { prodFilter.q = e.target.value; tabProducts().then(() => { const i = $('#pq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); });
  $('#pc').addEventListener('change', e => { prodFilter.cat = e.target.value; tabProducts(); });
  $('#pNew').addEventListener('click', () => productForm());
  $('#pBulk').addEventListener('click', () => bulkForm(cats));
  $('#pCsv').addEventListener('click', () => exportCsv('productos.csv', [['Código', 'Nombre', 'Categoría', 'Costo', 'Precio venta', 'Stock', 'Stock mínimo'], ...all.map(p => [p.code, p.name, p.category, p.cost, p.price, p.stock ?? '', p.minStock])]));
  const sa = $('#showAlert'); sa && sa.addEventListener('click', e => { e.preventDefault(); prodFilter.stock = 'alert'; tabProducts(); });
  const pa = $('#pAll'); pa && pa.addEventListener('click', () => { prodFilter.stock = ''; tabProducts(); });
  $$('[data-e]', b).forEach(x => x.addEventListener('click', () => productForm(all.find(p => p.id == x.dataset.e))));
  $$('[data-d]', b).forEach(x => x.addEventListener('click', async () => {
    const p = all.find(p => p.id == x.dataset.d);
    if (await confirmModal('Eliminar producto', `¿Eliminar "${p.name}"? Las ventas pasadas se conservan.`, 'Eliminar')) { await call('products:delete', p.id); toast('Producto eliminado'); tabProducts(); }
  }));
}
function productForm(p = {}) {
  const cats = [...new Set(S.products.map(x => x.category))];
  const m = openModal(`<h2>${p.id ? 'Editar' : 'Nuevo'} producto</h2><form id="pf">
    <label class="f">Código de barras / QR (vacío = autogenerado)</label><input type="text" name="code" value="${esc(p.code || '')}" autocomplete="off">
    <label class="f">Nombre *</label><input type="text" name="name" value="${esc(p.name || '')}" required>
    <label class="f">Categoría</label><input type="text" name="category" list="catl" value="${esc(p.category || '')}"><datalist id="catl">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <div class="grid2"><div><label class="f">Precio de costo</label><input type="number" step="any" min="0" name="cost" value="${p.cost ?? 0}"></div>
    <div><label class="f">Precio de venta</label><input type="number" step="any" min="0" name="price" value="${p.price ?? ''}"></div>
    <div><label class="f">Stock actual (vacío = sin control)</label><input type="number" step="any" name="stock" value="${p.stock ?? ''}"></div>
    <div><label class="f">Stock mínimo</label><input type="number" step="any" min="0" name="minStock" value="${p.minStock ?? 0}"></div></div>
    <label class="f"><input type="checkbox" name="quick" ${p.quick ? 'checked' : ''}> Botón de acceso rápido en la caja</label>
    <label class="f"><input type="checkbox" name="askPrice" ${p.askPrice ? 'checked' : ''}> Pedir el monto al vender (ej. Carga Virtual)</label>
    <div class="row"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  $('[name=name]', m.el).focus();
  $('#pf', m.el).addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(e.target); const o = { id: p.id };
    for (const [k, v] of f.entries()) o[k] = v; o.quick = f.has('quick'); o.askPrice = f.has('askPrice');
    try { await call('products:save', o); m.close(); toast('Producto guardado', 'ok'); tabProducts(); } catch (er) { toast(er.message, 'err', 4000); }
  });
}
function bulkForm(cats) {
  const m = openModal(`<h2>％ Aumento masivo de precios</h2><form id="bf">
    <label class="f">Aplicar a</label><select name="category"><option value="">TODO el inventario</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select>
    <label class="f">Porcentaje (usá negativo para descontar, ej. -10)</label><input type="number" step="any" name="percent" class="big-input" required>
    <label class="f">Redondear precio a</label><select name="roundTo"><option value="0">Sin redondeo</option><option value="10" selected>$ 10</option><option value="50">$ 50</option><option value="100">$ 100</option></select>
    <p style="color:var(--muted)">Se modifica solo el precio de venta (no el costo).</p>
    <div class="row"><button type="button" class="btn" data-close>Cancelar</button><button class="btn warn">Aplicar</button></div></form>`);
  $('[name=percent]', m.el).focus();
  $('#bf', m.el).addEventListener('submit', async e => {
    e.preventDefault(); const o = Object.fromEntries(new FormData(e.target));
    if (!await confirmModal('Confirmar', `¿Aplicar ${o.percent}% a ${o.category || 'todo el inventario'}?`, 'Aplicar')) return;
    try { const r = await call('products:bulkPrice', o); m.close(); toast(`${r.updated} productos actualizados`, 'ok'); tabProducts(); } catch (er) { toast(er.message, 'err'); }
  });
}

/* ---------- Historial de ventas ---------- */
async function tabSales() {
  const all = (await call('sales:list')).slice().reverse();
  $('#adminBody').innerHTML = `<div class="toolbar"><input id="sq" placeholder="Filtrar (producto, medio, fecha, #)…" style="width:300px"><button class="btn" id="sCsv">⬇ Exportar a Excel/CSV</button><span style="color:var(--muted)">${all.length} ventas</span></div>
  <div class="tw"><table><thead><tr><th>#</th><th>Fecha</th><th>Detalle</th><th>Medio</th><th class="r">Total</th><th class="r">Ganancia</th></tr></thead><tbody id="sRows"></tbody></table></div>`;
  const draw = q => {
    const t = norm(q);
    const rows = all.filter(s => !t || norm(`${s.id} ${fdate(s.date)} ${METHOD[s.method]} ${s.items.map(i => i.name).join(' ')}`).includes(t)).slice(0, 500);
    $('#sRows').innerHTML = rows.map(s => `<tr><td>${s.id}</td><td>${fdate(s.date)}</td><td>${esc(s.items.map(i => `${nfmt.format(i.qty)}× ${i.name}`).join(', '))}</td><td>${METHOD[s.method]}</td><td class="r"><b>${money(s.total)}</b></td><td class="r pos">${money(saleProfit(s))}</td></tr>`).join('');
  };
  draw(''); $('#sq').addEventListener('input', e => draw(e.target.value));
  $('#sCsv').addEventListener('click', () => exportCsv('ventas.csv', [['Ticket', 'Fecha', 'Medio de pago', 'Producto', 'Cantidad', 'Precio unit.', 'Costo unit.', 'Subtotal', 'Total ticket'],
    ...all.flatMap(s => s.items.map(i => [s.id, fdate(s.date), METHOD[s.method], i.name, i.qty, i.price, i.cost, i.qty * i.price, s.total]))]));
}

/* ---------- Cierres ---------- */
async function tabClosures() {
  const all = (await call('closures:list')).slice().reverse();
  const L = { perfect: '<span class="badge ok">PERFECTA</span>', over: '<span class="badge low">SOBRA</span>', short: '<span class="badge out">FALTA</span>' };
  $('#adminBody').innerHTML = `<div class="toolbar"><button class="btn" id="cCsv">⬇ Exportar a Excel/CSV</button></div>
  <div class="tw"><table><tr><th>#</th><th>Fecha cierre</th><th class="r">Tickets</th><th class="r">Efectivo</th><th class="r">MP / QR</th><th class="r">Transf./Tarj.</th><th class="r">Total</th><th class="r">Fondo</th><th class="r">Contado</th><th class="r">Diferencia</th><th>Estado</th><th>Obs.</th></tr>
  ${all.map(c => `<tr><td>${c.id}</td><td>${fdate(c.date)}</td><td class="r">${c.count}</td><td class="r">${money(c.cash)}</td><td class="r">${money(c.mp)}</td><td class="r">${money(c.card)}</td><td class="r"><b>${money(c.total)}</b></td><td class="r">${money(c.openingFloat)}</td><td class="r">${money(c.countedCash)}</td><td class="r ${c.difference < 0 ? 'neg' : c.difference > 0 ? 'pos' : ''}">${money(c.difference)}</td><td>${L[c.status]}</td><td>${esc(c.note)}</td></tr>`).join('') || '<tr><td colspan=12 class="empty">Todavía no hay cierres</td></tr>'}</table></div>`;
  $('#cCsv').addEventListener('click', () => exportCsv('cierres-de-caja.csv', [['#', 'Fecha', 'Tickets', 'Efectivo', 'Mercado Pago/QR', 'Transferencia/Tarjeta', 'Total', 'Fondo inicial', 'Efectivo esperado', 'Efectivo contado', 'Diferencia', 'Estado', 'Observaciones'],
    ...all.map(c => [c.id, fdate(c.date), c.count, c.cash, c.mp, c.card, c.total, c.openingFloat, c.expectedCash, c.countedCash, c.difference, c.status, c.note])]));
}

/* ---------- Configuración ---------- */
async function tabSettings() {
  const s = await call('settings:get'); const lic = await call('license:status');
  $('#adminBody').innerHTML = `<div class="panels"><div class="panel"><h3>Negocio</h3><form id="sf">
    <label class="f">Nombre del kiosco</label><input type="text" name="shopName" value="${esc(s.shopName)}" style="width:100%">
    <label class="f">Fondo de caja sugerido ($)</label><input type="number" step="any" min="0" name="defaultFloat" value="${s.defaultFloat}" style="width:100%">
    <h3 style="margin-top:20px">Cambiar PIN de Admin</h3>
    <label class="f">PIN actual</label><input type="password" name="currentPin" inputmode="numeric" style="width:100%">
    <label class="f">PIN nuevo (4 a 8 números)</label><input type="password" name="newPin" inputmode="numeric" style="width:100%">
    <div class="row"><button class="btn primary">Guardar cambios</button></div></form></div>
  <div class="panel"><h3>Datos y licencia</h3><p>ID de máquina: <b>${esc(lic.machineId)}</b> — ✔ Activado</p>
    <p style="color:var(--muted)">Los datos de prueba (ventas de ejemplo) sirven para probar las estadísticas. Cuando empieces a usar el sistema de verdad, borralos. Los productos se conservan.</p>
    <button class="btn danger" id="clrDemo">🧹 Borrar ventas y cierres de prueba</button></div></div>`;
  $('#sf').addEventListener('submit', async e => {
    e.preventDefault(); const o = Object.fromEntries(new FormData(e.target));
    try { await call('settings:save', o); $('#shopName').textContent = o.shopName; toast('Configuración guardada', 'ok'); e.target.currentPin.value = e.target.newPin.value = ''; } catch (er) { toast(er.message, 'err', 4000); }
  });
  $('#clrDemo').addEventListener('click', async () => { if (await confirmModal('Borrar datos de prueba', 'Se eliminarán las ventas de ejemplo. Los productos NO se borran.', 'Borrar')) { await call('data:clearDemo'); toast('Datos de prueba eliminados', 'ok'); } });
}
