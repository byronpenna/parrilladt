'use client';

import { useId, useState } from 'react';

export interface PuntoVentaSerie {
  /** Inicio del período, formato YYYY-MM-DD, usado como key */
  clave: string;
  /** Etiqueta corta para el eje, p.ej. "6 oct" */
  label: string;
  /** Etiqueta larga para el tooltip, p.ej. "Semana del 6 al 12 de oct" */
  detalle: string;
  total: number;
  pedidos: number;
}

function formatoMoneda(valor: number) {
  return `$${valor.toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function ticksEjeY(max: number) {
  if (max <= 0) return [0];
  const pasos = 4;
  const bruto = max / pasos;
  const magnitud = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
  const normalizado = bruto / magnitud;
  let paso: number;
  if (normalizado <= 1) paso = magnitud;
  else if (normalizado <= 2) paso = 2 * magnitud;
  else if (normalizado <= 5) paso = 5 * magnitud;
  else paso = 10 * magnitud;

  const tope = Math.ceil(max / paso) * paso;
  const ticks: number[] = [];
  for (let v = 0; v <= tope + 0.0001; v += paso) ticks.push(Math.round(v));
  return ticks;
}

export default function VentasChart({
  datos,
  ariaLabel = 'Ventas totales',
}: {
  datos: PuntoVentaSerie[];
  ariaLabel?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const gradientId = useId();

  const ancho = 760;
  const alto = 280;
  const pad = { top: 28, right: 20, bottom: 32, left: 56 };
  const anchoInterno = ancho - pad.left - pad.right;
  const altoInterno = alto - pad.top - pad.bottom;

  const max = Math.max(1, ...datos.map((d) => d.total));
  const ticks = ticksEjeY(max);
  const maxEscala = ticks[ticks.length - 1] || max;

  const n = datos.length;
  const x = (i: number) => (n <= 1 ? pad.left + anchoInterno / 2 : pad.left + (anchoInterno * i) / (n - 1));
  const y = (v: number) => pad.top + altoInterno * (1 - v / maxEscala);

  const puntos = datos.map((d, i) => ({ ...d, cx: x(i), cy: y(d.total) }));

  const linea = puntos.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' L ');
  const lineaPath = puntos.length ? `M ${linea}` : '';
  const areaPath = puntos.length
    ? `M ${puntos[0].cx.toFixed(1)},${(pad.top + altoInterno).toFixed(1)} L ${linea} L ${puntos[
        puntos.length - 1
      ].cx.toFixed(1)},${(pad.top + altoInterno).toFixed(1)} Z`
    : '';

  const activo = hoverIdx !== null ? puntos[hoverIdx] : null;
  const anchoColumna = n > 0 ? anchoInterno / n : anchoInterno;

  return (
    <div className="chart-ventas-wrap">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={ariaLabel} className="chart-ventas-svg">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--verde)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--verde)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={ancho - pad.right}
              y1={y(t)}
              y2={y(t)}
              stroke="#e4e4e4"
              strokeWidth={1}
            />
            <text x={pad.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="chart-eje-texto">
              {t === 0 ? '0' : formatoMoneda(t)}
            </text>
          </g>
        ))}

        {puntos.map((p, i) => (
          <rect
            key={`hit-${p.clave}`}
            x={pad.left + anchoColumna * i}
            y={pad.top}
            width={anchoColumna}
            height={altoInterno}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}

        {activo && (
          <line
            x1={activo.cx}
            x2={activo.cx}
            y1={pad.top}
            y2={pad.top + altoInterno}
            stroke="#bbb"
            strokeWidth={1}
          />
        )}

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
        {lineaPath && (
          <path d={lineaPath} fill="none" stroke="var(--verde)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}

        {puntos.map((p, i) => (
          <circle
            key={p.clave}
            cx={p.cx}
            cy={p.cy}
            r={hoverIdx === i ? 6 : 4}
            fill="var(--verde)"
            stroke="#fff"
            strokeWidth={2}
            tabIndex={0}
            onFocus={() => setHoverIdx(i)}
            onBlur={() => setHoverIdx(null)}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ outline: 'none', cursor: 'pointer' }}
          />
        ))}

        {puntos.length > 0 && (
          <text
            x={puntos[puntos.length - 1].cx}
            y={puntos[puntos.length - 1].cy - 12}
            textAnchor="end"
            className="chart-valor-final"
          >
            {formatoMoneda(puntos[puntos.length - 1].total)}
          </text>
        )}

        {puntos.map((p, i) => {
          if (n > 10 && i % Math.ceil(n / 10) !== 0 && i !== n - 1) return null;
          return (
            <text key={`lbl-${p.clave}`} x={p.cx} y={alto - 8} textAnchor="middle" className="chart-eje-texto">
              {p.label}
            </text>
          );
        })}
      </svg>

      {activo && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(activo.cx / ancho) * 100}%`,
            top: `${(activo.cy / alto) * 100}%`,
          }}
        >
          <div className="chart-tooltip-valor">{formatoMoneda(activo.total)}</div>
          <div className="chart-tooltip-label">{activo.detalle}</div>
          <div className="chart-tooltip-label">{activo.pedidos} pedido{activo.pedidos === 1 ? '' : 's'}</div>
        </div>
      )}
    </div>
  );
}
