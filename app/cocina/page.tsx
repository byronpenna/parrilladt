'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_PEDIDOS, QUERY_RIDERS, MUTATION_ACTUALIZAR_ESTADO, MUTATION_ACTUALIZAR_PEDIDO } from '@/lib/queries';
import type { Pedido, EstadoPedido, MetodoPago, Rider } from '@/lib/types';

const SIGUIENTE_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  pendiente: 'en_preparacion',
  en_preparacion: 'listo',
  listo: 'entregado',
};

const COLUMNA_POR_ESTADO: Partial<Record<EstadoPedido, 'colPendiente' | 'colPreparacion' | 'colListo'>> = {
  pendiente: 'colPendiente',
  en_preparacion: 'colPreparacion',
  listo: 'colListo',
};

function minutosDesde(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
}

function claseEspera(mins: number) {
  if (mins >= 15) return 'espera-larga';
  if (mins >= 8) return 'espera-media';
  return '';
}

function formatoHoraEntrega(iso: string) {
  return new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function horaInputDe(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function calcularFechaEntrega(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export default function CocinaPage() {
  const [reloj, setReloj] = useState('--:--:--');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [estadoConexion, setEstadoConexion] = useState<{ texto: string; ok: boolean }>({
    texto: 'Cargando...',
    ok: true,
  });
  const [, forceTick] = useState(0);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRiderId, setEditRiderId] = useState('');
  const [editMetodoPago, setEditMetodoPago] = useState<MetodoPago>('efectivo');
  const [editHoraEntrega, setEditHoraEntrega] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  useEffect(() => {
    const tick = () =>
      setReloj(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    cargarRiders();
    cargarPedidos();
    const idFetch = setInterval(cargarPedidos, 6000);
    const idRender = setInterval(() => forceTick((n) => n + 1), 10000);
    return () => {
      clearInterval(idFetch);
      clearInterval(idRender);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarPedidos() {
    try {
      const data = await gqlRequest<{ pedidos: Pedido[] }>(QUERY_PEDIDOS, { soloActivos: true });
      setPedidos(data.pedidos);
      setEstadoConexion({ texto: '● En línea', ok: true });
    } catch {
      setEstadoConexion({ texto: '● Sin conexión', ok: false });
    }
  }

  async function cargarRiders() {
    try {
      const data = await gqlRequest<{ riders: Rider[] }>(QUERY_RIDERS);
      setRiders(data.riders);
    } catch {
      // la edición simplemente mostrará la lista vacía si falla
    }
  }

  function iniciarEdicion(p: Pedido, e: MouseEvent) {
    e.stopPropagation();
    setEditId(p.id);
    setEditRiderId(p.riderId || '');
    setEditMetodoPago(p.metodoPago);
    setEditHoraEntrega(horaInputDe(p.horaEntrega));
  }

  function cancelarEdicion(e: MouseEvent) {
    e.stopPropagation();
    setEditId(null);
  }

  async function guardarEdicion(id: string, e: MouseEvent) {
    e.stopPropagation();
    setGuardandoEdit(true);
    try {
      const horaEntrega = editHoraEntrega ? calcularFechaEntrega(editHoraEntrega).toISOString() : null;
      const data = await gqlRequest<{ actualizarPedido: Pedido }>(MUTATION_ACTUALIZAR_PEDIDO, {
        id,
        riderId: editRiderId || null,
        metodoPago: editMetodoPago,
        horaEntrega,
      });
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.actualizarPedido } : p)));
      setEditId(null);
    } catch {
      cargarPedidos();
    } finally {
      setGuardandoEdit(false);
    }
  }

  async function avanzarEstado(id: string, estadoActual: EstadoPedido) {
    const siguiente = SIGUIENTE_ESTADO[estadoActual];
    if (!siguiente) return;
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: siguiente } : p)));
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_ESTADO, { id, estado: siguiente });
    } catch {
      // el próximo refresco automático corrige el estado si algo falló
    }
    cargarPedidos();
  }

  const columnas: Record<'colPendiente' | 'colPreparacion' | 'colListo', Pedido[]> = {
    colPendiente: [],
    colPreparacion: [],
    colListo: [],
  };
  pedidos.forEach((p) => {
    const col = COLUMNA_POR_ESTADO[p.estado];
    if (col) columnas[col].push(p);
  });

  const columnasInfo: { id: keyof typeof columnas; titulo: string; claseColumna: string }[] = [
    { id: 'colPendiente', titulo: 'Pendiente', claseColumna: 'col-pendiente' },
    { id: 'colPreparacion', titulo: 'En preparación', claseColumna: 'col-preparacion' },
    { id: 'colListo', titulo: 'Listo', claseColumna: 'col-listo' },
  ];

  return (
    <div className="cocina-body">
      <header className="cancha-header">
        <h1>🍽 Cocina en vivo</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div id="estadoConexion" style={{ color: estadoConexion.ok ? 'var(--verde-oscuro)' : '#c0392b' }}>
            {estadoConexion.texto}
          </div>
          <div className="reloj">{reloj}</div>
        </div>
      </header>

      <div className="columnas">
        {columnasInfo.map(({ id, titulo, claseColumna }) => (
          <div key={id} className={`columna ${claseColumna}`}>
            <h2>{titulo}</h2>
            <div className="tarjetas">
              {columnas[id].length === 0 ? (
                <div className="vacio-col">Sin pedidos</div>
              ) : (
                columnas[id].map((p) => {
                  const mins = minutosDesde(p.createdAt);
                  return (
                    <div
                      key={p.id}
                      className={`pedido-card ${claseEspera(mins)}`}
                      onClick={() => avanzarEstado(p.id, p.estado)}
                    >
                      <div className="fila-top">
                        <span className="cliente">{p.clienteNombre}</span>
                        <span className="tiempo">{mins} min</span>
                      </div>
                      <div className="items">{p.itemsTexto}</div>
                      {p.nota && <div className="nota">📝 {p.nota}</div>}
                      <div className="pedido-meta">
                        <span className="pedido-meta-chip">
                          {p.riderNombre ? `🛵 ${p.riderNombre}` : '🛵 Sin rider'}
                        </span>
                        <span className="pedido-meta-chip">
                          {p.metodoPago === 'efectivo' ? '💵 Efectivo' : '🏦 Transferencia'}
                        </span>
                        {p.horaEntrega && (
                          <span className="pedido-meta-chip">🕒 {formatoHoraEntrega(p.horaEntrega)}</span>
                        )}
                      </div>

                      {editId === p.id ? (
                        <div className="pedido-edit" onClick={(e) => e.stopPropagation()}>
                          <div className="filtro-campo">
                            <label htmlFor={`editRider-${p.id}`}>Rider</label>
                            <select
                              id={`editRider-${p.id}`}
                              value={editRiderId}
                              onChange={(e) => setEditRiderId(e.target.value)}
                            >
                              <option value="">Sin rider</option>
                              {riders.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nombre}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="metodo-pago-toggle">
                            <button
                              type="button"
                              className={`categoria-btn ${editMetodoPago === 'efectivo' ? 'activa' : ''}`}
                              onClick={() => setEditMetodoPago('efectivo')}
                            >
                              💵 Efectivo
                            </button>
                            <button
                              type="button"
                              className={`categoria-btn ${editMetodoPago === 'transferencia' ? 'activa' : ''}`}
                              onClick={() => setEditMetodoPago('transferencia')}
                            >
                              🏦 Transferencia
                            </button>
                          </div>
                          <div className="filtro-campo">
                            <label htmlFor={`editHora-${p.id}`}>Hora de entrega</label>
                            <input
                              id={`editHora-${p.id}`}
                              type="time"
                              className="input-hora"
                              value={editHoraEntrega}
                              onChange={(e) => setEditHoraEntrega(e.target.value)}
                            />
                          </div>
                          <div className="pedido-edit-acciones">
                            <button
                              className="btn btn-verde"
                              disabled={guardandoEdit}
                              onClick={(e) => guardarEdicion(p.id, e)}
                            >
                              Guardar
                            </button>
                            <button className="btn btn-blanco" onClick={cancelarEdicion}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pedido-footer">
                          <button className="btn-editar-pedido" onClick={(e) => iniciarEdicion(p, e)}>
                            ✏️ Editar
                          </button>
                          <span className="toca">Toca para avanzar →</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
