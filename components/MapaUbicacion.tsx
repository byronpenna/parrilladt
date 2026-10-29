'use client';

import { useEffect, useRef, useState } from 'react';
import { cargarGoogleMaps } from '@/lib/googleMaps';
import { distanciaKm } from '@/lib/geo';

interface Referencia {
  lat: number;
  lng: number;
  etiqueta?: string;
}

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number, direccion: string | null) => void;
  referencia?: Referencia | null;
  alto?: number;
}

const ZOOM_PUNTO = 15;
const ZOOM_SIN_PUNTO = 2;
const CENTRO_MUNDO = { lat: 10, lng: 0 };

export default function MapaUbicacion({ lat, lng, onChange, referencia, alto = 280 }: Props) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const autocompleteContenedorRef = useRef<HTMLDivElement | null>(null);
  const mapaRef = useRef<google.maps.Map | null>(null);
  const marcadorRef = useRef<google.maps.Marker | null>(null);
  const marcadorRefRef = useRef<google.maps.Marker | null>(null);
  const lineaRef = useRef<google.maps.Polyline | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [latManual, setLatManual] = useState('');
  const [lngManual, setLngManual] = useState('');

  function ubicar(posicion: google.maps.LatLng, reverseGeocode: boolean) {
    const nuevaLat = posicion.lat();
    const nuevaLng = posicion.lng();
    if (!reverseGeocode || !geocoderRef.current) {
      onChangeRef.current(nuevaLat, nuevaLng, null);
      return;
    }
    geocoderRef.current.geocode({ location: posicion }, (resultados, status) => {
      const direccion = status === 'OK' && resultados && resultados[0] ? resultados[0].formatted_address : null;
      onChangeRef.current(nuevaLat, nuevaLng, direccion);
    });
  }

  useEffect(() => {
    let cancelado = false;
    cargarGoogleMaps()
      .then(() => {
        if (cancelado || !contenedorRef.current) return;
        const centro = lat !== null && lng !== null ? { lat, lng } : referencia ? { lat: referencia.lat, lng: referencia.lng } : CENTRO_MUNDO;
        const zoom = lat !== null && lng !== null ? ZOOM_PUNTO : referencia ? 13 : ZOOM_SIN_PUNTO;

        const mapa = new google.maps.Map(contenedorRef.current, {
          center: centro,
          zoom,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
        mapaRef.current = mapa;
        geocoderRef.current = new google.maps.Geocoder();

        const marcador = new google.maps.Marker({
          map: mapa,
          draggable: true,
          position: lat !== null && lng !== null ? { lat, lng } : undefined,
          visible: lat !== null && lng !== null,
        });
        marcador.addListener('dragend', () => {
          const pos = marcador.getPosition();
          if (pos) ubicar(pos, true);
        });
        marcadorRef.current = marcador;

        mapa.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          marcador.setPosition(e.latLng);
          marcador.setVisible(true);
          ubicar(e.latLng, true);
        });

        if (referencia) {
          marcadorRefRef.current = new google.maps.Marker({
            map: mapa,
            position: { lat: referencia.lat, lng: referencia.lng },
            icon: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
            title: referencia.etiqueta || 'Negocio',
          });
        }

        if (autocompleteContenedorRef.current && !autocompleteContenedorRef.current.firstChild) {
          const autocompleteEl = new google.maps.places.PlaceAutocompleteElement();
          autocompleteEl.style.width = '100%';
          autocompleteContenedorRef.current.appendChild(autocompleteEl);
          autocompleteEl.addEventListener('gmp-select', async (e: google.maps.places.PlacePredictionSelectEvent) => {
            const lugar = e.placePrediction.toPlace();
            const { place } = await lugar.fetchFields({ fields: ['location', 'formattedAddress'] });
            if (!place.location) return;
            mapa.setCenter(place.location);
            mapa.setZoom(ZOOM_PUNTO);
            marcador.setPosition(place.location);
            marcador.setVisible(true);
            onChangeRef.current(place.location.lat(), place.location.lng(), place.formattedAddress || null);
          });
        }

        setCargando(false);
      })
      .catch((err: Error) => {
        if (!cancelado) {
          setError(err.message);
          setCargando(false);
        }
      });
    return () => {
      cancelado = true;
    };
    // El mapa se inicializa una sola vez; lat/lng/referencia se sincronizan en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sincroniza el marcador y la línea de distancia cuando cambian lat/lng desde fuera (ej. "usar mi ubicación")
  useEffect(() => {
    const mapa = mapaRef.current;
    const marcador = marcadorRef.current;
    if (!mapa || !marcador) return;

    if (lat !== null && lng !== null) {
      const pos = { lat, lng };
      marcador.setPosition(pos);
      marcador.setVisible(true);
    } else {
      marcador.setVisible(false);
    }

    if (lineaRef.current) {
      lineaRef.current.setMap(null);
      lineaRef.current = null;
    }
    if (lat !== null && lng !== null && referencia) {
      lineaRef.current = new google.maps.Polyline({
        map: mapa,
        path: [{ lat, lng }, { lat: referencia.lat, lng: referencia.lng }],
        strokeColor: '#e67e22',
        strokeOpacity: 0.8,
        strokeWeight: 3,
      });
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat, lng });
      bounds.extend({ lat: referencia.lat, lng: referencia.lng });
      mapa.fitBounds(bounds, 48);
    }
  }, [lat, lng, referencia]);

  function usarMiUbicacion() {
    if (!navigator.geolocation) {
      setError('Este navegador no permite obtener la ubicación actual');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const punto = new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        mapaRef.current?.setCenter(punto);
        mapaRef.current?.setZoom(ZOOM_PUNTO);
        marcadorRef.current?.setPosition(punto);
        marcadorRef.current?.setVisible(true);
        ubicar(punto, true);
      },
      () => setError('No se pudo obtener tu ubicación actual')
    );
  }

  function guardarManual() {
    const latNum = parseFloat(latManual);
    const lngNum = parseFloat(lngManual);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return;
    onChangeRef.current(latNum, lngNum, null);
  }

  const distancia = lat !== null && lng !== null && referencia ? distanciaKm(lat, lng, referencia.lat, referencia.lng) : null;

  if (error) {
    return (
      <div className="mapa-ubicacion-error">
        <div>⚠️ {error}. Puedes escribir las coordenadas a mano mientras tanto.</div>
        <div className="mapa-ubicacion-manual">
          <input
            type="number"
            step="any"
            placeholder="Latitud"
            value={latManual}
            onChange={(e) => setLatManual(e.target.value)}
          />
          <input
            type="number"
            step="any"
            placeholder="Longitud"
            value={lngManual}
            onChange={(e) => setLngManual(e.target.value)}
          />
          <button type="button" className="btn btn-blanco" onClick={guardarManual}>
            Usar coordenadas
          </button>
        </div>
        {distancia !== null && <div className="mapa-ubicacion-distancia">📏 ~{distancia.toFixed(1)} km del negocio</div>}
      </div>
    );
  }

  return (
    <div className="mapa-ubicacion">
      <div className="mapa-ubicacion-barra">
        <div ref={autocompleteContenedorRef} className="mapa-ubicacion-autocomplete" />
        <button type="button" className="btn btn-blanco" disabled={cargando} onClick={usarMiUbicacion}>
          📍 Mi ubicación
        </button>
      </div>
      <div className="mapa-ubicacion-contenedor" style={{ position: 'relative', height: alto }}>
        <div ref={contenedorRef} style={{ position: 'absolute', inset: 0, borderRadius: 10, overflow: 'hidden' }} />
        {cargando && <div className="vacio-col-claro mapa-ubicacion-cargando">Cargando mapa...</div>}
      </div>
      {distancia !== null && <div className="mapa-ubicacion-distancia">📏 ~{distancia.toFixed(1)} km del negocio</div>}
    </div>
  );
}
