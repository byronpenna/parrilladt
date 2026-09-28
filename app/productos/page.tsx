'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_MENU_ADMIN,
  MUTATION_CREAR_PRODUCTO,
  MUTATION_ACTUALIZAR_PRODUCTO,
  MUTATION_ELIMINAR_PRODUCTO,
} from '@/lib/queries';
import type { MenuItem } from '@/lib/types';

const TODAS = 'todas';

export default function ProductosPage() {
  const [productos, setProductos] = useState<MenuItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoCategoria, setNuevoCategoria] = useState('');
  const [nuevoPrecio, setNuevoPrecio] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorFila, setErrorFila] = useState<{ id: string; msg: string } | null>(null);

  const [filtroCategoria, setFiltroCategoria] = useState(TODAS);
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    cargarProductos();
  }, []);

  async function cargarProductos() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ menuAdmin: MenuItem[] }>(QUERY_MENU_ADMIN);
      setProductos(data.menuAdmin);
    } catch {
      setError('No se pudieron cargar los productos');
    } finally {
      setCargando(false);
    }
  }

  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, 'es')),
    [productos]
  );

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (filtroCategoria !== TODAS && p.categoria !== filtroCategoria) return false;
      if (filtroActivo === 'activos' && !p.activo) return false;
      if (filtroActivo === 'inactivos' && p.activo) return false;
      if (busqueda.trim() && !p.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
      return true;
    });
  }, [productos, filtroCategoria, filtroActivo, busqueda]);

  async function crearProducto() {
    const nombre = nuevoNombre.trim();
    const categoria = nuevoCategoria.trim();
    const precio = parseFloat(nuevoPrecio);
    if (!nombre || !categoria || Number.isNaN(precio)) {
      setErrorCrear('Completa nombre, categoría y precio');
      return;
    }
    setCreando(true);
    setErrorCrear('');
    try {
      const data = await gqlRequest<{ crearProductoMenu: MenuItem }>(MUTATION_CREAR_PRODUCTO, {
        nombre,
        categoria,
        precio,
      });
      setProductos((prev) => [...prev, data.crearProductoMenu]);
      setNuevoNombre('');
      setNuevoCategoria('');
      setNuevoPrecio('');
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : 'No se pudo crear el producto');
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(p: MenuItem) {
    setEditId(p.id);
    setEditNombre(p.nombre);
    setEditCategoria(p.categoria);
    setEditPrecio(String(p.precio));
    setErrorFila(null);
  }

  function cancelarEdicion() {
    setEditId(null);
  }

  async function guardarEdicion(id: string) {
    const nombre = editNombre.trim();
    const categoria = editCategoria.trim();
    const precio = parseFloat(editPrecio);
    if (!nombre || !categoria || Number.isNaN(precio)) {
      setErrorFila({ id, msg: 'Completa nombre, categoría y precio' });
      return;
    }
    setGuardando(true);
    setErrorFila(null);
    try {
      const data = await gqlRequest<{ actualizarProductoMenu: MenuItem }>(MUTATION_ACTUALIZAR_PRODUCTO, {
        id,
        nombre,
        categoria,
        precio,
      });
      setProductos((prev) => prev.map((p) => (p.id === id ? data.actualizarProductoMenu : p)));
      setEditId(null);
    } catch (e) {
      setErrorFila({ id, msg: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(p: MenuItem) {
    try {
      const data = await gqlRequest<{ actualizarProductoMenu: MenuItem }>(MUTATION_ACTUALIZAR_PRODUCTO, {
        id: p.id,
        activo: !p.activo,
      });
      setProductos((prev) => prev.map((x) => (x.id === p.id ? data.actualizarProductoMenu : x)));
    } catch (e) {
      setErrorFila({ id: p.id, msg: e instanceof Error ? e.message : 'No se pudo actualizar' });
    }
  }

  async function eliminarProducto(p: MenuItem) {
    if (!window.confirm(`¿Eliminar "${p.nombre}" definitivamente?`)) return;
    try {
      await gqlRequest(MUTATION_ELIMINAR_PRODUCTO, { id: p.id });
      setProductos((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setErrorFila({ id: p.id, msg: e instanceof Error ? e.message : 'No se pudo eliminar' });
    }
  }

  return (
    <>
      <header className="cancha-header">
        <h1>🍔 Productos</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link href="/" className="btn btn-blanco">
            ⚽ Tomar pedidos
          </Link>
          <Link href="/pedidos" className="btn btn-blanco">
            📋 Pedidos
          </Link>
          <div className="reloj">{productosFiltrados.length} productos</div>
        </div>
      </header>

      <div className="pedidos-page">
        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo" style={{ minWidth: 220 }}>
            <label htmlFor="nuevoNombre">Nombre</label>
            <input id="nuevoNombre" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoCategoria">Categoría</label>
            <input
              id="nuevoCategoria"
              list="categoriasExistentes"
              value={nuevoCategoria}
              onChange={(e) => setNuevoCategoria(e.target.value)}
            />
            <datalist id="categoriasExistentes">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoPrecio">Precio</label>
            <input
              id="nuevoPrecio"
              type="number"
              min="0"
              step="0.01"
              value={nuevoPrecio}
              onChange={(e) => setNuevoPrecio(e.target.value)}
            />
          </div>
          <button className="btn btn-naranja" disabled={creando} onClick={crearProducto}>
            + Agregar producto
          </button>
          {errorCrear && <div className="pedidos-error">{errorCrear}</div>}
        </div>

        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo">
            <label htmlFor="buscarProducto">Buscar</label>
            <input
              id="buscarProducto"
              placeholder="Nombre del producto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="filtro-campo">
            <label htmlFor="filtroCategoria">Categoría</label>
            <select id="filtroCategoria" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value={TODAS}>Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="filtro-campo">
            <label htmlFor="filtroActivo">Estado</label>
            <select
              id="filtroActivo"
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
          ) : productosFiltrados.length === 0 ? (
            <div className="vacio-col">No hay productos con estos filtros</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Activo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((p) => {
                  const enEdicion = editId === p.id;
                  return (
                    <Fragment key={p.id}>
                    <tr className={p.activo ? '' : 'fila-inactiva'}>
                      {enEdicion ? (
                        <>
                          <td>
                            <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
                          </td>
                          <td>
                            <input
                              list="categoriasExistentes"
                              value={editCategoria}
                              onChange={(e) => setEditCategoria(e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editPrecio}
                              onChange={(e) => setEditPrecio(e.target.value)}
                            />
                          </td>
                          <td>{p.activo ? 'Sí' : 'No'}</td>
                          <td className="acciones-productos">
                            <button className="btn btn-verde" disabled={guardando} onClick={() => guardarEdicion(p.id)}>
                              Guardar
                            </button>
                            <button className="btn btn-blanco" onClick={cancelarEdicion}>
                              Cancelar
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{p.nombre}</td>
                          <td>{p.categoria}</td>
                          <td className="col-monto">${p.precio.toFixed(2)}</td>
                          <td>
                            <button className="btn btn-blanco" onClick={() => toggleActivo(p)}>
                              {p.activo ? 'Sí — ocultar' : 'No — activar'}
                            </button>
                          </td>
                          <td className="acciones-productos">
                            <button className="btn btn-blanco" onClick={() => iniciarEdicion(p)}>
                              Editar
                            </button>
                            <button className="btn btn-naranja" onClick={() => eliminarProducto(p)}>
                              Eliminar
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                    {errorFila?.id === p.id && (
                      <tr>
                        <td colSpan={5} className="pedidos-error">
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
