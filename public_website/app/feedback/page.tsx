import type { Metadata } from 'next';
import FeedbackApp from './FeedbackApp';

export const metadata: Metadata = {
  title: 'Tu opinión — La Parrilla del DT',
  description: 'Contanos cómo te fue y gira la ruleta: puede tocarte un premio en tu próxima compra.',
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string | string[]; item?: string | string[] }>;
}) {
  const params = await searchParams;
  const pedidoRaw = Array.isArray(params.pedido) ? params.pedido[0] : params.pedido;
  const itemRaw = Array.isArray(params.item) ? params.item[0] : params.item;

  const pedidoId = pedidoRaw && /^\d+$/.test(pedidoRaw) ? pedidoRaw : null;
  // el id de plato solo tiene sentido junto con el pedido (así va el QR que se pega en cada plato)
  const pedidoItemId = pedidoId && itemRaw && /^\d+$/.test(itemRaw) ? itemRaw : null;

  return <FeedbackApp pedidoId={pedidoId} pedidoItemId={pedidoItemId} />;
}
