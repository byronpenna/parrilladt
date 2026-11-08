'use client';

import { useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { MUTATION_ABRIR_DIA, MUTATION_CERRAR_DIA } from '@/lib/queries';
import type { Cuenta, CierreDia } from '@/lib/types';

function moneda(valor: number) {
  return `$${valor.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AperturaCierreModal({
  modo,
  cuentasActivas,
  cierreActual,
  onClose,
  onAbierto,
  onCerrado,
}: {
  modo: 'abrir' | 'cerrar';
  cuentasActivas: Cuenta[];
  cierreActual: CierreDia | null;
  onClose: () => void;
  onAbierto: (cierre: CierreDia) => void;
  onCerrado: (cierre: CierreDia) => void;
}) {
  const [montos, setMontos] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    if (modo === 'abrir') {
      for (const c of cuentasActivas) inicial[c.id] = String(c.saldoActual);
    }
    return inicial;
  });
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  async function confirmarAbrir() {
    const aperturas = cuentasActivas.map((c) => {
      const valor = parseFloat(montos[c.id] ?? '0');
      return { cuentaId: c.id, montoApertura: Number.isNaN(valor) ? 0 : valor };
    });
    setGuardando(true);
    setError('');
    try {
      const data = await gqlRequest<{ abrirDia: CierreDia }>(MUTATION_ABRIR_DIA, {
        aperturas,
        nota: nota.trim() || undefined,
      });
      onAbierto(data.abrirDia);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el día');
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarCerrar() {
    if (!cierreActual) return;
    const cierres = cierreActual.detalles.map((d) => {
      const valor = parseFloat(montos[d.cuentaId] ?? '');
      return { cuentaId: d.cuentaId, montoCierreReal: Number.isNaN(valor) ? d.montoApertura : valor };
    });
    setGuardando(true);
    setError('');
    try {
      const data = await gqlRequest<{ cerrarDia: CierreDia }>(MUTATION_CERRAR_DIA, {
        cierreDiaId: cierreActual.id,
        cierres,
        nota: nota.trim() || undefined,
      });
      onCerrado(data.cerrarDia);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar el día');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{modo === 'abrir' ? '🔓 Abrir el día' : '🔒 Cerrar el día'}</h3>
          <button className="modal-cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-cuerpo">
          {modo === 'abrir' ? (
            <>
              <p className="ayuda-stock">
                Indica cuánto hay realmente en cada cuenta antes de empezar a vender hoy. Se sugiere el saldo con el
                que cerró el día anterior.
              </p>
              {cuentasActivas.length === 0 && (
                <div className="pedidos-error">Activa al menos una cuenta antes de abrir el día</div>
              )}
              {cuentasActivas.map((c) => (
                <div className="filtro-campo" key={c.id}>
                  <label>
                    {c.tipo === 'efectivo' ? '💵' : '🏦'} {c.nombre}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={montos[c.id] ?? ''}
                    onChange={(e) => setMontos((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                </div>
              ))}
            </>
          ) : (
            cierreActual && (
              <>
                <p className="ayuda-stock">
                  Cuenta el efectivo real y revisa el saldo de cada cuenta bancaria. Las ventas del día se calculan
                  solas al confirmar.
                </p>
                {cierreActual.detalles.map((d) => (
                  <div className="filtro-campo" key={d.cuentaId}>
                    <label>
                      {d.cuentaTipo === 'efectivo' ? '💵' : '🏦'} {d.cuentaNombre} (abrió con{' '}
                      {moneda(d.montoApertura)})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={montos[d.cuentaId] ?? ''}
                      onChange={(e) => setMontos((prev) => ({ ...prev, [d.cuentaId]: e.target.value }))}
                    />
                  </div>
                ))}
              </>
            )
          )}

          <div className="filtro-campo" style={{ minWidth: 280 }}>
            <label>Nota (opcional)</label>
            <input value={nota} onChange={(e) => setNota(e.target.value)} />
          </div>

          {error && <div className="pedidos-error">{error}</div>}

          {modo === 'cerrar' && !confirmando ? (
            <button className="btn btn-naranja" onClick={() => setConfirmando(true)}>
              Continuar
            </button>
          ) : modo === 'cerrar' ? (
            <div className="panel-movimiento">
              <strong>¿Confirmas el cierre del día? No se puede deshacer.</strong>
              <button className="btn btn-naranja" disabled={guardando} onClick={confirmarCerrar}>
                Sí, cerrar definitivamente
              </button>
              <button className="btn btn-blanco" onClick={() => setConfirmando(false)}>
                Volver
              </button>
            </div>
          ) : (
            <button className="btn btn-verde" disabled={guardando || cuentasActivas.length === 0} onClick={confirmarAbrir}>
              🔓 Abrir día
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
