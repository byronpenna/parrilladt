'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_PEDIDOS } from '@/lib/queries';
import type { Pedido, EstadoPedido } from '@/lib/types';

const RAPIDOS = 'rapidos';
const TODOS = 'todos';

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const ORDEN_OPCIONES = [
  { valor: 'fecha_desc', label: 'Fecha (más reciente primero)' },
  { valor: 'fecha_asc', label: 'Fecha (más antiguo primero)' },
  { valor: 'monto_desc', label: 'Monto (mayor a menor)' },
  { valor: 'monto_asc', label: 'Monto (menor a mayor)' },
] as const;

type Orden = (typeof ORDEN_OPCIONES)[number]['valor'];

function esRapido(nombre: string) {
  return nombre.startsWith('Rápido-');
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [filtroCliente, setFiltroCliente] = useState<string>(TODOS);
  const [filtroEstado, setFiltroEstado] = useState<EstadoPedido | typeof TODOS>(TODOS);
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
      const fecha = p.createdAt.slice(0, 10);
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
  }, [pedidos, filtroCliente, filtroEstado, fechaDesde, fechaHasta, orden]);

  const totalMostrado = pedidosFiltrados.reduce((s, p) => s + p.total, 0);

  return (
    <>
      <header className="cancha-header">
        <h1>📋 Pedidos</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/" className="btn btn-blanco">
            ⚽ Tomar pedidos
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
              setFechaDesde('');
              setFechaHasta('');
              setOrden('fecha_desc');
            }}
          >
            Limpiar filtros
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
                    <td className="col-monto">${p.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total mostrado</td>
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
