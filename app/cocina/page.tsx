'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import LogoutButton from '@/components/LogoutButton';
import MapaUbicacion from '@/components/MapaUbicacion';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_PEDIDOS,
  QUERY_RIDERS,
  QUERY_CONFIG_NEGOCIO,
  MUTATION_ACTUALIZAR_ESTADO,
  MUTATION_ACTUALIZAR_PEDIDO,
} from '@/lib/queries';
import type { Pedido, EstadoPedido, MetodoPago, Rider, ConfigNegocio } from '@/lib/types';
import { COSTO_DELIVERY_MIN, COSTO_DELIVERY_PASO } from '@/lib/constants';

const SIGUIENTE_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  pendiente: 'en_preparacion',
  en_preparacion: 'listo',
  listo: 'entregado',
};

const ANTERIOR_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  en_preparacion: 'pendiente',
  listo: 'en_preparacion',
  entregado: 'listo',
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
  const [configNegocio, setConfigNegocio] = useState<ConfigNegocio | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRiderId, setEditRiderId] = useState('');
  const [editCostoDelivery, setEditCostoDelivery] = useState(COSTO_DELIVERY_MIN);
  const [editClienteLat, setEditClienteLat] = useState<number | null>(null);
  const [editClienteLng, setEditClienteLng] = useState<number | null>(null);
  const [editClienteDireccion, setEditClienteDireccion] = useState('');
  const [editMetodoPago, setEditMetodoPago] = useState<MetodoPago>('efectivo');
  const [editHoraEntrega, setEditHoraEntrega] = useState('');
  const [modalEnvioAbierto, setModalEnvioAbierto] = useState(false);
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
    cargarConfigNegocio();
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

  async function cargarConfigNegocio() {
    try {
      const data = await gqlRequest<{ configNegocio: ConfigNegocio | null }>(QUERY_CONFIG_NEGOCIO);
      setConfigNegocio(data.configNegocio);
    } catch {
      // sin ubicación del negocio simplemente no se muestra la distancia
    }
  }

  function iniciarEdicion(p: Pedido, e: MouseEvent) {
    e.stopPropagation();
    setEditId(p.id);
    setEditRiderId(p.riderId || '');
    setEditCostoDelivery(p.costoDelivery || COSTO_DELIVERY_MIN);
    setEditClienteLat(p.clienteLat);
    setEditClienteLng(p.clienteLng);
    setEditClienteDireccion(p.clienteDireccion || '');
    setEditMetodoPago(p.metodoPago);
    setEditHoraEntrega(horaInputDe(p.horaEntrega));
    setModalEnvioAbierto(false);
  }

  function cancelarEdicion(e: MouseEvent) {
    e.stopPropagation();
    setEditId(null);
    setModalEnvioAbierto(false);
  }

  function cambiarEditRider(valor: string) {
    setEditRiderId(valor);
    if (!valor) {
      setEditCostoDelivery(COSTO_DELIVERY_MIN);
      setEditClienteLat(null);
      setEditClienteLng(null);
      setEditClienteDireccion('');
    }
  }

  function cambiarEditRiderDesdeModal(valor: string) {
    cambiarEditRider(valor);
    if (!valor) setModalEnvioAbierto(false);
  }

  function quitarEditEntregaDomicilio() {
    cambiarEditRider('');
    setModalEnvioAbierto(false);
  }

  function cambiarEditUbicacion(lat: number, lng: number, direccion: string | null) {
    setEditClienteLat(lat);
    setEditClienteLng(lng);
    if (direccion) setEditClienteDireccion(direccion);
  }

  function subirEditCostoDelivery() {
    setEditCostoDelivery((c) => c + COSTO_DELIVERY_PASO);
  }

  function bajarEditCostoDelivery() {
    setEditCostoDelivery((c) => Math.max(COSTO_DELIVERY_MIN, c - COSTO_DELIVERY_PASO));
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
        costoDelivery: editRiderId ? editCostoDelivery : 0,
        clienteLat: editRiderId ? editClienteLat : null,
        clienteLng: editRiderId ? editClienteLng : null,
        clienteDireccion: editRiderId ? editClienteDireccion.trim() : '',
      });
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...data.actualizarPedido } : p)));
      setEditId(null);
      setModalEnvioAbierto(false);
    } catch {
      cargarPedidos();
    } finally {
      setGuardandoEdit(false);
    }
  }

  async function moverEstado(id: string, estadoActual: EstadoPedido, direccion: 'adelante' | 'atras', e: MouseEvent) {
    e.stopPropagation();
    const destino = direccion === 'adelante' ? SIGUIENTE_ESTADO[estadoActual] : ANTERIOR_ESTADO[estadoActual];
    if (!destino) return;
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: destino } : p)));
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_ESTADO, { id, estado: destino });
    } catch {
      // el próximo refresco automático corrige el estado si algo falló
    }
    cargarPedidos();
  }

  const referenciaNegocio = useMemo(
    () => (configNegocio ? { lat: configNegocio.latitud, lng: configNegocio.longitud, etiqueta: 'Negocio' } : null),
    [configNegocio]
  );

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
        <div className="cancha-header-nav">
          <LogoutButton />
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
                  const haySiguiente = Boolean(SIGUIENTE_ESTADO[p.estado]);
                  const hayAnterior = Boolean(ANTERIOR_ESTADO[p.estado]);
                  return (
                    <div key={p.id} className={`pedido-card ${claseEspera(mins)}`}>
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
                        {p.distanciaKm !== null && (
                          <span className="pedido-meta-chip">📏 ~{p.distanciaKm.toFixed(1)} km</span>
                        )}
                        {p.clienteLat !== null && p.clienteLng !== null && (
                          <a
                            className="pedido-meta-chip"
                            href={`https://www.google.com/maps/search/?api=1&query=${p.clienteLat},${p.clienteLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            🗺️ Ver ubicación
                          </a>
                        )}
                      </div>

                      {editId === p.id ? (
                        <div className="pedido-edit" onClick={(e) => e.stopPropagation()}>
                          <div className="envio-toggle">
                            <button
                              type="button"
                              className={`envio-toggle-btn ${editRiderId ? 'activo' : ''}`}
                              onClick={() => setModalEnvioAbierto(true)}
                            >
                              <span className="envio-toggle-icono">🏍️</span>
                              <span className="envio-toggle-texto">
                                {editRiderId
                                  ? riders.find((r) => r.id === editRiderId)?.nombre || 'Entrega a domicilio'
                                  : 'Retiro en local'}
                              </span>
                              {editRiderId && <span className="envio-toggle-costo">${editCostoDelivery.toFixed(2)}</span>}
                            </button>
                            {editRiderId && (
                              <button
                                type="button"
                                className="envio-toggle-quitar"
                                title="Quitar entrega a domicilio"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  quitarEditEntregaDomicilio();
                                }}
                              >
                                ✕
                              </button>
                            )}
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
                          <button
                            className="btn-flecha"
                            disabled={!hayAnterior}
                            aria-label="Retroceder de estado"
                            onClick={(e) => moverEstado(p.id, p.estado, 'atras', e)}
                          >
                            ◀
                          </button>
                          <button className="btn-editar-pedido" onClick={(e) => iniciarEdicion(p, e)}>
                            ✏️ Editar
                          </button>
                          <button
                            className="btn-flecha"
                            disabled={!haySiguiente}
                            aria-label="Avanzar de estado"
                            onClick={(e) => moverEstado(p.id, p.estado, 'adelante', e)}
                          >
                            ▶
                          </button>
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

      {modalEnvioAbierto && editId && (
        <div className="modal-overlay" onClick={() => setModalEnvioAbierto(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🏍️ Entrega a domicilio</h3>
              <button type="button" className="modal-cerrar" onClick={() => setModalEnvioAbierto(false)}>
                ✕
              </button>
            </div>
            <div className="modal-cuerpo">
              <select
                id={`editRider-${editId}`}
                value={editRiderId}
                onChange={(e) => cambiarEditRiderDesdeModal(e.target.value)}
              >
                <option value="">Sin rider (retiro en local)</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
              {editRiderId && (
                <div className="delivery-box">
                  <label>Costo de delivery</label>
                  <div className="stepper">
                    <button
                      className="menos"
                      onClick={bajarEditCostoDelivery}
                      disabled={editCostoDelivery <= COSTO_DELIVERY_MIN}
                    >
                      −
                    </button>
                    <span className="cant">${editCostoDelivery.toFixed(2)}</span>
                    <button className="mas" onClick={subirEditCostoDelivery}>
                      +
                    </button>
                  </div>
                </div>
              )}
              {editRiderId && (
                <div className="delivery-box">
                  <label>Ubicación de entrega</label>
                  {!configNegocio && (
                    <div style={{ fontSize: '0.8rem', color: '#8a5a1f' }}>
                      Configura la ubicación del negocio en ⚙️ Config para calcular la distancia.
                    </div>
                  )}
                  <MapaUbicacion
                    lat={editClienteLat}
                    lng={editClienteLng}
                    onChange={cambiarEditUbicacion}
                    referencia={referenciaNegocio}
                    alto={220}
                  />
                  {editClienteDireccion && (
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{editClienteDireccion}</div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {editRiderId && (
                <button type="button" className="btn btn-blanco" onClick={quitarEditEntregaDomicilio}>
                  Quitar entrega
                </button>
              )}
              <button type="button" className="btn btn-naranja" onClick={() => setModalEnvioAbierto(false)}>
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
