'use strict';
// Lógica de licencias compartida por la app y el generador de claves (tools/keygen.js).
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin 0,O,1,I

function toBase32(buf, len) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

function rawMachineSource() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
      if (m) return 'win:' + m[1];
    } else if (fs.existsSync('/etc/machine-id')) {
      return 'lin:' + fs.readFileSync('/etc/machine-id', 'utf8').trim();
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      const m = out.match(/"IOPlatformUUID" = "([^"]+)"/);
      if (m) return 'mac:' + m[1];
    }
  } catch (e) { /* cae al fallback */ }
  const macs = Object.values(os.networkInterfaces()).flat()
    .filter(i => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00').map(i => i.mac).sort();
  return 'fb:' + os.hostname() + '|' + (os.cpus()[0] || {}).model + '|' + macs.join(',');
}

/** ID de máquina estable con formato KSC-XXXX-XXXX (derivado del hardware/SO). */
function getMachineId() {
  const h = crypto.createHash('sha256').update('KSC-MID|' + rawMachineSource()).digest();
  const s = toBase32(h, 8);
  return `KSC-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

function normalizeId(id) { return String(id || '').trim().toUpperCase().replace(/\s+/g, ''); }
function normalizeKey(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/** Clave de activación (XXXX-XXXX-XXXX-XXXX) para un ID de máquina dado. */
function generateKey(machineId, secret) {
  if (!secret) throw new Error('Falta el secreto de licencias');
  const mac = crypto.createHmac('sha256', secret).update('KSC1|' + normalizeId(machineId)).digest();
  const s = toBase32(mac, 16);
  return [0, 4, 8, 12].map(i => s.slice(i, i + 4)).join('-');
}

function verifyKey(machineId, key, secret) {
  const expected = normalizeKey(generateKey(machineId, secret));
  const given = normalizeKey(key);
  if (expected.length !== given.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

module.exports = { getMachineId, generateKey, verifyKey, normalizeId, normalizeKey };
