'use client';

import { useEffect, useRef, useState } from 'react';
import { gqlRequest } from '@/lib/graphql-client';
import {
  QUERY_FOTOS_MENU_ITEM,
  MUTATION_AGREGAR_FOTO_MENU_ITEM,
  MUTATION_MARCAR_FOTO_PRINCIPAL,
  MUTATION_ELIMINAR_FOTO_MENU_ITEM,
} from '@/lib/queries';
import type { FotoMenuItem, MenuItem } from '@/lib/types';

export default function PreviewModal({
  producto,
  onClose,
  onPrincipalChange,
}: {
  producto: MenuItem;
  onClose: () => void;
  onPrincipalChange: (menuItemId: string, url: string | null) => void;
}) {
  const [fotos, setFotos] = useState<FotoMenuItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [index, setIndex] = useState(0);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cargarFotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto.id]);

  async function cargarFotos() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ fotosMenuItem: FotoMenuItem[] }>(QUERY_FOTOS_MENU_ITEM, {
        menuItemId: producto.id,
      });
      setFotos(data.fotosMenuItem);
      setIndex(0);
    } catch {
      setError('No se pudieron cargar las fotos');
    } finally {
      setCargando(false);
    }
  }

  function anterior() {
    setIndex((i) => (i <= 0 ? fotos.length - 1 : i - 1));
  }

  function siguiente() {
    setIndex((i) => (i >= fotos.length - 1 ? 0 : i + 1));
  }

  async function subirFotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSubiendo(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const prep = await fetch('/api/productos/foto-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ menuItemId: producto.id, fileName: file.name }),
        });
        const prepData = await prep.json();
        if (!prep.ok) throw new Error(prepData.error || 'No se pudo preparar la subida');

        const subida = await fetch(prepData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': prepData.contentType },
          body: file,
        });
        if (!subida.ok) throw new Error('No se pudo subir la foto');

        const data = await gqlRequest<{ agregarFotoMenuItem: FotoMenuItem }>(MUTATION_AGREGAR_FOTO_MENU_ITEM, {
          menuItemId: producto.id,
          key: prepData.key,
        });
        setFotos((prev) => {
          const nueva = data.agregarFotoMenuItem;
          const limpio = nueva.principal ? prev.map((f) => ({ ...f, principal: false })) : prev;
          return [...limpio, nueva];
        });
        if (data.agregarFotoMenuItem.principal) {
          onPrincipalChange(producto.id, data.agregarFotoMenuItem.url);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto');
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function marcarPrincipal(foto: FotoMenuItem) {
    setError('');
    try {
      const data = await gqlRequest<{ marcarFotoPrincipal: FotoMenuItem }>(MUTATION_MARCAR_FOTO_PRINCIPAL, {
        id: foto.id,
      });
      setFotos((prev) => prev.map((f) => ({ ...f, principal: f.id === foto.id })));
      onPrincipalChange(producto.id, data.marcarFotoPrincipal.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar como principal');
    }
  }

  async function eliminarFoto(foto: FotoMenuItem) {
    if (!window.confirm('¿Eliminar esta foto definitivamente?')) return;
    setError('');
    try {
      await gqlRequest(MUTATION_ELIMINAR_FOTO_MENU_ITEM, { id: foto.id });
      fetch('/api/productos/foto-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: foto.key }),
      }).catch(() => {});
      setFotos((prev) => prev.filter((f) => f.id !== foto.id));
      setIndex(0);
      if (foto.principal) onPrincipalChange(producto.id, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar la foto');
    }
  }

  const fotoActual = fotos[index];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📷 Fotos — {producto.nombre}</h3>
          <button className="modal-cerrar" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-cuerpo">
          <div className="carrusel">
            <div className="carrusel-visor">
              {cargando ? (
                <div className="carrusel-vacio">Cargando...</div>
              ) : fotos.length === 0 ? (
                <div className="carrusel-vacio">Este producto todavía no tiene fotos</div>
              ) : (
                <>
                  {fotos.length > 1 && (
                    <button className="carrusel-flecha izq" onClick={anterior}>
                      ‹
                    </button>
                  )}
                  <img src={fotoActual.url} alt={producto.nombre} />
                  {fotos.length > 1 && (
                    <button className="carrusel-flecha der" onClick={siguiente}>
                      ›
                    </button>
                  )}
                </>
              )}
            </div>

            {fotoActual && (
              <div className="carrusel-acciones">
                {fotoActual.principal ? (
                  <span className="badge-principal">★ Foto principal</span>
                ) : (
                  <button className="btn btn-verde" onClick={() => marcarPrincipal(fotoActual)}>
                    ★ Marcar como principal
                  </button>
                )}
                <button className="btn btn-naranja" onClick={() => eliminarFoto(fotoActual)}>
                  Eliminar esta foto
                </button>
              </div>
            )}

            {fotos.length > 1 && (
              <div className="carrusel-miniaturas">
                {fotos.map((f, i) => (
                  <div
                    key={f.id}
                    className={`miniatura ${i === index ? 'activa' : ''}`}
                    onClick={() => setIndex(i)}
                  >
                    <img src={f.url} alt="" />
                    {f.principal && <span className="miniatura-principal">★</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="pedidos-error">{error}</div>}

          <div className="filtro-campo">
            <label htmlFor="subirFotos">Agregar fotos (puedes elegir varias)</label>
            <input
              id="subirFotos"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              disabled={subiendo}
              onChange={(e) => subirFotos(e.target.files)}
            />
          </div>
          {subiendo && <div className="vacio-col">Subiendo...</div>}
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
