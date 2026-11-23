'use strict';
// Reglas de negocio. El cajero solo puede vender y cerrar caja; todo lo demás exige PIN de admin.
const crypto = require('crypto');
const { hashPin } = require('./db');

const METHODS = ['cash', 'mp', 'card'];
const num = (v, def = 0) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : def; };
const money = n => Math.round(n * 100) / 100;

function createApi(store, license) {
  let admin = false;
  const d = () => store.data;
  const need = () => { if (!admin) throw new Error('Requiere modo Admin'); };

  function shiftSales() {
    const since = d().lastClosureAt || '';
    return d().sales.filter(s => s.date > since);
  }
  function summarize(sales) {
    const by = { cash: 0, mp: 0, card: 0 };
    let total = 0;
    sales.forEach(s => { by[s.method] += s.total; total += s.total; });
    return { cash: money(by.cash), mp: money(by.mp), card: money(by.card), total: money(total), count: sales.length };
  }

  const H = {
    // ---- licencia
    'license:status'() { return { machineId: license.machineId, activated: license.isActivated() }; },
    'license:activate'(key) { return { ok: license.activate(key) }; },

    // ---- público (cajero)
    'config:get'() { return { shopName: d().settings.shopName, admin }; },
    'products:list'() {
      return d().products.filter(p => p.active).map(p => {
        if (admin) return p;
        const { cost, ...rest } = p; return rest;
      });
    },
    'sale:create'({ items, method, paid }) {
      if (!METHODS.includes(method)) throw new Error('Medio de pago inválido');
      if (!Array.isArray(items) || !items.length) throw new Error('El ticket está vacío');
      const lines = items.map(it => {
        const qty = num(it.qty);
        if (!(qty > 0)) throw new Error('Cantidad inválida');
        if (it.pid) {
          const p = d().products.find(x => x.id === it.pid && x.active);
          if (!p) throw new Error('Producto inexistente: ' + it.name);
          const price = p.askPrice ? num(it.price) : p.price; // el cajero no puede cambiar precios de catálogo
          if (!(price > 0)) throw new Error('Precio inválido: ' + p.name);
          return { pid: p.id, name: p.name, qty, price, cost: p.cost };
        }
        const price = num(it.price);
        if (!(price > 0)) throw new Error('Monto inválido');
        return { pid: null, name: String(it.name || 'Varios').slice(0, 60), qty, price, cost: 0 };
      });
      const total = money(lines.reduce((s, l) => s + l.qty * l.price, 0));
      let p = total, change = 0;
      if (method === 'cash') {
        p = paid === '' || paid == null ? total : num(paid);
        if (p < total) throw new Error('El pago es menor al total');
        change = money(p - total);
      }
      lines.forEach(l => { if (l.pid) { const pr = d().products.find(x => x.id === l.pid); if (pr.stock != null) pr.stock = Math.max(0, money(pr.stock - l.qty)); } });
      const sale = { id: d().seq.sale++, date: new Date().toISOString(), items: lines, total, method, paid: p, change };
      d().sales.push(sale); store.save();
      return sale;
    },
    'shift:summary'() {
      const s = shiftSales();
      return { ...summarize(s), since: d().lastClosureAt, defaultFloat: d().settings.defaultFloat };
    },
    'shift:close'({ openingFloat, counted, note }) {
      const s = shiftSales(); const sum = summarize(s);
      const fund = num(openingFloat), cnt = num(counted);
      if (fund < 0 || cnt < 0) throw new Error('Los montos no pueden ser negativos');
      const expected = money(fund + sum.cash);
      const diff = money(cnt - expected);
      const c = {
        id: d().seq.closure++, date: new Date().toISOString(), from: d().lastClosureAt, ...sum,
        openingFloat: fund, expectedCash: expected, countedCash: cnt, difference: diff,
        status: diff === 0 ? 'perfect' : diff > 0 ? 'over' : 'short', note: String(note || '').slice(0, 200),
      };
      d().closures.push(c); d().lastClosureAt = c.date; store.save();
      return c;
    },

    // ---- admin
    'admin:login'(pin) {
      const s = d().settings;
      const ok = hashPin(String(pin), s.pinSalt) === s.pinHash;
      if (ok) admin = true;
      return { ok };
    },
    'admin:lock'() { admin = false; return { ok: true }; },
    'products:save'(p) {
      need();
      const name = String(p.name || '').trim(); if (!name) throw new Error('Falta el nombre');
      const rec = {
        name, category: String(p.category || 'General').trim() || 'General',
        cost: Math.max(0, num(p.cost)), price: Math.max(0, num(p.price)),
        stock: p.stock === '' || p.stock == null ? null : num(p.stock),
        minStock: Math.max(0, num(p.minStock)), quick: !!p.quick, askPrice: !!p.askPrice,
      };
      let code = String(p.code || '').trim();
      if (!code) code = 'KSC' + String(d().seq.product).padStart(6, '0');
      if (d().products.some(x => x.active && x.code === code && x.id !== p.id)) throw new Error('Ya existe un producto con ese código');
      rec.code = code;
      if (!rec.askPrice && rec.price <= 0) throw new Error('El precio de venta debe ser mayor a 0');
      if (p.id) {
        const ex = d().products.find(x => x.id === p.id); if (!ex) throw new Error('Producto inexistente');
        Object.assign(ex, rec);
      } else d().products.push({ id: d().seq.product++, active: true, ...rec });
      store.save(); return { ok: true };
    },
    'products:delete'(id) {
      need(); const p = d().products.find(x => x.id === id);
      if (p) { p.active = false; store.save(); } // baja lógica: conserva el historial de ventas
      return { ok: true };
    },
    'products:bulkPrice'({ category, percent, roundTo }) {
      need(); const pc = num(percent);
      if (!pc || pc <= -100) throw new Error('Porcentaje inválido');
      let n = 0;
      d().products.forEach(p => {
        if (!p.active || p.askPrice || p.price <= 0) return;
        if (category && p.category !== category) return;
        let np = p.price * (1 + pc / 100);
        const r = num(roundTo, 0);
        np = r > 0 ? Math.round(np / r) * r : Math.round(np * 100) / 100;
        p.price = Math.max(0, np); n++;
      });
      store.save(); return { updated: n };
    },
    'sales:list'() { need(); return d().sales; },
    'closures:list'() { need(); return d().closures; },
    'settings:get'() { need(); const { shopName, defaultFloat } = d().settings; return { shopName, defaultFloat }; },
    'settings:save'({ shopName, defaultFloat, currentPin, newPin }) {
      need(); const s = d().settings;
      if (shopName != null) s.shopName = String(shopName).trim().slice(0, 40) || 'Mi Kiosco';
      if (defaultFloat != null) s.defaultFloat = Math.max(0, num(defaultFloat));
      if (newPin) {
        if (!/^\d{4,8}$/.test(String(newPin))) throw new Error('El PIN debe tener de 4 a 8 números');
        if (hashPin(String(currentPin), s.pinSalt) !== s.pinHash) throw new Error('PIN actual incorrecto');
        s.pinSalt = crypto.randomBytes(8).toString('hex'); s.pinHash = hashPin(String(newPin), s.pinSalt);
      }
      store.save(); return { ok: true };
    },
    'data:clearDemo'() { // borra ventas/cierres de prueba, conserva productos
      need(); d().sales = d().sales.filter(s => !s.demo); d().closures = d().closures.filter(c => !c.demo);
      store.save(); return { ok: true };
    },
  };

  return { handle(channel, arg) { const f = H[channel]; if (!f) throw new Error('Canal desconocido: ' + channel); return f(arg); } };
}

module.exports = { createApi };
