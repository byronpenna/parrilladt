'use client';

import { useMemo, useState } from 'react';
import writeXlsxFile from 'write-excel-file';
import { gqlRequest } from '@/lib/graphql-client';
import { MUTATION_CREAR_ORDEN_COMPRA } from '@/lib/queries';
import type { Insumo, OrdenCompra } from '@/lib/types';

type ModoPedido = 'no' | 'minimo' | 'ideal' | 'manual';

function moneda(valor: number) {
  return `$${valor.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function OrdenCompraModal({
  insumos,
  onClose,
  onCreada,
}: {
  insumos: Insumo[];
  onClose: () => void;
  onCreada: (orden: OrdenCompra) => void;
}) {
  const insumosBajoMinimo = useMemo(
    () => insumos.filter((i) => i.activo && i.bajoMinimo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [insumos]
  );

  const [modoPorInsumo, setModoPorInsumo] = useState<Record<string, ModoPedido>>(() => {
    const inicial: Record<string, ModoPedido> = {};
    for (const i of insumosBajoMinimo) inicial[i.id] = 'ideal';
    return inicial;
  });
  const [manualPorInsumo, setManualPorInsumo] = useState<Record<string, string>>({});

  const [extras, setExtras] = useState<{ insumoId: string; cantidad: string }[]>([]);
  const [insumoAAgregar, setInsumoAAgregar] = useState('');
  const [cantidadAAgregar, setCantidadAAgregar] = useState('');

  const [nota, setNota] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');

  const insumosDisponiblesParaAgregar = useMemo(
    () =>
      insumos
        .filter((i) => i.activo && !i.bajoMinimo && !extras.some((e) => e.insumoId === i.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [insumos, extras]
  );

  function cantidadSugerida(i: Insumo, modo: ModoPedido) {
    if (modo === 'minimo') return Math.max(0, i.stockMinimo - i.stockActual);
    if (modo === 'ideal') return Math.max(0, i.stockIdeal - i.stockActual);
    if (modo === 'manual') return parseFloat(manualPorInsumo[i.id] || '0') || 0;
    return 0;
  }

  const lineas = useMemo(() => {
    const porBajoMinimo = insumosBajoMinimo
      .map((i) => ({ insumo: i, cantidad: cantidadSugerida(i, modoPorInsumo[i.id] || 'no') }))
      .filter((l) => l.cantidad > 0);

    const porExtras = extras
      .map((e) => {
        const insumo = insumos.find((i) => i.id === e.insumoId);
        if (!insumo) return null;
        const cantidad = parseFloat(e.cantidad) || 0;
        return { insumo, cantidad };
      })
      .filter((l): l is { insumo: Insumo; cantidad: number } => l !== null && l.cantidad > 0);

    return [...porBajoMinimo, ...porExtras];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insumosBajoMinimo, modoPorInsumo, manualPorInsumo, extras, insumos]);

  const total = useMemo(
    () => lineas.reduce((s, l) => s + l.cantidad * l.insumo.precioReferencia, 0),
    [lineas]
  );

  function agregarExtra() {
    if (!insumoAAgregar) return;
    const cantidad = parseFloat(cantidadAAgregar);
    if (Number.isNaN(cantidad) || cantidad <= 0) return;
    setExtras((prev) => [...prev, { insumoId: insumoAAgregar, cantidad: cantidadAAgregar }]);
    setInsumoAAgregar('');
    setCantidadAAgregar('');
  }

  function quitarExtra(insumoId: string) {
    setExtras((prev) => prev.filter((e) => e.insumoId !== insumoId));
  }

  async function descargarExcel() {
    const schema = [
      { column: 'Insumo', type: String, width: 28, value: (l: (typeof lineas)[number]) => l.insumo.nombre },
      { column: 'Unidad', type: String, width: 10, value: (l: (typeof lineas)[number]) => l.insumo.unidad },
      { column: 'Cantidad a pedir', type: Number, format: '0.00', width: 16, value: (l: (typeof lineas)[number]) => l.cantidad },
      {
        column: 'Precio ref. unitario',
        type: Number,
        format: '0.00',
        width: 16,
        value: (l: (typeof lineas)[number]) => l.insumo.precioReferencia,
      },
      {
        column: 'Subtotal',
        type: Number,
        format: '0.00',
        width: 14,
        value: (l: (typeof lineas)[number]) => l.cantidad * l.insumo.precioReferencia,
      },
    ];
    const fecha = new Date().toISOString().slice(0, 10);
    await writeXlsxFile(lineas, { schema, fileName: `orden_compra_${fecha}.xlsx`, sheet: 'Orden de compra' });
  }

  async function crearOrden() {
    setCreando(true);
    setErrorCrear('');
    try {
      const data = await gqlRequest<{ crearOrdenCompra: OrdenCompra }>(MUTATION_CREAR_ORDEN_COMPRA, {
        items: lineas.map((l) => ({ insumoId: l.insumo.id, cantidad: l.cantidad })),
        nota: nota.trim() || undefined,
      });
      onCreada(data.crearOrdenCompra);
    } catch (e) {
      setErrorCrear(e instanceof Error ? e.message : 'No se pudo crear la orden de compra');
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🧾 Nueva orden de compra</h3>
          <button className="modal-cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-cuerpo">
          <h2 className="chart-titulo">Insumos bajo mínimo</h2>
          {insumosBajoMinimo.length === 0 ? (
            <p className="ayuda-stock">No hay insumos bajo mínimo en este momento.</p>
          ) : (
            <table className="tabla-pedidos tabla-historico">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Actual</th>
                  <th>Mínimo</th>
                  <th>Ideal</th>
                  <th>Pedir</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {insumosBajoMinimo.map((i) => {
                  const modo = modoPorInsumo[i.id] || 'no';
                  return (
                    <tr key={i.id}>
                      <td>{i.nombre}</td>
                      <td className="col-monto">
                        {i.stockActual} {i.unidad}
                      </td>
                      <td className="col-monto">
                        {i.stockMinimo} {i.unidad}
                      </td>
                      <td className="col-monto">
                        {i.stockIdeal} {i.unidad}
                      </td>
                      <td>
                        <select
                          value={modo}
                          onChange={(e) =>
                            setModoPorInsumo((prev) => ({ ...prev, [i.id]: e.target.value as ModoPedido }))
                          }
                        >
                          <option value="no">No pedir</option>
                          <option value="minimo">
                            Hasta mínimo (+{Math.max(0, i.stockMinimo - i.stockActual)} {i.unidad})
                          </option>
                          <option value="ideal">
                            Hasta ideal (+{Math.max(0, i.stockIdeal - i.stockActual)} {i.unidad})
                          </option>
                          <option value="manual">Cantidad personalizada</option>
                        </select>
                      </td>
                      <td className="col-monto">
                        {modo === 'manual' ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            style={{ width: 90 }}
                            value={manualPorInsumo[i.id] ?? ''}
                            onChange={(e) => setManualPorInsumo((prev) => ({ ...prev, [i.id]: e.target.value }))}
                          />
                        ) : (
                          `${cantidadSugerida(i, modo)} ${i.unidad}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <h2 className="chart-titulo">Agregar otro producto</h2>
          <p className="ayuda-stock">
            También puedes incluir insumos que no están bajo mínimo, por ejemplo si conviene comprarlos junto con los
            demás.
          </p>
          <div className="panel-movimiento">
            <div className="filtro-campo" style={{ minWidth: 220 }}>
              <label>Insumo</label>
              <select value={insumoAAgregar} onChange={(e) => setInsumoAAgregar(e.target.value)}>
                <option value="">Selecciona...</option>
                {insumosDisponiblesParaAgregar.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.stockActual} {i.unidad} actual)
                  </option>
                ))}
              </select>
            </div>
            <div className="filtro-campo">
              <label>Cantidad</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cantidadAAgregar}
                onChange={(e) => setCantidadAAgregar(e.target.value)}
              />
            </div>
            <button className="btn btn-blanco" onClick={agregarExtra} disabled={!insumoAAgregar}>
              + Agregar
            </button>
          </div>

          <h2 className="chart-titulo">Resumen de la orden</h2>
          {lineas.length === 0 ? (
            <p className="ayuda-stock">Todavía no has agregado nada a la orden.</p>
          ) : (
            <table className="tabla-pedidos tabla-historico">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Cantidad</th>
                  <th>Precio ref.</th>
                  <th>Subtotal</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l) => (
                  <tr key={l.insumo.id}>
                    <td>{l.insumo.nombre}</td>
                    <td className="col-monto">
                      {l.cantidad} {l.insumo.unidad}
                    </td>
                    <td className="col-monto">{moneda(l.insumo.precioReferencia)}</td>
                    <td className="col-monto">{moneda(l.cantidad * l.insumo.precioReferencia)}</td>
                    <td>
                      {extras.some((e) => e.insumoId === l.insumo.id) ? (
                        <button className="btn btn-blanco" onClick={() => quitarExtra(l.insumo.id)}>
                          Quitar
                        </button>
                      ) : (
                        <button
                          className="btn btn-blanco"
                          onClick={() => setModoPorInsumo((prev) => ({ ...prev, [l.insumo.id]: 'no' }))}
                        >
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total estimado</td>
                  <td className="col-monto">{moneda(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}

          <div className="filtro-campo" style={{ minWidth: 280 }}>
            <label>Nota (opcional)</label>
            <input value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>

          {errorCrear && <div className="pedidos-error">{errorCrear}</div>}

          <div className="acciones-productos">
            <button className="btn btn-naranja" disabled={lineas.length === 0 || creando} onClick={crearOrden}>
              🧾 Crear orden de compra
            </button>
            <button className="btn btn-blanco" disabled={lineas.length === 0} onClick={descargarExcel}>
              📥 Descargar (Excel)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
