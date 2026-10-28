'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_RIDERS_ADMIN,
  MUTATION_CREAR_RIDER,
  MUTATION_ACTUALIZAR_RIDER,
  MUTATION_ELIMINAR_RIDER,
} from '@/lib/queries';
import type { Rider } from '@/lib/types';

export default function RidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editTelefono, setEditTelefono] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorFila, setErrorFila] = useState<{ id: string; msg: string } | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('todos');

  useEffect(() => {
    cargarRiders();
  }, []);

  async function cargarRiders() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ ridersAdmin: Rider[] }>(QUERY_RIDERS_ADMIN);
      setRiders(data.ridersAdmin);
    } catch {
      setError('No se pudieron cargar los riders');
    } finally {
      setCargando(false);
    }
  }

  const ridersFiltrados = useMemo(() => {
    return riders.filter((r) => {
      if (filtroActivo === 'activos' && !r.activo) return false;
      if (filtroActivo === 'inactivos' && r.activo) return false;
      if (busqueda.trim() && !r.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
      return true;
    });
  }, [riders, filtroActivo, busqueda]);

  async function crearRider() {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      setErrorCrear('Completa el nombre del rider');
      return;
    }
    setCreando(true);
    setErrorCrear('');
    try {
      const data = await gqlRequest<{ crearRider: Rider }>(MUTATION_CREAR_RIDER, {
        nombre,
        telefono: nuevoTelefono.trim() || undefined,
      });
      setRiders((prev) => [...prev, data.crearRider]);
      setNuevoNombre('');
      setNuevoTelefono('');
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : 'No se pudo crear el rider');
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(r: Rider) {
    setEditId(r.id);
    setEditNombre(r.nombre);
    setEditTelefono(r.telefono || '');
    setErrorFila(null);
  }

  function cancelarEdicion() {
    setEditId(null);
  }

  async function guardarEdicion(id: string) {
    const nombre = editNombre.trim();
    if (!nombre) {
      setErrorFila({ id, msg: 'Completa el nombre del rider' });
      return;
    }
    setGuardando(true);
    setErrorFila(null);
    try {
      const data = await gqlRequest<{ actualizarRider: Rider }>(MUTATION_ACTUALIZAR_RIDER, {
        id,
        nombre,
        telefono: editTelefono.trim(),
      });
      setRiders((prev) => prev.map((r) => (r.id === id ? data.actualizarRider : r)));
      setEditId(null);
    } catch (e) {
      setErrorFila({ id, msg: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(r: Rider) {
    try {
      const data = await gqlRequest<{ actualizarRider: Rider }>(MUTATION_ACTUALIZAR_RIDER, {
        id: r.id,
        activo: !r.activo,
      });
      setRiders((prev) => prev.map((x) => (x.id === r.id ? data.actualizarRider : x)));
    } catch (e) {
      setErrorFila({ id: r.id, msg: e instanceof Error ? e.message : 'No se pudo actualizar' });
    }
  }

  async function eliminarRider(r: Rider) {
    if (!window.confirm(`¿Eliminar al rider "${r.nombre}" definitivamente?`)) return;
    try {
      await gqlRequest(MUTATION_ELIMINAR_RIDER, { id: r.id });
      setRiders((prev) => prev.filter((x) => x.id !== r.id));
    } catch (e) {
      setErrorFila({ id: r.id, msg: e instanceof Error ? e.message : 'No se pudo eliminar' });
    }
  }

  return (
    <>
      <header className="cancha-header">
        <h1>🛵 Riders</h1>
        <div className="cancha-header-nav">
          <Link href="/" className="btn btn-blanco">
            ⚽ Tomar pedidos
          </Link>
          <Link href="/pedidos" className="btn btn-blanco">
            📋 Pedidos
          </Link>
          <Link href="/productos" className="btn btn-blanco">
            🍔 Productos
          </Link>
          <Link href="/clientes" className="btn btn-blanco">
            👤 Clientes
          </Link>
          <Link href="/reportes" className="btn btn-blanco">
            📈 Reportes
          </Link>
          <div className="reloj">{ridersFiltrados.length} riders</div>
        </div>
      </header>

      <div className="pedidos-page">
        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo" style={{ minWidth: 220 }}>
            <label htmlFor="nuevoNombreRider">Nombre</label>
            <input id="nuevoNombreRider" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoTelefonoRider">Teléfono</label>
            <input
              id="nuevoTelefonoRider"
              type="tel"
              value={nuevoTelefono}
              onChange={(e) => setNuevoTelefono(e.target.value)}
            />
          </div>
          <button className="btn btn-naranja" disabled={creando} onClick={crearRider}>
            + Agregar rider
          </button>
          {errorCrear && <div className="pedidos-error">{errorCrear}</div>}
        </div>

        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo">
            <label htmlFor="buscarRider">Buscar</label>
            <input
              id="buscarRider"
              placeholder="Nombre del rider..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="filtro-campo">
            <label htmlFor="filtroActivoRider">Estado</label>
            <select
              id="filtroActivoRider"
              value={filtroActivo}
              onChange={(e) => setFiltroActivo(e.target.value as 'todos' | 'activos' | 'inactivos')}
            >
              <option value="todos">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
        </div>

        {error && <div className="pedidos-error">{error}</div>}

        <div className="tabla-pedidos-wrap card-blanca">
          {cargando ? (
            <div className="vacio-col">Cargando...</div>
          ) : ridersFiltrados.length === 0 ? (
            <div className="vacio-col">No hay riders con estos filtros</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Activo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ridersFiltrados.map((r) => {
                  const enEdicion = editId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={r.activo ? '' : 'fila-inactiva'}>
                        {enEdicion ? (
                          <>
                            <td>
                              <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
                            </td>
                            <td>
                              <input
                                type="tel"
                                value={editTelefono}
                                onChange={(e) => setEditTelefono(e.target.value)}
                              />
                            </td>
                            <td>{r.activo ? 'Sí' : 'No'}</td>
                            <td className="acciones-productos">
                              <button className="btn btn-verde" disabled={guardando} onClick={() => guardarEdicion(r.id)}>
                                Guardar
                              </button>
                              <button className="btn btn-blanco" onClick={cancelarEdicion}>
                                Cancelar
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{r.nombre}</td>
                            <td>{r.telefono || '—'}</td>
                            <td>
                              <button className="btn btn-blanco" onClick={() => toggleActivo(r)}>
                                {r.activo ? 'Sí — ocultar' : 'No — activar'}
                              </button>
                            </td>
                            <td className="acciones-productos">
                              <button className="btn btn-blanco" onClick={() => iniciarEdicion(r)}>
                                Editar
                              </button>
                              <button className="btn btn-naranja" onClick={() => eliminarRider(r)}>
                                Eliminar
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                      {errorFila?.id === r.id && (
                        <tr>
                          <td colSpan={4} className="pedidos-error">
                            {errorFila.msg}
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
