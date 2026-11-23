# Vendify Kiosco — POS y gestión offline para Windows

Electron + datos en un JSON local (`%APPDATA%/Vendify Kiosco/vendify-data.json`, con respaldo `.bak`). 100 % offline.

## Desarrollo
```bash
npm install
npm run gen-secret     # crea src/license-secret.js (NO se sube a git). GUARDALO en un backup
npm start              # abrir la app
npm test               # pruebas de lógica
```

## Generar el instalador .exe
- En Windows: `npm install && npm run dist` → `dist/Vendify-Kiosco-Setup-1.0.0.exe`
- Sin Windows: workflow de GitHub Actions *Build Windows installer* (Actions → Run workflow).
  Antes creá el secret `LICENSE_SECRET` con el contenido de tu secreto
  (el string dentro de `src/license-secret.js`).

## Vender una licencia
1. El cliente instala y abre el programa → ve su **ID de Máquina** `KSC-XXXX-XXXX`.
2. Te lo manda por WhatsApp y vos ejecutás: `node tools/keygen.js KSC-XXXX-XXXX` (o `npm run keygen` interactivo).
3. Le pasás la clave `XXXX-XXXX-XXXX-XXXX`. Queda activado de forma permanente en esa PC.

La clave es HMAC-SHA256(secreto, ID). El ID sale del GUID de la máquina (Windows), así que copiar la carpeta de datos o la clave a otra PC no funciona.
**Nunca entregues `tools/` ni `src/license-secret.js`.** Si cambiás el secreto, todas las claves ya vendidas dejan de servir.

> Límite honesto: ningún sistema 100 % offline es inviolable; un atacante experto puede modificar el código del programa. Esto frena la copia casual (el 99 % de los casos). Para endurecer: ofuscar el JS (ej. `javascript-obfuscator`) o usar licencias con servidor.

## Uso
- Caja abierta por defecto. Lector USB: escanear directo (sin foco en ningún campo). F1 buscar · F2 efectivo · F3 MP/QR · F4 transf./tarjeta · F8 monto libre · Supr vaciar · Esc cancelar.
- 🔒 Modo Admin: PIN por defecto **1234** (cambiarlo en Configuración). Los permisos se validan en el proceso principal, no solo en la interfaz.
- Datos de prueba: productos y ~30 días de ventas de ejemplo. Borrarlas en Configuración antes de usar en serio.
- Temas: oscuro, alto contraste, claro (botón 🌓).
