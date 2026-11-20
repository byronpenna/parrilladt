import { NextRequest, NextResponse } from 'next/server';
import { enviarFeedbackPublico, type FeedbackInput } from '@/lib/graphql';

function calificacionValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 5;
}

export async function POST(request: NextRequest) {
  let body: Partial<FeedbackInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  if (
    !calificacionValida(body.calificacionComida) ||
    !calificacionValida(body.calificacionAtencion) ||
    !calificacionValida(body.calificacionRecomendacion)
  ) {
    return NextResponse.json({ error: 'Faltan calificaciones por responder' }, { status: 400 });
  }

  const input: FeedbackInput = {
    pedidoId: body.pedidoId ? String(body.pedidoId) : null,
    pedidoItemId: body.pedidoItemId ? String(body.pedidoItemId) : null,
    clienteNombre: body.clienteNombre ? String(body.clienteNombre).slice(0, 120) : undefined,
    clienteTelefono: body.clienteTelefono ? String(body.clienteTelefono).slice(0, 40) : undefined,
    calificacionComida: body.calificacionComida,
    calificacionAtencion: body.calificacionAtencion,
    calificacionRecomendacion: body.calificacionRecomendacion,
    comentario: body.comentario ? String(body.comentario).slice(0, 500) : undefined,
  };

  try {
    const resultado = await enviarFeedbackPublico(input);
    return NextResponse.json(resultado);
  } catch (err) {
    console.error('enviar feedback error', err);
    const mensaje = err instanceof Error ? err.message : 'No se pudo enviar tu opinión';
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
}
