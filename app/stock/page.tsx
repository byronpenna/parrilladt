'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import LogoutButton from '@/components/LogoutButton';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_INSUMOS,
  MUTATION_CREAR_INSUMO,
  MUTATION_ACTUALIZAR_INSUMO,
  MUTATION_ELIMINAR_INSUMO,
} from '@/lib/queries';
import type { Insumo } from '@/lib/types';

export default function StockPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoUnidad, setNuevoUnidad] = useState('');
  const [nuevoStockActual, setNuevoStockActual] = useState('');
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState('');
  const [nuevoStockIdeal, setNuevoStockIdeal] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editUnidad, setEditUnidad] = useState('');
  const [editStockActual, setEditStockActual] = useState('');
  const [editStockMinimo, setEditStockMinimo] = useState('');
  const [editStockIdeal, setEditStockIdeal] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorFila, setErrorFila] = useState<{ id: string; msg: string } | null>(null);

  const [soloAlerta, setSoloAlerta] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    cargarInsumos();
  }, []);

  async function cargarInsumos() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ insumos: Insumo[] }>(QUERY_INSUMOS);
      setInsumos(data.insumos);
    } catch {
      setError('No se pudieron cargar los insumos');
    } finally {
      setCargando(false);
    }
  }

  const insumosFiltrados = useMemo(() => {
    return insumos.filter((i) => {
      if (soloAlerta && !i.bajoMinimo) return false;
      if (busqueda.trim() && !i.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())) return false;
      return true;
    });
  }, [insumos, soloAlerta, busqueda]);

  const totalAlertas = useMemo(() => insumos.filter((i) => i.bajoMinimo).length, [insumos]);

  async function crearInsumo() {
    const nombre = nuevoNombre.trim();
    const unidad = nuevoUnidad.trim();
    const stockActual = parseFloat(nuevoStockActual || '0');
    const stockMinimo = parseFloat(nuevoStockMinimo || '0');
    const stockIdeal = parseFloat(nuevoStockIdeal || '0');
    if (!nombre || !unidad || Number.isNaN(stockActual) || Number.isNaN(stockMinimo) || Number.isNaN(stockIdeal)) {
      setErrorCrear('Completa nombre, unidad y los tres valores de stock');
      return;
    }
    setCreando(true);
    setErrorCrear('');
    try {
      const data = await gqlRequest<{ crearInsumo: Insumo }>(MUTATION_CREAR_INSUMO, {
        nombre,
        unidad,
        stockActual,
        stockMinimo,
        stockIdeal,
      });
      setInsumos((prev) => [...prev, data.crearInsumo]);
      setNuevoNombre('');
      setNuevoUnidad('');
      setNuevoStockActual('');
      setNuevoStockMinimo('');
      setNuevoStockIdeal('');
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : 'No se pudo crear el insumo');
    } finally {
      setCreando(false);
    }
  }

  function iniciarEdicion(i: Insumo) {
    setEditId(i.id);
    setEditNombre(i.nombre);
    setEditUnidad(i.unidad);
    setEditStockActual(String(i.stockActual));
    setEditStockMinimo(String(i.stockMinimo));
    setEditStockIdeal(String(i.stockIdeal));
    setErrorFila(null);
  }

  function cancelarEdicion() {
    setEditId(null);
  }

  async function guardarEdicion(id: string) {
    const nombre = editNombre.trim();
    const unidad = editUnidad.trim();
    const stockActual = parseFloat(editStockActual);
    const stockMinimo = parseFloat(editStockMinimo);
    const stockIdeal = parseFloat(editStockIdeal);
    if (!nombre || !unidad || Number.isNaN(stockActual) || Number.isNaN(stockMinimo) || Number.isNaN(stockIdeal)) {
      setErrorFila({ id, msg: 'Completa nombre, unidad y los tres valores de stock' });
      return;
    }
    setGuardando(true);
    setErrorFila(null);
    try {
      const data = await gqlRequest<{ actualizarInsumo: Insumo }>(MUTATION_ACTUALIZAR_INSUMO, {
        id,
        nombre,
        unidad,
        stockActual,
        stockMinimo,
        stockIdeal,
      });
      setInsumos((prev) => prev.map((i) => (i.id === id ? data.actualizarInsumo : i)));
      setEditId(null);
    } catch (e) {
      setErrorFila({ id, msg: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  }

  async function toggleActivo(i: Insumo) {
    try {
      const data = await gqlRequest<{ actualizarInsumo: Insumo }>(MUTATION_ACTUALIZAR_INSUMO, {
        id: i.id,
        activo: !i.activo,
      });
      setInsumos((prev) => prev.map((x) => (x.id === i.id ? data.actualizarInsumo : x)));
    } catch (e) {
      setErrorFila({ id: i.id, msg: e instanceof Error ? e.message : 'No se pudo actualizar' });
    }
  }

  async function eliminarInsumo(i: Insumo) {
    if (!window.confirm(`¿Eliminar "${i.nombre}" definitivamente?`)) return;
    try {
      await gqlRequest(MUTATION_ELIMINAR_INSUMO, { id: i.id });
      setInsumos((prev) => prev.filter((x) => x.id !== i.id));
    } catch (e) {
      setErrorFila({ id: i.id, msg: e instanceof Error ? e.message : 'No se pudo eliminar' });
    }
  }

  return (
    <>
      <header className="cancha-header">
        <h1>📦 Stock</h1>
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
          <Link href="/configuracion" className="btn btn-blanco">
            ⚙️ Config
          </Link>
          <div className="reloj">
            {totalAlertas > 0 ? `⚠️ ${totalAlertas} bajo mínimo` : `${insumosFiltrados.length} insumos`}
          </div>
        </div>
      </header>

      <div className="pedidos-page">
        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo" style={{ minWidth: 200 }}>
            <label htmlFor="nuevoNombre">Nombre</label>
            <input id="nuevoNombre" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoUnidad">Unidad</label>
            <input
              id="nuevoUnidad"
              placeholder="kg, lb, unidad..."
              value={nuevoUnidad}
              onChange={(e) => setNuevoUnidad(e.target.value)}
            />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoStockActual">Stock actual</label>
            <input
              id="nuevoStockActual"
              type="number"
              min="0"
              step="0.01"
              value={nuevoStockActual}
              onChange={(e) => setNuevoStockActual(e.target.value)}
            />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoStockMinimo">Stock mínimo</label>
            <input
              id="nuevoStockMinimo"
              type="number"
              min="0"
              step="0.01"
              value={nuevoStockMinimo}
              onChange={(e) => setNuevoStockMinimo(e.target.value)}
            />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevoStockIdeal">Stock ideal</label>
            <input
              id="nuevoStockIdeal"
              type="number"
              min="0"
              step="0.01"
              value={nuevoStockIdeal}
              onChange={(e) => setNuevoStockIdeal(e.target.value)}
            />
          </div>
          <button className="btn btn-naranja" disabled={creando} onClick={crearInsumo}>
            + Agregar insumo
          </button>
          {errorCrear && <div className="pedidos-error">{errorCrear}</div>}
        </div>

        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo">
            <label htmlFor="buscarInsumo">Buscar</label>
            <input
              id="buscarInsumo"
              placeholder="Nombre del insumo..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="filtro-campo">
            <label htmlFor="soloAlerta">Alertas</label>
            <select
              id="soloAlerta"
              value={soloAlerta ? 'si' : 'no'}
              onChange={(e) => setSoloAlerta(e.target.value === 'si')}
            >
              <option value="no">Todos</option>
              <option value="si">Solo bajo mínimo</option>
            </select>
          </div>
        </div>

        {error && <div className="pedidos-error">{error}</div>}

        <div className="tabla-pedidos-wrap card-blanca">
          {cargando ? (
            <div className="vacio-col">Cargando...</div>
          ) : insumosFiltrados.length === 0 ? (
            <div className="vacio-col">No hay insumos con estos filtros</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Unidad</th>
                  <th>Stock actual</th>
                  <th>Stock mínimo</th>
                  <th>Stock ideal</th>
                  <th>Activo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {insumosFiltrados.map((i) => {
                  const enEdicion = editId === i.id;
                  return (
                    <Fragment key={i.id}>
                      <tr className={!i.activo ? 'fila-inactiva' : i.bajoMinimo ? 'fila-alerta' : ''}>
                        {enEdicion ? (
                          <>
                            <td>
                              <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
                            </td>
                            <td>
                              <input value={editUnidad} onChange={(e) => setEditUnidad(e.target.value)} />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editStockActual}
                                onChange={(e) => setEditStockActual(e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editStockMinimo}
                                onChange={(e) => setEditStockMinimo(e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editStockIdeal}
                                onChange={(e) => setEditStockIdeal(e.target.value)}
                              />
                            </td>
                            <td>{i.activo ? 'Sí' : 'No'}</td>
                            <td className="acciones-productos">
                              <button className="btn btn-verde" disabled={guardando} onClick={() => guardarEdicion(i.id)}>
                                Guardar
                              </button>
                              <button className="btn btn-blanco" onClick={cancelarEdicion}>
                                Cancelar
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              {i.nombre}
                              {i.bajoMinimo && <span className="badge-alerta">bajo mínimo</span>}
                            </td>
                            <td>{i.unidad}</td>
                            <td className="col-monto">{i.stockActual}</td>
                            <td className="col-monto">{i.stockMinimo}</td>
                            <td className="col-monto">{i.stockIdeal}</td>
                            <td>
                              <button className="btn btn-blanco" onClick={() => toggleActivo(i)}>
                                {i.activo ? 'Sí — ocultar' : 'No — activar'}
                              </button>
                            </td>
                            <td className="acciones-productos">
                              <button className="btn btn-blanco" onClick={() => iniciarEdicion(i)}>
                                Editar
                              </button>
                              <button className="btn btn-naranja" onClick={() => eliminarInsumo(i)}>
                                Eliminar
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                      {errorFila?.id === i.id && (
                        <tr>
                          <td colSpan={7} className="pedidos-error">
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
