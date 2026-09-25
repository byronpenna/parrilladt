'use client';

import { useEffect, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_PEDIDOS, MUTATION_ACTUALIZAR_ESTADO } from '@/lib/queries';
import type { Pedido, EstadoPedido } from '@/lib/types';

const SIGUIENTE_ESTADO: Partial<Record<EstadoPedido, EstadoPedido>> = {
  pendiente: 'en_preparacion',
  en_preparacion: 'listo',
  listo: 'entregado',
};

const COLUMNA_POR_ESTADO: Partial<Record<EstadoPedido, 'colPendiente' | 'colPreparacion' | 'colListo'>> = {
  pendiente: 'colPendiente',
  en_preparacion: 'colPreparacion',
  listo: 'colListo',
};

function minutosDesde(createdAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
}

function claseEspera(mins: number) {
  if (mins >= 15) return 'espera-larga';
  if (mins >= 8) return 'espera-media';
  return '';
}

export default function CocinaPage() {
  const [reloj, setReloj] = useState('--:--:--');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [estadoConexion, setEstadoConexion] = useState<{ texto: string; ok: boolean }>({
    texto: 'Cargando...',
    ok: true,
  });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const tick = () =>
      setReloj(new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    cargarPedidos();
    const idFetch = setInterval(cargarPedidos, 6000);
    const idRender = setInterval(() => forceTick((n) => n + 1), 10000);
    return () => {
      clearInterval(idFetch);
      clearInterval(idRender);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarPedidos() {
    try {
      const data = await gqlRequest<{ pedidos: Pedido[] }>(QUERY_PEDIDOS, { soloActivos: true });
      setPedidos(data.pedidos);
      setEstadoConexion({ texto: '● En línea', ok: true });
    } catch {
      setEstadoConexion({ texto: '● Sin conexión', ok: false });
    }
  }

  async function avanzarEstado(id: string, estadoActual: EstadoPedido) {
    const siguiente = SIGUIENTE_ESTADO[estadoActual];
    if (!siguiente) return;
    setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado: siguiente } : p)));
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_ESTADO, { id, estado: siguiente });
    } catch {
      // el próximo refresco automático corrige el estado si algo falló
    }
    cargarPedidos();
  }

  const columnas: Record<'colPendiente' | 'colPreparacion' | 'colListo', Pedido[]> = {
    colPendiente: [],
    colPreparacion: [],
    colListo: [],
  };
  pedidos.forEach((p) => {
    const col = COLUMNA_POR_ESTADO[p.estado];
    if (col) columnas[col].push(p);
  });

  const columnasInfo: { id: keyof typeof columnas; titulo: string; claseColumna: string }[] = [
    { id: 'colPendiente', titulo: 'Pendiente', claseColumna: 'col-pendiente' },
    { id: 'colPreparacion', titulo: 'En preparación', claseColumna: 'col-preparacion' },
    { id: 'colListo', titulo: 'Listo', claseColumna: 'col-listo' },
  ];

  return (
    <div className="cocina-body">
      <header className="cancha-header">
        <h1>🍽 Cocina en vivo</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div id="estadoConexion" style={{ color: estadoConexion.ok ? 'var(--verde-oscuro)' : '#c0392b' }}>
            {estadoConexion.texto}
          </div>
          <div className="reloj">{reloj}</div>
        </div>
      </header>

      <div className="columnas">
        {columnasInfo.map(({ id, titulo, claseColumna }) => (
          <div key={id} className={`columna ${claseColumna}`}>
            <h2>{titulo}</h2>
            <div className="tarjetas">
              {columnas[id].length === 0 ? (
                <div className="vacio-col">Sin pedidos</div>
              ) : (
                columnas[id].map((p) => {
                  const mins = minutosDesde(p.createdAt);
                  return (
                    <div
                      key={p.id}
                      className={`pedido-card ${claseEspera(mins)}`}
                      onClick={() => avanzarEstado(p.id, p.estado)}
                    >
                      <div className="fila-top">
                        <span className="cliente">{p.clienteNombre}</span>
                        <span className="tiempo">{mins} min</span>
                      </div>
                      <div className="items">{p.itemsTexto}</div>
                      {p.nota && <div className="nota">📝 {p.nota}</div>}
                      <div className="toca">Toca para avanzar →</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
