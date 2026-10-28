'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_PEDIDOS_REPORTE } from '@/lib/queries';
import type { Pedido, MetodoPago } from '@/lib/types';
import VentasChart, { type PuntoVentaSerie } from '@/components/VentasChart';

type Agrupacion = 'dia' | 'semana' | 'mes';

const METODO_PAGO_LABEL: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
};

const METODO_PAGO_COLOR: Record<MetodoPago, string> = {
  efectivo: 'var(--verde)',
  transferencia: 'var(--naranja)',
};

const AGRUPACION_OPCIONES: { valor: Agrupacion; label: string }[] = [
  { valor: 'dia', label: 'Día' },
  { valor: 'semana', label: 'Semana' },
  { valor: 'mes', label: 'Mes' },
];

const AGRUPACION_CONFIG: Record<
  Agrupacion,
  { label: string; defaultPeriodos: number; maxPeriodos: number; tendenciaLabel: string }
> = {
  dia: { label: 'día', defaultPeriodos: 30, maxPeriodos: 90, tendenciaLabel: 'vs. día anterior' },
  semana: { label: 'semana', defaultPeriodos: 12, maxPeriodos: 26, tendenciaLabel: 'vs. semana anterior' },
  mes: { label: 'mes', defaultPeriodos: 12, maxPeriodos: 24, tendenciaLabel: 'vs. mes anterior' },
};

