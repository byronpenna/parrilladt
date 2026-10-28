'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_CLIENTES,
  MUTATION_AGREGAR_CLIENTE,
  MUTATION_ACTUALIZAR_CLIENTE,
  MUTATION_ELIMINAR_CLIENTE,
} from '@/lib/queries';
import type { Cliente } from '@/lib/types';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
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

  useEffect(() => {
    cargarClientes();
  }, []);

  async function cargarClientes() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ clientes: Cliente[] }>(QUERY_CLIENTES);
      setClientes(data.clientes);
    } catch {
      setError('No se pudieron cargar los clientes');
    } finally {
      setCargando(false);
    }
  }

  const clientesFiltrados = useMemo(() => {
    return clientes.filter((c) => {
      if (busqueda.trim() && !c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
      return true;
    });
  }, [clientes, busqueda]);

  async function crearCliente() {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      setErrorCrear('Completa el nombre del cliente');
      return;
    }
    setCreando(true);
    setErrorCrear('');
    try {
      const data = await gqlRequest<{ agregarCliente: Cliente }>(MUTATION_AGREGAR_CLIENTE, {
        nombre,
        telefono: nuevoTelefono.trim() || undefined,
      });
      setClientes((prev) => {
        const sinDuplicado = prev.filter((c) => c.id !== data.agregarCliente.id);
        return [...sinDuplicado, data.agregarCliente];
      });
      setNuevoNombre('');
      setNuevoTelefono('');
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : 'No se pudo crear el cliente');
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(c: Cliente) {
    setEditId(c.id);
    setEditNombre(c.nombre);
    setEditTelefono(c.telefono || '');
    setErrorFila(null);
  }

  function cancelarEdicion() {
    setEditId(null);
  }

  async function guardarEdicion(id: string) {
    const nombre = editNombre.trim();
    if (!nombre) {
      setErrorFila({ id, msg: 'Completa el nombre del cliente' });
      return;
    }
    setGuardando(true);
    setErrorFila(null);
    try {
      const data = await gqlRequest<{ actualizarCliente: Cliente }>(MUTATION_ACTUALIZAR_CLIENTE, {
        id,
        nombre,
        telefono: editTelefono.trim(),
      });
      setClientes((prev) => prev.map((c) => (c.id === id ? data.actualizarCliente : c)));
      setEditId(null);
    } catch (e) {
      setErrorFila({ id, msg: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarCliente(c: Cliente) {
    if (!window.confirm(`¿Eliminar al cliente "${c.nombre}" definitivamente?`)) return;
    try {
      await gqlRequest(MUTATION_ELIMINAR_CLIENTE, { id: c.id });
      setClientes((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setErrorFila({ id: c.id, msg: e instanceof Error ? e.message : 'No se pudo eliminar' });
    }
  }

  return (
    <>
      <header className="cancha-header">
        <h1>👤 Clientes</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
          <Link href="/reportes" className="btn btn-blanco">
            📈 Reportes
          </Link>
          <div className="reloj">{clientesFiltrados.length} clientes</div>
        </div>
      </header>

      <div className="pedidos-page">
        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo" style={{ minWidth: 220 }}>
            <label htmlFor="nuevoNombreCliente">Nombre</label>
            <input id="nuevoNombreCliente" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoTelefonoCliente">Teléfono</label>
            <input
              id="nuevoTelefonoCliente"
              type="tel"
              value={nuevoTelefono}
              onChange={(e) => setNuevoTelefono(e.target.value)}
            />
          </div>
          <button className="btn btn-naranja" disabled={creando} onClick={crearCliente}>
            + Agregar cliente
          </button>
          {errorCrear && <div className="pedidos-error">{errorCrear}</div>}
        </div>

        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo">
            <label htmlFor="buscarCliente">Buscar</label>
            <input
              id="buscarCliente"
              placeholder="Nombre del cliente..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="pedidos-error">{error}</div>}

        <div className="tabla-pedidos-wrap card-blanca">
          {cargando ? (
            <div className="vacio-col">Cargando...</div>
          ) : clientesFiltrados.length === 0 ? (
            <div className="vacio-col">No hay clientes con estos filtros</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((c) => {
                  const enEdicion = editId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr>
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
                            <td className="acciones-productos">
                              <button className="btn btn-verde" disabled={guardando} onClick={() => guardarEdicion(c.id)}>
                                Guardar
                              </button>
                              <button className="btn btn-blanco" onClick={cancelarEdicion}>
                                Cancelar
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{c.nombre}</td>
                            <td>{c.telefono || '—'}</td>
                            <td className="acciones-productos">
                              <button className="btn btn-blanco" onClick={() => iniciarEdicion(c)}>
                                Editar
                              </button>
                              <button className="btn btn-naranja" onClick={() => eliminarCliente(c)}>
                                Eliminar
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                      {errorFila?.id === c.id && (
                        <tr>
                          <td colSpan={3} className="pedidos-error">
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
