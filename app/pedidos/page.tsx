'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import writeXlsxFile from 'write-excel-file';
import LogoutButton from '@/components/LogoutButton';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_PEDIDOS, MUTATION_ACTUALIZAR_ESTADO, MUTATION_ACTUALIZAR_PEDIDO } from '@/lib/queries';
import type { Pedido, EstadoPedido, MetodoPago, ModoRuletaPedido } from '@/lib/types';
import { formatoNegocio } from '@/lib/timezone';
import FeedbackModal from './FeedbackModal';

const RAPIDOS = 'rapidos';
const TODOS = 'todos';
const MOTIVO_DEFAULT = 'Error al ingresar';

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

const RULETA_MODO_LABEL: Record<ModoRuletaPedido, string> = {
  ninguno: 'Ninguno',
  pedido: 'Pedido completo',
  item: 'Por plato',
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

  const [feedbackPedido, setFeedbackPedido] = useState<Pedido | null>(null);

  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState(MOTIVO_DEFAULT);
  const [guardandoCancelacion, setGuardandoCancelacion] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState('');

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

  // los cancelados nunca se suman a los totales mostrados
  const pedidosParaTotal = pedidosFiltrados.filter((p) => p.estado !== 'cancelado');
  const totalMostrado = pedidosParaTotal.reduce((s, p) => s + p.total, 0);
  const totalMostradoSinDelivery = pedidosParaTotal.reduce((s, p) => s + (p.total - p.costoDelivery), 0);
  const totalDelivery = pedidosParaTotal.reduce((s, p) => s + p.costoDelivery, 0);

  function abrirCancelacion(p: Pedido) {
    setCancelandoId(p.id);
    setMotivoCancelacion(MOTIVO_DEFAULT);
    setErrorCancelacion('');
  }

  function cerrarCancelacion() {
    setCancelandoId(null);
  }

  async function confirmarCancelacion(p: Pedido) {
    setGuardandoCancelacion(true);
    setErrorCancelacion('');
    try {
      const data = await gqlRequest<{ actualizarEstado: Pedido }>(MUTATION_ACTUALIZAR_ESTADO, {
        id: p.id,
        estado: 'cancelado',
        motivo: motivoCancelacion.trim() || MOTIVO_DEFAULT,
      });
      setPedidos((prev) =>
        prev.map((x) =>
          x.id === p.id ? { ...x, estado: 'cancelado', motivoCancelacion: data.actualizarEstado.motivoCancelacion } : x
        )
      );
      setCancelandoId(null);
    } catch (e) {
      setErrorCancelacion(e instanceof Error ? e.message : 'No se pudo cancelar el pedido');
    } finally {
      setGuardandoCancelacion(false);
    }
  }

  async function togglePagado(p: Pedido) {
    const nuevoPagado = !p.pagado;
    setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, pagado: nuevoPagado } : x)));
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_PEDIDO, { id: p.id, pagado: nuevoPagado });
    } catch {
      cargarPedidos();
    }
  }

  async function cambiarRuletaModo(p: Pedido, modo: ModoRuletaPedido) {
    setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, ruletaModo: modo } : x)));
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_PEDIDO, { id: p.id, ruletaModo: modo });
    } catch {
      cargarPedidos();
    }
  }

  async function toggleMetodoPago(p: Pedido) {
    const nuevoMetodo: MetodoPago = p.metodoPago === 'efectivo' ? 'transferencia' : 'efectivo';
    setPedidos((prev) => prev.map((x) => (x.id === p.id ? { ...x, metodoPago: nuevoMetodo } : x)));
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_PEDIDO, { id: p.id, metodoPago: nuevoMetodo });
    } catch {
      cargarPedidos();
    }
  }

  async function exportarExcel() {
    const schema = [
      {
        column: 'Fecha',
        type: String,
        width: 18,
        value: (p: Pedido) => formatoNegocio(new Date(p.createdAt), { dateStyle: 'short', timeStyle: 'short' }),
      },
      { column: 'Cliente', type: String, width: 22, value: (p: Pedido) => p.clienteNombre },
      { column: 'Items', type: String, width: 45, value: (p: Pedido) => p.itemsTexto },
      { column: 'Nota', type: String, width: 25, value: (p: Pedido) => p.nota || '' },
      { column: 'Estado', type: String, width: 16, value: (p: Pedido) => ESTADO_LABEL[p.estado] },
      { column: 'Rider', type: String, width: 18, value: (p: Pedido) => p.riderNombre || '' },
      { column: 'Delivery', type: Number, format: '0.00', width: 12, value: (p: Pedido) => p.costoDelivery },
      { column: 'Pago', type: String, width: 14, value: (p: Pedido) => METODO_PAGO_LABEL[p.metodoPago] },
      { column: 'Pagado', type: String, width: 10, value: (p: Pedido) => (p.pagado ? 'Sí' : 'No') },
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
        <div className="cancha-header-nav">
          <LogoutButton />
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
          <Link href="/stock" className="btn btn-blanco">
            📦 Stock
          </Link>
          <Link href="/caja" className="btn btn-blanco">
            💰 Caja
          </Link>
          <Link href="/configuracion" className="btn btn-blanco">
            ⚙️ Config
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
                  <th>Pedido</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Item</th>
                  <th>Nota</th>
                  <th>Estado</th>
                  <th>Rider</th>
                  <th>Delivery</th>
                  <th>Distancia</th>
                  <th>Pago</th>
                  <th>Pagado</th>
                  <th>Ruleta</th>
                  <th>Total sin delivery</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => {
                  const itemsFila = p.items.length > 0 ? p.items : [{ id: '', itemNombre: p.itemsTexto || '—', cantidad: 1 }];
                  const filas = itemsFila.length;
                  return (
                  <Fragment key={p.id}>
                  {itemsFila.map((item, idx) => (
                    <tr key={item.id || `${p.id}-sin-item`}>
                      {idx === 0 && (
                        <>
                          <td rowSpan={filas}>#{p.id}</td>
                          <td rowSpan={filas}>
                            {formatoNegocio(new Date(p.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td rowSpan={filas}>{p.clienteNombre}</td>
                        </>
                      )}
                      <td>
                        {item.cantidad}x {item.itemNombre}
                        {item.id && ` (#${item.id})`}
                      </td>
                      {idx === 0 && (
                        <>
                          <td rowSpan={filas}>{p.nota || '—'}</td>
                          <td rowSpan={filas}>
                            <span className={`estado-badge estado-${p.estado}`}>{ESTADO_LABEL[p.estado]}</span>
                            {p.estado === 'cancelado' && p.motivoCancelacion && (
                              <div className="motivo-cancelacion">{p.motivoCancelacion}</div>
                            )}
                          </td>
                          <td rowSpan={filas}>{p.riderNombre || '—'}</td>
                          <td rowSpan={filas} className="col-monto">
                            {p.riderNombre ? `$${p.costoDelivery.toFixed(2)}` : '—'}
                          </td>
                          <td rowSpan={filas}>
                            {p.distanciaKm !== null ? `~${p.distanciaKm.toFixed(1)} km` : '—'}
                            {p.clienteLat !== null && p.clienteLng !== null && (
                              <>
                                {' '}
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${p.clienteLat},${p.clienteLng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  🗺️
                                </a>
                              </>
                            )}
                          </td>
                          <td rowSpan={filas}>
                            <button
                              className={`btn ${p.metodoPago === 'efectivo' ? 'btn-verde' : 'btn-naranja'}`}
                              onClick={() => toggleMetodoPago(p)}
                            >
                              {p.metodoPago === 'efectivo' ? '💵' : '🏦'} {METODO_PAGO_LABEL[p.metodoPago]}
                            </button>
                          </td>
                          <td rowSpan={filas}>
                            <button
                              className={`btn ${p.pagado ? 'btn-verde' : 'btn-naranja'}`}
                              onClick={() => togglePagado(p)}
                            >
                              {p.pagado ? '✅ Pagado' : '⏳ Sin pagar'}
                            </button>
                          </td>
                          <td rowSpan={filas}>
                            <select
                              title="Decide si el premio de la ruleta en /feedback se juega con la encuesta general del pedido o con la de cada plato (QR por plato)"
                              value={p.ruletaModo}
                              onChange={(e) => cambiarRuletaModo(p, e.target.value as ModoRuletaPedido)}
                            >
                              {(Object.keys(RULETA_MODO_LABEL) as ModoRuletaPedido[]).map((modo) => (
                                <option key={modo} value={modo}>
                                  🎡 {RULETA_MODO_LABEL[modo]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td rowSpan={filas} className="col-monto">
                            ${(p.total - p.costoDelivery).toFixed(2)}
                          </td>
                          <td rowSpan={filas} className="col-monto">
                            ${p.total.toFixed(2)}
                          </td>
                          <td rowSpan={filas} className="acciones-productos">
                            <button className="btn btn-blanco" onClick={() => setFeedbackPedido(p)}>
                              💬 Feedback
                            </button>
                            {p.estado !== 'cancelado' && (
                              <button className="btn btn-naranja" onClick={() => abrirCancelacion(p)}>
                                Cancelar
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {cancelandoId === p.id && (
                    <tr>
                      <td colSpan={15}>
                        <div className="panel-movimiento">
                          <strong>Cancelar pedido de {p.clienteNombre}</strong>
                          <div className="filtro-campo" style={{ minWidth: 280 }}>
                            <label>Motivo</label>
                            <input
                              value={motivoCancelacion}
                              onChange={(e) => setMotivoCancelacion(e.target.value)}
                              autoFocus
                            />
                          </div>
                          <button
                            className="btn btn-naranja"
                            disabled={guardandoCancelacion}
                            onClick={() => confirmarCancelacion(p)}
                          >
                            Confirmar cancelación
                          </button>
                          <button className="btn btn-blanco" onClick={cerrarCancelacion}>
                            Volver
                          </button>
                          {errorCancelacion && <div className="pedidos-error">{errorCancelacion}</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7}>Total mostrado (sin cancelados)</td>
                  <td className="col-monto">${totalDelivery.toFixed(2)}</td>
                  <td colSpan={4}></td>
                  <td className="col-monto">${totalMostradoSinDelivery.toFixed(2)}</td>
                  <td className="col-monto">${totalMostrado.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {feedbackPedido && <FeedbackModal pedido={feedbackPedido} onClose={() => setFeedbackPedido(null)} />}
    </>
  );
}
