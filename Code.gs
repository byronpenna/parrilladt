/**
 * Backend de Toma de Pedidos - se pega en el editor de Apps Script
 * de una Google Sheet (Extensiones > Apps Script).
 *
 * Pestañas que este script administra dentro de la misma hoja:
 *   - Pedidos: registro de cada pedido (lo que ve la pantalla de cocina)
 *   - Menu: catálogo de productos (item, categoria, precio, activo)
 *   - Clientes: catálogo de clientes para el buscador de la tablet
 *
 * Ejecuta la función setup() UNA VEZ desde el editor para crear las
 * pestañas y precargar el menú. Luego despliega como Web App
 * (ver README.md).
 */

const SHEET_PEDIDOS = 'Pedidos';
const SHEET_MENU = 'Menu';
const SHEET_CLIENTES = 'Clientes';

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_PEDIDOS, ['ID', 'Fecha', 'Hora', 'Cliente', 'Nota', 'Items', 'Total', 'Estado', 'Actualizado']);
  ensureSheet_(ss, SHEET_MENU, ['Item', 'Categoria', 'Precio', 'Activo']);
  ensureSheet_(ss, SHEET_CLIENTES, ['Nombre', 'Telefono']);

  const menuSheet = ss.getSheetByName(SHEET_MENU);
  if (menuSheet.getLastRow() < 2) {
    menuSheet.getRange(2, 1, 7, 4).setValues([
      ['Carne asada', 'Platos fuertes', 4.5, true],
      ['Costilla', 'Platos fuertes', 4.5, true],
      ['Plato de chicharrones', 'Platos fuertes', 4.5, true],
      ['Sopa de gallina', 'Sopas', 3, true],
      ['Gallina asada', 'Platos fuertes', 5, true],
      ['Hatrick (3 carnes)', 'Combos', 9, true],
      ['Parrillada campeona', 'Combos', 7, true],
    ]);
  }
  SpreadsheetApp.flush();
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doGet(e) {
  const action = e.parameter.action;
  let payload;
  try {
    if (action === 'menu') payload = getMenu_();
    else if (action === 'clientes') payload = getClientes_();
    else if (action === 'pedidos') payload = getPedidos_(e.parameter);
    else payload = { error: 'accion desconocida' };
  } catch (err) {
    payload = { error: err.message };
  }
  return jsonOut_(payload);
}

function doPost(e) {
  let payload;
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action === 'crear_pedido') payload = crearPedido_(body);
    else if (action === 'actualizar_estado') payload = actualizarEstado_(body);
    else if (action === 'agregar_cliente') payload = agregarCliente_(body);
    else payload = { error: 'accion desconocida' };
  } catch (err) {
    payload = { error: err.message };
  }
  return jsonOut_(payload);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getMenu_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MENU);
  const values = sh.getDataRange().getValues();
  return values.slice(1)
    .filter(r => r[0] && r[3] !== false)
    .map(r => ({ item: r[0], categoria: r[1], precio: Number(r[2]) }));
}

function getClientes_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLIENTES);
  const values = sh.getDataRange().getValues();
  return values.slice(1)
    .filter(r => r[0])
    .map(r => ({ nombre: r[0], telefono: r[1] || '' }));
}

function getPedidos_(params) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEDIDOS);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  let pedidos = values.slice(1)
    .filter(r => r[0])
    .map(r => {
      const o = {};
      headers.forEach((h, i) => (o[h] = r[i]));
      return o;
    });

  if (params && params.activos === '1') {
    pedidos = pedidos.filter(o => o.Estado !== 'Entregado');
  }

  pedidos.sort((a, b) => new Date(a.Fecha + ' ' + a.Hora) - new Date(b.Fecha + ' ' + b.Hora));
  return pedidos;
}

function crearPedido_(body) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEDIDOS);
  const now = new Date();
  const tz = Session.getScriptTimeZone();
  const id = Utilities.formatDate(now, tz, 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
  const fecha = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const hora = Utilities.formatDate(now, tz, 'HH:mm:ss');
  const items = body.items || [];
  const itemsTexto = items.map(it => `${it.cantidad}x ${it.item}`).join(', ');
  const total = items.reduce((s, it) => s + it.cantidad * it.precio, 0);

  sh.appendRow([id, fecha, hora, body.cliente || 'Cliente rápido', body.nota || '', itemsTexto, total, 'Pendiente', hora]);
  return { ok: true, id: id };
}

function actualizarEstado_(body) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_PEDIDOS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(body.id)) {
      sh.getRange(i + 1, 8).setValue(body.estado); // columna Estado
      sh.getRange(i + 1, 9).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm:ss')); // Actualizado
      return { ok: true };
    }
  }
  return { ok: false, error: 'pedido no encontrado' };
}

function agregarCliente_(body) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_CLIENTES);
  const values = sh.getDataRange().getValues();
  const existe = values.slice(1).some(r => String(r[0]).toLowerCase() === String(body.nombre).toLowerCase());
  if (!existe) sh.appendRow([body.nombre, body.telefono || '']);
  return { ok: true };
}
