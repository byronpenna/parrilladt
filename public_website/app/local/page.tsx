import type { Metadata } from 'next';
import { obtenerMenu } from '@/lib/graphql';
import Catalogo from './Catalogo';

// El menú cambia desde el back-office (altas, bajas, precios): se
// renderiza en cada request en vez de congelarse en el build estático.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menú — La Parrilla del DT',
  description: 'Mirá el menú de La Parrilla del DT y armá tu pedido.',
};

export default async function LocalPage() {
  let menu: Awaited<ReturnType<typeof obtenerMenu>> = [];
  let error: string | null = null;

  try {
    menu = (await obtenerMenu()).filter((item) => item.activo);
  } catch (err) {
    console.error('local menu error', err);
    error = 'No pudimos cargar el menú. Intenta de nuevo en un momento.';
  }

  return <Catalogo menuInicial={menu} error={error} />;
}
