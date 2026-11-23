'use strict';
// Almacenamiento local persistente en un archivo JSON (escritura atómica + respaldo).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hashPin = (pin, salt) => crypto.createHash('sha256').update(salt + ':' + pin).digest('hex');

// [código, nombre, categoría, costo, precio, stock, mínimo, rápido, pedirPrecio]
const SEED = [
  ['7790895000997', 'Coca-Cola 500ml', 'Bebidas', 900, 1400, 36, 12],
  ['7790895001000', 'Coca-Cola 1.5L', 'Bebidas', 1700, 2500, 24, 8],
  ['7790895002007', 'Sprite 500ml', 'Bebidas', 850, 1350, 20, 10],
  ['7790895003004', 'Fanta 500ml', 'Bebidas', 850, 1350, 4, 10],
  ['7792170000012', 'Agua Mineral 500ml', 'Bebidas', 500, 900, 40, 12],
  ['7791813420019', 'Powerade 500ml', 'Bebidas', 1000, 1600, 15, 6],
  ['7790070411015', 'Cerveza Quilmes 1L', 'Bebidas', 1800, 2800, 18, 6],
  ['7790040100018', 'Jugo Cepita 1L', 'Bebidas', 1100, 1800, 0, 6],
  ['7790040200015', 'Alfajor Jorgito Chocolate', 'Golosinas', 450, 800, 50, 20],
  ['7790040300012', 'Alfajor Havanna', 'Golosinas', 1300, 2000, 12, 6],
  ['7790040400019', 'Alfajor Terrabusi Triple', 'Golosinas', 600, 1000, 30, 10],
  ['7790040500016', 'Alfajor Guaymallén', 'Golosinas', 250, 450, 60, 24],
  ['7790040600013', 'Chocolate Milka 55g', 'Golosinas', 1200, 1900, 20, 8],
  ['7790040700010', 'Chicle Beldent', 'Golosinas', 350, 650, 35, 12],
  ['7790040800017', 'Chupetín Pico Dulce', 'Golosinas', 100, 250, 80, 30],
  ['7790040900014', 'Turrón Arcor', 'Golosinas', 150, 300, 70, 20],
  ['7790041000010', 'Pastillas Menthoplus', 'Golosinas', 400, 700, 25, 10],
  ['7790270000011', 'Galletitas Oreo', 'Galletitas', 1000, 1600, 22, 8],
  ['7790270000028', 'Galletitas Pepitos', 'Galletitas', 1100, 1700, 18, 8],
  ['7790270000035', 'Galletitas Criollitas', 'Galletitas', 700, 1200, 25, 10],
  ['7790270000042', 'Galletitas Express', 'Galletitas', 600, 1000, 3, 10],
  ['7790270000059', 'Galletitas Rumba', 'Galletitas', 650, 1100, 20, 8],
  ['7790310000013', 'Papas Lays Clásicas', 'Snacks', 1300, 2100, 20, 8],
  ['7790310000020', 'Doritos 90g', 'Snacks', 1400, 2300, 14, 6],
  ['7790310000037', 'Palitos Salados 100g', 'Snacks', 600, 1000, 25, 8],
  ['7790310000044', 'Maní Salado 80g', 'Snacks', 500, 900, 17, 6],
  ['7790420000014', 'Cigarrillos Marlboro Box', 'Cigarrillos', 3200, 3900, 30, 10],
  ['7790420000021', 'Cigarrillos Lucky Strike', 'Cigarrillos', 2900, 3500, 25, 10],
  ['7790420000038', 'Encendedor BIC', 'Varios', 700, 1500, 40, 10],
  ['7790420000045', 'Pilas AA x2', 'Varios', 1500, 2500, 12, 4],
  ['7790420000052', 'Pañuelos Descartables', 'Varios', 400, 800, 20, 8],
  // Accesos rápidos (sin código de barras)
  ['QK-CARAMELOS', 'Caramelos sueltos', 'Sueltos', 20, 50, null, 0, true, false],
  ['QK-PAN', 'Pan', 'Sueltos', 1200, 2200, null, 0, true, false],
  ['QK-BOLSA', 'Bolsa', 'Sueltos', 30, 100, null, 0, true, false],
  ['QK-HIELO', 'Hielo', 'Sueltos', 900, 1800, null, 0, true, false],
  ['QK-CARGA', 'Carga Virtual', 'Servicios', 0, 0, null, 0, true, true],
];

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function seedProducts(data) {
  SEED.forEach((r, i) => data.products.push({
    id: i + 1, code: r[0], name: r[1], category: r[2], cost: r[3], price: r[4],
    stock: r[5], minStock: r[6] || 0, quick: !!r[7], askPrice: !!r[8], active: true,
  }));
  data.seq.product = SEED.length + 1;
}

