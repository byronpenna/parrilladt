import { NextResponse } from 'next/server';
import { obtenerFotosMenuItem } from '@/lib/graphql';

export async function GET(_req: Request, ctx: RouteContext<'/api/menu/[id]/fotos'>) {
  const { id } = await ctx.params;
  try {
    const fotos = await obtenerFotosMenuItem(id);
    return NextResponse.json({ fotos });
  } catch (err) {
    console.error('fotos menu error', err);
    return NextResponse.json({ error: 'No se pudieron cargar las fotos' }, { status: 502 });
  }
}
