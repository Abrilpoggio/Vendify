'use strict';
// Crea src/license-secret.js con un secreto aleatorio (NO se sube a git).
// Uso: node tools/gen-secret.js [--if-missing]   | o variable LICENSE_SECRET para fijarlo (CI)
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const file = path.join(__dirname, '..', 'src', 'license-secret.js');
if (process.argv.includes('--if-missing') && fs.existsSync(file)) { console.log('Secreto existente, se conserva.'); process.exit(0); }
if (fs.existsSync(file) && !process.argv.includes('--force') && !process.env.LICENSE_SECRET) {
  console.error('Ya existe src/license-secret.js. Usá --force para reemplazarlo (invalida TODAS las claves ya vendidas).'); process.exit(1);
}
const secret = process.env.LICENSE_SECRET || crypto.randomBytes(32).toString('hex');
fs.writeFileSync(file, `'use strict';\nmodule.exports = ${JSON.stringify(secret)};\n`);
console.log('Secreto escrito en src/license-secret.js. GUARDALO en un lugar seguro (backup).');
