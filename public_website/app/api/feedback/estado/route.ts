import { NextRequest, NextResponse } from 'next/server';
import { obtenerEstadoFeedbackPedido } from '@/lib/graphql';

export async function GET(request: NextRequest) {
  const pedidoId = request.nextUrl.searchParams.get('pedidoId');
  const pedidoItemId = request.nextUrl.searchParams.get('pedidoItemId');
  if (!pedidoId) {
    return NextResponse.json({ existe: false, yaRespondido: false, itemNombre: null });
  }
  try {
    const estado = await obtenerEstadoFeedbackPedido(pedidoId, pedidoItemId);
    return NextResponse.json(estado);
  } catch (err) {
    console.error('estado feedback error', err);
    return NextResponse.json({ error: 'No se pudo consultar el pedido' }, { status: 502 });
  }
}
