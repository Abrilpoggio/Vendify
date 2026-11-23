#!/usr/bin/env node
'use strict';
// GENERADOR DE CLAVES DEL VENDEDOR - NO distribuir a los clientes.
// Uso:  node tools/keygen.js KSC-XXXX-XXXX      (o sin argumento para modo interactivo)
const readline = require('readline');
const { generateKey, normalizeId } = require('../src/license');
let secret;
try { secret = require('../src/license-secret'); }
catch (e) { console.error('Falta src/license-secret.js. Ejecutá: npm run gen-secret'); process.exit(1); }

const valid = id => /^KSC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id);
function emit(raw) {
  const id = normalizeId(raw);
  if (!valid(id)) { console.log('  ✗ ID inválido. Formato esperado: KSC-XXXX-XXXX'); return; }
  console.log(`\n  ID de máquina : ${id}\n  CLAVE         : ${generateKey(id, secret)}\n`);
}
if (process.argv[2]) { emit(process.argv[2]); process.exit(0); }
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('=== Vendify Kiosco - Generador de claves (Ctrl+C para salir) ===');
const ask = () => rl.question('ID de máquina del cliente: ', a => { if (a.trim()) emit(a); ask(); });
ask();
