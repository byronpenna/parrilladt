'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import LogoutButton from '@/components/LogoutButton';
import MapaUbicacion from '@/components/MapaUbicacion';
import { gqlRequest } from '@/lib/graphql-client';
import { QUERY_CONFIG_NEGOCIO, MUTATION_ACTUALIZAR_CONFIG_NEGOCIO } from '@/lib/queries';
import type { ConfigNegocio } from '@/lib/types';

export default function ConfiguracionPage() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [direccion, setDireccion] = useState('');

  useEffect(() => {
    cargarConfig();
  }, []);

  async function cargarConfig() {
    setCargando(true);
    setError('');
    try {
      const data = await gqlRequest<{ configNegocio: ConfigNegocio | null }>(QUERY_CONFIG_NEGOCIO);
      if (data.configNegocio) {
        setLat(data.configNegocio.latitud);
        setLng(data.configNegocio.longitud);
        setDireccion(data.configNegocio.direccion || '');
      }
    } catch {
      setError('No se pudo cargar la configuración del negocio');
    } finally {
      setCargando(false);
    }
  }

  function cambiarUbicacion(nuevaLat: number, nuevaLng: number, direccionDetectada: string | null) {
    setLat(nuevaLat);
    setLng(nuevaLng);
    if (direccionDetectada) setDireccion(direccionDetectada);
    setGuardadoOk(false);
  }

  async function guardar() {
    if (lat === null || lng === null) {
      setError('Marca la ubicación del negocio en el mapa');
      return;
    }
    setGuardando(true);
    setError('');
    setGuardadoOk(false);
    try {
      await gqlRequest(MUTATION_ACTUALIZAR_CONFIG_NEGOCIO, {
        latitud: lat,
        longitud: lng,
        direccion: direccion.trim() || undefined,
      });
      setGuardadoOk(true);
    } catch {
      setError('No se pudo guardar la configuración');
    } finally {
      setGuardando(false);
    }
  }

  const referencia = useMemo(() => null, []);

  return (
    <>
      <header className="cancha-header">
        <h1>⚙️ Configuración</h1>
        <div className="cancha-header-nav">
          <LogoutButton />
          <Link href="/" className="btn btn-blanco">
            ⚽ Tomar pedidos
          </Link>
          <Link href="/pedidos" className="btn btn-blanco">
            📋 Pedidos
          </Link>
          <Link href="/productos" className="btn btn-blanco">
            🍔 Productos
          </Link>
          <Link href="/riders" className="btn btn-blanco">
            🛵 Riders
          </Link>
          <Link href="/clientes" className="btn btn-blanco">
            👤 Clientes
          </Link>
          <Link href="/reportes" className="btn btn-blanco">
            📈 Reportes
          </Link>
          <Link href="/stock" className="btn btn-blanco">
            📦 Stock
          </Link>
        </div>
      </header>

      <div className="pedidos-page">
        <div className="card-blanca" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <h2 style={{ margin: '0 0 4px' }}>Ubicación del negocio</h2>
            <p style={{ margin: 0, color: '#666' }}>
              Busca la dirección, usa tu ubicación actual o haz clic en el mapa para marcar dónde está el local. Esta
              ubicación se usa para calcular la distancia aproximada de cada pedido con envío.
            </p>
          </div>

          {cargando ? (
            <div className="vacio-col">Cargando...</div>
          ) : (
            <>
              <MapaUbicacion lat={lat} lng={lng} onChange={cambiarUbicacion} referencia={referencia} alto={360} />

              <div className="filtro-campo">
                <label htmlFor="direccionNegocio">Dirección (referencia para el equipo)</label>
                <input
                  id="direccionNegocio"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Se completa sola al marcar el punto, o escríbela a mano"
                />
              </div>

              {error && <div className="pedidos-error">{error}</div>}
              {guardadoOk && <div className="mapa-ubicacion-distancia">✔ Configuración guardada</div>}

              <button className="btn btn-naranja" disabled={guardando || lat === null} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Guardar ubicación'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
