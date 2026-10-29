let loadPromise: Promise<void> | null = null;

/** Inyecta el script de Google Maps JS una sola vez y resuelve cuando ya está listo para usarse. */
export function cargarGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps solo puede cargarse en el navegador'));
  if (window.google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return Promise.reject(new Error('Falta configurar NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('No se pudo cargar Google Maps'));
    };
    document.head.appendChild(script);
  });
  return loadPromise;
}
