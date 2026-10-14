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
  };
}

const PEDIDO_SELECT = `
  SELECT p.id, p.cliente_nombre, p.nota, p.estado, p.total, p.created_at, p.updated_at,
    p.rider_id, r.nombre AS rider_nombre, p.costo_delivery,
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

function shapeMenuItem(r: { id: string; nombre: string; categoria: string; precio: string | number; activo: boolean }) {
  return { id: r.id, nombre: r.nombre, categoria: r.categoria, precio: Number(r.precio), activo: r.activo };
}

function shapeRider(r: { id: string; nombre: string; telefono: string | null; activo: boolean }) {
  return { id: r.id, nombre: r.nombre, telefono: r.telefono, activo: r.activo };
}

export const rootValue = {
  menu: async () => {
    const pool = await getPool();
    const res = await pool.query(
      'SELECT id, nombre, categoria, precio, activo FROM menu_items WHERE activo = true ORDER BY categoria, nombre'
    );
    return res.rows.map(shapeMenuItem);
  },

  menuAdmin: async () => {
    const pool = await getPool();
    const res = await pool.query('SELECT id, nombre, categoria, precio, activo FROM menu_items ORDER BY categoria, nombre');
    return res.rows.map(shapeMenuItem);
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
    items,
  }: {
    clienteNombre: string;
    nota?: string;
    riderId?: string;
    costoDelivery?: number;
    items: { menuItemId?: string; nombre: string; cantidad: number; precioUnitario: number }[];
  }) => {
    if (items.length === 0) throw new Error('El pedido necesita al menos un item');
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pedidoRes = await client.query(
        'INSERT INTO pedidos (cliente_nombre, nota, rider_id, costo_delivery) VALUES ($1, $2, $3, $4) RETURNING id',
        [clienteNombre, nota || null, riderId || null, costoDelivery || 0]
      );
      const pedidoId = pedidoRes.rows[0].id;
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
    const res = await pool.query('UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING id', [estado, id]);
    if (res.rowCount === 0) throw new Error(`Pedido ${id} no encontrado`);
    return fetchPedido(pool, id);
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
       RETURNING id, nombre, categoria, precio, activo`,
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
};