function fechaLocal(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function isoDeHoyMenos(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return fechaLocal(d.toISOString());
}

function lunesDe(d: Date) {
  const copia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dia = copia.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  copia.setDate(copia.getDate() + diff);
  return copia;
}

function claveFecha(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function inicioPeriodo(d: Date, agrupacion: Agrupacion) {
  if (agrupacion === 'dia') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (agrupacion === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1);
  return lunesDe(d);
}

function siguientePeriodo(d: Date, agrupacion: Agrupacion) {
  const copia = new Date(d);
  if (agrupacion === 'dia') copia.setDate(copia.getDate() + 1);
  else if (agrupacion === 'mes') copia.setMonth(copia.getMonth() + 1);
  else copia.setDate(copia.getDate() + 7);
  return copia;
}

function restarPeriodos(d: Date, n: number, agrupacion: Agrupacion) {
  const copia = new Date(d);
  if (agrupacion === 'dia') copia.setDate(copia.getDate() - n);
  else if (agrupacion === 'mes') copia.setMonth(copia.getMonth() - n);
  else copia.setDate(copia.getDate() - 7 * n);
  return copia;
}

function contarPeriodos(inicio: Date, fin: Date, agrupacion: Agrupacion) {
  if (agrupacion === 'mes') {
    return (fin.getFullYear() - inicio.getFullYear()) * 12 + (fin.getMonth() - inicio.getMonth()) + 1;
  }
  const msPorPeriodo = agrupacion === 'dia' ? 86400000 : 7 * 86400000;
  return Math.round((fin.getTime() - inicio.getTime()) / msPorPeriodo) + 1;
}

function labelSemanaLargo(inicio: Date) {
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  const mesInicio = capitalizar(inicio.toLocaleDateString('es', { month: 'short' }).replace('.', ''));
  const mesFin = capitalizar(fin.toLocaleDateString('es', { month: 'short' }).replace('.', ''));
  if (inicio.getMonth() === fin.getMonth()) return `${inicio.getDate()} al ${fin.getDate()} de ${mesFin}`;
  return `${inicio.getDate()} ${mesInicio} al ${fin.getDate()} ${mesFin}`;
}

function labelCortoPeriodo(d: Date, agrupacion: Agrupacion) {
  if (agrupacion === 'mes') {
    return capitalizar(d.toLocaleDateString('es', { month: 'short', year: '2-digit' }).replace('.', ''));
  }
  return capitalizar(d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', ''));
}

function detallePeriodo(d: Date, agrupacion: Agrupacion) {
  if (agrupacion === 'dia') {
    return capitalizar(d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }));
  }
  if (agrupacion === 'mes') {
    return capitalizar(d.toLocaleDateString('es', { month: 'long', year: 'numeric' }));
  }
  return `Semana del ${labelSemanaLargo(d)}`;
}

function moneda(valor: number) {
  return `$${valor.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReportesPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('semana');

  useEffect(() => {
    cargarPedidos();
  }, []);

  async function cargarPedidos() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ pedidos: Pedido[] }>(QUERY_PEDIDOS_REPORTE, { soloActivos: false });
      setPedidos(data.pedidos);
    } catch {
      setError('No se pudieron cargar los datos de ventas');
    } finally {
      setCargando(false);
    }
  }

  function aplicarPreset(dias: number) {
    setFechaDesde(isoDeHoyMenos(dias - 1));
    setFechaHasta(isoDeHoyMenos(0));
  }

  function limpiarFiltros() {
    setFechaDesde('');
    setFechaHasta('');
  }

  const pedidosVenta = useMemo(() => pedidos.filter((p) => p.estado !== 'cancelado'), [pedidos]);

  const pedidosEnRango = useMemo(() => {
    return pedidosVenta.filter((p) => {
      const f = fechaLocal(p.createdAt);
      if (fechaDesde && f < fechaDesde) return false;
      if (fechaHasta && f > fechaHasta) return false;
      return true;
    });
  }, [pedidosVenta, fechaDesde, fechaHasta]);

  const totalVentas = useMemo(() => pedidosEnRango.reduce((s, p) => s + p.total, 0), [pedidosEnRango]);
  const totalPedidos = pedidosEnRango.length;
  const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;

  const serieVentas = useMemo<PuntoVentaSerie[]>(() => {
    const config = AGRUPACION_CONFIG[agrupacion];
    const finRango = fechaHasta
      ? inicioPeriodo(new Date(`${fechaHasta}T00:00:00`), agrupacion)
      : inicioPeriodo(new Date(), agrupacion);
    let inicioRango = fechaDesde
      ? inicioPeriodo(new Date(`${fechaDesde}T00:00:00`), agrupacion)
      : restarPeriodos(finRango, config.defaultPeriodos - 1, agrupacion);

    if (contarPeriodos(inicioRango, finRango, agrupacion) > config.maxPeriodos) {
      inicioRango = restarPeriodos(finRango, config.maxPeriodos - 1, agrupacion);
    }

    const buckets = new Map<string, { total: number; pedidos: number; inicio: Date }>();
    for (let cursor = new Date(inicioRango); cursor <= finRango; cursor = siguientePeriodo(cursor, agrupacion)) {
      buckets.set(claveFecha(cursor), { total: 0, pedidos: 0, inicio: new Date(cursor) });
    }

    for (const p of pedidosVenta) {
      const inicioP = inicioPeriodo(new Date(p.createdAt), agrupacion);
      const clave = claveFecha(inicioP);
      const bucket = buckets.get(clave);
      if (bucket) {
        bucket.total += p.total;
        bucket.pedidos += 1;
      }
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, b]) => ({
        clave,
        label: labelCortoPeriodo(b.inicio, agrupacion),
        detalle: detallePeriodo(b.inicio, agrupacion),
        total: Math.round(b.total * 100) / 100,
        pedidos: b.pedidos,
      }));
  }, [pedidosVenta, fechaDesde, fechaHasta, agrupacion]);

  const tendencia = useMemo(() => {
    if (serieVentas.length < 2) return null;
    const ultima = serieVentas[serieVentas.length - 1];
    const anterior = serieVentas[serieVentas.length - 2];
    if (anterior.total === 0) {
      return ultima.total === 0 ? 0 : 100;
    }
    return ((ultima.total - anterior.total) / anterior.total) * 100;
  }, [serieVentas]);

  const topProductos = useMemo(() => {
    const mapa = new Map<string, { cantidad: number; subtotal: number }>();
    for (const p of pedidosEnRango) {
      for (const item of p.items) {
        const actual = mapa.get(item.itemNombre) || { cantidad: 0, subtotal: 0 };
        actual.cantidad += item.cantidad;
        actual.subtotal += item.subtotal;
        mapa.set(item.itemNombre, actual);
      }
    }
    return [...mapa.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.subtotal - a.subtotal)
      .slice(0, 8);
  }, [pedidosEnRango]);

  const maxProducto = Math.max(1, ...topProductos.map((p) => p.subtotal));

  const porMetodoPago = useMemo(() => {
    const mapa = new Map<MetodoPago, number>();
    for (const p of pedidosEnRango) {
      mapa.set(p.metodoPago, (mapa.get(p.metodoPago) || 0) + p.total);
    }
    return (['efectivo', 'transferencia'] as MetodoPago[]).map((m) => ({
      metodo: m,
      total: mapa.get(m) || 0,
    }));
  }, [pedidosEnRango]);

  return (
    <>
      <header className="cancha-header">
        <h1>📈 Reportería</h1>
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
        </div>
      </header>

      <div className="reportes-page">
        <div className="filtros-pedidos card-blanca">
          <div className="filtro-campo">
            <label htmlFor="fechaDesde">Desde</label>
            <input id="fechaDesde" type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
          <div className="filtro-campo">
            <label htmlFor="fechaHasta">Hasta</label>
            <input id="fechaHasta" type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
          <button className="btn btn-blanco" onClick={() => aplicarPreset(7)}>
            Últimos 7 días
          </button>
          <button className="btn btn-blanco" onClick={() => aplicarPreset(30)}>
            Últimos 30 días
          </button>
          <button className="btn btn-blanco" onClick={() => aplicarPreset(90)}>
            Últimos 90 días
          </button>
          <button className="btn btn-blanco" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>

          <div className="filtro-campo">
            <label>Agrupar por</label>
            <div className="agrupador-toggle">
              {AGRUPACION_OPCIONES.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  className={`categoria-btn ${agrupacion === o.valor ? 'activa' : ''}`}
                  onClick={() => setAgrupacion(o.valor)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="pedidos-error">{error}</div>}

        {cargando ? (
          <div className="vacio-col">Cargando...</div>
        ) : (
          <>
            <div className="kpi-grid">
              <div className="kpi-card card-blanca">
                <div className="kpi-label">Ventas totales</div>
                <div className="kpi-valor">{moneda(totalVentas)}</div>
              </div>
              <div className="kpi-card card-blanca">
                <div className="kpi-label">Pedidos</div>
                <div className="kpi-valor">{totalPedidos}</div>
              </div>
              <div className="kpi-card card-blanca">
                <div className="kpi-label">Ticket promedio</div>
                <div className="kpi-valor">{moneda(ticketPromedio)}</div>
              </div>
              <div className="kpi-card card-blanca">
                <div className="kpi-label">Tendencia</div>
                {tendencia === null ? (
                  <div className="kpi-valor">—</div>
                ) : (
                  <div className={`kpi-valor kpi-delta ${tendencia >= 0 ? 'kpi-delta-up' : 'kpi-delta-down'}`}>
                    {tendencia >= 0 ? '▲' : '▼'} {Math.abs(tendencia).toFixed(1)}%
                  </div>
                )}
                <div className="kpi-sublabel">{AGRUPACION_CONFIG[agrupacion].tendenciaLabel}</div>
              </div>
            </div>

            <div className="chart-card card-blanca">
              <h2 className="chart-titulo">Ventas por {AGRUPACION_CONFIG[agrupacion].label}</h2>
              <VentasChart datos={serieVentas} ariaLabel={`Ventas totales por ${AGRUPACION_CONFIG[agrupacion].label}`} />
            </div>

            <div className="reportes-fila">
              <div className="chart-card card-blanca">
                <h2 className="chart-titulo">Productos más vendidos</h2>
                {topProductos.length === 0 ? (
                  <div className="vacio-col-claro">No hay ventas en este período</div>
                ) : (
                  <div className="producto-top-list">
                    {topProductos.map((p) => (
                      <div className="producto-top-row" key={p.nombre}>
                        <div className="producto-top-nombre">{p.nombre}</div>
                        <div className="producto-top-barra-wrap">
                          <div
                            className="producto-top-barra"
                            style={{ width: `${(p.subtotal / maxProducto) * 100}%` }}
                          />
                        </div>
                        <div className="producto-top-valor">
                          {moneda(p.subtotal)} <span className="producto-top-cantidad">· {p.cantidad}u</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="chart-card card-blanca">
                <h2 className="chart-titulo">Ventas por método de pago</h2>
                {totalVentas === 0 ? (
                  <div className="vacio-col-claro">No hay ventas en este período</div>
                ) : (
                  <div className="producto-top-list">
                    {porMetodoPago.map(({ metodo, total }) => (
                      <div className="producto-top-row" key={metodo}>
                        <div className="producto-top-nombre">{METODO_PAGO_LABEL[metodo]}</div>
                        <div className="producto-top-barra-wrap">
                          <div
                            className="producto-top-barra"
                            style={{
                              width: `${totalVentas > 0 ? (total / totalVentas) * 100 : 0}%`,
                              background: METODO_PAGO_COLOR[metodo],
                            }}
                          />
                        </div>
                        <div className="producto-top-valor">{moneda(total)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
