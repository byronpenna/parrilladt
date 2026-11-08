import { Pool } from 'pg';
import { getPool } from './db';

interface PedidoItemRow {
  id: string;
  itemNombre: string;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
}

interface PedidoRow {
  id: string;
  cliente_nombre: string;
  nota: string | null;
  estado: string;
  total: string;
  created_at: Date;
  updated_at: Date;
  items: PedidoItemRow[];
  rider_id: string | null;
  rider_nombre: string | null;
  costo_delivery: string;
  metodo_pago: string;
  hora_entrega: Date | null;
  historial: { estado: string; motivo: string | null; createdAt: string }[];
  cliente_lat: number | string | null;
  cliente_lng: number | string | null;
  cliente_direccion: string | null;
  distancia_km: string | null;
  motivo_cancelacion: string | null;
  pagado: boolean;
}

const RADIO_TIERRA_KM = 6371;

// El negocio opera en El Salvador (config_negocio apunta a San Salvador).
// "Hoy" para efectos de caja se define en esta zona, no en UTC: la RDS
// corre en UTC y el negocio abre de noche, así que CURRENT_DATE a secas
// adelantaría la fecha casi todas las horas de operación.
const NEGOCIO_TZ = 'America/El_Salvador';

// Distancia en línea recta (no la de ruta real), suficiente para un
// estimado de "más o menos cuántos kilómetros son".
function distanciaHaversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RADIO_TIERRA_KM * c;
}

function shapePedido(row: PedidoRow) {
  const items = row.items.map((it) => ({
    id: it.id,
    itemNombre: it.itemNombre,
    cantidad: it.cantidad,
    precioUnitario: Number(it.precioUnitario),
    subtotal: Number(it.subtotal),
  }));
  return {
    id: row.id,
    clienteNombre: row.cliente_nombre,
    nota: row.nota,
    estado: row.estado,
    total: Number(row.total),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    items,
    itemsTexto: items.map((it) => `${it.cantidad}x ${it.itemNombre}`).join(', '),
    riderId: row.rider_id,
    riderNombre: row.rider_nombre,
    costoDelivery: Number(row.costo_delivery),
    metodoPago: row.metodo_pago,
    horaEntrega: row.hora_entrega ? new Date(row.hora_entrega).toISOString() : null,
    historialEstados: (row.historial || []).map((h) => ({
      estado: h.estado,
      motivo: h.motivo,
      createdAt: new Date(h.createdAt).toISOString(),
    })),
    clienteLat: row.cliente_lat !== null ? Number(row.cliente_lat) : null,
    clienteLng: row.cliente_lng !== null ? Number(row.cliente_lng) : null,
    clienteDireccion: row.cliente_direccion,
    distanciaKm: row.distancia_km !== null ? Number(row.distancia_km) : null,
    motivoCancelacion: row.motivo_cancelacion,
    pagado: row.pagado,
  };
}

const PEDIDO_SELECT = `
  SELECT p.id, p.cliente_nombre, p.nota, p.estado, p.total, p.created_at, p.updated_at,
    p.rider_id, r.nombre AS rider_nombre, p.costo_delivery, p.metodo_pago, p.hora_entrega,
    p.cliente_lat, p.cliente_lng, p.cliente_direccion, p.distancia_km, p.motivo_cancelacion, p.pagado,
    (
      SELECT COALESCE(
        json_agg(json_build_object('estado', h.estado, 'motivo', h.motivo, 'createdAt', h.created_at) ORDER BY h.created_at),
        '[]'
      )
      FROM pedido_estado_historial h
      WHERE h.pedido_id = p.id
    ) AS historial,
    COALESCE(
      json_agg(
        json_build_object(
          'id', pi.id,
          'itemNombre', pi.item_nombre,
          'cantidad', pi.cantidad,
          'precioUnitario', pi.precio_unitario,
          'subtotal', pi.subtotal
        ) ORDER BY pi.id
      ) FILTER (WHERE pi.id IS NOT NULL),
      '[]'
    ) AS items
  FROM pedidos p
  LEFT JOIN pedido_items pi ON pi.pedido_id = p.id
  LEFT JOIN riders r ON r.id = p.rider_id
`;

const PEDIDO_GROUP_BY = 'GROUP BY p.id, r.nombre';

async function fetchPedido(pool: Pool, id: string) {
  const res = await pool.query(`${PEDIDO_SELECT} WHERE p.id = $1 ${PEDIDO_GROUP_BY}`, [id]);
  if (res.rowCount === 0) throw new Error(`Pedido ${id} no encontrado`);
  return shapePedido(res.rows[0]);
}

const FOTOS_BUCKET_PUBLIC_URL = process.env.FOTOS_BUCKET_PUBLIC_URL || '';

function fotoUrl(key: string) {
  return `${FOTOS_BUCKET_PUBLIC_URL}/${key}`;
}

function shapeMenuItem(r: {
  id: string;
  nombre: string;
  categoria: string;
  precio: string | number;
  activo: boolean;
  foto_principal_key?: string | null;
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    precio: Number(r.precio),
    activo: r.activo,
    fotoPrincipalUrl: r.foto_principal_key ? fotoUrl(r.foto_principal_key) : null,
  };
}

