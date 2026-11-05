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
  historial: { estado: string; createdAt: string }[];
  cliente_lat: number | string | null;
  cliente_lng: number | string | null;
  cliente_direccion: string | null;
  distancia_km: string | null;
}

const RADIO_TIERRA_KM = 6371;

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
      createdAt: new Date(h.createdAt).toISOString(),
    })),
    clienteLat: row.cliente_lat !== null ? Number(row.cliente_lat) : null,
    clienteLng: row.cliente_lng !== null ? Number(row.cliente_lng) : null,
    clienteDireccion: row.cliente_direccion,
    distanciaKm: row.distancia_km !== null ? Number(row.distancia_km) : null,
  };
}

const PEDIDO_SELECT = `
  SELECT p.id, p.cliente_nombre, p.nota, p.estado, p.total, p.created_at, p.updated_at,
    p.rider_id, r.nombre AS rider_nombre, p.costo_delivery, p.metodo_pago, p.hora_entrega,
    p.cliente_lat, p.cliente_lng, p.cliente_direccion, p.distancia_km,
    (
      SELECT COALESCE(
        json_agg(json_build_object('estado', h.estado, 'createdAt', h.created_at) ORDER BY h.created_at),
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
        `INSERT INTO pedidos (cliente_nombre, nota, rider_id, costo_delivery, metodo_pago, cliente_lat, cliente_lng, cliente_direccion, distancia_km)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          clienteNombre,
          nota || null,
          riderId || null,
          costoDelivery || 0,
          metodoPago || 'efectivo',
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

  actualizarEstado: async ({ id, estado }: { id: string; estado: string }) => {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query('UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING id', [estado, id]);
      if (res.rowCount === 0) throw new Error(`Pedido ${id} no encontrado`);
      await client.query('INSERT INTO pedido_estado_historial (pedido_id, estado) VALUES ($1, $2)', [id, estado]);
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
};
