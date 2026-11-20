'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import LogoutButton from '@/components/LogoutButton';
import MapaUbicacion from '@/components/MapaUbicacion';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_CONFIG_NEGOCIO,
  MUTATION_ACTUALIZAR_CONFIG_NEGOCIO,
  QUERY_PREMIOS_RULETA,
  MUTATION_CREAR_PREMIO_RULETA,
  MUTATION_ACTUALIZAR_PREMIO_RULETA,
  MUTATION_ELIMINAR_PREMIO_RULETA,
} from '@/lib/queries';
import type { ConfigNegocio, PremioRuleta } from '@/lib/types';

export default function ConfiguracionPage() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [direccion, setDireccion] = useState('');

  const [premios, setPremios] = useState<PremioRuleta[]>([]);
  const [cargandoPremios, setCargandoPremios] = useState(true);
  const [errorPremios, setErrorPremios] = useState('');
  const [nuevoPremio, setNuevoPremio] = useState('');
  const [creandoPremio, setCreandoPremio] = useState(false);
  const [editIdPremio, setEditIdPremio] = useState<string | null>(null);
  const [editNombrePremio, setEditNombrePremio] = useState('');
  const [errorFilaPremio, setErrorFilaPremio] = useState<{ id: string; msg: string } | null>(null);

  useEffect(() => {
    cargarConfig();
    cargarPremios();
  }, []);

  async function cargarPremios() {
    setCargandoPremios(true);
    setErrorPremios('');
    try {
      const data = await gqlRequest<{ premiosRuleta: PremioRuleta[] }>(QUERY_PREMIOS_RULETA);
      setPremios(data.premiosRuleta);
    } catch {
      setErrorPremios('No se pudieron cargar los premios');
    } finally {
      setCargandoPremios(false);
    }
  }

  async function crearPremio() {
    const nombre = nuevoPremio.trim();
    if (!nombre) {
      setErrorPremios('Escribe el nombre del premio');
      return;
    }
    setCreandoPremio(true);
    setErrorPremios('');
    try {
      const data = await gqlRequest<{ crearPremioRuleta: PremioRuleta }>(MUTATION_CREAR_PREMIO_RULETA, { nombre });
      setPremios((prev) => [...prev, data.crearPremioRuleta]);
      setNuevoPremio('');
    } catch (e) {
      setErrorPremios(e instanceof Error ? e.message : 'No se pudo crear el premio');
    } finally {
      setCreandoPremio(false);
    }
  }

  function iniciarEdicionPremio(p: PremioRuleta) {
    setEditIdPremio(p.id);
    setEditNombrePremio(p.nombre);
    setErrorFilaPremio(null);
  }

  function cancelarEdicionPremio() {
    setEditIdPremio(null);
  }

  async function guardarEdicionPremio(id: string) {
    const nombre = editNombrePremio.trim();
    if (!nombre) {
      setErrorFilaPremio({ id, msg: 'Escribe el nombre del premio' });
      return;
    }
    try {
      const data = await gqlRequest<{ actualizarPremioRuleta: PremioRuleta }>(MUTATION_ACTUALIZAR_PREMIO_RULETA, {
        id,
        nombre,
      });
      setPremios((prev) => prev.map((p) => (p.id === id ? data.actualizarPremioRuleta : p)));
      setEditIdPremio(null);
    } catch (e) {
      setErrorFilaPremio({ id, msg: e instanceof Error ? e.message : 'No se pudo guardar' });
    }
  }

  async function toggleActivoPremio(p: PremioRuleta) {
    try {
      const data = await gqlRequest<{ actualizarPremioRuleta: PremioRuleta }>(MUTATION_ACTUALIZAR_PREMIO_RULETA, {
        id: p.id,
        activo: !p.activo,
      });
      setPremios((prev) => prev.map((x) => (x.id === p.id ? data.actualizarPremioRuleta : x)));
    } catch (e) {
      setErrorFilaPremio({ id: p.id, msg: e instanceof Error ? e.message : 'No se pudo actualizar' });
    }
  }

  async function eliminarPremio(p: PremioRuleta) {
    if (!window.confirm(`¿Eliminar el premio "${p.nombre}" definitivamente?`)) return;
    try {
      await gqlRequest(MUTATION_ELIMINAR_PREMIO_RULETA, { id: p.id });
      setPremios((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setErrorFilaPremio({ id: p.id, msg: e instanceof Error ? e.message : 'No se pudo eliminar' });
    }
  }

  async function cargarConfig() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ configNegocio: ConfigNegocio | null }>(QUERY_CONFIG_NEGOCIO);
      if (data.configNegocio) {
        setLat(data.configNegocio.latitud);
        setLng(data.configNegocio.longitud);
        setDireccion(data.configNegocio.direccion || '');
      }
    } catch {
      setError('No se pudo cargar la configuración del negocio');
    } finally {
      setCargando(false);
    }
  }

  function cambiarUbicacion(nuevaLat: number, nuevaLng: number, direccionDetectada: string | null) {
    setLat(nuevaLat);
    setLng(nuevaLng);
    if (direccionDetectada) setDireccion(direccionDetectada);
    setGuardadoOk(false);
  }

  async function guardar() {
    if (lat === null || lng === null) {
      setError('Marca la ubicación del negocio en el mapa');
      return;
    }
    setGuardando(true);
    setError('');
    setGuardadoOk(false);
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_CONFIG_NEGOCIO, {
        latitud: lat,
        longitud: lng,
        direccion: direccion.trim() || undefined,
      });
      setGuardadoOk(true);
    } catch {
      setError('No se pudo guardar la configuración');
    } finally {
      setGuardando(false);
    }
  }

  const referencia = useMemo(() => null, []);

  return (
    <>
      <header className="cancha-header">
        <h1>⚙️ Configuración</h1>
        <div className="cancha-header-nav">
          <LogoutButton />
          <Link href="/" className="btn btn-blanco">
            ⚽ Tomar pedidos
          </Link>
          <Link href="/pedidos" className="btn btn-blanco">
            📋 Pedidos
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
        </div>
      </header>

      <div className="pedidos-page">
        <div className="card-blanca" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h2 style={{ margin: '0 0 4px' }}>Ubicación del negocio</h2>
            <p style={{ margin: 0, color: '#666' }}>
              Busca la dirección, usa tu ubicación actual o haz clic en el mapa para marcar dónde está el local. Esta
              ubicación se usa para calcular la distancia aproximada de cada pedido con envío.
            </p>
          </div>

          {cargando ? (
            <div className="vacio-col">Cargando...</div>
          ) : (
            <>
              <MapaUbicacion lat={lat} lng={lng} onChange={cambiarUbicacion} referencia={referencia} alto={360} />

              <div className="filtro-campo">
                <label htmlFor="direccionNegocio">Dirección (referencia para el equipo)</label>
                <input
                  id="direccionNegocio"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Se completa sola al marcar el punto, o escríbela a mano"
                />
              </div>

              {error && <div className="pedidos-error">{error}</div>}
              {guardadoOk && <div className="mapa-ubicacion-distancia">✔ Configuración guardada</div>}

              <button className="btn btn-naranja" disabled={guardando || lat === null} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Guardar ubicación'}
              </button>
            </>
          )}
        </div>

        <div className="card-blanca" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h2 style={{ margin: '0 0 4px' }}>Premios de la ruleta</h2>
            <p style={{ margin: 0, color: '#666' }}>
              Catálogo de premios que puede repartir la ruleta de /feedback. Cuando una encuesta gana, se elige al
              azar uno de los premios activos. Puedes agregar más en cualquier momento o desactivar los que ya no
              apliquen, sin perder el historial de los que ya se entregaron.
            </p>
          </div>

          <div className="filtros-pedidos" style={{ padding: 0 }}>
            <div className="filtro-campo" style={{ minWidth: 280 }}>
              <label htmlFor="nuevoPremio">Nuevo premio</label>
              <input
                id="nuevoPremio"
                value={nuevoPremio}
                onChange={(e) => setNuevoPremio(e.target.value)}
                placeholder="Ej. Postre gratis"
              />
            </div>
            <button className="btn btn-naranja" disabled={creandoPremio} onClick={crearPremio}>
              + Agregar premio
            </button>
          </div>

          {errorPremios && <div className="pedidos-error">{errorPremios}</div>}

          {cargandoPremios ? (
            <div className="vacio-col">Cargando...</div>
          ) : premios.length === 0 ? (
            <div className="vacio-col">Todavía no hay premios configurados</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Premio</th>
                  <th>Activo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {premios.map((p) => {
                  const enEdicion = editIdPremio === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className={p.activo ? '' : 'fila-inactiva'}>
                        {enEdicion ? (
                          <>
                            <td>
                              <input
                                value={editNombrePremio}
                                onChange={(e) => setEditNombrePremio(e.target.value)}
                                autoFocus
                              />
                            </td>
                            <td>{p.activo ? 'Sí' : 'No'}</td>
                            <td className="acciones-productos">
                              <button className="btn btn-verde" onClick={() => guardarEdicionPremio(p.id)}>
                                Guardar
                              </button>
                              <button className="btn btn-blanco" onClick={cancelarEdicionPremio}>
                                Cancelar
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{p.nombre}</td>
                            <td>
                              <button className="btn btn-blanco" onClick={() => toggleActivoPremio(p)}>
                                {p.activo ? 'Sí — ocultar' : 'No — activar'}
                              </button>
                            </td>
                            <td className="acciones-productos">
                              <button className="btn btn-blanco" onClick={() => iniciarEdicionPremio(p)}>
                                Editar
                              </button>
                              <button className="btn btn-naranja" onClick={() => eliminarPremio(p)}>
                                Eliminar
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                      {errorFilaPremio?.id === p.id && (
                        <tr>
                          <td colSpan={3} className="pedidos-error">
                            {errorFilaPremio.msg}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