function shapeFotoMenuItem(r: {
  id: string;
  menu_item_id: string;
  foto_key: string;
  principal: boolean;
  created_at: Date;
}) {
  return {
    id: r.id,
    menuItemId: r.menu_item_id,
    key: r.foto_key,
    url: fotoUrl(r.foto_key),
    principal: r.principal,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function shapeRider(r: { id: string; nombre: string; telefono: string | null; activo: boolean }) {
  return { id: r.id, nombre: r.nombre, telefono: r.telefono, activo: r.activo };
}

function shapeInsumo(r: {
  id: string;
  nombre: string;
  unidad: string;
  stock_actual: string | number;
  stock_minimo: string | number;
  stock_ideal: string | number;
  precio_referencia: string | number;
  activo: boolean;
}) {
  const stockActual = Number(r.stock_actual);
  const stockMinimo = Number(r.stock_minimo);
  return {
    id: r.id,
    nombre: r.nombre,
    unidad: r.unidad,
    stockActual,
    stockMinimo,
    stockIdeal: Number(r.stock_ideal),
    precioReferencia: Number(r.precio_referencia),
    activo: r.activo,
    bajoMinimo: stockActual < stockMinimo,
  };
}

function shapeMovimientoInsumo(r: {
  id: string;
  insumo_id: string;
  tipo: string;
  cantidad: string | number;
  precio_unitario: string | number;
  factura_key: string | null;
  nota: string | null;
  created_at: Date;
}) {
  return {
    id: r.id,
    insumoId: r.insumo_id,
    tipo: r.tipo,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    facturaKey: r.factura_key,
    nota: r.nota,
    createdAt: new Date(r.created_at).toISOString(),
  };
}

function shapeCuenta(r: {
  id: string;
  nombre: string;
  tipo: string;
  activa: boolean;
  saldo_actual: string | number;
  qr_key?: string | null;
}) {
  return {
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    activa: r.activa,
    saldoActual: Number(r.saldo_actual),
    qrUrl: r.qr_key ? fotoUrl(r.qr_key) : null,
  };
}

interface CierreDiaRow {
  id: string;
  fecha: Date;
  estado: string;
  abierto_en: Date;
  cerrado_en: Date | null;
  nota_apertura: string | null;
  nota_cierre: string | null;
  ventas_efectivo: string | null;
  ventas_transferencia: string | null;
  ventas_total: string | null;
  detalles: {
    id: string;
    cuentaId: string;
    cuentaNombre: string;
    cuentaTipo: string;
    montoApertura: string | number;
    montoCierreReal: string | number | null;
  }[];
}

function shapeCierreDia(row: CierreDiaRow) {
  const detalles = (row.detalles || []).map((d) => ({
    id: d.id,
    cuentaId: d.cuentaId,
    cuentaNombre: d.cuentaNombre,
    cuentaTipo: d.cuentaTipo,
    montoApertura: Number(d.montoApertura),
    montoCierreReal: d.montoCierreReal !== null ? Number(d.montoCierreReal) : null,
  }));

  let diferenciaEfectivo: number | null = null;
  let diferenciaBanco: number | null = null;
  if (row.estado === 'cerrado') {
    const sumPor = (tipo: string, campo: 'montoApertura' | 'montoCierreReal') =>
      detalles.filter((d) => d.cuentaTipo === tipo).reduce((s, d) => s + (d[campo] ?? 0), 0);
    diferenciaEfectivo = sumPor('efectivo', 'montoCierreReal') - sumPor('efectivo', 'montoApertura') - Number(row.ventas_efectivo || 0);
    diferenciaBanco = sumPor('banco', 'montoCierreReal') - sumPor('banco', 'montoApertura') - Number(row.ventas_transferencia || 0);
  }

  return {
    id: row.id,
    fecha: new Date(row.fecha).toISOString().slice(0, 10),
    estado: row.estado,
    abiertoEn: new Date(row.abierto_en).toISOString(),
    cerradoEn: row.cerrado_en ? new Date(row.cerrado_en).toISOString() : null,
    notaApertura: row.nota_apertura,
    notaCierre: row.nota_cierre,
    ventasEfectivo: row.ventas_efectivo !== null ? Number(row.ventas_efectivo) : null,
    ventasTransferencia: row.ventas_transferencia !== null ? Number(row.ventas_transferencia) : null,
    ventasTotal: row.ventas_total !== null ? Number(row.ventas_total) : null,
    detalles,
    diferenciaEfectivo,
    diferenciaBanco,
  };
}

const CIERRE_DIA_SELECT = `
  SELECT cd.id, cd.fecha, cd.estado, cd.abierto_en, cd.cerrado_en, cd.nota_apertura, cd.nota_cierre,
    cd.ventas_efectivo, cd.ventas_transferencia, cd.ventas_total,
    COALESCE(
      json_agg(
        json_build_object(
          'id', d.id,
          'cuentaId', d.cuenta_id,
          'cuentaNombre', c.nombre,
          'cuentaTipo', c.tipo,
          'montoApertura', d.monto_apertura,
          'montoCierreReal', d.monto_cierre_real
        ) ORDER BY c.tipo, c.nombre
      ) FILTER (WHERE d.id IS NOT NULL),
      '[]'
    ) AS detalles
  FROM cierres_dia cd
  LEFT JOIN cierre_cuenta_detalle d ON d.cierre_dia_id = cd.id
  LEFT JOIN cuentas c ON c.id = d.cuenta_id
`;

const CIERRE_DIA_GROUP_BY = 'GROUP BY cd.id';

async function fetchCierreDia(pool: Pool, id: string) {
  const res = await pool.query(`${CIERRE_DIA_SELECT} WHERE cd.id = $1 ${CIERRE_DIA_GROUP_BY}`, [id]);
  if (res.rowCount === 0) throw new Error(`Cierre de día ${id} no encontrado`);
  return shapeCierreDia(res.rows[0]);
}

const MENU_ITEM_SELECT = `
  SELECT m.id, m.nombre, m.categoria, m.precio, m.activo,
    (SELECT f.foto_key FROM menu_item_fotos f WHERE f.menu_item_id = m.id AND f.principal LIMIT 1) AS foto_principal_key
  FROM menu_items m
`;

export const rootValue = {
  menu: async () => {
    const pool = await getPool();
    const res = await pool.query(`${MENU_ITEM_SELECT} WHERE m.activo = true ORDER BY m.categoria, m.nombre`);
    return res.rows.map(shapeMenuItem);
  },

  menuAdmin: async () => {
    const pool = await getPool();
    const res = await pool.query(`${MENU_ITEM_SELECT} ORDER BY m.categoria, m.nombre`);
    return res.rows.map(shapeMenuItem);
  },

  fotosMenuItem: async ({ menuItemId }: { menuItemId: string }) => {
    const pool = await getPool();
    const res = await pool.query(
      `SELECT id, menu_item_id, foto_key, principal, created_at
       FROM menu_item_fotos WHERE menu_item_id = $1 ORDER BY principal DESC, created_at ASC`,
      [menuItemId]
    );
    return res.rows.map(shapeFotoMenuItem);
  },

  clientes: async () => {
    const pool = await getPool();
    const res = await pool.query('SELECT id, nombre, telefono FROM clientes ORDER BY nombre');
    return res.rows;
  },

  riders: async () => {
    const pool = await getPool();
    const res = await pool.query(
      'SELECT id, nombre, telefono, activo FROM riders WHERE activo = true ORDER BY nombre'
    );
    return res.rows.map(shapeRider);
  },

  ridersAdmin: async () => {
    const pool = await getPool();
    const res = await pool.query('SELECT id, nombre, telefono, activo FROM riders ORDER BY nombre');
    return res.rows.map(shapeRider);
  },

  insumos: async () => {
    const pool = await getPool();
    const res = await pool.query(
      'SELECT id, nombre, unidad, stock_actual, stock_minimo, stock_ideal, precio_referencia, activo FROM insumos ORDER BY nombre'
    );
    return res.rows.map(shapeInsumo);
  },

  movimientosInsumo: async ({ insumoId }: { insumoId: string }) => {
    const pool = await getPool();
    const res = await pool.query(
      `SELECT id, insumo_id, tipo, cantidad, precio_unitario, factura_key, nota, created_at
       FROM insumo_movimientos WHERE insumo_id = $1 ORDER BY created_at DESC`,
      [insumoId]
    );
    return res.rows.map(shapeMovimientoInsumo);
  },

  cuentas: async () => {
    const pool = await getPool();
    const res = await pool.query(`
      SELECT c.id, c.nombre, c.tipo, c.activa, c.qr_key,
        COALESCE(
          (SELECT d.monto_cierre_real FROM cierre_cuenta_detalle d
           JOIN cierres_dia cd ON cd.id = d.cierre_dia_id
           WHERE d.cuenta_id = c.id AND d.monto_cierre_real IS NOT NULL
           ORDER BY cd.fecha DESC LIMIT 1),
          (SELECT d.monto_apertura FROM cierre_cuenta_detalle d
           JOIN cierres_dia cd ON cd.id = d.cierre_dia_id
           WHERE d.cuenta_id = c.id
           ORDER BY cd.fecha DESC LIMIT 1),
          0
        ) AS saldo_actual
      FROM cuentas c
      ORDER BY c.tipo, c.nombre
    `);
    return res.rows.map(shapeCuenta);
  },

  cierresDia: async ({ limite }: { limite?: number }) => {
    const pool = await getPool();
    const res = await pool.query(
      `${CIERRE_DIA_SELECT} ${CIERRE_DIA_GROUP_BY} ORDER BY cd.fecha DESC LIMIT $1`,
      [limite ?? 30]
    );
    return res.rows.map(shapeCierreDia);
  },

  cierreDiaActual: async () => {
    const pool = await getPool();
    const res = await pool.query(
      `${CIERRE_DIA_SELECT} WHERE cd.fecha = (now() AT TIME ZONE $1)::date ${CIERRE_DIA_GROUP_BY}`,
      [NEGOCIO_TZ]
    );
    if (res.rowCount === 0) return null;
    return shapeCierreDia(res.rows[0]);
  },

  configNegocio: async () => {
    const pool = await getPool();
    const res = await pool.query('SELECT latitud, longitud, direccion FROM config_negocio WHERE id = true');
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return { latitud: Number(row.latitud), longitud: Number(row.longitud), direccion: row.direccion };
  },

  pedidos: async ({ soloActivos }: { soloActivos?: boolean }) => {
    const pool = await getPool();
    const res = await pool.query(
      `${PEDIDO_SELECT}
       WHERE ($1::boolean IS NOT TRUE OR p.estado NOT IN ('entregado', 'cancelado'))
       ${PEDIDO_GROUP_BY}
       ORDER BY p.created_at ASC`,
      [soloActivos ?? false]
    );
    return res.rows.map(shapePedido);
  },

  crearPedido: async ({
    clienteNombre,
    nota,
    riderId,
    costoDelivery,
    metodoPago,
    pagado,
    items,
    clienteLat,
    clienteLng,
    clienteDireccion,
  }: {
    clienteNombre: string;
    nota?: string;
    riderId?: string;
    costoDelivery?: number;
    metodoPago?: string;
    pagado?: boolean;
    items: { menuItemId?: string; nombre: string; cantidad: number; precioUnitario: number }[];
    clienteLat?: number;
    clienteLng?: number;
    clienteDireccion?: string;
  }) => {
    if (items.length === 0) throw new Error('El pedido necesita al menos un item');
    const pool = await getPool();

    // distancia recalculada en el servidor (no se confía en la del cliente)
    // contra la ubicación configurada del negocio, si ambas existen
    let distanciaKm: number | null = null;
    if (typeof clienteLat === 'number' && typeof clienteLng === 'number') {
      const configRes = await pool.query('SELECT latitud, longitud FROM config_negocio WHERE id = true');
      if (configRes.rowCount && configRes.rowCount > 0) {
        const { latitud, longitud } = configRes.rows[0];
        distanciaKm = distanciaHaversineKm(Number(latitud), Number(longitud), clienteLat, clienteLng);
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pedidoRes = await client.query(
        `INSERT INTO pedidos (cliente_nombre, nota, rider_id, costo_delivery, metodo_pago, pagado, cliente_lat, cliente_lng, cliente_direccion, distancia_km)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        [
          clienteNombre,
          nota || null,
          riderId || null,
          costoDelivery || 0,
          metodoPago || 'efectivo',
          pagado ?? true,
          clienteLat ?? null,
          clienteLng ?? null,
          clienteDireccion || null,
          distanciaKm,
        ]
      );
      const pedidoId = pedidoRes.rows[0].id;
      await client.query(`INSERT INTO pedido_estado_historial (pedido_id, estado) VALUES ($1, 'pendiente')`, [
        pedidoId,
      ]);
      for (const it of items) {
        await client.query(
          `INSERT INTO pedido_items (pedido_id, menu_item_id, item_nombre, cantidad, precio_unitario)
           VALUES ($1, $2, $3, $4, $5)`,
          [pedidoId, it.menuItemId || null, it.nombre, it.cantidad, it.precioUnitario]
        );
      }
      await client.query('COMMIT');
      return fetchPedido(pool, pedidoId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  actualizarEstado: async ({ id, estado, motivo }: { id: string; estado: string; motivo?: string }) => {
    const pool = await getPool();
    const client = await pool.connect();
    const motivoCancelacion = estado === 'cancelado' ? motivo?.trim() || 'Error al ingresar' : null;
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `UPDATE pedidos SET estado = $1, motivo_cancelacion = $3 WHERE id = $2 RETURNING id`,
        [estado, id, motivoCancelacion]
      );
      if (res.rowCount === 0) throw new Error(`Pedido ${id} no encontrado`);
      await client.query('INSERT INTO pedido_estado_historial (pedido_id, estado, motivo) VALUES ($1, $2, $3)', [
        id,
        estado,
        motivoCancelacion,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return fetchPedido(pool, id);
  },

  actualizarPedido: async (args: {
    id: string;
    riderId?: string | null;
    metodoPago?: string;
    pagado?: boolean;
    horaEntrega?: string | null;
    costoDelivery?: number;
    clienteLat?: number | null;
    clienteLng?: number | null;
    clienteDireccion?: string | null;
  }) => {
    const pool = await getPool();
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 2;
    // hasOwnProperty, no destructuring: distingue "no vino la variable" (no tocar) de "vino null" (limpiar)
    if (Object.prototype.hasOwnProperty.call(args, 'riderId')) {
      sets.push(`rider_id = $${i++}`);
      values.push(args.riderId || null);
    }
    if (args.metodoPago) {
      sets.push(`metodo_pago = $${i++}`);
      values.push(args.metodoPago);
    }
    // hasOwnProperty: pagado es boolean, "false" es un valor válido a guardar
    if (Object.prototype.hasOwnProperty.call(args, 'pagado')) {
      sets.push(`pagado = $${i++}`);
      values.push(args.pagado);
    }
    if (Object.prototype.hasOwnProperty.call(args, 'horaEntrega')) {
      sets.push(`hora_entrega = $${i++}`);
      values.push(args.horaEntrega || null);
    }
    if (Object.prototype.hasOwnProperty.call(args, 'costoDelivery')) {
      sets.push(`costo_delivery = $${i++}`);
      values.push(args.costoDelivery ?? 0);
    }
    // lat/lng/direccion viajan juntos desde el modal de ubicación: si se toca uno, se
    // recalcula la distancia contra el negocio con los tres a la vez
    if (
      Object.prototype.hasOwnProperty.call(args, 'clienteLat') ||
      Object.prototype.hasOwnProperty.call(args, 'clienteLng') ||
      Object.prototype.hasOwnProperty.call(args, 'clienteDireccion')
    ) {
      const lat = args.clienteLat ?? null;
      const lng = args.clienteLng ?? null;
      let distanciaKm: number | null = null;
      if (typeof lat === 'number' && typeof lng === 'number') {
        const configRes = await pool.query('SELECT latitud, longitud FROM config_negocio WHERE id = true');
        if (configRes.rowCount && configRes.rowCount > 0) {
          const { latitud, longitud } = configRes.rows[0];
          distanciaKm = distanciaHaversineKm(Number(latitud), Number(longitud), lat, lng);
        }
      }
      sets.push(`cliente_lat = $${i++}`);
      values.push(lat);
      sets.push(`cliente_lng = $${i++}`);
      values.push(lng);
      sets.push(`cliente_direccion = $${i++}`);
      values.push(args.clienteDireccion || null);
      sets.push(`distancia_km = $${i++}`);
      values.push(distanciaKm);
    }
    if (sets.length > 0) {
      const res = await pool.query(`UPDATE pedidos SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, [
        args.id,
        ...values,
      ]);
      if (res.rowCount === 0) throw new Error(`Pedido ${args.id} no encontrado`);
    }
    return fetchPedido(pool, args.id);
  },

  agregarCliente: async ({ nombre, telefono }: { nombre: string; telefono?: string }) => {
    const pool = await getPool();
    const res = await pool.query(
      `INSERT INTO clientes (nombre, telefono) VALUES ($1, $2)
       ON CONFLICT (lower(trim(nombre)))
       DO UPDATE SET telefono = COALESCE(EXCLUDED.telefono, clientes.telefono)
       RETURNING id, nombre, telefono`,
      [nombre, telefono || null]
    );
    return res.rows[0];
  },

  actualizarCliente: async ({
    id,
    nombre,
    telefono,
  }: {
    id: string;
    nombre?: string;
    telefono?: string;
  }) => {
    const pool = await getPool();
    try {
      const res = await pool.query(
        `UPDATE clientes SET
           nombre = COALESCE($2, nombre),
           telefono = COALESCE($3, telefono)
         WHERE id = $1
         RETURNING id, nombre, telefono`,
        [id, nombre?.trim() ?? null, telefono?.trim() ?? null]
      );
      if (res.rowCount === 0) throw new Error(`Cliente ${id} no encontrado`);
      return res.rows[0];
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        throw new Error(`Ya existe un cliente llamado "${nombre?.trim()}"`);
      }
      throw err;
    }
  },

  eliminarCliente: async ({ id }: { id: string }) => {
    const pool = await getPool();
    const res = await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  agregarProductosMenu: async ({
    items,
  }: {
    items: { nombre: string; categoria: string; precio: number }[];
  }) => {
    const pool = await getPool();
    const insertados: ReturnType<typeof shapeMenuItem>[] = [];
    for (const it of items) {
      const nombre = it.nombre.trim();
      if (!nombre) continue;
      const res = await pool.query(
        `INSERT INTO menu_items (nombre, categoria, precio) VALUES ($1, $2, $3)
         ON CONFLICT (nombre) DO NOTHING
         RETURNING id, nombre, categoria, precio, activo`,
        [nombre, it.categoria.trim(), it.precio]
      );
      if (res.rowCount && res.rowCount > 0) {
        insertados.push(shapeMenuItem(res.rows[0]));
      }
    }
    return insertados;
  },

  crearProductoMenu: async ({
    nombre,
    categoria,
    precio,
  }: {
    nombre: string;
    categoria: string;
    precio: number;
  }) => {
    const pool = await getPool();
    try {
      const res = await pool.query(
        `INSERT INTO menu_items (nombre, categoria, precio) VALUES ($1, $2, $3)
         RETURNING id, nombre, categoria, precio, activo`,
        [nombre.trim(), categoria.trim(), precio]
      );
      return shapeMenuItem(res.rows[0]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        throw new Error(`Ya existe un producto llamado "${nombre.trim()}"`);
      }
      throw err;
    }
  },

  actualizarProductoMenu: async ({
    id,
    nombre,
    categoria,
    precio,
    activo,
  }: {
    id: string;
    nombre?: string;
    categoria?: string;
    precio?: number;
    activo?: boolean;
  }) => {
    const pool = await getPool();
    const res = await pool.query(
      `UPDATE menu_items SET
         nombre = COALESCE($2, nombre),
         categoria = COALESCE($3, categoria),
         precio = COALESCE($4, precio),
         activo = COALESCE($5, activo)
       WHERE id = $1
       RETURNING id, nombre, categoria, precio, activo,
         (SELECT f.foto_key FROM menu_item_fotos f WHERE f.menu_item_id = menu_items.id AND f.principal LIMIT 1) AS foto_principal_key`,
      [id, nombre?.trim() ?? null, categoria?.trim() ?? null, precio ?? null, activo ?? null]
    );
    if (res.rowCount === 0) throw new Error(`Producto ${id} no encontrado`);
    return shapeMenuItem(res.rows[0]);
  },

  eliminarProductoMenu: async ({ id }: { id: string }) => {
    const pool = await getPool();
    const res = await pool.query('DELETE FROM menu_items WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  agregarFotoMenuItem: async ({
    menuItemId,
    key,
    principal,
  }: {
    menuItemId: string;
    key: string;
    principal?: boolean;
  }) => {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // la primera foto de un producto queda como principal por defecto,
      // salvo que ya exista una (en ese caso solo se vuelve principal si se pide)
      const existente = await client.query(
        'SELECT 1 FROM menu_item_fotos WHERE menu_item_id = $1 AND principal',
        [menuItemId]
      );
      const esPrincipal = principal ?? existente.rowCount === 0;
      if (esPrincipal) {
        await client.query('UPDATE menu_item_fotos SET principal = false WHERE menu_item_id = $1', [menuItemId]);
      }
      const res = await client.query(
        `INSERT INTO menu_item_fotos (menu_item_id, foto_key, principal)
         VALUES ($1, $2, $3)
         RETURNING id, menu_item_id, foto_key, principal, created_at`,
        [menuItemId, key, esPrincipal]
      );
      await client.query('COMMIT');
      return shapeFotoMenuItem(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  marcarFotoPrincipal: async ({ id }: { id: string }) => {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const fotoRes = await client.query('SELECT menu_item_id FROM menu_item_fotos WHERE id = $1', [id]);
      if (fotoRes.rowCount === 0) throw new Error(`Foto ${id} no encontrada`);
      const menuItemId = fotoRes.rows[0].menu_item_id;
      await client.query('UPDATE menu_item_fotos SET principal = false WHERE menu_item_id = $1', [menuItemId]);
      const res = await client.query(
        `UPDATE menu_item_fotos SET principal = true WHERE id = $1
         RETURNING id, menu_item_id, foto_key, principal, created_at`,
        [id]
      );
      await client.query('COMMIT');
      return shapeFotoMenuItem(res.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  eliminarFotoMenuItem: async ({ id }: { id: string }) => {
    const pool = await getPool();
    const res = await pool.query('DELETE FROM menu_item_fotos WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  crearRider: async ({ nombre, telefono }: { nombre: string; telefono?: string }) => {
    const pool = await getPool();
    try {
      const res = await pool.query(
        `INSERT INTO riders (nombre, telefono) VALUES ($1, $2)
         RETURNING id, nombre, telefono, activo`,
        [nombre.trim(), telefono?.trim() || null]
      );
      return shapeRider(res.rows[0]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        throw new Error(`Ya existe un rider llamado "${nombre.trim()}"`);
      }
      throw err;
    }
  },

  actualizarRider: async ({
    id,
    nombre,
    telefono,
    activo,
  }: {
    id: string;
    nombre?: string;
    telefono?: string;
    activo?: boolean;
  }) => {
    const pool = await getPool();
    const res = await pool.query(
      `UPDATE riders SET
         nombre = COALESCE($2, nombre),
         telefono = COALESCE($3, telefono),
         activo = COALESCE($4, activo)
       WHERE id = $1
       RETURNING id, nombre, telefono, activo`,
      [id, nombre?.trim() ?? null, telefono?.trim() ?? null, activo ?? null]
    );
    if (res.rowCount === 0) throw new Error(`Rider ${id} no encontrado`);
    return shapeRider(res.rows[0]);
  },

  eliminarRider: async ({ id }: { id: string }) => {
    const pool = await getPool();
    const res = await pool.query('DELETE FROM riders WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  crearInsumo: async ({
    nombre,
    unidad,
    stockMinimo,
    stockIdeal,
    precioReferencia,
  }: {
    nombre: string;
    unidad: string;
    stockMinimo?: number;
    stockIdeal?: number;
    precioReferencia?: number;
  }) => {
    const pool = await getPool();
    try {
      const res = await pool.query(
        `INSERT INTO insumos (nombre, unidad, stock_minimo, stock_ideal, precio_referencia)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, nombre, unidad, stock_actual, stock_minimo, stock_ideal, precio_referencia, activo`,
        [nombre.trim(), unidad.trim(), stockMinimo ?? 0, stockIdeal ?? 0, precioReferencia ?? 0]
      );
      return shapeInsumo(res.rows[0]);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        throw new Error(`Ya existe un insumo llamado "${nombre.trim()}"`);
      }
      throw err;
    }
  },

  actualizarInsumo: async ({
    id,
    nombre,
    unidad,
    stockMinimo,
    stockIdeal,
    precioReferencia,
    activo,
  }: {
    id: string;
    nombre?: string;
    unidad?: string;
    stockMinimo?: number;
    stockIdeal?: number;
    precioReferencia?: number;
    activo?: boolean;
  }) => {
    const pool = await getPool();
    const res = await pool.query(
      `UPDATE insumos SET
         nombre = COALESCE($2, nombre),
         unidad = COALESCE($3, unidad),
         stock_minimo = COALESCE($4, stock_minimo),
         stock_ideal = COALESCE($5, stock_ideal),
         precio_referencia = COALESCE($6, precio_referencia),
         activo = COALESCE($7, activo)
       WHERE id = $1
       RETURNING id, nombre, unidad, stock_actual, stock_minimo, stock_ideal, precio_referencia, activo`,
      [
        id,
        nombre?.trim() ?? null,
        unidad?.trim() ?? null,
        stockMinimo ?? null,
        stockIdeal ?? null,
        precioReferencia ?? null,
        activo ?? null,
      ]
    );
    if (res.rowCount === 0) throw new Error(`Insumo ${id} no encontrado`);
    return shapeInsumo(res.rows[0]);
  },

  eliminarInsumo: async ({ id }: { id: string }) => {
    const pool = await getPool();
    const res = await pool.query('DELETE FROM insumos WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  },

  registrarMovimientoInsumo: async ({
    insumoId,
    tipo,
    cantidad,
    precioUnitario,
    facturaKey,
    nota,
  }: {
    insumoId: string;
    tipo: 'carga' | 'descarga';
    cantidad: number;
    precioUnitario?: number;
    facturaKey?: string;
    nota?: string;
  }) => {
    if (cantidad <= 0) throw new Error('La cantidad debe ser mayor a 0');
    const pool = await getPool();

    // en una carga, si no mandan precio se usa el de referencia del insumo
    let precio = precioUnitario;
    if (tipo === 'carga' && precio === undefined) {
      const insumoRes = await pool.query('SELECT precio_referencia FROM insumos WHERE id = $1', [insumoId]);
      if (insumoRes.rowCount === 0) throw new Error(`Insumo ${insumoId} no encontrado`);
      precio = Number(insumoRes.rows[0].precio_referencia);
    }

    try {
      const res = await pool.query(
        `INSERT INTO insumo_movimientos (insumo_id, tipo, cantidad, precio_unitario, factura_key, nota)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, insumo_id, tipo, cantidad, precio_unitario, factura_key, nota, created_at`,
        [insumoId, tipo, cantidad, precio ?? 0, facturaKey || null, nota || null]
      );
      return shapeMovimientoInsumo(res.rows[0]);
    } catch (err: unknown) {
      // CHECK stock_actual >= 0 del trigger: una descarga mayor al stock disponible
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23514') {
        throw new Error('No hay suficiente stock para esa descarga');
      }
      throw err;
    }
  },

  actualizarConfigNegocio: async ({
    latitud,
    longitud,
    direccion,
  }: {
    latitud: number;
    longitud: number;
    direccion?: string;
  }) => {
    const pool = await getPool();
    const res = await pool.query(
      `INSERT INTO config_negocio (id, latitud, longitud, direccion)
       VALUES (true, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         latitud = EXCLUDED.latitud,
         longitud = EXCLUDED.longitud,
         direccion = EXCLUDED.direccion,
         updated_at = now()
       RETURNING latitud, longitud, direccion`,
      [latitud, longitud, direccion || null]
    );
    const row = res.rows[0];
    return { latitud: Number(row.latitud), longitud: Number(row.longitud), direccion: row.direccion };
  },

  crearCuenta: async ({ nombre, tipo }: { nombre: string; tipo: string }) => {
    const pool = await getPool();
    try {
      const res = await pool.query(
        `INSERT INTO cuentas (nombre, tipo) VALUES ($1, $2) RETURNING id, nombre, tipo, activa, qr_key`,
        [nombre.trim(), tipo]
      );
      return shapeCuenta({ ...res.rows[0], saldo_actual: 0 });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
        throw new Error(`Ya existe una cuenta llamada "${nombre.trim()}"`);
      }
      throw err;
    }
  },

  actualizarCuenta: async (args: { id: string; nombre?: string; activa?: boolean; qrKey?: string | null }) => {
    const pool = await getPool();
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 2;
    if (args.nombre) {
      sets.push(`nombre = $${i++}`);
      values.push(args.nombre.trim());
    }
    if (Object.prototype.hasOwnProperty.call(args, 'activa')) {
      sets.push(`activa = $${i++}`);
      values.push(args.activa);
    }
    // hasOwnProperty: qrKey:null es "quitar el QR", distinto de no mandarlo (no tocar)
    if (Object.prototype.hasOwnProperty.call(args, 'qrKey')) {
      sets.push(`qr_key = $${i++}`);
      values.push(args.qrKey ?? null);
    }
    if (sets.length === 0) throw new Error('No hay nada que actualizar');
    const res = await pool.query(
      `UPDATE cuentas SET ${sets.join(', ')} WHERE id = $1 RETURNING id, nombre, tipo, activa, qr_key`,
      [args.id, ...values]
    );
    if (res.rowCount === 0) throw new Error(`Cuenta ${args.id} no encontrada`);
    const id = args.id;
    const saldoRes = await pool.query(
      `SELECT COALESCE(
         (SELECT d.monto_cierre_real FROM cierre_cuenta_detalle d
          JOIN cierres_dia cd ON cd.id = d.cierre_dia_id
          WHERE d.cuenta_id = $1 AND d.monto_cierre_real IS NOT NULL
          ORDER BY cd.fecha DESC LIMIT 1),
         (SELECT d.monto_apertura FROM cierre_cuenta_detalle d
          JOIN cierres_dia cd ON cd.id = d.cierre_dia_id
          WHERE d.cuenta_id = $1
          ORDER BY cd.fecha DESC LIMIT 1),
         0
       ) AS saldo_actual`,
      [id]
    );
    return shapeCuenta({ ...res.rows[0], saldo_actual: saldoRes.rows[0].saldo_actual });
  },

  abrirDia: async ({
    aperturas,
    nota,
  }: {
    aperturas: { cuentaId: string; montoApertura: number }[];
    nota?: string;
  }) => {
    if (aperturas.length === 0) throw new Error('Indica el monto de apertura de al menos una cuenta');
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existente = await client.query(
        `SELECT id FROM cierres_dia WHERE fecha = (now() AT TIME ZONE $1)::date`,
        [NEGOCIO_TZ]
      );
      if (existente.rowCount && existente.rowCount > 0) {
        throw new Error('Ya existe un cierre de caja para hoy');
      }
      const cierreRes = await client.query(
        `INSERT INTO cierres_dia (fecha, nota_apertura) VALUES ((now() AT TIME ZONE $2)::date, $1) RETURNING id`,
        [nota || null, NEGOCIO_TZ]
      );
      const cierreDiaId = cierreRes.rows[0].id;
      for (const a of aperturas) {
        await client.query(
          `INSERT INTO cierre_cuenta_detalle (cierre_dia_id, cuenta_id, monto_apertura) VALUES ($1, $2, $3)`,
          [cierreDiaId, a.cuentaId, a.montoApertura]
        );
      }
      await client.query('COMMIT');
      return fetchCierreDia(pool, cierreDiaId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  cerrarDia: async ({
    cierreDiaId,
    cierres,
    nota,
  }: {
    cierreDiaId: string;
    cierres: { cuentaId: string; montoCierreReal: number }[];
    nota?: string;
  }) => {
    if (cierres.length === 0) throw new Error('Indica el monto real de al menos una cuenta');
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cierreRes = await client.query(
        'SELECT estado, abierto_en FROM cierres_dia WHERE id = $1 FOR UPDATE',
        [cierreDiaId]
      );
      if (cierreRes.rowCount === 0) throw new Error('Cierre de día no encontrado');
      if (cierreRes.rows[0].estado === 'cerrado') throw new Error('Este día ya está cerrado');
      const abiertoEn = cierreRes.rows[0].abierto_en;

      const ventasRes = await client.query(
        `SELECT
           COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'efectivo'), 0) AS ventas_efectivo,
           COALESCE(SUM(total) FILTER (WHERE metodo_pago = 'transferencia'), 0) AS ventas_transferencia,
           COALESCE(SUM(total), 0) AS ventas_total
         FROM pedidos
         WHERE created_at >= $1 AND created_at <= now() AND pagado = true AND estado <> 'cancelado'`,
        [abiertoEn]
      );
      const { ventas_efectivo, ventas_transferencia, ventas_total } = ventasRes.rows[0];

      for (const c of cierres) {
        const upd = await client.query(
          `UPDATE cierre_cuenta_detalle SET monto_cierre_real = $1 WHERE cierre_dia_id = $2 AND cuenta_id = $3 RETURNING id`,
          [c.montoCierreReal, cierreDiaId, c.cuentaId]
        );
        if (upd.rowCount === 0) {
          // cuenta creada después de abrir el día: no tiene fila de apertura todavía
          await client.query(
            `INSERT INTO cierre_cuenta_detalle (cierre_dia_id, cuenta_id, monto_apertura, monto_cierre_real)
             VALUES ($1, $2, 0, $3)`,
            [cierreDiaId, c.cuentaId, c.montoCierreReal]
          );
        }
      }

      await client.query(
        `UPDATE cierres_dia SET
           estado = 'cerrado',
           cerrado_en = now(),
           nota_cierre = $1,
           ventas_efectivo = $2,
           ventas_transferencia = $3,
           ventas_total = $4
         WHERE id = $5`,
        [nota || null, ventas_efectivo, ventas_transferencia, ventas_total, cierreDiaId]
      );
      await client.query('COMMIT');
      return fetchCierreDia(pool, cierreDiaId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // solo permite borrar un día que todavía está abierto (apertura hecha por
  // error); una vez cerrado queda fijo, como cualquier registro de auditoría
  eliminarCierreDia: async ({ id }: { id: string }) => {
    const pool = await getPool();
    const res = await pool.query(`DELETE FROM cierres_dia WHERE id = $1 AND estado = 'abierto'`, [id]);
    return (res.rowCount ?? 0) > 0;
  },
};
