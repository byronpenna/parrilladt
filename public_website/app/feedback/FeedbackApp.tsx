'use client';

import { useEffect, useMemo, useState } from 'react';

type Fase = 'cargando' | 'no_encontrado' | 'ya_respondido' | 'encuesta' | 'ruleta' | 'resultado' | 'error';

type Paso = 'identidad' | 'comida' | 'atencion' | 'recomendacion' | 'comentario';

type ResultadoFeedback = {
  ganoPremio: boolean;
  premioNombre: string | null;
  premioCodigo: string | null;
};

const N_SLICES = 6;
const SLICE_DEG = 360 / N_SLICES;
const SLICE_PREMIO_INDEX = 0;
const COLORES_SLICE = ['#ff7a00', '#1c7d3e', '#2ea34f', '#1c7d3e', '#2ea34f', '#1c7d3e'];
const ICONO_SLICE = ['🏆', '⚽', '⚽', '⚽', '⚽', '⚽'];

const CONIC_GRADIENT = `conic-gradient(${COLORES_SLICE.map(
  (color, i) => `${color} ${i * SLICE_DEG}deg ${(i + 1) * SLICE_DEG}deg`
).join(', ')})`;

function Estrellas({
  valor,
  onChange,
  etiqueta,
}: {
  valor: number;
  onChange: (v: number) => void;
  etiqueta: string;
}) {
  return (
    <div className="estrellas" role="radiogroup" aria-label={etiqueta}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`estrella ${n <= valor ? 'activa' : ''}`}
          onClick={() => onChange(n)}
          aria-label={`${n} de 5`}
          aria-pressed={n <= valor}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function FeedbackApp({
  pedidoId,
  pedidoItemId,
}: {
  pedidoId: string | null;
  pedidoItemId: string | null;
}) {
  const pasos = useMemo<Paso[]>(
    () => (pedidoId ? ['comida', 'atencion', 'recomendacion', 'comentario'] : ['identidad', 'comida', 'atencion', 'recomendacion', 'comentario']),
    [pedidoId]
  );

  const [fase, setFase] = useState<Fase>(pedidoId ? 'cargando' : 'encuesta');
  const [pasoIndex, setPasoIndex] = useState(0);
  const [errorGeneral, setErrorGeneral] = useState('');
  const [itemNombre, setItemNombre] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [calificacionComida, setCalificacionComida] = useState(0);
  const [calificacionAtencion, setCalificacionAtencion] = useState(0);
  const [calificacionRecomendacion, setCalificacionRecomendacion] = useState(0);
  const [comentario, setComentario] = useState('');

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFeedback | null>(null);
  const [rotacion, setRotacion] = useState(0);
  const [girando, setGirando] = useState(false);
  const [girada, setGirada] = useState(false);

  useEffect(() => {
    if (!pedidoId) return;
    let cancelado = false;
    (async () => {
      try {
        const params = new URLSearchParams({ pedidoId });
        if (pedidoItemId) params.set('pedidoItemId', pedidoItemId);
        const res = await fetch(`/api/feedback/estado?${params.toString()}`);
        const data = await res.json();
        if (cancelado) return;
        if (!data.existe) setFase('no_encontrado');
        else if (data.yaRespondido) setFase('ya_respondido');
        else {
          setItemNombre(data.itemNombre ?? null);
          setFase('encuesta');
        }
      } catch {
        if (!cancelado) {
          setFase('error');
          setErrorGeneral('No pudimos cargar tu pedido. Intenta de nuevo más tarde.');
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pedidoId, pedidoItemId]);

  const pasoActual = pasos[pasoIndex];
  const esUltimoPaso = pasoIndex === pasos.length - 1;

  function puedeAvanzar(): boolean {
    switch (pasoActual) {
      case 'identidad':
        return nombre.trim().length > 0 && telefono.trim().length > 0;
      case 'comida':
        return calificacionComida > 0;
      case 'atencion':
        return calificacionAtencion > 0;
      case 'recomendacion':
        return calificacionRecomendacion > 0;
      case 'comentario':
        return true;
    }
  }

  function irAtras() {
    setErrorGeneral('');
    setPasoIndex((i) => Math.max(0, i - 1));
  }

  async function irAdelante() {
    if (!puedeAvanzar()) return;
    setErrorGeneral('');
    if (!esUltimoPaso) {
      setPasoIndex((i) => i + 1);
      return;
    }
    await enviar();
  }

  async function enviar() {
    setEnviando(true);
    setErrorGeneral('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoId,
          pedidoItemId,
          clienteNombre: pedidoId ? undefined : nombre.trim(),
          clienteTelefono: pedidoId ? undefined : telefono.trim(),
          calificacionComida,
          calificacionAtencion,
          calificacionRecomendacion,
          comentario: comentario.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar tu opinión');
      setResultado(data);
      setFase('ruleta');
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : 'No se pudo enviar tu opinión');
    } finally {
      setEnviando(false);
    }
  }

  function girar() {
    if (girando || girada || !resultado) return;
    setGirando(true);
    setGirada(true);
    const indice = resultado.ganoPremio
      ? SLICE_PREMIO_INDEX
      : [...Array(N_SLICES).keys()].filter((i) => i !== SLICE_PREMIO_INDEX)[
          Math.floor(Math.random() * (N_SLICES - 1))
        ];
    const centro = indice * SLICE_DEG + SLICE_DEG / 2;
    const margenSeguro = SLICE_DEG / 2 - 6;
    const jitter = (Math.random() * 2 - 1) * margenSeguro;
    const vueltas = 5;
    setRotacion(vueltas * 360 + (360 - centro) + jitter);
  }

  function finSpin() {
    setGirando(false);
    setTimeout(() => setFase('resultado'), 500);
  }

  return (
    <div className="wrap">
      <div className="cancha-header">
        <h1 className="logo">⚽ La Parrilla <span>del DT</span></h1>
      </div>
      <p className="subtitulo">Tu opinión nos ayuda a mejorar — y puede tocarte un premio.</p>

      <div className="feedback-card">
        {fase === 'cargando' && <p>Cargando tu pedido…</p>}

        {fase === 'no_encontrado' && (
          <>
            <span className="emoji-grande" style={{ fontSize: '2.4rem' }}>
              🔍
            </span>
            <h2>No encontramos ese pedido</h2>
            <p>Revisa el enlace que te enviamos, o escríbenos directamente si el problema sigue.</p>
          </>
        )}

        {fase === 'ya_respondido' && (
          <>
            <span className="emoji-grande" style={{ fontSize: '2.4rem' }}>
              ✅
            </span>
            <h2>¡Ya recibimos tu opinión!</h2>
            <p>Gracias por contarnos cómo te fue con este pedido.</p>
          </>
        )}

        {fase === 'error' && (
          <>
            <h2>Algo salió mal</h2>
            <p>{errorGeneral}</p>
          </>
        )}

        {fase === 'encuesta' && (
          <>
            <div className="feedback-progreso">
              {pasos.map((p, i) => (
                <span
                  key={p}
                  className={`punto ${i === pasoIndex ? 'activo' : ''} ${i < pasoIndex ? 'hecho' : ''}`}
                />
              ))}
            </div>

            {pasoActual === 'identidad' && (
              <>
                <h2>Antes de empezar</h2>
                <p>Déjanos tu nombre y tu teléfono para poder avisarte si ganas algo 🎉</p>
                <div className="campo-identidad">
                  <label htmlFor="fb-nombre">Nombre</label>
                  <input
                    id="fb-nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Tu nombre"
                    autoFocus
                  />
                </div>
                <div className="campo-identidad">
                  <label htmlFor="fb-telefono">Teléfono</label>
                  <input
                    id="fb-telefono"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="Tu teléfono"
                    inputMode="tel"
                  />
                </div>
              </>
            )}

            {pasoActual === 'comida' && (
              <>
                <h2>{itemNombre ? `¿Cómo estuvo tu ${itemNombre}?` : '¿Cómo estuvo la comida?'}</h2>
                <p>Toca una estrella para calificar</p>
                <Estrellas valor={calificacionComida} onChange={setCalificacionComida} etiqueta="Calificación de la comida" />
              </>
            )}

            {pasoActual === 'atencion' && (
              <>
                <h2>¿Cómo fue la atención?</h2>
                <p>Pensando en cómo te atendimos en tu pedido</p>
                <Estrellas valor={calificacionAtencion} onChange={setCalificacionAtencion} etiqueta="Calificación de la atención" />
              </>
            )}

            {pasoActual === 'recomendacion' && (
              <>
                <h2>¿Volverías a pedir con nosotros?</h2>
                <p>1 = seguro que no, 5 = seguro que sí</p>
                <Estrellas
                  valor={calificacionRecomendacion}
                  onChange={setCalificacionRecomendacion}
                  etiqueta="Probabilidad de volver a pedir"
                />
              </>
            )}

            {pasoActual === 'comentario' && (
              <>
                <h2>¿Algo que quieras contarnos?</h2>
                <p>Opcional</p>
                <textarea
                  className="feedback-textarea"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Cuéntanos lo que quieras (opcional)"
                  maxLength={500}
                />
              </>
            )}

            {errorGeneral && <div className="feedback-error">{errorGeneral}</div>}

            <div className="feedback-nav">
              {pasoIndex > 0 && (
                <button className="btn btn-blanco" onClick={irAtras} disabled={enviando}>
                  Atrás
                </button>
              )}
              <button className="btn btn-naranja" onClick={irAdelante} disabled={!puedeAvanzar() || enviando}>
                {enviando ? 'Enviando…' : esUltimoPaso ? 'Enviar' : 'Siguiente'}
              </button>
            </div>
          </>
        )}

        {fase === 'ruleta' && (
          <>
            <h2>¡Gracias por tu opinión!</h2>
            <p>Gira la ruleta — puede tocarte un premio para tu próxima compra</p>
            <div className="ruleta-wrap">
              <div className="ruleta-puntero">🔻</div>
              <div
                className="ruleta-disco"
                style={{ background: CONIC_GRADIENT, transform: `rotate(${rotacion}deg)` }}
                onTransitionEnd={finSpin}
              >
                {ICONO_SLICE.map((icono, i) => {
                  const angulo = i * SLICE_DEG + SLICE_DEG / 2;
                  return (
                    <div
                      key={i}
                      className="ruleta-slice-label"
                      style={{ transform: `rotate(${angulo}deg) translate(0, -78px) rotate(${-angulo}deg)` }}
                    >
                      {icono}
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="btn btn-naranja" disabled={girando || girada} onClick={girar}>
              {girada ? 'Girando…' : '🎡 Girar la ruleta'}
            </button>
          </>
        )}

        {fase === 'resultado' && resultado && (
          <div className="resultado-box">
            {resultado.ganoPremio ? (
              <>
                <span className="emoji-grande">🎉</span>
                <h2>¡Ganaste un premio!</h2>
                <p>{resultado.premioNombre}</p>
                <p>Muéstrale este código al personal en tu próxima compra:</p>
                <div className="resultado-premio-codigo">{resultado.premioCodigo}</div>
              </>
            ) : (
              <>
                <span className="emoji-grande">💚</span>
                <h2>¡Gracias por tu opinión!</h2>
                <p>Esta vez no hubo premio, pero tu opinión ya quedó registrada. ¡Que vuelvas pronto!</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
