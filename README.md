# Toma de Pedidos - Cancha

Sistema básico de toma de pedidos que guarda todo en una Google Sheet
(sin base de datos). Pensado para usarse en una **tablet** (mesero toma el
pedido) y visualizarse en un **televisor en cocina** (pantalla en vivo).

## Archivos

- `Code.gs` — backend, se pega en Apps Script.
- `index.html` — pantalla para la tablet (tomar pedidos).
- `cocina.html` — pantalla para el TV de cocina (pedidos en vivo).
- `styles.css` — estilo visual (verde/blanco/naranja, tipo cancha).
- `config.js` — aquí va la URL de tu backend una vez desplegado.

## 1. Crear la Google Sheet

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
   Nómbrala, por ejemplo, "Pedidos Cancha".
2. Menú **Extensiones > Apps Script**.
3. Borra el contenido de `Code.gs` que aparece por defecto y pega el
   contenido del archivo `Code.gs` de esta carpeta.
4. Guarda (ícono de disco o Ctrl/Cmd+S).

## 2. Preparar las pestañas y el menú

1. En el editor de Apps Script, arriba selecciona la función `setup` en el
   desplegable y presiona **Ejecutar**.
2. La primera vez te pedirá autorización: acepta los permisos (es tu propia
   hoja, es seguro).
3. Vuelve a la Sheet: deberían aparecer 3 pestañas nuevas: `Pedidos`,
   `Menu` (ya con tus 7 productos cargados) y `Clientes` (vacía).

Puedes editar precios o agregar/quitar productos directamente en la
pestaña `Menu` en cualquier momento (columna `Activo` en `FALSE` lo oculta
de la tablet sin borrarlo). Lo mismo con `Clientes`: puedes precargar
nombres ahí para que aparezcan en el buscador de la tablet.

## 3. Publicar el backend (Web App)

1. En Apps Script, botón **Implementar > Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:
   - Ejecutar como: **Yo (tu correo)**
   - Quién tiene acceso: **Cualquier usuario**
4. Presiona **Implementar** y autoriza de nuevo si lo pide.
5. Copia la **URL de la aplicación web** (termina en `/exec`).

## 4. Conectar el frontend

1. Abre `config.js` en esta carpeta.
2. Reemplaza `PEGA_AQUI_TU_URL_DE_APPS_SCRIPT` por la URL que copiaste.

## 5. Usarlo

- **Tablet (mesero):** abre `index.html` en el navegador de la tablet
  (Chrome). Puedes dejarla como acceso directo en pantalla de inicio.
- **TV de cocina:** conecta un mini PC / Chromecast con navegador / stick
  Android a la TV y abre `cocina.html` en pantalla completa (F11 en
  Chrome, o modo kiosko). Se refresca sola cada 6 segundos.

### Flujo de un pedido

1. En la tablet: buscas al cliente (autocompletado desde la pestaña
   `Clientes`) o presionas **"Cliente rápido"** para generar un nombre
   temporal al instante (ej. `Rápido-K3F`) cuando no hay tiempo de
   buscar/escribir. Luego, si quieres asociarlo al cliente real, solo
   edita la celda `Cliente` en la pestaña `Pedidos` de la hoja.
2. Agregas productos con los botones **+ / −**, escribes una nota si hace
   falta (ej. "sin cebolla") y presionas **Enviar a cocina**.
3. El pedido aparece de inmediato en el TV de cocina, columna
   **Pendiente**.
4. En el TV, tocar una tarjeta la avanza de estado:
   `Pendiente → En preparación → Listo → Entregado`.
   Al llegar a "Entregado" desaparece del TV (ya no está activo), pero
   sigue registrado en la pestaña `Pedidos` de la hoja.

### Sin conexión

Si la tablet se queda sin wifi al enviar un pedido, éste se guarda
localmente y el sistema reintenta enviarlo solo cada 15 segundos hasta
que haya conexión — no se pierde el pedido.

## Notas

- No se necesita ninguna base de datos: todo vive en la Google Sheet.
- Los tres archivos HTML son estáticos: puedes abrirlos directo desde el
  archivo, o subirlos a un hosting simple (GitHub Pages, Netlify, etc.)
  si prefieres tener una URL fija para la tablet y el TV.
- Colores: verde (césped), blanco (líneas de cancha) y naranja (acentos /
  botones de acción), como pediste.
