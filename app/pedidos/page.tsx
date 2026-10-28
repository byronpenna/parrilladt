'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import writeXlsxFile from 'write-excel-file';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_PEDIDOS } from '@/lib/queries';
import type { Pedido, EstadoPedido, MetodoPago } from '@/lib/types';

const RAPIDOS = 'rapidos';
const TODOS = 'todos';

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
};

const ORDEN_OPCIONES = [
  { valor: 'fecha_desc', label: 'Fecha (más reciente primero)' },
  { valor: 'fecha_asc', label: 'Fecha (más antiguo primero)' },
  { valor: 'monto_desc', label: 'Monto (mayor a menor)' },
  { valor: 'monto_asc', label: 'Monto (menor a mayor)' },
] as const;

type Orden = (typeof ORDEN_OPCIONES)[number]['valor'];

function fechaLocal(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function esRapido(nombre: string) {
  return nombre.startsWith('Rápido-');
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [filtroCliente, setFiltroCliente] = useState<string>(TODOS);
  const [filtroEstado, setFiltroEstado] = useState<EstadoPedido | typeof TODOS>(TODOS);
  const [filtroMetodoPago, setFiltroMetodoPago] = useState<MetodoPago | typeof TODOS>(TODOS);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [orden, setOrden] = useState<Orden>('fecha_desc');

  useEffect(() => {
    cargarPedidos();
  }, []);

  async function cargarPedidos() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ pedidos: Pedido[] }>(QUERY_PEDIDOS, { soloActivos: false });
      setPedidos(data.pedidos);
    } catch {
      setError('No se pudieron cargar los pedidos');
    } finally {
      setCargando(false);
    }
  }

  const clientesUnicos = useMemo(() => {
    const nombres = new Set(pedidos.filter((p) => !esRapido(p.clienteNombre)).map((p) => p.clienteNombre));
    return [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    const resultado = pedidos.filter((p) => {
      if (filtroCliente === RAPIDOS && !esRapido(p.clienteNombre)) return false;
      if (filtroCliente !== TODOS && filtroCliente !== RAPIDOS && p.clienteNombre !== filtroCliente) return false;
      if (filtroEstado !== TODOS && p.estado !== filtroEstado) return false;
      if (filtroMetodoPago !== TODOS && p.metodoPago !== filtroMetodoPago) return false;
      const fecha = fechaLocal(p.createdAt);
      if (fechaDesde && fecha < fechaDesde) return false;
      if (fechaHasta && fecha > fechaHasta) return false;
      return true;
    });

    resultado.sort((a, b) => {
      switch (orden) {
        case 'fecha_asc':
          return a.createdAt.localeCompare(b.createdAt);
        case 'fecha_desc':
          return b.createdAt.localeCompare(a.createdAt);
        case 'monto_asc':
          return a.total - b.total;
        case 'monto_desc':
          return b.total - a.total;
      }
    });

    return resultado;
  }, [pedidos, filtroCliente, filtroEstado, filtroMetodoPago, fechaDesde, fechaHasta, orden]);

  const totalMostrado = pedidosFiltrados.reduce((s, p) => s + p.total, 0);

  async function exportarExcel() {
    const schema = [
      {
        column: 'Fecha',
        type: String,
        width: 18,
        value: (p: Pedido) => new Date(p.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }),
      },
      { column: 'Cliente', type: String, width: 22, value: (p: Pedido) => p.clienteNombre },
      { column: 'Items', type: String, width: 45, value: (p: Pedido) => p.itemsTexto },
      { column: 'Nota', type: String, width: 25, value: (p: Pedido) => p.nota || '' },
      { column: 'Estado', type: String, width: 16, value: (p: Pedido) => ESTADO_LABEL[p.estado] },
      { column: 'Rider', type: String, width: 18, value: (p: Pedido) => p.riderNombre || '' },
      { column: 'Delivery', type: Number, format: '0.00', width: 12, value: (p: Pedido) => p.costoDelivery },
      { column: 'Pago', type: String, width: 14, value: (p: Pedido) => METODO_PAGO_LABEL[p.metodoPago] },
      { column: 'Total', type: Number, format: '0.00', width: 12, value: (p: Pedido) => p.total },
    ];

    const ahora = new Date();
    const marca = ahora.toISOString().slice(0, 16).replace(/[-:T]/g, '');

    await writeXlsxFile(pedidosFiltrados, {
      schema,
      fileName: `pedidos_${marca}.xlsx`,
      sheet: 'Pedidos',
    });
  }

  return (
    <>
      <header className="cancha-header">
        <h1>📋 Pedidos</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/" className="btn btn-blanco">
            ⚽ Tomar pedidos
          </Link>
          <Link href="/productos" className="btn btn-blanco">
            🍔 Productos
          </Link>
          <Link href="/riders" className="btn btn-blanco">
            🛵 Riders
          </Link>
          <Link href="/clientes" className="btn btn-blanco">
            👤 Clientes
          </Link>
          <Link href="/reportes" className="btn btn-blanco">
            📈 Reportes
          </Link>
          <div className="reloj">{pedidosFiltrados.length} pedidos</div>
        </div>
      </header>

      <div className="pedidos-page">
        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo">
            <label htmlFor="filtroCliente">Cliente</label>
            <select id="filtroCliente" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
              <option value={TODOS}>Todos</option>
              <option value={RAPIDOS}>Rápidos</option>
              {clientesUnicos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="filtro-campo">
            <label htmlFor="filtroEstado">Estado</label>
            <select
              id="filtroEstado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as EstadoPedido | typeof TODOS)}
            >
              <option value={TODOS}>Todos</option>
              {(Object.keys(ESTADO_LABEL) as EstadoPedido[]).map((estado) => (
                <option key={estado} value={estado}>
                  {ESTADO_LABEL[estado]}
                </option>
              ))}
            </select>
          </div>

          <div className="filtro-campo">
            <label htmlFor="filtroMetodoPago">Pago</label>
            <select
              id="filtroMetodoPago"
              value={filtroMetodoPago}
              onChange={(e) => setFiltroMetodoPago(e.target.value as MetodoPago | typeof TODOS)}
            >
              <option value={TODOS}>Todos</option>
              {(Object.keys(METODO_PAGO_LABEL) as MetodoPago[]).map((m) => (
                <option key={m} value={m}>
                  {METODO_PAGO_LABEL[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="filtro-campo">
            <label htmlFor="fechaDesde">Desde</label>
            <input id="fechaDesde" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>

          <div className="filtro-campo">
            <label htmlFor="fechaHasta">Hasta</label>
            <input id="fechaHasta" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>

          <div className="filtro-campo">
            <label htmlFor="ordenPedidos">Ordenar por</label>
            <select id="ordenPedidos" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              {ORDEN_OPCIONES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-blanco"
            onClick={() => {
              setFiltroCliente(TODOS);
              setFiltroEstado(TODOS);
              setFiltroMetodoPago(TODOS);
              setFechaDesde('');
              setFechaHasta('');
              setOrden('fecha_desc');
            }}
          >
            Limpiar filtros
          </button>

          <button
            className="btn btn-verde"
            disabled={pedidosFiltrados.length === 0}
            onClick={exportarExcel}
          >
            📊 Exportar a Excel
          </button>
        </div>

        {error && <div className="pedidos-error">{error}</div>}

        <div className="tabla-pedidos-wrap card-blanca">
          {cargando ? (
            <div className="vacio-col">Cargando...</div>
          ) : pedidosFiltrados.length === 0 ? (
            <div className="vacio-col">No hay pedidos con estos filtros</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Items</th>
                  <th>Nota</th>
                  <th>Estado</th>
                  <th>Rider</th>
                  <th>Delivery</th>
                  <th>Pago</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.createdAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{p.clienteNombre}</td>
                    <td>{p.itemsTexto}</td>
                    <td>{p.nota || '—'}</td>
                    <td>
                      <span className={`estado-badge estado-${p.estado}`}>{ESTADO_LABEL[p.estado]}</span>
                    </td>
                    <td>{p.riderNombre || '—'}</td>
                    <td className="col-monto">{p.riderNombre ? `$${p.costoDelivery.toFixed(2)}` : '—'}</td>
                    <td>{METODO_PAGO_LABEL[p.metodoPago]}</td>
                    <td className="col-monto">${p.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7}>Total mostrado</td>
                  <td className="col-monto">${totalMostrado.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
