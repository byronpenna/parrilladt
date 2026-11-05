'use client';

import Image from 'next/image';
import type { ItemCarrito } from './types';
import styles from './local.module.css';

type Props = {
  items: ItemCarrito[];
  total: number;
  onCerrar: () => void;
  onCambiarCantidad: (menuItemId: string, delta: number) => void;
  onQuitar: (menuItemId: string) => void;
};

export default function Carrito({ items, total, onCerrar, onCambiarCantidad, onQuitar }: Props) {
  return (
    <div className={styles.carritoOverlay} onClick={onCerrar} role="presentation">
      <div
        className={styles.carrito}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Carrito de compra"
      >
        <div className={styles.carritoHeader}>
          <h2>Tu pedido</h2>
          <button type="button" className={styles.carritoCerrar} onClick={onCerrar} aria-label="Cerrar carrito">
            ✕
          </button>
        </div>

        <div className={styles.carritoLista}>
          {items.length === 0 && <p className={styles.carritoVacio}>Todavía no agregaste nada del menú.</p>}

          {items.map((item) => (
            <div key={item.menuItemId} className={styles.itemCarrito}>
              <div className={styles.itemFoto}>
                {item.fotoUrl ? (
                  <Image src={item.fotoUrl} alt={item.nombre} fill sizes="52px" />
                ) : (
                  <div className={styles.itemFotoPlaceholder}>🍽️</div>
                )}
              </div>
              <div className={styles.itemInfo}>
                <div className={styles.itemNombre}>{item.nombre}</div>
                <div className={styles.itemPrecioUnit}>${item.precioUnitario.toFixed(2)} c/u</div>
              </div>
              <div className={styles.itemAcciones}>
                <div className={styles.itemStepper}>
                  <button
                    type="button"
                    className={styles.itemStepperBtn}
                    onClick={() => onCambiarCantidad(item.menuItemId, -1)}
                    aria-label={`Quitar uno de ${item.nombre}`}
                  >
                    −
                  </button>
                  <span>{item.cantidad}</span>
                  <button
                    type="button"
                    className={styles.itemStepperBtn}
                    onClick={() => onCambiarCantidad(item.menuItemId, 1)}
                    aria-label={`Agregar uno de ${item.nombre}`}
                  >
                    +
                  </button>
                </div>
                <span className={styles.itemSubtotal}>${(item.precioUnitario * item.cantidad).toFixed(2)}</span>
                <button type="button" className={styles.itemQuitar} onClick={() => onQuitar(item.menuItemId)}>
                  Quitar
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.carritoFooter}>
          <div className={styles.carritoTotalRow}>
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <p className={styles.carritoNota}>Tu pedido se guarda en este dispositivo. Pronto vas a poder enviarlo.</p>
        </div>
      </div>
    </div>
  );
}