/** Ventas de ejemplo de los últimos 30 días para ver estadísticas al instante. */
function seedDemoSales(data, now = new Date()) {
  const rnd = mulberry(42);
  const sellable = data.products.filter(p => p.price > 0);
  const hourW = [0,0,0,0,0,0,1,3,4,3,2,3,5,4,2,2,3,5,7,8,6,4,1,0];
  const pickHour = () => { const tot = hourW.reduce((a, b) => a + b); let r = rnd() * tot; for (let h = 0; h < 24; h++) { r -= hourW[h]; if (r <= 0) return h; } return 12; };
  const sales = [];
  for (let d = 30; d >= 0; d--) {
    const day = new Date(now); day.setDate(day.getDate() - d); day.setHours(0, 0, 0, 0);
    const n = 10 + Math.floor(rnd() * 14) + (day.getDay() === 5 || day.getDay() === 6 ? 6 : 0);
    for (let i = 0; i < n; i++) {
      const dt = new Date(day); dt.setHours(pickHour(), Math.floor(rnd() * 60), Math.floor(rnd() * 60));
      if (dt > now) continue;
      const items = []; const k = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) {
        const p = sellable[Math.floor(Math.pow(rnd(), 1.6) * sellable.length)];
        const ex = items.find(x => x.pid === p.id);
        if (ex) ex.qty++; else items.push({ pid: p.id, name: p.name, qty: 1 + (rnd() < .2 ? 1 : 0), price: p.price, cost: p.cost });
      }
      const total = items.reduce((s, x) => s + x.qty * x.price, 0);
      const r = rnd(); const method = r < .55 ? 'cash' : r < .8 ? 'mp' : 'card';
      sales.push({ date: dt.toISOString(), items, total, method, paid: total, change: 0, demo: true });
    }
  }
  sales.sort((a, b) => a.date.localeCompare(b.date));
  sales.forEach(s => { s.id = data.seq.sale++; });
  data.sales.push(...sales);
}

function freshData() {
  const salt = crypto.randomBytes(8).toString('hex');
  const data = {
    version: 1,
    settings: { shopName: 'Mi Kiosco', pinSalt: salt, pinHash: hashPin('1234', salt), defaultFloat: 5000 },
    products: [], sales: [], closures: [],
    seq: { product: 1, sale: 1, closure: 1 },
    lastClosureAt: null,
  };
  seedProducts(data);
  seedDemoSales(data);
  // Los datos de prueba de días anteriores no pertenecen al turno actual
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  data.lastClosureAt = new Date(startToday.getTime() - 1000).toISOString();
  return data;
}

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = this._load();
  }
  _load() {
    for (const f of [this.file, this.file + '.bak']) {
      try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); }
      catch (e) { console.error('No se pudo leer', f, e.message); }
    }
    const d = freshData(); this.data = d; this.save(); return d;
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    if (fs.existsSync(this.file)) { try { fs.copyFileSync(this.file, this.file + '.bak'); } catch (e) {} }
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, hashPin, freshData };
