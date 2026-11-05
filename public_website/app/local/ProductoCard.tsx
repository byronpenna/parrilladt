'use client';

import Image from 'next/image';
import type { MenuItem } from './types';
import styles from './local.module.css';

type Props = {
  producto: MenuItem;
  onAbrir: (producto: MenuItem) => void;
  onAgregarRapido: (producto: MenuItem) => void;
};

export default function ProductoCard({ producto, onAbrir, onAgregarRapido }: Props) {
  return (
    <button type="button" className={styles.card} onClick={() => onAbrir(producto)}>
      <div className={styles.cardFoto}>
        {producto.fotoPrincipalUrl ? (
          <Image
            src={producto.fotoPrincipalUrl}
            alt={producto.nombre}
            fill
            sizes="(max-width: 600px) 45vw, 220px"
          />
        ) : (
          <div className={styles.cardFotoPlaceholder}>🍽️</div>
        )}
      </div>
      <div className={styles.cardBody}>
        <span className={styles.cardCategoria}>{producto.categoria}</span>
        <span className={styles.cardNombre}>{producto.nombre}</span>
        <div className={styles.cardFooter}>
          <span className={styles.cardPrecio}>${producto.precio.toFixed(2)}</span>
          <button
            type="button"
            className={styles.btnAgregar}
            aria-label={`Agregar ${producto.nombre} al carrito`}
            onClick={(e) => {
              e.stopPropagation();
              onAgregarRapido(producto);
            }}
          >
            +
          </button>
        </div>
      </div>
    </button>
  );
}
