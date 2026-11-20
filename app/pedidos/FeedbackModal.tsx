'use client';

import { useEffect, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_FEEDBACK_PEDIDO, MUTATION_ELIMINAR_ENCUESTA_SATISFACCION } from '@/lib/queries';
import type { EncuestaSatisfaccion, FeedbackPedido, Pedido } from '@/lib/types';
import { formatoNegocio } from '@/lib/timezone';

function estrellas(valor: number) {
  return '★'.repeat(valor) + '☆'.repeat(5 - valor);
}

function DetalleEncuesta({
  encuesta,
  tituloComida,
  puedeEliminar,
  onEliminar,
}: {
  encuesta: EncuestaSatisfaccion;
  tituloComida: string;
  puedeEliminar: boolean;
  onEliminar: (encuesta: EncuestaSatisfaccion) => void;
}) {
  return (
    <>
      <div className="filtro-campo">
        <label>Fecha</label>
        <span>{formatoNegocio(new Date(encuesta.createdAt), { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      <div className="filtro-campo">
        <label>{tituloComida}</label>
        <span>{estrellas(encuesta.calificacionComida)}</span>
      </div>
      <div className="filtro-campo">
        <label>¿Cómo fue la atención?</label>
        <span>{estrellas(encuesta.calificacionAtencion)}</span>
      </div>
      <div className="filtro-campo">
        <label>¿Volvería a pedir?</label>
        <span>{estrellas(encuesta.calificacionRecomendacion)}</span>
      </div>
      {encuesta.comentario && (
        <div className="filtro-campo">
          <label>Comentario</label>
          <span>{encuesta.comentario}</span>
        </div>
      )}
      <div className="filtro-campo">
        <label>Ruleta de premio</label>
        {encuesta.ganoPremio ? (
          <span>
            🎉 Ganó: {encuesta.premioNombre} — código <strong>{encuesta.premioCodigo}</strong>{' '}
            {encuesta.premioUsado ? '(ya canjeado)' : '(sin canjear)'}
          </span>
        ) : (
          <span>No le tocó premio en esta vuelta.</span>
        )}
      </div>
      {puedeEliminar && (
        <button className="btn btn-naranja" onClick={() => onEliminar(encuesta)}>
          🗑️ Eliminar este feedback
        </button>
      )}
    </>
  );
}

export default function FeedbackModal({ pedido, onClose }: { pedido: Pedido; onClose: () => void }) {
  const [feedback, setFeedback] = useState<FeedbackPedido | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [esSuperadmin, setEsSuperadmin] = useState(false);

  useEffect(() => {
    cargarFeedback();
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setEsSuperadmin(!!d.esSuperadmin))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.id]);

  async function cargarFeedback() {
    setError('');
    setFeedback(undefined);
    try {
      const data = await gqlRequest<{ feedbackPedido: FeedbackPedido }>(QUERY_FEEDBACK_PEDIDO, {
        pedidoId: pedido.id,
      });
      setFeedback(data.feedbackPedido);
    } catch {
      setError('No se pudo cargar el feedback de este pedido');
      setFeedback(null);
    }
  }

  async function eliminarEncuesta(encuesta: EncuestaSatisfaccion) {
    if (!window.confirm('¿Eliminar este feedback definitivamente? Esto no se puede deshacer.')) return;
    setError('');
    try {
      await gqlRequest(MUTATION_ELIMINAR_ENCUESTA_SATISFACCION, { id: encuesta.id });
      setFeedback((prev) =>
        prev
          ? {
              general: prev.general?.id === encuesta.id ? null : prev.general,
              porItem: prev.porItem.filter((f) => f.id !== encuesta.id),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el feedback');
    }
  }

  const sinNada = feedback && !feedback.general && feedback.porItem.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            💬 Feedback — Pedido #{pedido.id} ({pedido.clienteNombre})
          </h3>
          <button className="modal-cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-cuerpo">
          {feedback === undefined && !error && <div className="vacio-col">Cargando...</div>}
          {error && <div className="pedidos-error">{error}</div>}
          {sinNada && <div className="vacio-col">El cliente todavía no dejó su opinión para este pedido.</div>}

          {feedback?.general && (
            <>
              <strong>Encuesta general del pedido</strong>
              <DetalleEncuesta
                encuesta={feedback.general}
                tituloComida="¿Cómo estuvo la comida?"
                puedeEliminar={esSuperadmin}
                onEliminar={eliminarEncuesta}
              />
            </>
          )}

          {feedback && feedback.porItem.length > 0 && (
            <>
              <strong>Feedback por plato</strong>
              {feedback.porItem.map((encuesta) => (
                <div key={encuesta.id} className="panel-movimiento">
                  <DetalleEncuesta
                    encuesta={encuesta}
                    tituloComida={`¿Cómo estuvo ${encuesta.itemNombre ?? 'este plato'}?`}
                    puedeEliminar={esSuperadmin}
                    onEliminar={eliminarEncuesta}
                  />
                </div>
              ))}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-blanco" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
