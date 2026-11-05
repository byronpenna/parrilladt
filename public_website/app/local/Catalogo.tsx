'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ItemCarrito, MenuItem } from './types';
import ProductoCard from './ProductoCard';
import ProductoModal from './ProductoModal';
import Carrito from './Carrito';
import styles from './local.module.css';

const STORAGE_KEY = 'parrilladt_carrito';

type Props = {
  menuInicial: MenuItem[];
  error: string | null;
};

function slug(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

export default function Catalogo({ menuInicial, error }: Props) {
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [productoAbierto, setProductoAbierto] = useState<MenuItem | null>(null);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) setCarrito(JSON.parse(guardado));
    } catch {
      /* localStorage puede no estar disponible (modo privado) */
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(carrito));
    } catch {
      /* localStorage puede no estar disponible (modo privado) */
    }
  }, [carrito, cargado]);

  const categorias = useMemo(() => {
    const mapa = new Map<string, MenuItem[]>();
    for (const producto of menuInicial) {
      const lista = mapa.get(producto.categoria) ?? [];
      lista.push(producto);
      mapa.set(producto.categoria, lista);
    }
    return Array.from(mapa.entries());
  }, [menuInicial]);

  function agregarAlCarrito(producto: MenuItem, cantidad: number) {
    setCarrito((prev) => {
      const existente = prev.find((item) => item.menuItemId === producto.id);
      if (existente) {
        return prev.map((item) =>
          item.menuItemId === producto.id ? { ...item, cantidad: item.cantidad + cantidad } : item
        );
      }
      return [
        ...prev,
        {
          menuItemId: producto.id,
          nombre: producto.nombre,
          precioUnitario: producto.precio,
          cantidad,
          fotoUrl: producto.fotoPrincipalUrl,
        },
      ];
    });
  }

  function cambiarCantidad(menuItemId: string, delta: number) {
    setCarrito((prev) =>
      prev
        .map((item) => (item.menuItemId === menuItemId ? { ...item, cantidad: item.cantidad + delta } : item))
        .filter((item) => item.cantidad > 0)
    );
  }

  function quitarDelCarrito(menuItemId: string) {
    setCarrito((prev) => prev.filter((item) => item.menuItemId !== menuItemId));
  }

  const totalCarrito = carrito.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);
  const cantidadCarrito = carrito.reduce((acc, item) => acc + item.cantidad, 0);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.logo}>
            ⚽ La Parrilla <span>del DT</span>
          </h1>
          <p className={styles.subtitulo}>Elegí del menú y armá tu pedido.</p>
        </header>

        {error && <p className={styles.aviso}>{error}</p>}

        {!error && menuInicial.length === 0 && (
          <p className={styles.vacio}>Todavía no hay productos cargados en el menú.</p>
        )}

        {categorias.length > 1 && (
          <nav className={styles.navCategorias}>
            {categorias.map(([categoria]) => (
              <a key={categoria} href={`#${slug(categoria)}`} className={styles.chipCategoria}>
                {categoria}
              </a>
            ))}
          </nav>
        )}

        {categorias.map(([categoria, productos]) => (
          <section key={categoria} id={slug(categoria)} className={styles.seccion}>
            <h2 className={styles.tituloSeccion}>{categoria}</h2>
            <div className={styles.grid}>
              {productos.map((producto) => (
                <ProductoCard
                  key={producto.id}
                  producto={producto}
                  onAbrir={setProductoAbierto}
                  onAgregarRapido={(p) => agregarAlCarrito(p, 1)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <button type="button" className={styles.fabCarrito} onClick={() => setCarritoAbierto(true)}>
        🛒 Carrito
        {cantidadCarrito > 0 && <span className={styles.fabBadge}>{cantidadCarrito}</span>}
        {cantidadCarrito > 0 && <span>${totalCarrito.toFixed(2)}</span>}
      </button>

      {productoAbierto && (
        <ProductoModal
          producto={productoAbierto}
          onCerrar={() => setProductoAbierto(null)}
          onAgregar={agregarAlCarrito}
        />
      )}

      {carritoAbierto && (
        <Carrito
          items={carrito}
          total={totalCarrito}
          onCerrar={() => setCarritoAbierto(false)}
          onCambiarCantidad={cambiarCantidad}
          onQuitar={quitarDelCarrito}
        />
      )}
    </div>
  );
}
