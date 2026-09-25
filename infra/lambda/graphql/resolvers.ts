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
  };
}

const PEDIDO_SELECT = `
  SELECT p.id, p.cliente_nombre, p.nota, p.estado, p.total, p.created_at, p.updated_at,
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
`;

async function fetchPedido(pool: Pool, id: string) {
  const res = await pool.query(`${PEDIDO_SELECT} WHERE p.id = $1 GROUP BY p.id`, [id]);
  if (res.rowCount === 0) throw new Error(`Pedido ${id} no encontrado`);
  return shapePedido(res.rows[0]);
}

export const rootValue = {
  menu: async () => {
    const pool = await getPool();
    const res = await pool.query(
      'SELECT id, nombre, categoria, precio FROM menu_items WHERE activo = true ORDER BY categoria, nombre'
    );
    return res.rows.map((r) => ({ id: r.id, nombre: r.nombre, categoria: r.categoria, precio: Number(r.precio) }));
  },

  clientes: async () => {
    const pool = await getPool();
    const res = await pool.query('SELECT id, nombre, telefono FROM clientes ORDER BY nombre');
    return res.rows;
  },

  pedidos: async ({ soloActivos }: { soloActivos?: boolean }) => {
    const pool = await getPool();
    const res = await pool.query(
      `${PEDIDO_SELECT}
       WHERE ($1::boolean IS NOT TRUE OR p.estado NOT IN ('entregado', 'cancelado'))
       GROUP BY p.id
       ORDER BY p.created_at ASC`,
      [soloActivos ?? false]
    );
    return res.rows.map(shapePedido);
  },

  crearPedido: async ({
    clienteNombre,
    nota,
    items,
  }: {
    clienteNombre: string;
    nota?: string;
    items: { menuItemId?: string; nombre: string; cantidad: number; precioUnitario: number }[];
  }) => {
    if (items.length === 0) throw new Error('El pedido necesita al menos un item');
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pedidoRes = await client.query(
        'INSERT INTO pedidos (cliente_nombre, nota) VALUES ($1, $2) RETURNING id',
        [clienteNombre, nota || null]
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
};
