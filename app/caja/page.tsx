'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import LogoutButton from '@/components/LogoutButton';
import AperturaCierreModal from './AperturaCierreModal';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_CUENTAS,
  MUTATION_CREAR_CUENTA,
  MUTATION_ACTUALIZAR_CUENTA,
  QUERY_CIERRE_DIA_ACTUAL,
  QUERY_CIERRES_DIA,
  MUTATION_ELIMINAR_CIERRE_DIA,
} from '@/lib/queries';
import type { Cuenta, TipoCuenta, CierreDia } from '@/lib/types';
import { formatoNegocio } from '@/lib/timezone';

function moneda(valor: number) {
  return `$${valor.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fechaHora(iso: string) {
  return formatoNegocio(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
}

function claseDiferencia(d: number | null) {
  if (d === null) return '';
  if (Math.abs(d) < 0.01) return 'diferencia-ok';
  return d < 0 ? 'diferencia-faltante' : 'diferencia-sobrante';
}

function textoDiferencia(d: number | null) {
  if (d === null) return '—';
  if (Math.abs(d) < 0.01) return 'Cuadra exacto';
  return d < 0 ? `Faltante: ${moneda(Math.abs(d))}` : `Sobrante: ${moneda(d)}`;
}

export default function CajaPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [nuevaCuentaNombre, setNuevaCuentaNombre] = useState('');
  const [nuevaCuentaTipo, setNuevaCuentaTipo] = useState<TipoCuenta>('efectivo');
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  const [errorCuenta, setErrorCuenta] = useState('');

  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [errorFila, setErrorFila] = useState<{ id: string; msg: string } | null>(null);
  const [subiendoQrId, setSubiendoQrId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [cierreActual, setCierreActual] = useState<CierreDia | null | undefined>(undefined);
  const [historico, setHistorico] = useState<CierreDia[]>([]);
  const [cargandoCierre, setCargandoCierre] = useState(true);
  const [modal, setModal] = useState<'abrir' | 'cerrar' | null>(null);

  useEffect(() => {
    cargarCuentas();
    cargarCierre();
  }, []);

  async function cargarCuentas() {
    setCargandoCuentas(true);
    try {
      const data = await gqlRequest<{ cuentas: Cuenta[] }>(QUERY_CUENTAS);
      setCuentas(data.cuentas);
    } catch {
      // la página sigue funcionando con lo que ya haya en memoria
    } finally {
      setCargandoCuentas(false);
    }
  }

  async function cargarCierre() {
    setCargandoCierre(true);
    try {
      const [actualData, historicoData] = await Promise.all([
        gqlRequest<{ cierreDiaActual: CierreDia | null }>(QUERY_CIERRE_DIA_ACTUAL),
        gqlRequest<{ cierresDia: CierreDia[] }>(QUERY_CIERRES_DIA, { limite: 30 }),
      ]);
      setCierreActual(actualData.cierreDiaActual);
      setHistorico(historicoData.cierresDia);
    } catch {
      setCierreActual(null);
    } finally {
      setCargandoCierre(false);
    }
  }

  const cuentasActivas = useMemo(() => cuentas.filter((c) => c.activa), [cuentas]);
  const totalDisponible = useMemo(() => cuentasActivas.reduce((s, c) => s + c.saldoActual, 0), [cuentasActivas]);
  const totalEfectivo = useMemo(
    () => cuentasActivas.filter((c) => c.tipo === 'efectivo').reduce((s, c) => s + c.saldoActual, 0),
    [cuentasActivas]
  );
  const totalBanco = useMemo(
    () => cuentasActivas.filter((c) => c.tipo === 'banco').reduce((s, c) => s + c.saldoActual, 0),
    [cuentasActivas]
  );

  async function crearCuenta() {
    const nombre = nuevaCuentaNombre.trim();
    if (!nombre) {
      setErrorCuenta('Escribe un nombre para la cuenta');
      return;
    }
    setCreandoCuenta(true);
    setErrorCuenta('');
    try {
      const data = await gqlRequest<{ crearCuenta: Cuenta }>(MUTATION_CREAR_CUENTA, {
        nombre,
        tipo: nuevaCuentaTipo,
      });
      setCuentas((prev) => [...prev, data.crearCuenta]);
      setNuevaCuentaNombre('');
    } catch (e) {
      setErrorCuenta(e instanceof Error ? e.message : 'No se pudo crear la cuenta');
    } finally {
      setCreandoCuenta(false);
    }
  }

  async function toggleCuentaActiva(c: Cuenta) {
    try {
      const data = await gqlRequest<{ actualizarCuenta: Cuenta }>(MUTATION_ACTUALIZAR_CUENTA, {
        id: c.id,
        activa: !c.activa,
      });
      setCuentas((prev) => prev.map((x) => (x.id === c.id ? data.actualizarCuenta : x)));
    } catch {
      cargarCuentas();
    }
  }

  function iniciarEdicionNombre(c: Cuenta) {
    setEditId(c.id);
    setEditNombre(c.nombre);
    setErrorFila(null);
  }

  async function guardarNombre(id: string) {
    const nombre = editNombre.trim();
    if (!nombre) {
      setErrorFila({ id, msg: 'El nombre no puede quedar vacío' });
      return;
    }
    setGuardandoNombre(true);
    setErrorFila(null);
    try {
      const data = await gqlRequest<{ actualizarCuenta: Cuenta }>(MUTATION_ACTUALIZAR_CUENTA, { id, nombre });
      setCuentas((prev) => prev.map((x) => (x.id === id ? data.actualizarCuenta : x)));
      setEditId(null);
    } catch (e) {
      setErrorFila({ id, msg: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setGuardandoNombre(false);
    }
  }

  async function subirQr(c: Cuenta, file: File | undefined) {
    if (!file) return;
    setSubiendoQrId(c.id);
    setErrorFila(null);
    try {
      const prep = await fetch('/api/caja/qr-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuentaId: c.id, fileName: file.name }),
      });
      const prepData = await prep.json();
      if (!prep.ok) throw new Error(prepData.error || 'No se pudo preparar la subida');

      const subida = await fetch(prepData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': prepData.contentType },
        body: file,
      });
      if (!subida.ok) throw new Error('No se pudo subir el QR');

      const qrAnteriorKey = c.qrUrl ? c.qrUrl.split('/').slice(-3).join('/') : null;
      const data = await gqlRequest<{ actualizarCuenta: Cuenta }>(MUTATION_ACTUALIZAR_CUENTA, {
        id: c.id,
        qrKey: prepData.key,
      });
      setCuentas((prev) => prev.map((x) => (x.id === c.id ? data.actualizarCuenta : x)));
      if (qrAnteriorKey) {
        fetch('/api/caja/qr-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: qrAnteriorKey }),
        }).catch(() => {});
      }
    } catch (e) {
      setErrorFila({ id: c.id, msg: e instanceof Error ? e.message : 'No se pudo subir el QR' });
    } finally {
      setSubiendoQrId(null);
      const input = fileInputRefs.current[c.id];
      if (input) input.value = '';
    }
  }

  async function quitarQr(c: Cuenta) {
    if (!c.qrUrl) return;
    if (!window.confirm('¿Quitar el QR de esta cuenta?')) return;
    const key = c.qrUrl.split('/').slice(-3).join('/');
    try {
      const data = await gqlRequest<{ actualizarCuenta: Cuenta }>(MUTATION_ACTUALIZAR_CUENTA, {
        id: c.id,
        qrKey: null,
      });
      setCuentas((prev) => prev.map((x) => (x.id === c.id ? data.actualizarCuenta : x)));
      fetch('/api/caja/qr-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      }).catch(() => {});
    } catch (e) {
      setErrorFila({ id: c.id, msg: e instanceof Error ? e.message : 'No se pudo quitar el QR' });
    }
  }

  async function eliminarAperturaPorError() {
    if (!cierreActual) return;
    if (!window.confirm('¿Deshacer la apertura de hoy? Solo se puede si todavía no se ha cerrado.')) return;
    try {
      await gqlRequest(MUTATION_ELIMINAR_CIERRE_DIA, { id: cierreActual.id });
      setCierreActual(null);
    } catch {
      cargarCierre();
    }
  }

  return (
    <>
      <header className="cancha-header">
        <h1>💰 Caja</h1>
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
          <Link href="/configuracion" className="btn btn-blanco">
            ⚙️ Config
          </Link>
        </div>
      </header>

      <div className="pedidos-page">
        <div className="kpi-grid">
          <div className="kpi-card card-blanca">
            <div className="kpi-label">Total disponible</div>
            <div className="kpi-valor">{moneda(totalDisponible)}</div>
          </div>
          <div className="kpi-card card-blanca">
            <div className="kpi-label">Efectivo</div>
            <div className="kpi-valor">{moneda(totalEfectivo)}</div>
          </div>
          <div className="kpi-card card-blanca">
            <div className="kpi-label">Bancos</div>
            <div className="kpi-valor">{moneda(totalBanco)}</div>
          </div>
          <div className="kpi-card card-blanca caja-estado-card">
            <div className="kpi-label">Estado de hoy</div>
            <div className="kpi-valor">
              {cargandoCierre
                ? '…'
                : !cierreActual
                  ? 'Sin abrir'
                  : cierreActual.estado === 'abierto'
                    ? '🟢 Abierto'
                    : '🔒 Cerrado'}
            </div>
            {!cargandoCierre && !cierreActual && (
              <button className="btn btn-verde" onClick={() => setModal('abrir')}>
                🔓 Abrir día
              </button>
            )}
            {!cargandoCierre && cierreActual?.estado === 'abierto' && (
              <button className="btn btn-naranja" onClick={() => setModal('cerrar')}>
                🔒 Cerrar día
              </button>
            )}
          </div>
        </div>

        {/* ── Cuentas ── */}
        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo" style={{ minWidth: 220 }}>
            <label htmlFor="nuevaCuentaNombre">Nueva cuenta</label>
            <input
              id="nuevaCuentaNombre"
              placeholder="ej. BAC Cuenta Corriente"
              value={nuevaCuentaNombre}
              onChange={(e) => setNuevaCuentaNombre(e.target.value)}
            />
          </div>
          <div className="filtro-campo">
            <label htmlFor="nuevaCuentaTipo">Tipo</label>
            <select
              id="nuevaCuentaTipo"
              value={nuevaCuentaTipo}
              onChange={(e) => setNuevaCuentaTipo(e.target.value as TipoCuenta)}
            >
              <option value="efectivo">Efectivo</option>
              <option value="banco">Banco</option>
            </select>
          </div>
          <button className="btn btn-naranja" disabled={creandoCuenta} onClick={crearCuenta}>
            + Agregar cuenta
          </button>
          {errorCuenta && <div className="pedidos-error">{errorCuenta}</div>}
        </div>

        <div className="tabla-pedidos-wrap card-blanca">
          {cargandoCuentas ? (
            <div className="vacio-col">Cargando...</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Tipo</th>
                  <th>Saldo actual</th>
                  <th>QR de cobro</th>
                  <th>Activa</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((c) => {
                  const enEdicion = editId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr className={c.activa ? '' : 'fila-inactiva'}>
                        <td>
                          {enEdicion ? (
                            <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus />
                          ) : (
                            c.nombre
                          )}
                        </td>
                        <td>{c.tipo === 'efectivo' ? '💵 Efectivo' : '🏦 Banco'}</td>
                        <td className="col-monto">{moneda(c.saldoActual)}</td>
                        <td>
                          {c.tipo === 'banco' ? (
                            <div className="caja-qr-celda">
                              {c.qrUrl && (
                                <a href={c.qrUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={c.qrUrl} alt={`QR de ${c.nombre}`} className="caja-qr-miniatura" />
                                </a>
                              )}
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[c.id] = el;
                                }}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                disabled={subiendoQrId === c.id}
                                onChange={(e) => subirQr(c, e.target.files?.[0])}
                                className="caja-qr-input"
                              />
                              {c.qrUrl && (
                                <button className="btn btn-blanco" onClick={() => quitarQr(c)}>
                                  Quitar
                                </button>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <button className="btn btn-blanco" onClick={() => toggleCuentaActiva(c)}>
                            {c.activa ? 'Sí — desactivar' : 'No — activar'}
                          </button>
                        </td>
                        <td className="acciones-productos">
                          {enEdicion ? (
                            <>
                              <button className="btn btn-verde" disabled={guardandoNombre} onClick={() => guardarNombre(c.id)}>
                                Guardar
                              </button>
                              <button className="btn btn-blanco" onClick={() => setEditId(null)}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-blanco" onClick={() => iniciarEdicionNombre(c)}>
                              Editar nombre
                            </button>
                          )}
                        </td>
                      </tr>
                      {errorFila?.id === c.id && (
                        <tr>
                          <td colSpan={6} className="pedidos-error">
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

        {/* ── Estado del día ── */}
        {cargandoCierre ? (
          <div className="card-blanca vacio-col">Cargando estado del día...</div>
        ) : !cierreActual ? (
          <div className="card-blanca panel-caja">
            <h2 className="chart-titulo">El día todavía no se ha abierto</h2>
            <p className="ayuda-stock">
              Usa el botón "🔓 Abrir día" de arriba para registrar cuánto hay en cada cuenta y empezar a vender.
            </p>
          </div>
        ) : cierreActual.estado === 'abierto' ? (
          <div className="card-blanca panel-caja">
            <h2 className="chart-titulo">Día abierto desde {fechaHora(cierreActual.abiertoEn)}</h2>
            <table className="tabla-pedidos tabla-historico">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Apertura</th>
                </tr>
              </thead>
              <tbody>
                {cierreActual.detalles.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.cuentaTipo === 'efectivo' ? '💵' : '🏦'} {d.cuentaNombre}
                    </td>
                    <td className="col-monto">{moneda(d.montoApertura)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cierreActual.notaApertura && <p className="ayuda-stock">📝 {cierreActual.notaApertura}</p>}
            <button className="btn btn-blanco" onClick={eliminarAperturaPorError}>
              Deshacer apertura (me equivoqué)
            </button>
          </div>
        ) : (
          <div className="card-blanca panel-caja">
            <h2 className="chart-titulo">
              Día cerrado — {fechaHora(cierreActual.abiertoEn)} a{' '}
              {cierreActual.cerradoEn && fechaHora(cierreActual.cerradoEn)}
            </h2>
            <div className="kpi-grid">
              <div className="kpi-card card-blanca">
                <div className="kpi-label">Ventas efectivo</div>
                <div className="kpi-valor">{moneda(cierreActual.ventasEfectivo ?? 0)}</div>
              </div>
              <div className="kpi-card card-blanca">
                <div className="kpi-label">Ventas transferencia</div>
                <div className="kpi-valor">{moneda(cierreActual.ventasTransferencia ?? 0)}</div>
              </div>
              <div className="kpi-card card-blanca">
                <div className="kpi-label">Ventas totales</div>
                <div className="kpi-valor">{moneda(cierreActual.ventasTotal ?? 0)}</div>
              </div>
            </div>
            <table className="tabla-pedidos tabla-historico">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th>Apertura</th>
                  <th>Real contado</th>
                </tr>
              </thead>
              <tbody>
                {cierreActual.detalles.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.cuentaTipo === 'efectivo' ? '💵' : '🏦'} {d.cuentaNombre}
                    </td>
                    <td className="col-monto">{moneda(d.montoApertura)}</td>
                    <td className="col-monto">{d.montoCierreReal !== null ? moneda(d.montoCierreReal) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="caja-diferencias">
              <div className={`caja-diferencia-chip ${claseDiferencia(cierreActual.diferenciaEfectivo)}`}>
                Efectivo: {textoDiferencia(cierreActual.diferenciaEfectivo)}
              </div>
              <div className={`caja-diferencia-chip ${claseDiferencia(cierreActual.diferenciaBanco)}`}>
                Bancos: {textoDiferencia(cierreActual.diferenciaBanco)}
              </div>
            </div>
            {cierreActual.notaApertura && <p className="ayuda-stock">📝 Apertura: {cierreActual.notaApertura}</p>}
            {cierreActual.notaCierre && <p className="ayuda-stock">📝 Cierre: {cierreActual.notaCierre}</p>}
          </div>
        )}

        {/* ── Histórico ── */}
        <div className="tabla-pedidos-wrap card-blanca">
          <h2 className="chart-titulo">Histórico de cierres</h2>
          {historico.length === 0 ? (
            <div className="vacio-col">Todavía no hay cierres registrados</div>
          ) : (
            <table className="tabla-pedidos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Ventas totales</th>
                  <th>Diferencia efectivo</th>
                  <th>Diferencia bancos</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td>{h.fecha}</td>
                    <td>
                      <span className={`estado-badge ${h.estado === 'cerrado' ? 'estado-listo' : 'estado-pendiente'}`}>
                        {h.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}
                      </span>
                    </td>
                    <td className="col-monto">{h.ventasTotal !== null ? moneda(h.ventasTotal) : '—'}</td>
                    <td className={claseDiferencia(h.diferenciaEfectivo)}>{textoDiferencia(h.diferenciaEfectivo)}</td>
                    <td className={claseDiferencia(h.diferenciaBanco)}>{textoDiferencia(h.diferenciaBanco)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal && (
        <AperturaCierreModal
          modo={modal}
          cuentasActivas={cuentasActivas}
          cierreActual={cierreActual ?? null}
          onClose={() => setModal(null)}
          onAbierto={(cierre) => {
            setCierreActual(cierre);
            setModal(null);
          }}
          onCerrado={(cierre) => {
            setCierreActual(cierre);
            setHistorico((prev) => [cierre, ...prev.filter((h) => h.id !== cierre.id)]);
            setModal(null);
            cargarCuentas();
          }}
        />
      )}
    </>
  );
}
