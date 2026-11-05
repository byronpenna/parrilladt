'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { MenuItem } from './types';
import styles from './local.module.css';

type Foto = { id: string; url: string; principal: boolean };

type Props = {
  producto: MenuItem;
  onCerrar: () => void;
  onAgregar: (producto: MenuItem, cantidad: number) => void;
};

export default function ProductoModal({ producto, onCerrar, onAgregar }: Props) {
  const [fotos, setFotos] = useState<Foto[]>(
    producto.fotoPrincipalUrl
      ? [{ id: 'principal', url: producto.fotoPrincipalUrl, principal: true }]
      : []
  );
  const [cargandoFotos, setCargandoFotos] = useState(true);
  const [fotoActiva, setFotoActiva] = useState(0);
  const [cantidad, setCantidad] = useState(1);

  useEffect(() => {
    let cancelado = false;
    setCargandoFotos(true);
    fetch(`/api/menu/${producto.id}/fotos`)
      .then((res) => (res.ok ? res.json() : { fotos: [] }))
      .then((data: { fotos?: Foto[] }) => {
        if (cancelado) return;
        const recibidas = data.fotos ?? [];
        if (recibidas.length > 0) {
          const ordenadas = [...recibidas].sort((a, b) => Number(b.principal) - Number(a.principal));
          setFotos(ordenadas);
          setFotoActiva(0);
        }
      })
      .catch(() => {
        /* se mantienen las fotos ya conocidas (fotoPrincipalUrl, si existía) */
      })
      .finally(() => {
        if (!cancelado) setCargandoFotos(false);
      });
    return () => {
      cancelado = true;
    };
  }, [producto.id]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCerrar();
  }

  return (
    <div className={styles.modalOverlay} onClick={onCerrar} onKeyDown={onKeyDown} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={producto.nombre}
      >
        <button type="button" className={styles.modalCerrar} onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>

        <div className={styles.galeriaPrincipal}>
          {fotos.length > 0 ? (
            <Image
              src={fotos[fotoActiva].url}
              alt={producto.nombre}
              fill
              sizes="480px"
              priority
            />
          ) : (
            <div className={styles.galeriaPlaceholder}>🍽️</div>
          )}
        </div>

        {cargandoFotos && <p className={styles.cargandoFotos}>Buscando más fotos…</p>}

        {fotos.length > 1 && (
          <div className={styles.miniaturas}>
            {fotos.map((foto, i) => (
              <button
                key={foto.id}
                type="button"
                className={`${styles.miniatura} ${i === fotoActiva ? styles.miniaturaActiva : ''}`}
                onClick={() => setFotoActiva(i)}
                aria-label={`Ver foto ${i + 1} de ${producto.nombre}`}
              >
                <Image src={foto.url} alt="" fill sizes="56px" />
              </button>
            ))}
          </div>
        )}

        <div className={styles.modalBody}>
          <span className={styles.cardCategoria}>{producto.categoria}</span>
          <h2 className={styles.modalNombre}>{producto.nombre}</h2>
          <span className={styles.modalPrecio}>${producto.precio.toFixed(2)}</span>

          <div className={styles.stepperRow}>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.stepperBtn}
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                aria-label="Quitar uno"
              >
                −
              </button>
              <span className={styles.stepperValor}>{cantidad}</span>
              <button
                type="button"
                className={styles.stepperBtn}
                onClick={() => setCantidad((c) => c + 1)}
                aria-label="Agregar uno"
              >
                +
              </button>
            </div>
            <span className={styles.modalPrecio}>${(producto.precio * cantidad).toFixed(2)}</span>
          </div>

          <button
            type="button"
            className={styles.btnAgregarGrande}
            onClick={() => {
              onAgregar(producto, cantidad);
              onCerrar();
            }}
          >
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  );
}
