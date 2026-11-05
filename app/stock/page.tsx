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
  QUERY_MOVIMIENTOS_INSUMO,
  MUTATION_REGISTRAR_MOVIMIENTO_INSUMO,
} from '@/lib/queries';
import type { Insumo, MovimientoInsumo, TipoMovimientoInsumo } from '@/lib/types';

export default function StockPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoUnidad, setNuevoUnidad] = useState('');
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState('');
  const [nuevoStockIdeal, setNuevoStockIdeal] = useState('');
  const [nuevoPrecioReferencia, setNuevoPrecioReferencia] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editUnidad, setEditUnidad] = useState('');
  const [editStockMinimo, setEditStockMinimo] = useState('');
  const [editStockIdeal, setEditStockIdeal] = useState('');
  const [editPrecioReferencia, setEditPrecioReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorFila, setErrorFila] = useState<{ id: string; msg: string } | null>(null);

  const [soloAlerta, setSoloAlerta] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  // carga / descarga
  const [movimientoAbierto, setMovimientoAbierto] = useState<{ id: string; tipo: TipoMovimientoInsumo } | null>(null);
  const [movCantidad, setMovCantidad] = useState('');
  const [movPrecio, setMovPrecio] = useState('');
  const [movNota, setMovNota] = useState('');
  const [movArchivo, setMovArchivo] = useState<File | null>(null);
  const [movGuardando, setMovGuardando] = useState(false);
  const [movError, setMovError] = useState('');

  // histórico
  const [historicoAbierto, setHistoricoAbierto] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Record<string, MovimientoInsumo[]>>({});
  const [historicoCargando, setHistoricoCargando] = useState<string | null>(null);

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
    const stockMinimo = parseFloat(nuevoStockMinimo || '0');
    const stockIdeal = parseFloat(nuevoStockIdeal || '0');
    const precioReferencia = parseFloat(nuevoPrecioReferencia || '0');
    if (!nombre || !unidad || Number.isNaN(stockMinimo) || Number.isNaN(stockIdeal) || Number.isNaN(precioReferencia)) {
      setErrorCrear('Completa nombre, unidad, stock mínimo/ideal y precio de referencia');
      return;
    }
    setCreando(true);
    setErrorCrear('');
    try {
      const data = await gqlRequest<{ crearInsumo: Insumo }>(MUTATION_CREAR_INSUMO, {
        nombre,
        unidad,
        stockMinimo,
        stockIdeal,
        precioReferencia,
      });
      setInsumos((prev) => [...prev, data.crearInsumo]);
      setNuevoNombre('');
      setNuevoUnidad('');
      setNuevoStockMinimo('');
      setNuevoStockIdeal('');
      setNuevoPrecioReferencia('');
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
    setEditStockMinimo(String(i.stockMinimo));
    setEditStockIdeal(String(i.stockIdeal));
    setEditPrecioReferencia(String(i.precioReferencia));
    setErrorFila(null);
  }

  function cancelarEdicion() {
    setEditId(null);
  }

  async function guardarEdicion(id: string) {
    const nombre = editNombre.trim();
    const unidad = editUnidad.trim();
    const stockMinimo = parseFloat(editStockMinimo);
    const stockIdeal = parseFloat(editStockIdeal);
    const precioReferencia = parseFloat(editPrecioReferencia);
    if (!nombre || !unidad || Number.isNaN(stockMinimo) || Number.isNaN(stockIdeal) || Number.isNaN(precioReferencia)) {
      setErrorFila({ id, msg: 'Completa nombre, unidad, stock mínimo/ideal y precio de referencia' });
      return;
    }
    setGuardando(true);
    setErrorFila(null);
    try {
      const data = await gqlRequest<{ actualizarInsumo: Insumo }>(MUTATION_ACTUALIZAR_INSUMO, {
        id,
        nombre,
        unidad,
        stockMinimo,
        stockIdeal,
        precioReferencia,
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
    if (!window.confirm(`¿Eliminar "${i.nombre}" definitivamente? También se borra su histórico de cargas/descargas.`)) return;
    try {
      await gqlRequest(MUTATION_ELIMINAR_INSUMO, { id: i.id });
      setInsumos((prev) => prev.filter((x) => x.id !== i.id));
    } catch (e) {
      setErrorFila({ id: i.id, msg: e instanceof Error ? e.message : 'No se pudo eliminar' });
    }
  }

  function abrirMovimiento(i: Insumo, tipo: TipoMovimientoInsumo) {
    setMovimientoAbierto({ id: i.id, tipo });
    setMovCantidad('');
    setMovPrecio(tipo === 'carga' ? String(i.precioReferencia) : '');
    setMovNota('');
    setMovArchivo(null);
    setMovError('');
    setErrorFila(null);
  }

  function cerrarMovimiento() {
    setMovimientoAbierto(null);
  }

  async function confirmarMovimiento(i: Insumo) {
    if (!movimientoAbierto) return;
    const cantidad = parseFloat(movCantidad);
    if (Number.isNaN(cantidad) || cantidad <= 0) {
      setMovError('Ingresa una cantidad válida');
      return;
    }
    let precioUnitario: number | undefined;
    if (movimientoAbierto.tipo === 'carga') {
      precioUnitario = movPrecio.trim() === '' ? undefined : parseFloat(movPrecio);
      if (precioUnitario !== undefined && Number.isNaN(precioUnitario)) {
        setMovError('Precio inválido');
        return;
      }
    }

    setMovGuardando(true);
    setMovError('');
    try {
      let facturaKey: string | undefined;
      if (movimientoAbierto.tipo === 'carga' && movArchivo) {
        const prep = await fetch('/api/stock/factura-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ insumoId: i.id, fileName: movArchivo.name }),
        });
        const prepData = await prep.json();
        if (!prep.ok) throw new Error(prepData.error || 'No se pudo preparar la subida de la factura');

        const subida = await fetch(prepData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: movArchivo,
        });
        if (!subida.ok) throw new Error('No se pudo subir la factura');
        facturaKey = prepData.key;
      }

      const data = await gqlRequest<{ registrarMovimientoInsumo: MovimientoInsumo }>(
        MUTATION_REGISTRAR_MOVIMIENTO_INSUMO,
        {
          insumoId: i.id,
          tipo: movimientoAbierto.tipo,
          cantidad,
          precioUnitario,
          facturaKey,
          nota: movNota.trim() || undefined,
        }
      );

      setInsumos((prev) =>
        prev.map((x) => {
          if (x.id !== i.id) return x;
          const delta = movimientoAbierto.tipo === 'carga' ? cantidad : -cantidad;
          const stockActual = x.stockActual + delta;
          return { ...x, stockActual, bajoMinimo: stockActual < x.stockMinimo };
        })
      );
      if (historico[i.id]) {
        setHistorico((prev) => ({ ...prev, [i.id]: [data.registrarMovimientoInsumo, ...prev[i.id]] }));
      }
      setMovimientoAbierto(null);
    } catch (e) {
      setMovError(e instanceof Error ? e.message : 'No se pudo registrar el movimiento');
    } finally {
      setMovGuardando(false);
    }
  }

  async function toggleHistorico(i: Insumo) {
    if (historicoAbierto === i.id) {
      setHistoricoAbierto(null);
      return;
    }
    setHistoricoAbierto(i.id);
    if (!historico[i.id]) {
      setHistoricoCargando(i.id);
      try {
        const data = await gqlRequest<{ movimientosInsumo: MovimientoInsumo[] }>(QUERY_MOVIMIENTOS_INSUMO, {
          insumoId: i.id,
        });
        setHistorico((prev) => ({ ...prev, [i.id]: data.movimientosInsumo }));
      } catch {
        setErrorFila({ id: i.id, msg: 'No se pudo cargar el histórico' });
      } finally {
        setHistoricoCargando(null);
      }
    }
  }

  async function verFactura(key: string) {
    try {
      const res = await fetch(`/api/stock/factura?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir la factura');
      window.open(data.url, '_blank');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo abrir la factura');
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
          <div className="filtro-campo">
            <label htmlFor="nuevoPrecioReferencia">Precio referencia</label>
            <input
              id="nuevoPrecioReferencia"
              type="number"
              min="0"
              step="0.01"
              value={nuevoPrecioReferencia}
              onChange={(e) => setNuevoPrecioReferencia(e.target.value)}
            />
          </div>
          <button className="btn btn-naranja" disabled={creando} onClick={crearInsumo}>
            + Agregar insumo
          </button>
          {errorCrear && <div className="pedidos-error">{errorCrear}</div>}
        </div>
        <p className="ayuda-stock">
          El stock inicial de un insumo nuevo se registra con el botón <b>Cargar</b> de su fila (queda en el histórico,
          igual que cualquier otra compra).
        </p>

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
                  <th>Precio ref.</th>
                  <th>Activo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {insumosFiltrados.map((i) => {
                  const enEdicion = editId === i.id;
                  const movAbierto = movimientoAbierto?.id === i.id ? movimientoAbierto.tipo : null;
                  const histAbierto = historicoAbierto === i.id;
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
                            <td className="col-monto">{i.stockActual}</td>
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
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editPrecioReferencia}
                                onChange={(e) => setEditPrecioReferencia(e.target.value)}
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
                            <td className="col-monto">${i.precioReferencia.toFixed(2)}</td>
                            <td>
                              <button className="btn btn-blanco" onClick={() => toggleActivo(i)}>
                                {i.activo ? 'Sí — ocultar' : 'No — activar'}
                              </button>
                            </td>
                            <td className="acciones-productos">
                              <button className="btn btn-verde" onClick={() => abrirMovimiento(i, 'carga')}>
                                ⬆️ Cargar
                              </button>
                              <button className="btn btn-naranja" onClick={() => abrirMovimiento(i, 'descarga')}>
                                ⬇️ Descargar
                              </button>
                              <button className="btn btn-blanco" onClick={() => toggleHistorico(i)}>
                                {histAbierto ? 'Ocultar histórico' : 'Ver histórico'}
                              </button>
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

                      {movAbierto && (
                        <tr>
                          <td colSpan={8}>
                            <div className="panel-movimiento">
                              <strong>{movAbierto === 'carga' ? '⬆️ Cargar stock' : '⬇️ Descargar stock'}</strong>
                              <div className="filtro-campo">
                                <label>Cantidad ({i.unidad})</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={movCantidad}
                                  onChange={(e) => setMovCantidad(e.target.value)}
                                  autoFocus
                                />
                              </div>
                              {movAbierto === 'carga' && (
                                <>
                                  <div className="filtro-campo">
                                    <label>Precio unitario (ref. ${i.precioReferencia.toFixed(2)})</label>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={movPrecio}
                                      onChange={(e) => setMovPrecio(e.target.value)}
                                    />
                                  </div>
                                  <div className="filtro-campo">
                                    <label>Factura (PDF, opcional)</label>
                                    <input
                                      type="file"
                                      accept="application/pdf"
                                      onChange={(e) => setMovArchivo(e.target.files?.[0] || null)}
                                    />
                                  </div>
                                </>
                              )}
                              <div className="filtro-campo" style={{ minWidth: 220 }}>
                                <label>Nota (opcional)</label>
                                <input value={movNota} onChange={(e) => setMovNota(e.target.value)} />
                              </div>
                              <button
                                className="btn btn-verde"
                                disabled={movGuardando}
                                onClick={() => confirmarMovimiento(i)}
                              >
                                Confirmar
                              </button>
                              <button className="btn btn-blanco" onClick={cerrarMovimiento}>
                                Cancelar
                              </button>
                              {movError && <div className="pedidos-error">{movError}</div>}
                            </div>
                          </td>
                        </tr>
                      )}

                      {histAbierto && (
                        <tr>
                          <td colSpan={8}>
                            {historicoCargando === i.id ? (
                              <div className="vacio-col">Cargando histórico...</div>
                            ) : !historico[i.id] || historico[i.id].length === 0 ? (
                              <div className="vacio-col">Sin movimientos todavía</div>
                            ) : (
                              <table className="tabla-pedidos tabla-historico">
                                <thead>
                                  <tr>
                                    <th>Fecha</th>
                                    <th>Tipo</th>
                                    <th>Cantidad</th>
                                    <th>Precio unitario</th>
                                    <th>Nota</th>
                                    <th>Factura</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {historico[i.id].map((m) => (
                                    <tr key={m.id}>
                                      <td>{new Date(m.createdAt).toLocaleString('es')}</td>
                                      <td>{m.tipo === 'carga' ? '⬆️ Carga' : '⬇️ Descarga'}</td>
                                      <td className="col-monto">{m.cantidad}</td>
                                      <td className="col-monto">${m.precioUnitario.toFixed(2)}</td>
                                      <td>{m.nota || '—'}</td>
                                      <td>
                                        {m.facturaKey ? (
                                          <button className="btn btn-blanco" onClick={() => verFactura(m.facturaKey!)}>
                                            Ver factura
                                          </button>
                                        ) : (
                                          '—'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}

                      {errorFila?.id === i.id && (
                        <tr>
                          <td colSpan={8} className="pedidos-error">
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
